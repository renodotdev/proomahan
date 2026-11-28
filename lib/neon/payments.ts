import "server-only";
import type { PoolClient } from "pg";
import { realDate } from "./core-input.ts";
import { billingStaff } from "./bill-schedules.ts";
import { DatabaseAccessError, validUuid, withActorTenant } from "./tenant-context.ts";

function id(value: unknown) {
  if (typeof value !== "string" || !validUuid(value)) throw new DatabaseAccessError("Data pembayaran tidak valid.", 400);
  return value;
}

export async function residentInvoice(db: PoolClient, tenant: string, actor: string, invoice: string, submit = false) {
  const { rows: [row] } = await db.query<{ id: string; unit_id: string; bill_to_person_id: string; status: string; unit_label_snapshot: string; invoice_number: string }>(`
    SELECT i.id,i.unit_id,i.bill_to_person_id,i.status,i.unit_label_snapshot,i.invoice_number
    FROM app.invoices i
    JOIN app.tenant_memberships m ON m.tenant_id=i.tenant_id AND m.user_id=$3 AND m.status='active'
    WHERE i.tenant_id=$1 AND i.id=$2 AND i.status<>'draft'
      AND (i.bill_to_person_id=m.person_id OR EXISTS (
        SELECT 1 FROM app.invoice_participants p WHERE (p.tenant_id,p.invoice_id)=(i.tenant_id,i.id)
          AND p.person_id=m.person_id AND ($4::boolean IS FALSE OR p.permission='submit_payment')
      ))`, [tenant, id(invoice), actor, submit]);
  if (!row) throw new DatabaseAccessError("Tagihan tidak ditemukan.", 404);
  return row;
}

export async function paymentDetails(actor: string, tenant: string, invoice: string) {
  return withActorTenant(actor, tenant, async db => {
    const bill = await residentInvoice(db, tenant, actor, invoice);
    const items = await db.query(`
      SELECT i.id,i.name_snapshot AS name,i.line_amount::text AS total,
        (i.line_amount-coalesce((
          SELECT sum(a.amount) FROM app.payment_allocations a
          JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id)
          WHERE a.tenant_id=i.tenant_id AND a.invoice_item_id=i.id AND a.stage='verified' AND p.status='verified'
            AND NOT EXISTS (SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))
        ),0))::text AS remaining
      FROM app.invoice_items i WHERE i.tenant_id=$1 AND i.invoice_id=$2 ORDER BY i.created_at,i.id`, [tenant, invoice]);
    const payments = await db.query(`
      SELECT p.id,p.status,p.amount::text,p.claimed_paid_at::text,p.rejection_reason
      FROM app.payments p WHERE p.tenant_id=$1 AND p.submitted_by=$3
        AND EXISTS (SELECT 1 FROM app.payment_allocations a WHERE a.tenant_id=p.tenant_id AND a.payment_id=p.id AND a.invoice_id=$2)
      ORDER BY p.created_at DESC LIMIT 30`, [tenant, invoice, actor]);
    return { bill, items: items.rows, payments: payments.rows };
  });
}

export async function markBillRead(actor: string, tenant: string, invoice: string) {
  return withActorTenant(actor, tenant, async db => {
    await residentInvoice(db, tenant, actor, invoice);
    await db.query(`UPDATE app.invoice_participants p SET notification_read_at=now()
      FROM app.tenant_memberships m
      WHERE p.tenant_id=$1 AND p.invoice_id=$2 AND m.tenant_id=p.tenant_id AND m.person_id=p.person_id
        AND m.user_id=$3 AND m.status='active' AND p.notification_created_at IS NOT NULL AND p.notification_read_at IS NULL`,
    [tenant, invoice, actor]);
    return { success: true };
  });
}

export async function submitPayment(actor: string, tenant: string, body: Record<string, unknown>) {
  const invoice = id(body.invoice);
  const proof = id(body.proof);
  const key = id(body.key);
  const method = body.method;
  if (method !== "bank_transfer" && method !== "cash") throw new DatabaseAccessError("Pilih metode pembayaran.", 400);
  let date: string;
  try { date = realDate(body.date); }
  catch { throw new DatabaseAccessError("Tanggal pembayaran tidak valid.", 400); }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new DatabaseAccessError("Pilih item yang dibayar.", 400);
  const allocations = body.items.map(value => {
    const item = id(value?.id);
    const amount = value?.amount;
    if (typeof amount !== "string" || !/^[1-9][0-9]{0,13}$/.test(amount)) throw new DatabaseAccessError("Isi pembayaran dalam rupiah bulat.", 400);
    return { item, amount };
  });
  if (new Set(allocations.map(row => row.item)).size !== allocations.length) throw new DatabaseAccessError("Item pembayaran tercatat dua kali.", 400);
  const amount = String(allocations.reduce((total, row) => total + BigInt(row.amount), 0n));
  return withActorTenant(actor, tenant, async db => {
    const bill = await residentInvoice(db, tenant, actor, invoice, true);
    const lock = await db.query<{ status: string; valid_date: boolean }>(
      "SELECT status, $3::date <= CURRENT_DATE AND $3::date >= DATE '0001-01-01' AS valid_date FROM app.invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [tenant, invoice, date]);
    const existing = await db.query<{ id: string; proof_file_id: string }>(
      "SELECT id,proof_file_id FROM app.payments WHERE tenant_id=$1 AND submitted_by=$2 AND client_submission_key=$3", [tenant, actor, key]);
    if (existing.rows[0]?.proof_file_id === proof) return { id: existing.rows[0].id };
    if (existing.rows.length) throw new DatabaseAccessError("Referensi pengiriman sudah digunakan.", 409);
    if (lock.rows[0]?.status !== "issued") throw new DatabaseAccessError("Tagihan ini tidak dapat dibayar.", 409);
    if (!lock.rows[0].valid_date) throw new DatabaseAccessError("Tanggal pembayaran tidak valid.", 400);
    const file = await db.query<{ checksum: string | null }>(`SELECT checksum FROM app.files WHERE tenant_id=$1 AND id=$2 AND uploaded_by=$3
      AND purpose='payment_proof' AND deleted_at IS NULL AND scan_status<>'rejected' FOR UPDATE`, [tenant, proof, actor]);
    if (!file.rows.length) throw new DatabaseAccessError("Unggah bukti pembayaran terlebih dahulu.", 400);
    const used = await db.query("SELECT 1 FROM app.payments WHERE tenant_id=$1 AND proof_file_id=$2", [tenant, proof]);
    if (used.rows.length) throw new DatabaseAccessError("Bukti ini sudah digunakan.", 409);
    const digest = file.rows[0].checksum;
    if (digest) {
      const duplicate = await db.query(`SELECT 1 FROM app.payments p
        JOIN app.files f ON (f.tenant_id,f.id)=(p.tenant_id,p.proof_file_id)
        WHERE p.tenant_id=$1 AND f.checksum=$3 AND p.status IN ('submitted','verified')
          AND EXISTS (SELECT 1 FROM app.payment_allocations a WHERE (a.tenant_id,a.payment_id)=(p.tenant_id,p.id) AND a.invoice_id=$2)
          AND NOT EXISTS (SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))
        LIMIT 1`, [tenant, invoice, digest]);
      if (duplicate.rows.length) throw new DatabaseAccessError("Bukti yang sama sudah diajukan untuk tagihan ini.", 409);
    }
    const { rows: valid } = await db.query<{ id: string; available: boolean }>(`
      SELECT i.id,(i.line_amount-coalesce((
        SELECT sum(a.amount) FROM app.payment_allocations a
        JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id)
        WHERE a.tenant_id=i.tenant_id AND a.invoice_item_id=i.id AND a.stage='verified' AND p.status='verified'
          AND NOT EXISTS (SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))
      ),0))>=x.amount AS available
      FROM unnest($3::uuid[],$4::numeric[]) AS x(id,amount)
      JOIN app.invoice_items i ON i.tenant_id=$1 AND i.invoice_id=$2 AND i.id=x.id`,
    [tenant, invoice, allocations.map(row => row.item), allocations.map(row => row.amount)]);
    if (valid.length !== allocations.length || valid.some(row => !row.available)) {
      throw new DatabaseAccessError("Periksa item dan nominal terhadap sisa tagihan.", 409);
    }
    const { rows: [payment] } = await db.query<{ id: string }>(`
      INSERT INTO app.payments (tenant_id,unit_id,bill_to_person_id,submitted_by,origin,method,amount,claimed_paid_at,proof_file_id,client_submission_key)
      VALUES ($1,$2,$3,$4,'resident',$5,$6,$7,$8,$9) RETURNING id`,
    [tenant, bill.unit_id, bill.bill_to_person_id, actor, method, amount, date, proof, key]);
    await db.query(`INSERT INTO app.payment_allocations (tenant_id,payment_id,invoice_id,invoice_item_id,stage,amount)
      SELECT $1::uuid,$2::uuid,$3::uuid,x.id,'requested',x.amount FROM unnest($4::uuid[],$5::numeric[]) AS x(id,amount)`,
    [tenant, payment.id, invoice, allocations.map(row => row.item), allocations.map(row => row.amount)]);
    return payment;
  });
}

export async function staffPayments(actor: string, tenant: string, page: number) {
  return withActorTenant(actor, tenant, async db => {
    const payments = await db.query(`
      SELECT p.id,p.amount::text,p.method,p.claimed_paid_at::text,p.status,p.rejection_reason,p.proof_file_id IS NOT NULL AS has_proof,
        coalesce(pr.full_name,'Warga') AS submitter,i.unit_label_snapshot AS unit,i.invoice_number,
        (SELECT string_agg(concat(it.name_snapshot,' (Rp',a.amount,')'),', ' ORDER BY it.id)
         FROM app.payment_allocations a JOIN app.invoice_items it ON (it.tenant_id,it.id)=(a.tenant_id,a.invoice_item_id)
         WHERE a.tenant_id=p.tenant_id AND a.payment_id=p.id AND a.stage='requested') AS items
      FROM app.payments p
      LEFT JOIN app.tenant_memberships m ON m.tenant_id=p.tenant_id AND m.user_id=p.submitted_by
      LEFT JOIN app.people pr ON (pr.tenant_id,pr.id)=(m.tenant_id,m.person_id)
      JOIN LATERAL (SELECT i.unit_label_snapshot,i.invoice_number FROM app.payment_allocations a
        JOIN app.invoices i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id)
        WHERE a.tenant_id=p.tenant_id AND a.payment_id=p.id ORDER BY i.id LIMIT 1) i ON true
      WHERE p.tenant_id=$1
      ORDER BY (p.status='submitted') DESC,p.created_at DESC,p.id LIMIT 21 OFFSET $2`, [tenant, (page - 1) * 20]);
    const accounts = await db.query("SELECT id,name,kind FROM app.cash_accounts WHERE tenant_id=$1 AND active ORDER BY name,id", [tenant]);
    return { payments: payments.rows.slice(0, 20), next: payments.rows.length > 20, accounts: accounts.rows };
  }, billingStaff);
}

export async function reviewPayment(actor: string, tenant: string, body: Record<string, unknown>) {
  const paymentId = id(body.payment);
  const action = body.action;
  if (action !== "verify" && action !== "reject") throw new DatabaseAccessError("Tindakan pembayaran tidak valid.", 400);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "reject" && (!reason || reason.length > 500)) throw new DatabaseAccessError("Isi alasan penolakan.", 400);
  return withActorTenant(actor, tenant, async db => {
    // Lock invoices before payments, in the same order as submission and cancellation.
    const invoices = await db.query<{ status: string }>(`
      SELECT i.status FROM app.invoices i WHERE i.tenant_id=$1 AND EXISTS (
        SELECT 1 FROM app.payment_allocations a WHERE (a.tenant_id,a.invoice_id)=(i.tenant_id,i.id) AND a.payment_id=$2
      ) ORDER BY i.id FOR UPDATE`, [tenant, paymentId]);
    const { rows: [payment] } = await db.query<{ status: string; method: string }>(
      "SELECT status,method FROM app.payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenant, paymentId]);
    if (!payment) throw new DatabaseAccessError("Pembayaran tidak ditemukan.", 404);
    if (payment.status !== "submitted") throw new DatabaseAccessError("Pembayaran ini sudah diperiksa.", 409);
    if (action === "reject") {
      await db.query("UPDATE app.payments SET status='rejected',rejection_reason=$3,verified_by=$4,verified_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenant, paymentId, reason, actor]);
    } else {
      if (!invoices.rows.length || invoices.rows.some(invoice => invoice.status !== "issued")) throw new DatabaseAccessError("Tagihan tidak aktif.", 409);
      const account = id(body.account);
      const matching = await db.query("SELECT id FROM app.cash_accounts WHERE tenant_id=$1 AND id=$2 AND active AND kind=$3",
        [tenant, account, payment.method === "cash" ? "cash" : "bank"]);
      if (!matching.rows.length) throw new DatabaseAccessError("Pilih akun kas atau bank yang sesuai.", 400);
      await db.query(`INSERT INTO app.payment_allocations (tenant_id,payment_id,invoice_id,invoice_item_id,stage,amount)
        SELECT tenant_id,payment_id,invoice_id,invoice_item_id,'verified',amount FROM app.payment_allocations
        WHERE tenant_id=$1 AND payment_id=$2 AND stage='requested'`, [tenant, paymentId]);
      try {
        await db.query(`UPDATE app.payments SET status='verified',verified_by=$3,verified_at=now(),cash_account_id=$4,updated_at=now()
          WHERE tenant_id=$1 AND id=$2`, [tenant, paymentId, actor, account]);
      } catch (error) {
        if ((error as Error).message.includes("outstanding")) throw new DatabaseAccessError("Pembayaran melebihi sisa tagihan. Periksa pembayaran lain yang sudah terverifikasi.", 409);
        throw error;
      }
    }
    return { success: true };
  }, billingStaff);
}

export async function addPaymentAccount(actor: string, tenant: string, body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind = body.kind;
  if (!name || name.length > 120 || (kind !== "bank" && kind !== "cash")) throw new DatabaseAccessError("Isi nama dan jenis akun penerima.", 400);
  return withActorTenant(actor, tenant, async db => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cash-account:${tenant}`]);
    const existing = await db.query("SELECT id FROM app.cash_accounts WHERE tenant_id=$1 AND kind=$2 AND lower(name)=lower($3)", [tenant, kind, name]);
    if (existing.rows.length) throw new DatabaseAccessError("Nama akun ini sudah digunakan.", 409);
    const { rows: [account] } = await db.query<{ id: string }>(
      "INSERT INTO app.cash_accounts (tenant_id,name,kind,opening_date) VALUES ($1,$2,$3,CURRENT_DATE) RETURNING id", [tenant, name, kind]);
    await db.query(`INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
      VALUES ($1,$2,'cash_account.created','cash_account',$3)`, [tenant, actor, account.id]);
    return account;
  }, billingStaff);
}

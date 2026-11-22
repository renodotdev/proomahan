import "server-only";
import type { PoolClient } from "pg";
import { realDate } from "./core-input.ts";
import { invoiceInput, meterCharge, meterInput, occursInPeriod } from "./invoice-input.ts";
import { billingStaff, getBillSchedules } from "./bill-schedules.ts";
import { DatabaseAccessError, validUuid, withActorTenant } from "./tenant-context.ts";

async function recipients(db: PoolClient, tenant: string, period: string, selection: { search: string } | { unit: string; person: string }) {
  const search = "search" in selection;
  const result = await db.query<{ unit_id: string; person_id: string; name: string; unit_label: string }>(`
    WITH related AS (
      SELECT unit_id,person_id FROM app.unit_ownerships
      WHERE tenant_id=$1 AND start_date<=$2 AND (end_date IS NULL OR end_date>$2)
      UNION
      SELECT o.unit_id,m.person_id FROM app.unit_occupancies o
      JOIN app.occupancy_members m ON (m.tenant_id,m.occupancy_id)=(o.tenant_id,o.id)
      WHERE o.tenant_id=$1 AND o.start_date<=$2 AND (o.end_date IS NULL OR o.end_date>$2)
        AND m.start_date<=$2 AND (m.end_date IS NULL OR m.end_date>$2)
    )
    SELECT u.id AS unit_id,p.id AS person_id,p.full_name AS name,concat(c.name,' · ',u.number) AS unit_label
    FROM related r JOIN app.units u ON u.tenant_id=$1 AND u.id=r.unit_id
    JOIN app.clusters c ON (c.tenant_id,c.id)=(u.tenant_id,u.cluster_id)
    JOIN app.people p ON p.tenant_id=$1 AND p.id=r.person_id
    WHERE ${search ? "(u.number ILIKE $3 OR c.name ILIKE $3 OR p.full_name ILIKE $3)" : "u.id=$3 AND p.id=$4"}
    ORDER BY c.name,u.number,p.full_name,p.id LIMIT 20`,
    search ? [tenant, period, `%${selection.search}%`] : [tenant, period, selection.unit, selection.person]);
  return result.rows;
}

export async function listInvoices(actor: string, tenant: string, params: URLSearchParams) {
  if (params.has("schedules")) {
    return withActorTenant(actor, tenant, async db => ({ schedules: await getBillSchedules(db, tenant) }), billingStaff);
  }
  const period = params.get("recipientPeriod");
  if (period !== null) {
    let date: string;
    try { date = realDate(`${period}-01`); if (date.startsWith("0000")) throw new Error(); }
    catch { throw new DatabaseAccessError("Periode tagihan tidak valid.", 400); }
    return withActorTenant(actor, tenant, async db => ({
      recipients: await recipients(db, tenant, date, { search: (params.get("q") || "").trim().slice(0, 100) }),
    }), billingStaff);
  }
  const ongoing = params.get("status") === "ongoing";
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(params.get("page"))) || 1));
  return withActorTenant(actor, tenant, async (db, roles) => {
    const canManage = roles.includes("super_admin") || roles.includes("billing_admin");
    const { rows } = await db.query(`
      SELECT i.id,i.invoice_number,i.period::text,i.issue_date::text,i.due_date::text,i.status,i.kind,i.void_reason,
        i.total_amount,b.paid_amount,i.bill_to_name_snapshot,i.unit_label_snapshot,
        (SELECT string_agg(it.name_snapshot, ', ' ORDER BY it.id) FROM app.invoice_items it
          WHERE (it.tenant_id,it.invoice_id)=(i.tenant_id,i.id)) AS items,
        (SELECT r.consumption::text FROM app.meter_readings r JOIN app.invoice_items it ON (it.tenant_id,it.id)=(r.tenant_id,r.invoice_item_id)
          WHERE (it.tenant_id,it.invoice_id)=(i.tenant_id,i.id) ORDER BY r.id LIMIT 1) AS consumption
      FROM app.invoices i JOIN app.invoice_balances b ON (b.tenant_id,b.invoice_id)=(i.tenant_id,i.id)
      WHERE i.tenant_id=$1 AND ($2::boolean OR (i.status<>'draft' AND EXISTS (
        SELECT 1 FROM app.tenant_memberships m
        WHERE m.tenant_id=i.tenant_id AND m.user_id=$3 AND m.status='active'
          AND (m.person_id=i.bill_to_person_id OR EXISTS (
            SELECT 1 FROM app.invoice_participants p WHERE (p.tenant_id,p.invoice_id,p.person_id)=(i.tenant_id,i.id,m.person_id)
          ))
      )))
      AND (NOT $5::boolean OR (i.status='issued' AND b.paid_amount<i.total_amount))
      ORDER BY i.period DESC,i.issue_date DESC,i.id DESC LIMIT 21 OFFSET $4`, [tenant, canManage, actor, (page - 1) * 20, ongoing]);
    return { rows: rows.slice(0, 20), hasNext: rows.length > 20, canManage };
  });
}

export async function changeInvoice(actor: string, tenant: string, body: Record<string, unknown>) {
  if (body.action === "void") {
    const { invoiceId } = body;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (typeof invoiceId !== "string" || !validUuid(invoiceId) || !reason || reason.length > 500) {
      throw new DatabaseAccessError("Pilih tagihan dan isi alasan pembatalan.", 400);
    }
    return withActorTenant(actor, tenant, async db => {
      const invoice = await db.query("SELECT id FROM app.invoices WHERE tenant_id=$1 AND id=$2 AND status='issued' FOR UPDATE", [tenant, invoiceId]);
      if (!invoice.rows.length) throw new DatabaseAccessError("Tagihan terbit tidak ditemukan.", 404);
      const pending = await db.query(`
        SELECT 1 FROM app.payment_allocations a JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id)
        WHERE a.tenant_id=$1 AND a.invoice_id=$2 AND p.status='submitted' LIMIT 1`, [tenant, invoiceId]);
      if (pending.rows.length) throw new DatabaseAccessError("Selesaikan pemeriksaan pembayaran sebelum membatalkan tagihan.", 409);
      await db.query("UPDATE app.invoices SET status='void',void_reason=$3 WHERE tenant_id=$1 AND id=$2", [tenant, invoiceId, reason]);
      await db.query(`INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,summary)
        VALUES ($1,$2,'invoice.voided','invoice',$3,jsonb_build_object('reason',$4::text))`, [tenant, actor, invoiceId, reason]);
      return { id: invoiceId };
    }, billingStaff);
  }

  const { unitId, personId } = body;
  if (body.action !== "record" || typeof unitId !== "string" || !validUuid(unitId) || typeof personId !== "string" || !validUuid(personId)) {
    throw new DatabaseAccessError("Pilih unit dan penanggung tagihan.", 400);
  }
  const scheduleId = body.scheduleId === "" ? null : body.scheduleId ?? null;
  if (scheduleId !== null && (typeof scheduleId !== "string" || !validUuid(scheduleId))) {
    throw new DatabaseAccessError("Pilih jadwal tagihan yang valid.", 400);
  }
  return withActorTenant(actor, tenant, async db => {
    const [schedule] = scheduleId ? await getBillSchedules(db, tenant, scheduleId) : [];
    if (scheduleId && !schedule) throw new DatabaseAccessError("Jadwal tagihan tidak tersedia.", 404);
    let input;
    try { input = invoiceInput(schedule ? { ...body, item: schedule.name, amount: schedule.amount } : body); }
    catch (error) { throw new DatabaseAccessError((error as Error).message, 400); }
    const { item, period, issueDate, dueDate } = input;
    if (schedule && !occursInPeriod(schedule, period)) throw new DatabaseAccessError("Jadwal ini tidak berlaku pada periode yang dipilih.", 400);
    const [recipient] = await recipients(db, tenant, period, { unit: unitId, person: personId });
    if (!recipient) throw new DatabaseAccessError("Penanggung tagihan harus tercatat sebagai pemilik atau penghuni pada awal periode.", 400);
    const { rows: [today] } = await db.query<{ date: string; period: string }>(
      "SELECT CURRENT_DATE::text AS date,date_trunc('month',CURRENT_DATE)::date::text AS period");
    if (issueDate > today.date || (schedule && period > today.period)) {
      throw new DatabaseAccessError("Tanggal terbit dan periode jadwal tidak boleh setelah bulan berjalan.", 400);
    }

    const reading = schedule?.tariff_id ? await recordMeterReading(db, tenant, actor, unitId, period, schedule.tariff_id, schedule.amount, body) : null;
    if (reading?.amount === "0") return { id: null };
    const amount = reading?.amount ?? input.amount;
    const feeItemId = schedule?.fee_item_id ?? await manualFee(db, tenant, item);
    const invoice = await db.query<{ id: string }>(`
      INSERT INTO app.invoices(tenant_id,unit_id,bill_to_person_id,invoice_number,kind,period,issue_date,due_date,
        bill_to_name_snapshot,unit_label_snapshot,total_amount,fee_schedule_id)
      VALUES ($1,$2,$3,'INV-'||gen_random_uuid(),$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [tenant, unitId, personId, reading ? "water" : "dues", period, issueDate, dueDate, recipient.name, recipient.unit_label, amount, scheduleId]);
    const { id } = invoice.rows[0];
    const line = await db.query<{ id: string }>(`
      INSERT INTO app.invoice_items(tenant_id,invoice_id,fee_item_id,fee_schedule_id,name_snapshot,category_snapshot,quantity,unit_rate,charge_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'workspace-invoice:'||$2::uuid::text) RETURNING id`,
      [tenant, id, feeItemId, scheduleId, item, reading ? "Air" : schedule ? "Iuran terjadwal" : "Iuran manual",
        reading?.consumption ?? "1", input.amount]);
    if (reading) await db.query("UPDATE app.meter_readings SET invoice_item_id=$3 WHERE tenant_id=$1 AND id=$2", [tenant, reading.id, line.rows[0].id]);
    await db.query("UPDATE app.invoices SET status='issued',issued_at=now() WHERE tenant_id=$1 AND id=$2", [tenant, id]);
    await db.query(`INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
      VALUES ($1,$2,'invoice.recorded','invoice',$3)`, [tenant, actor, id]);
    return { id };
  }, billingStaff);
}

async function manualFee(db: PoolClient, tenant: string, item: string) {
  const category = await db.query<{ id: string }>(`
    INSERT INTO app.fee_categories(tenant_id,code,name) VALUES ($1,'manual-invoice','Iuran manual')
    ON CONFLICT (tenant_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [tenant]);
  const fee = await db.query<{ id: string }>(`
    INSERT INTO app.fee_items(tenant_id,category_id,code,name) VALUES ($1,$2,'manual-invoice-'||md5(lower($3)),$3)
    ON CONFLICT (tenant_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [tenant, category.rows[0].id, item]);
  return fee.rows[0].id;
}

async function recordMeterReading(db: PoolClient, tenant: string, actor: string, unit: string, period: string, tariff: string, rate: string, body: Record<string, unknown>) {
  let input;
  try { input = meterInput(body); }
  catch (error) { throw new DatabaseAccessError((error as Error).message, 400); }
  const { serial, previous, current } = input;
  const amount = meterCharge(input, rate);
  if (amount.length > 18) throw new DatabaseAccessError("Total tagihan melebihi batas nominal.", 400);

  // Serialize registration and adjacent readings for the same unit.
  await db.query("SELECT id FROM app.units WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenant, unit]);
  const existing = await db.query<{ id: string }>(`
    SELECT id FROM app.meters WHERE tenant_id=$1 AND unit_id=$2 AND serial_number=$3
    AND date_trunc('month', installed_on)::date<=$4
    AND (retired_on IS NULL OR date_trunc('month',retired_on)::date>=$4)`, [tenant, unit, serial, period]);
  const meter = existing.rows[0] ?? (await db.query<{ id: string }>(`
    INSERT INTO app.meters(tenant_id,unit_id,serial_number,installed_on)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [tenant, unit, serial, period])).rows[0];
  if (!meter) throw new DatabaseAccessError("Nomor meter tidak sesuai dengan meter unit pada periode ini.", 409);

  const continuity = await db.query<{ valid: boolean }>(`
    SELECT coalesce((SELECT current_value=$4::numeric FROM app.meter_readings
      WHERE tenant_id=$1 AND meter_id=$2 AND period<$3 ORDER BY period DESC LIMIT 1),true)
      AND coalesce((SELECT previous_value=$5::numeric FROM app.meter_readings
      WHERE tenant_id=$1 AND meter_id=$2 AND period>$3 ORDER BY period LIMIT 1),true) AS valid`,
    [tenant, meter.id, period, previous, current]);
  if (!continuity.rows[0].valid) throw new DatabaseAccessError("Angka meter harus menyambung dengan catatan sebelum dan sesudah periode ini.", 409);

  const { rows: [reading] } = await db.query<{ id: string; consumption: string }>(`
    INSERT INTO app.meter_readings(tenant_id,meter_id,period,previous_value,current_value,tariff_id,recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,consumption::text`, [tenant, meter.id, period, previous, current, tariff, actor]);
  await db.query(`INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
    VALUES ($1,$2,'meter_reading.recorded','meter_reading',$3)`, [tenant, actor, reading.id]);
  return { ...reading, amount };
}

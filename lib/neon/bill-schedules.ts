import "server-only";
import type { PoolClient } from "pg";
import { billScheduleInput, type BillSchedule } from "./invoice-input.ts";
import { DatabaseAccessError, withActorTenant } from "./tenant-context.ts";

export const billingStaff = ["billing_admin"] as const;

export async function getBillSchedules(db: PoolClient, tenant: string, id?: string) {
  const { rows } = await db.query<BillSchedule & { fee_item_id: string; tariff_id: string | null }>(`
    SELECT s.id,f.id AS fee_item_id,f.name,s.recurrence,s.effective_from::text AS start_date,s.effective_to::text AS end_date,
      CASE WHEN w.id IS NULL THEN 'fixed' ELSE 'water' END AS pricing,
      coalesce(w.rate_per_m3,s.amount)::numeric(18,0)::text AS amount,w.id AS tariff_id
    FROM app.fee_schedules s JOIN app.fee_items f ON (f.tenant_id,f.id)=(s.tenant_id,s.fee_item_id)
    JOIN app.fee_categories c ON (c.tenant_id,c.id)=(f.tenant_id,f.category_id)
    LEFT JOIN app.water_tariffs w ON (w.tenant_id,w.id)=(s.tenant_id,s.water_tariff_id)
    WHERE s.tenant_id=$1 AND c.code='workspace-bills' AND f.active AND c.active AND ($2::uuid IS NULL OR s.id=$2)
    ORDER BY f.name,s.effective_from DESC,s.id`, [tenant, id ?? null]);
  return rows;
}

export async function createBillSchedule(actor: string, tenant: string, body: Record<string, unknown>) {
  let input;
  try { input = billScheduleInput(body); }
  catch (error) { throw new DatabaseAccessError((error as Error).message, 400); }
  return withActorTenant(actor, tenant, async db => {
    const { item, amount, period, recurrence, pricing } = input;
    const category = await db.query<{ id: string }>(`
      INSERT INTO app.fee_categories(tenant_id,code,name) VALUES ($1,'workspace-bills','Tagihan terjadwal')
      ON CONFLICT (tenant_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [tenant]);
    const fee = await db.query<{ id: string }>(`
      INSERT INTO app.fee_items(tenant_id,category_id,code,name)
      VALUES ($1,$2,'workspace-bill-'||md5(lower($3)),$3) RETURNING id`, [tenant, category.rows[0].id, item]);
    let tariffId: string | null = null;
    if (pricing === "water") {
      const tariff = await db.query<{ id: string }>(`
        INSERT INTO app.water_tariffs(tenant_id,name,rate_per_m3,effective_from)
        VALUES ($1,$2,$3,$4) RETURNING id`, [tenant, item, amount, period]);
      tariffId = tariff.rows[0].id;
    }
    const schedule = await db.query<{ id: string }>(`
      INSERT INTO app.fee_schedules(tenant_id,fee_item_id,scope,amount,recurrence,effective_from,effective_to,payer_rule,vacancy_rule,water_tariff_id)
      VALUES ($1,$2,'tenant',$3,$4,$5,CASE WHEN $4='one_time' THEN ($5::date+interval '1 month')::date END,'explicit','skip',$6)
      RETURNING id`, [tenant, fee.rows[0].id, pricing === "fixed" ? amount : "0", recurrence, period, tariffId]);
    const { id } = schedule.rows[0];
    await db.query(`INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
      VALUES ($1,$2,'bill_schedule.created','fee_schedule',$3)`, [tenant, actor, id]);
    return { id };
  }, billingStaff);
}

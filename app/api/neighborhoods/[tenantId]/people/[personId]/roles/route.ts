import { getVerifiedSession } from "@/lib/neon/auth-server";
import { assignmentInput } from "@/lib/neon/resident-admin";
import { apiError, assertSameOrigin, jsonBody } from "@/lib/neon/request";
import { DatabaseAccessError, validUuid, withActorTenant } from "@/lib/neon/tenant-context";

type Context = { params: Promise<{ tenantId: string; personId: string }> };
const headers = { "Cache-Control": "private, no-store" };

async function assignmentContext({ params }: Context) {
  const { data: session } = await getVerifiedSession();
  if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
  const { tenantId, personId } = await params;
  if (!validUuid(personId)) throw new DatabaseAccessError("Warga tidak valid.", 400);
  return { actor: session.user.id, tenantId, personId };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { actor, tenantId, personId } = await assignmentContext(context);
    const result = await withActorTenant(actor, tenantId, async db => {
      const { rows } = await db.query(`
        SELECT r.id, r.role, r.starts_at>now() AS scheduled, r.starts_at::date::text AS start_date, r.ends_at::date::text AS end_date
        FROM app.role_assignments r JOIN app.tenant_memberships m ON (m.tenant_id,m.id)=(r.tenant_id,r.membership_id)
        WHERE m.tenant_id=$1 AND m.person_id=$2 AND r.role IN ('neighborhood_admin','billing_admin')
          AND r.revoked_at IS NULL AND r.ends_at>now()
        ORDER BY r.starts_at,r.id`, [tenantId, personId]);
      const { rows: [availability] } = await db.query<{ can_change: boolean }>(`
        SELECT to_regprocedure('app.change_resident_administrator(uuid,text,date,uuid,text)') IS NOT NULL AS can_change`);
      return { assignments: rows, canChange: availability.can_change };
    }, ["super_admin"]);
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { actor, tenantId, personId } = await assignmentContext(context);
    const body = await jsonBody(request);
    let input;
    try { input = assignmentInput(body); }
    catch (error) { throw new DatabaseAccessError((error as Error).message, 400); }
    if (input.assignmentId !== null && !validUuid(input.assignmentId)) {
      throw new DatabaseAccessError("Penugasan tidak valid.", 400);
    }
    await withActorTenant(actor, tenantId, async db => {
      await db.query("SELECT app.change_resident_administrator($1,$2,$3,$4,$5)",
        [personId, input.role, input.endDate, input.assignmentId, input.reason]);
    }, ["super_admin"]);
    return Response.json({ success: true }, { headers });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42883" && String((error as Error).message).includes("change_resident_administrator")) {
      return apiError(new DatabaseAccessError("Pengaturan hak administrator memerlukan pembaruan basis data. Hubungi pengelola aplikasi.", 503));
    }
    if (code === "42501") return apiError(new DatabaseAccessError("Hanya Super Administrator yang dapat mengatur penugasan.", 403));
    if (code === "P0002") return apiError(new DatabaseAccessError("Akun warga atau penugasan tidak tersedia.", 404));
    if (code === "P0001") return apiError(new DatabaseAccessError("Masa jabatan untuk kemampuan ini bertumpang tindih.", 409));
    if (code === "22023") return apiError(new DatabaseAccessError("Tanggal akhir jabatan harus setelah hari ini.", 400));
    return apiError(error);
  }
}

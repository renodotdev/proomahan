import "server-only";
import type { PoolClient } from "pg";
import { getDatabase } from "./database.ts";

export class DatabaseAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) { super(message); this.status = status; }
}
export const STAFF_ROLES = ["neighborhood_admin", "billing_admin", "content_admin", "service_admin"] as const;
export type DatabaseRole = typeof STAFF_ROLES[number] | "super_admin";
export function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }

// Internal server primitive: actorId must come from a verified session, never request data.
export async function withActorTenant<T>(actorId: string, tenantId: string, work: (client: PoolClient, roles: DatabaseRole[]) => Promise<T>, requiredRoles: readonly DatabaseRole[] = []) {
  if (!validUuid(actorId) || !validUuid(tenantId)) throw new DatabaseAccessError("Invalid account or neighborhood", 400);
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE proomahan_app");
    await client.query("SELECT set_config('app.actor_id',$1,true),set_config('app.tenant_id','',true)", [actorId]);
    const profile = await client.query<{status:string;must_change_password:boolean}>("SELECT status,must_change_password FROM app.user_profiles WHERE user_id=$1", [actorId]);
    if (profile.rows[0]?.status !== "active" || profile.rows[0].must_change_password) throw new DatabaseAccessError("Account requires administrator setup or a password change");
    const platform = await client.query("SELECT id FROM app.platform_role_assignments WHERE user_id=$1 AND starts_at<=now() AND revoked_at IS NULL", [actorId]);
    const membership = await client.query<{id:string}>("SELECT id FROM app.tenant_memberships WHERE user_id=$1 AND tenant_id=$2 AND status='active'", [actorId,tenantId]);
    if (!platform.rows.length && !membership.rows.length) throw new DatabaseAccessError("No active neighborhood membership");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const tenant = await client.query("SELECT id,timezone FROM app.tenants WHERE id=$1 AND status='active'", [tenantId]);
    if (!tenant.rows.length) throw new DatabaseAccessError("Neighborhood is unavailable");
    await client.query("SELECT set_config('TimeZone',$1,true)", [tenant.rows[0].timezone]);
    const assigned = membership.rows.length ? await client.query<{role: DatabaseRole}>("SELECT role FROM app.role_assignments WHERE tenant_id=$1 AND membership_id=$2 AND starts_at<=now() AND ends_at>now() AND (revoked_at IS NULL OR revoked_at>now())", [tenantId,membership.rows[0].id]) : {rows:[]};
    const roles: DatabaseRole[] = platform.rows.length ? ["super_admin"] : assigned.rows.map(row => row.role);
    if (requiredRoles.length && !roles.includes("super_admin") && !roles.some(role => requiredRoles.includes(role))) throw new DatabaseAccessError("Current role does not allow this operation");
    const result = await work(client,roles);
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

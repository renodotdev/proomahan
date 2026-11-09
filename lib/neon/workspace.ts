import "server-only";
import { getVerifiedSession } from "./auth-server.ts";
import { getDatabase } from "./database.ts";
import { DatabaseAccessError, withActorTenant } from "./tenant-context.ts";

export async function workspaceIdentity() {
 const {data:session}=await getVerifiedSession();
 if(!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
 const profile=await getDatabase().query<{display_name:string;status:string;must_change_password:boolean;phone:string|null}>(`SELECT p.display_name,p.status,p.must_change_password,l.phone_e164 AS phone FROM app.user_profiles p LEFT JOIN app_private.phone_login_identifiers l ON l.user_id=p.user_id AND l.disabled_at IS NULL WHERE p.user_id=$1`,[session.user.id]);
 const current=profile.rows[0];
 if(!current || current.status!=="active") throw new DatabaseAccessError("Akun belum diaktifkan administrator.");
 const tenants=await getDatabase().query<{id:string;name:string}>(`SELECT t.id,t.name FROM app.tenants t WHERE t.status='active' AND (EXISTS(SELECT 1 FROM app.tenant_memberships m WHERE m.tenant_id=t.id AND m.user_id=$1 AND m.status='active') OR EXISTS(SELECT 1 FROM app.platform_role_assignments r WHERE r.user_id=$1 AND r.starts_at<=now() AND r.revoked_at IS NULL)) ORDER BY t.name`,[session.user.id]);
 return {userId:session.user.id,name:current.display_name,phone:current.phone,mustChangePassword:current.must_change_password,tenants:tenants.rows};
}

export async function workspaceSummary(tenantId:string) {
 const identity=await workspaceIdentity();
 const summary=await withActorTenant(identity.userId,tenantId,async (db,roles)=>{
  const result=await db.query<{id:string;name:string;cluster_count:number}>("SELECT t.id,t.name,(SELECT count(*)::int FROM app.clusters c WHERE c.tenant_id=t.id AND c.archived_at IS NULL) AS cluster_count FROM app.tenants t WHERE t.id=$1",[tenantId]);
  return {...result.rows[0],roles};
 });
 return {...identity,selectedTenant:summary};
}

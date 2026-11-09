import "server-only";
import { getVerifiedSession } from "./auth-server.ts";
import { DatabaseAccessError, withActorTenant } from "./tenant-context.ts";

export async function getNeighborhood(tenantId: string) {
  const {data:session} = await getVerifiedSession();
  if (!session?.user) throw new DatabaseAccessError("Please sign in",401);
  return withActorTenant(session.user.id,tenantId,async client => {
    const result = await client.query<{id:string;name:string;slug:string;locale:string;timezone:string;currency:string;cluster_count:number}>(`SELECT t.id,t.name,t.slug,t.locale,t.timezone,t.currency,
      (SELECT count(*)::int FROM app.clusters c WHERE c.tenant_id=t.id AND c.archived_at IS NULL) AS cluster_count
      FROM app.tenants t WHERE t.id=$1`,[tenantId]);
    return result.rows[0];
  });
}

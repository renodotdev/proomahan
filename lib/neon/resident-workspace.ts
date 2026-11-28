import "server-only";
import type { CommunityContact } from "../community-contact.ts";
import { residentCommunityContact } from "./community-contact.ts";
import { currentUnitAccess } from "./core-records.ts";
import { withActorTenant } from "./tenant-context.ts";

export type ResidentWorkspaceData = {
  profile: { name: string; phone: string; email: string | null } | null;
  units: { id: string; number: string; cluster: string; address: string | null }[];
  contact: CommunityContact | null;
};

export function residentWorkspace(actorId: string, tenantId: string): Promise<ResidentWorkspaceData> {
  return withActorTenant(actorId, tenantId, async db => {
    const profile = await db.query<NonNullable<ResidentWorkspaceData["profile"]>>(
      `SELECT p.full_name AS name,p.phone,p.email
       FROM app.tenant_memberships m JOIN app.people p ON (p.tenant_id,p.id)=(m.tenant_id,m.person_id)
       WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='active' AND p.archived_at IS NULL`,
      [tenantId, actorId],
    );
    const units = profile.rows[0] ? await db.query<ResidentWorkspaceData["units"][number]>(
      `SELECT r.id,r.number,c.name AS cluster,r.address_detail AS address
       FROM app.units r JOIN app.clusters c ON (c.tenant_id,c.id)=(r.tenant_id,r.cluster_id)
       WHERE r.tenant_id=$1 AND r.archived_at IS NULL AND ${currentUnitAccess("$2")}
       ORDER BY r.number,r.id`,
      [tenantId, actorId],
    ) : null;
    return {
      profile: profile.rows[0] ?? null,
      units: units?.rows ?? [],
      contact: await residentCommunityContact(db, tenantId),
    };
  });
}

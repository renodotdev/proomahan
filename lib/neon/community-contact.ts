import "server-only";
import type { PoolClient } from "pg";
import { contactLink } from "../community-contact.ts";
import { getDatabase } from "./database.ts";

const contactColumns = "SELECT e.phone,e.whatsapp FROM app.contact_entries e";
const contactCategory = "e.active AND e.category='pengurus'";

export async function publicCommunityContact() {
  const slug = process.env.PROOMAHAN_PUBLIC_TENANT_SLUG?.trim() || "dpark-city";
  try {
    const { rows } = await getDatabase().query<{ phone: string; whatsapp: string | null }>(
      `${contactColumns} JOIN app.tenants t ON t.id=e.tenant_id
       WHERE t.slug=$1 AND t.status='active' AND ${contactCategory} AND e.visibility='public'
       ORDER BY e.created_at,e.id`,
      [slug],
    );
    return firstContact(rows);
  } catch {
    console.warn("Public community contact is unavailable.");
    return null;
  }
}

export async function residentCommunityContact(db: PoolClient, tenantId: string) {
  try {
    const { rows } = await db.query<{ phone: string; whatsapp: string | null }>(
      `${contactColumns} WHERE e.tenant_id=$1 AND ${contactCategory}
       ORDER BY e.visibility='residents' DESC,e.created_at,e.id`,
      [tenantId],
    );
    return firstContact(rows);
  } catch {
    console.warn("Resident community contact is unavailable.");
    return null;
  }
}

function firstContact(rows: { phone: string; whatsapp: string | null }[]) {
  for (const row of rows) {
    const contact = contactLink(row.phone, row.whatsapp);
    if (contact) return contact;
  }
  return null;
}

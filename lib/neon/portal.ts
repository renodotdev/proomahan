import "server-only";
import { randomUUID } from "node:crypto";
import { publicPageFields, type PublicPageContent } from "../public-page-content.ts";
import { getDatabase } from "./database.ts";
import { DatabaseAccessError, STAFF_ROLES, validUuid, withActorTenant } from "./tenant-context.ts";

const housing = `
 SELECT u.id,u.number,c.name AS cluster,
   CASE WHEN current_stay.occupancy_type='rented' THEN 'rented'
     WHEN current_stay.id IS NOT NULL THEN 'occupied'
     WHEN u.available_for_rent THEN 'available'
     WHEN EXISTS (SELECT 1 FROM app.unit_occupancies old WHERE old.tenant_id=u.tenant_id AND old.unit_id=u.id
       AND old.end_date<=CURRENT_DATE) THEN 'vacant' ELSE 'unknown' END AS status
 FROM app.units u JOIN app.clusters c ON (c.tenant_id,c.id)=(u.tenant_id,u.cluster_id)
 LEFT JOIN LATERAL (SELECT id,occupancy_type FROM app.unit_occupancies o
   WHERE o.tenant_id=u.tenant_id AND o.unit_id=u.id AND o.start_date<=CURRENT_DATE
     AND (o.end_date IS NULL OR o.end_date>CURRENT_DATE) ORDER BY o.start_date DESC,o.id LIMIT 1) current_stay ON true
 WHERE u.tenant_id=$1 AND u.archived_at IS NULL AND c.archived_at IS NULL`;

export async function housingList(actor: string, tenant: string, query: URLSearchParams) {
  const status = query.get("status") || "";
  const cluster = query.get("cluster") || "";
  const page = portalPage(query);
  return withActorTenant(actor, tenant, async db => {
    const { rows } = await db.query(`WITH housing AS (${housing})
      SELECT id,number,cluster,status FROM housing WHERE status IN ('rented','available','vacant')
        AND ($2='' OR status=$2) AND ($3='' OR cluster=$3)
      ORDER BY cluster,number,id LIMIT 21 OFFSET $4`, [tenant, status, cluster, (page - 1) * 20]);
    const clusters = await db.query<{ name: string }>("SELECT name FROM app.clusters WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY name", [tenant]);
    return { rows: rows.slice(0, 20), next: rows.length > 20, clusters: clusters.rows.map(row => row.name) };
  }, STAFF_ROLES);
}

export async function overview(actor: string, tenant: string, period: string | null) {
  if (period && !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(period)) throw new DatabaseAccessError("Periode tidak valid.", 400);
  return withActorTenant(actor, tenant, async (db, roles) => {
    const superAdmin = roles.includes("super_admin");
    const canBill = superAdmin || roles.includes("billing_admin");
    const canManage = superAdmin || roles.includes("neighborhood_admin");
    const { rows: [month] } = await db.query<{ period: string }>("SELECT coalesce($1,to_char(CURRENT_DATE,'YYYY-MM')) AS period", [period]);
    const { rows: housingCounts } = await db.query<{ status: string; total: number }>(`WITH housing AS (${housing})
      SELECT status,count(*)::int AS total FROM housing GROUP BY status`, [tenant]);
    const { rows: [counts] } = canManage ? await db.query(`SELECT
      (SELECT count(*)::int FROM app.clusters WHERE tenant_id=$1 AND archived_at IS NULL) AS clusters,
      (SELECT count(*)::int FROM app.people WHERE tenant_id=$1 AND archived_at IS NULL) AS people`, [tenant]) : { rows: [null] };
    const { rows: [billing] } = canBill ? await db.query(`SELECT
      coalesce(sum(i.total_amount),0)::text AS issued,coalesce(sum(b.paid_amount),0)::text AS paid,
      coalesce(sum(i.total_amount-b.paid_amount),0)::text AS outstanding,
      count(*) FILTER (WHERE i.due_date<CURRENT_DATE AND b.paid_amount<i.total_amount)::int AS overdue,
      (SELECT count(*)::int FROM app.payments WHERE tenant_id=$1 AND status='submitted') AS pending
      FROM app.invoices i JOIN app.invoice_balances b ON (b.tenant_id,b.invoice_id)=(i.tenant_id,i.id)
      WHERE i.tenant_id=$1 AND i.status='issued' AND i.period=$2::date`, [tenant, month.period + "-01"]) : { rows: [null] };
    return { housing: Object.fromEntries(housingCounts.map(row => [row.status,row.total])), counts, billing, period: month.period };
  }, STAFF_ROLES);
}

export function portalPage(query: URLSearchParams) {
  return Math.max(1, Math.min(100000, Math.floor(Number(query.get("page"))) || 1));
}

export async function bulletin(actor: string, tenant: string, page: number) {
  return withActorTenant(actor, tenant, async (db, roles) => {
    const canPublish = roles.length > 0;
    const { rows } = await db.query(`SELECT id,title,body,status,published_at::text,updated_at::text FROM app.posts
      WHERE tenant_id=$1 AND kind='announcement' AND audience='residents' AND ($2 OR status='published')
      ORDER BY coalesce(published_at,created_at) DESC,id LIMIT 21 OFFSET $3`, [tenant, canPublish, (page - 1) * 20]);
    return { posts: rows.slice(0,20), next: rows.length > 20, canPublish };
  });
}

export async function saveAnnouncement(actor: string, tenant: string, data: Record<string, unknown>) {
  const { id, version, status } = data;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (id !== undefined && (typeof id !== "string" || !validUuid(id) || typeof version !== "string" || !Number.isFinite(Date.parse(version)))) {
    throw new DatabaseAccessError("Pengumuman tidak valid.", 400);
  }
  if (!title || title.length > 140 || !body || body.length > 3000 || (status !== "draft" && status !== "published" && status !== "archived")) {
    throw new DatabaseAccessError("Periksa judul, isi, dan status pengumuman.", 400);
  }
  return withActorTenant(actor, tenant, async db => {
    const result = id ? await db.query<{ id: string }>(`UPDATE app.posts SET title=$3,body=$4,status=$5,
      published_at=CASE WHEN $5='published' THEN coalesce(published_at,now()) ELSE published_at END,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND id=$2 AND audience='residents' AND kind='announcement' AND updated_at=$6::timestamptz RETURNING id`,
    [tenant,id,title,body,status,version]) : await db.query<{ id: string }>(`
      INSERT INTO app.posts (tenant_id,title,slug,body,kind,audience,status,author_id,published_at)
      VALUES ($1,$2,$3,$4,'announcement','residents',$5,$6,CASE WHEN $5='published' THEN now() END) RETURNING id`,
    [tenant,title,randomUUID(),body,status,actor]);
    const post = result.rows[0];
    if (!post) throw new DatabaseAccessError("Pengumuman sudah berubah. Muat ulang halaman.",409);
    await db.query(`INSERT INTO app.audit_events (tenant_id,actor_user_id,action,entity_type,entity_id)
      VALUES ($1,$2,$3,'post',$4)`, [tenant,actor,`announcement.${status}`,post.id]);
    return post;
  }, STAFF_ROLES);
}

export async function publicPage() {
  const slug = process.env.PROOMAHAN_PUBLIC_TENANT_SLUG?.trim() || "dpark-city";
  try {
    const { rows } = await getDatabase().query<{ published: PublicPageContent }>(`
      SELECT p.published FROM app.public_page_content p JOIN app.tenants t ON t.id=p.tenant_id
      WHERE t.slug=$1 AND t.status='active' AND p.published_at IS NOT NULL`, [slug]);
    return rows[0]?.published ?? {};
  } catch {
    return {};
  }
}

export async function publicPageDraft(actor: string, tenant: string) {
  return withActorTenant(actor, tenant, async db => {
    const { rows } = await db.query("SELECT draft,published,published_at::text,updated_at::text FROM app.public_page_content WHERE tenant_id=$1", [tenant]);
    return rows[0] ?? { draft: {}, published: null, published_at: null, updated_at: null };
  }, ["super_admin"]);
}

export async function savePublicPage(actor: string, tenant: string, data: Record<string, unknown>) {
  const publish = data.action === "publish";
  if (!publish && data.action !== "draft") throw new DatabaseAccessError("Tindakan tidak valid.",400);
  const version = data.version;
  if (version !== null && (typeof version !== "string" || !Number.isFinite(Date.parse(version)))) {
    throw new DatabaseAccessError("Versi halaman tidak valid.",400);
  }
  const content: PublicPageContent = {};
  for (const field of publicPageFields) {
    const value = data[field.key];
    if (typeof value !== "string" || value.trim().length > field.max) throw new DatabaseAccessError(`Periksa isian ${field.label.toLowerCase()}.`, 400);
    content[field.key] = value.trim();
  }
  return withActorTenant(actor, tenant, async db => {
    // The version check protects a draft saved by another editor while this page was open.
    const updated = version === null ? await db.query(`INSERT INTO app.public_page_content (tenant_id,draft,published,published_at)
      VALUES ($1,$2::jsonb,CASE WHEN $3 THEN $2::jsonb END,CASE WHEN $3 THEN now() END) ON CONFLICT DO NOTHING RETURNING tenant_id`,
    [tenant,JSON.stringify(content),publish]) : await db.query(`UPDATE app.public_page_content
      SET draft=$2::jsonb,published=CASE WHEN $3 THEN $2::jsonb ELSE published END,
          published_at=CASE WHEN $3 THEN now() ELSE published_at END,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND updated_at=$4::timestamptz RETURNING tenant_id`,
    [tenant,JSON.stringify(content),publish,version]);
    if (!updated.rows.length) throw new DatabaseAccessError("Halaman sudah berubah. Muat ulang untuk melanjutkan.",409);
    await db.query(`INSERT INTO app.audit_events (tenant_id,actor_user_id,action,entity_type,entity_id)
      VALUES ($1,$2,$3,'public_page',$1)`, [tenant,actor,publish ? "public_page.published" : "public_page.draft_saved"]);
    return { success: true };
  }, ["super_admin"]);
}

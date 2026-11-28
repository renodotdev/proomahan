import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { Client } from "pg";
import { realDate } from "../lib/neon/core-input.ts";

const clusters = ["ANDALUSIA", "ALEXANDRIA", "SEVILA", "GRANADA"];
const relations = new Set(["owner", "owner_occupied", "rented", "caretaker", "other"]);
const header = "Klaster\tUnit\tNama\tHubungan terverifikasi\tTanggal mulai (YYYY-MM-DD)\tID warga yang sudah ada";
const [pdf, mode, reviewPath] = process.argv.slice(2);
type SourceRow = { cluster: string; unit: string; name: string };
const rowKey = (cluster: string, unit: string) => `${cluster.trim().toUpperCase()}:${unit.trim().toUpperCase()}`;
const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

async function run() {
  if (!pdf || (mode && (!["--review", "--apply"].includes(mode) || !reviewPath))) {
    throw new Error("Usage: node --experimental-strip-types scripts/reconcile-kas.ts <KAS.pdf> [--review <new.tsv> | --apply <reviewed.tsv>]");
  }
  const text = execFileSync("pdftotext", ["-layout", resolve(pdf), "-"], { encoding: "utf8", maxBuffer: 2_000_000 });
  const pattern = new RegExp(`^(.+?)\\s{2,}(${clusters.join("|")})\\s{2,}([A-Z][0-9][A-Za-z0-9-]*)(?:\\s{2,}|$)`);
  const sources = new Map<string, SourceRow>();
  for (const line of text.split(/[\n\f]/)) {
    const match = line.trim().match(pattern);
    if (!match) continue;
    const [, name, cluster, unit] = match;
    const key = rowKey(cluster, unit);
    if (sources.has(key)) throw new Error(`Duplicate unit in source: ${key}`);
    sources.set(key, { cluster, unit, name: normalizeName(name) });
  }
  if (sources.size !== 92) throw new Error(`Expected 92 KAS rows. Found ${sources.size}. Review the source before proceeding.`);
  console.log(clusters.map(cluster => `${cluster}: ${Array.from(sources.values()).filter(row => row.cluster === cluster).length}`).join(", "));
  if (mode === "--review") {
    const rows = Array.from(sources.values()).map(row => [row.cluster,row.unit,row.name,"","",""].join("\t"));
    await writeFile(reviewPath, [header,...rows].join("\n") + "\n", { flag: "wx", mode: 0o600 });
    console.log("Review sheet created. Fill in verified relationships and dates before using --apply. Blank relationship rows are skipped.");
  }
  if (mode !== "--apply") return;
  const [columns, ...rows] = (await readFile(reviewPath,"utf8")).trimEnd().split(/\r?\n/);
  if (columns !== header) throw new Error("Use the TSV produced by --review.");
  const seen = new Set<string>();
  const reviewed = rows.flatMap((line,index) => {
    const [cluster = "", unit = "", name = "", relation = "", date = "", person = ""] = line.split("\t").map(cell => cell.trim());
    if (!relation) return [];
    const key = rowKey(cluster,unit);
    const source = sources.get(key);
    if (!source || normalizeName(name) !== source.name || seen.has(key) || !relations.has(relation) ||
      (person && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(person))) {
      throw new Error(`Review row ${index + 2}: check the source unit, name, relationship, and existing resident ID.`);
    }
    const start = realDate(date);
    if (start.startsWith("0000")) throw new Error(`Review row ${index + 2}: invalid date.`);
    seen.add(key);
    return [{ ...source, key, relation, date: start, person }];
  });
  if (!reviewed.length) throw new Error("There are no confirmed relationships to apply.");

  nextEnv.loadEnvConfig(process.cwd());
  const connection = new URL(process.env.DATABASE_URL_UNPOOLED || "");
  if (connection.hostname.includes("-pooler")) throw new Error("Use the direct database connection.");
  connection.searchParams.set("sslmode","verify-full");
  const db = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 15000 });
  await db.connect();
  try {
    await db.query("BEGIN");
    const { rows: [context] } = await db.query<{ tenant: string; actor: string }>(`
      SELECT t.id AS tenant,a.user_id AS actor FROM app.tenants t
      JOIN app_private.admin_login_identifiers a ON a.identifier='super-admin-dpark'
      JOIN app.user_profiles p ON p.user_id=a.user_id AND p.status='active' AND NOT p.must_change_password
      JOIN app.platform_role_assignments r ON r.user_id=a.user_id AND r.starts_at<=now() AND r.revoked_at IS NULL
      WHERE t.slug='dpark-city' AND t.status='active'`);
    if (!context) throw new Error("Configure an active D’Park City Super Administrator before importing.");
    const { tenant, actor } = context;
    await db.query("SET LOCAL ROLE proomahan_app");
    await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),pg_advisory_xact_lock(hashtext($1 || ':kas'))", [tenant,actor]);
    for (const row of reviewed) {
      const { rows: matchingClusters } = await db.query<{ id: string; archived_at: string | null }>(`
        SELECT id,archived_at FROM app.clusters WHERE tenant_id=$1 AND (lower(name)=lower($2) OR lower(code)=lower($2))`,
      [tenant,row.cluster]);
      if (matchingClusters.length > 1 || matchingClusters[0]?.archived_at) throw new Error(`Resolve the cluster match for ${row.key} before importing.`);
      const cluster = matchingClusters[0] ?? (await db.query<{ id: string }>(
        "INSERT INTO app.clusters (tenant_id,code,name) VALUES ($1,$2,$2) RETURNING id", [tenant,row.cluster])).rows[0];
      let { rows: [unit] } = await db.query<{ id: string; archived_at: string | null }>(
        "SELECT id,archived_at FROM app.units WHERE tenant_id=$1 AND cluster_id=$2 AND lower(number)=lower($3) FOR UPDATE", [tenant,cluster.id,row.unit]);
      if (!unit) {
        ({ rows: [unit] } = await db.query<{ id: string; archived_at: string | null }>(
          "INSERT INTO app.units (tenant_id,cluster_id,number) VALUES ($1,$2,$3) RETURNING id,archived_at",[tenant,cluster.id,row.unit]));
      }
      if (unit.archived_at) throw new Error(`Archived unit: ${row.key}.`);
      const { rows: matches } = await db.query<{ id: string; archived_at: string | null }>(`
        SELECT id,archived_at FROM app.people WHERE tenant_id=$1
          AND (CASE WHEN $3::uuid IS NULL THEN lower(regexp_replace(btrim(full_name),'\\s+',' ','g'))=lower($2) ELSE id=$3 END)`,
      [tenant,row.name,row.person || null]);
      if (matches.length > 1 || matches[0]?.archived_at || (row.person && !matches.length)) {
        throw new Error(`Resolve the existing resident match for ${row.key}.`);
      }
      const person = matches[0] ?? (await db.query<{ id: string }>("INSERT INTO app.people (tenant_id,full_name) VALUES ($1,$2) RETURNING id", [tenant,row.name])).rows[0];
      if (row.relation === "owner") {
        const exists = await db.query(`SELECT id FROM app.unit_ownerships
          WHERE tenant_id=$1 AND unit_id=$2 AND person_id=$3 AND start_date=$4`, [tenant,unit.id,person.id,row.date]);
        if (exists.rows.length) continue;
        await db.query(`INSERT INTO app.unit_ownerships (tenant_id,unit_id,person_id,start_date)
          VALUES ($1,$2,$3,$4)`, [tenant,unit.id,person.id,row.date]);
      } else {
        const exists = await db.query(`SELECT o.id FROM app.unit_occupancies o
          JOIN app.occupancy_members m ON (m.tenant_id,m.occupancy_id)=(o.tenant_id,o.id)
          WHERE o.tenant_id=$1 AND o.unit_id=$2 AND m.person_id=$3 AND o.start_date=$4 AND o.occupancy_type=$5`,
        [tenant,unit.id,person.id,row.date,row.relation]);
        if (exists.rows.length) continue;
        const { rows: [stay] } = await db.query<{ id: string }>(`INSERT INTO app.unit_occupancies (tenant_id,unit_id,occupancy_type,start_date,recorded_by)
          VALUES ($1,$2,$3,$4,$5) RETURNING id`, [tenant,unit.id,row.relation,row.date,actor]);
        await db.query(`INSERT INTO app.occupancy_members (tenant_id,occupancy_id,person_id,start_date,is_primary_contact)
          VALUES ($1,$2,$3,$4,true)`, [tenant,stay.id,person.id,row.date]);
      }
      await db.query(`INSERT INTO app.audit_events (tenant_id,actor_user_id,action,entity_type,entity_id)
        VALUES ($1,$2,'kas.relationship_imported','unit',$3)`, [tenant,actor,unit.id]);
    }
    await db.query("COMMIT");
    console.log(`Reconciled ${reviewed.length} reviewed unit relationships.`);
  } catch (failure) {
    await db.query("ROLLBACK");
    if (typeof failure === "object" && failure && "code" in failure) throw new Error("Database rejected the import. Check for conflicting occupancy or unit records. No rows were applied.");
    throw failure;
  } finally { await db.end(); }
}
run().catch(failure => { console.error((failure as Error).message); process.exitCode = 1; });

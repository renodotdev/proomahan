import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Client } from "pg";

export async function migrate(client: Client, directory = new URL("../../db/migrations/", import.meta.url)) {
  await client.query("SELECT pg_advisory_lock(73180421)");
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS app_private; REVOKE ALL ON SCHEMA app_private FROM PUBLIC; CREATE TABLE IF NOT EXISTS app_private.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!files.length) throw new Error("No migrations found");
    for (const version of files) {
      const sql = await readFile(new URL(version, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{checksum:string}>("SELECT checksum FROM app_private.schema_migrations WHERE version=$1", [version]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${version}`);
        console.log(`Unchanged ${version}`); continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO app_private.schema_migrations(version,checksum) VALUES ($1,$2)", [version,checksum]);
        await client.query("COMMIT"); console.log(`Applied ${version}`);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally { await client.query("SELECT pg_advisory_unlock(73180421)"); }
}

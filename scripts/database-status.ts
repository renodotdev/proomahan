import nextEnv from "@next/env";
import { getDatabase } from "../lib/neon/database.ts";
nextEnv.loadEnvConfig(process.cwd());
const db=getDatabase();
try {
 const tables=await db.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename");
 const migrations=await db.query<{version:string}>("SELECT version FROM app_private.schema_migrations ORDER BY version");
 const tenants=await db.query<{name:string;slug:string}>("SELECT name,slug FROM app.tenants ORDER BY slug");
 console.log(`Connected: ${tables.rows.length} application tables, ${migrations.rows.length} migrations`);
 console.log(`Neighborhoods: ${tenants.rows.map(row=>`${row.name} (${row.slug})`).join(', ')}`);
 console.log(`Tables: ${tables.rows.map(row=>row.tablename).join(', ')}`);
} catch { console.error("Database status check failed; verify server configuration and applied migrations."); process.exitCode=1; }
finally { await db.end(); }

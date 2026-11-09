import nextEnv from "@next/env";
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { migrate } from "../lib/neon/migrations.ts";
nextEnv.loadEnvConfig(process.cwd());
const branch = process.argv[2];
const raw = branch ? execFileSync("neon", ["connection-string", branch, "--ssl", "verify-full"], {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim() : process.env.DATABASE_URL_UNPOOLED;
if (!raw) throw new Error("DATABASE_URL_UNPOOLED is required");
const connection = new URL(raw);
if (connection.hostname.includes("-pooler")) throw new Error("Migrations require a direct connection");
connection.searchParams.set("sslmode","verify-full");
const client = new Client({connectionString:connection.toString(),connectionTimeoutMillis:15000});
try { await client.connect(); await migrate(client); }
catch (error) { console.error("Migration failed:", error instanceof Error ? error.message : "database error"); process.exitCode=1; }
finally { await client.end(); }

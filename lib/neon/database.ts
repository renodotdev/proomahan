import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { requiredEnv } from "./environment.ts";

let pool: Pool | undefined;
export function getDatabase() {
  if (!pool) {
    const connection = new URL(requiredEnv("DATABASE_URL"));
    connection.searchParams.set("sslmode", "verify-full");
    pool = new Pool({ connectionString: connection.toString(), max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 5000 });
    attachDatabasePool(pool);
  }
  return pool;
}

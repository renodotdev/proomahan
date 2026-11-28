import "server-only";
import { createHmac } from "node:crypto";
import { getDatabase } from "./database.ts";
import { requiredEnv } from "./environment.ts";
import { DatabaseAccessError } from "./tenant-context.ts";

export async function loginEmail(identifier: string) {
  const isAdmin = identifier === "super-admin-dpark";
  const db=getDatabase();
  const globalRate=await db.query<{attempts:number}>(`INSERT INTO app_private.login_rate_limits(bucket_key,window_start,attempts) VALUES ('endpoint',date_trunc('minute',now()),1) ON CONFLICT(bucket_key,window_start) DO UPDATE SET attempts=app_private.login_rate_limits.attempts+1 RETURNING attempts`);
  if(globalRate.rows[0].attempts>300)throw new DatabaseAccessError("Layanan masuk sedang sibuk. Tunggu satu menit lalu coba lagi.",429);
  const hash=createHmac("sha256",requiredEnv("NEON_AUTH_COOKIE_SECRET")).update((isAdmin ? "id:" : "phone:") + identifier).digest("hex");
  const rate=await db.query<{attempts:number}>(`INSERT INTO app_private.login_rate_limits(bucket_key,window_start,attempts)
    VALUES ($1,date_trunc('minute',now()),1) ON CONFLICT(bucket_key,window_start) DO UPDATE SET attempts=app_private.login_rate_limits.attempts+1 RETURNING attempts`,[hash]);
  if (rate.rows[0].attempts>10) throw new DatabaseAccessError("Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.",429);
  if(globalRate.rows[0].attempts===1)await db.query("DELETE FROM app_private.login_rate_limits WHERE window_start<now()-interval '1 day'");
  const result = await db.query<{ email: string }>(isAdmin ? `
    SELECT u.email FROM app_private.admin_login_identifiers l
    JOIN app.user_profiles p ON p.user_id=l.user_id
    JOIN neon_auth."user" u ON u.id=p.user_id
    JOIN app.platform_role_assignments r ON r.user_id=p.user_id
    WHERE l.identifier=$1 AND p.status='active' AND r.starts_at<=now() AND r.revoked_at IS NULL
    ` : `
    SELECT u.email FROM app_private.phone_login_identifiers l
    JOIN app.user_profiles p ON p.user_id=l.user_id
    JOIN neon_auth."user" u ON u.id=l.user_id
    WHERE l.phone_e164=$1 AND l.disabled_at IS NULL AND p.status='active'
      AND NOT EXISTS (SELECT 1 FROM app_private.admin_login_identifiers a WHERE a.user_id=l.user_id)
    `, [identifier]);
  // Unknown identifiers still pass through the provider's invalid-password path.
  return result.rows[0]?.email || "unavailable@accounts.proomahan.invalid";
}

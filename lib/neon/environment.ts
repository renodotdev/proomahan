export function requiredEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function authEnvironment(env: Record<string, string | undefined> = process.env) {
  const baseUrl = requiredEnv("NEON_AUTH_BASE_URL", env);
  const secret = requiredEnv("NEON_AUTH_COOKIE_SECRET", env);
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("NEON_AUTH_BASE_URL must be an HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("NEON_AUTH_BASE_URL must be an HTTPS URL");
  if (secret.length < 32) throw new Error("NEON_AUTH_COOKIE_SECRET must contain at least 32 characters");
  return { baseUrl, cookies: { secret } };
}

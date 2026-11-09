import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { authEnvironment } from "./environment.ts";

// Resolve secrets at request time so the demo can still build before provisioning.
export function getAuth() {
  return createNeonAuth(authEnvironment());
}

export function getVerifiedSession() {
  return getAuth().getSession({ query: { disableCookieCache: "true" } });
}

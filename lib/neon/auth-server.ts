import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { authEnvironment } from "./environment.ts";

type AuthAdmin = {
  createUser(input: { email: string; name: string; password: string; role: "user" }): Promise<{
    data: { user: { id: string } } | null;
    error: unknown;
  }>;
  removeUser(input: { userId: string }): Promise<{ error: unknown }>;
  setUserPassword(input: { userId: string; newPassword: string }): Promise<{ error: unknown }>;
  revokeUserSessions(input: { userId: string }): Promise<{ error: unknown }>;
};

// Resolve secrets at request time so the demo can still build before provisioning.
export function getAuth() {
  return createNeonAuth(authEnvironment());
}

export function getAuthAdmin() {
  // The SDK exposes these endpoints at runtime, but its inferred admin type can resolve to unknown.
  return getAuth().admin as AuthAdmin;
}

export function getVerifiedSession() {
  return getAuth().getSession({ query: { disableCookieCache: "true" } });
}

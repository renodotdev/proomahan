import { QueryClient } from "@tanstack/react-query";
import type { CoreResource } from "./neon/core-input.ts";

export const cacheTimes = { account: 60_000, choices: 300_000, records: 30_000, documents: 30_000 };
export const cacheKeys = {
  user: (userId: string) => ["private", userId] as const,
  account: (userId: string) => ["private", userId, "account"] as const,
  tenant: (userId: string, tenantId: string) => ["private", userId, "tenant", tenantId] as const,
  summary: (userId: string, tenantId: string) => ["private", userId, "tenant", tenantId, "summary"] as const,
  resident: (userId: string, tenantId: string) => ["private", userId, "tenant", tenantId, "resident"] as const,
  records: (userId: string, tenantId: string, resource: CoreResource) => ["private", userId, "tenant", tenantId, "records", resource] as const,
  documents: (userId: string) => ["private", userId, "documents"] as const,
};

export function createClientCache() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: cacheTimes.records, gcTime: typeof window === "undefined" ? Infinity : 300_000, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true }, mutations: { retry: false } } });
}

export async function invalidateRecords(client: QueryClient, userId: string, tenantId: string, resource: CoreResource) {
  const affected: CoreResource[] = resource === "clusters" ? ["clusters", "units"] : resource === "people" ? ["people", "units"] : ["units"];
  await Promise.all([
    ...affected.map(item => client.invalidateQueries({ queryKey: cacheKeys.records(userId, tenantId, item) })),
    client.invalidateQueries({ queryKey: cacheKeys.resident(userId, tenantId) }),
    ...(resource === "clusters" ? [client.invalidateQueries({ queryKey: cacheKeys.summary(userId, tenantId) })] : []),
  ]);
}

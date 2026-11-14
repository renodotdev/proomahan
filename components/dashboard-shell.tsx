"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import WorkspaceNavigation from "@/components/workspace-navigation";
import { useConfirmation } from "@/components/action-confirmation";
import { authClient } from "@/lib/neon/auth-client";
import { cacheKeys, cacheTimes, createClientCache } from "@/lib/client-cache";

type Identity = { userId: string; name: string; phone: string; mustChangePassword: boolean; tenants: { id: string; name: string }[] };
type Summary = { selectedTenant: { roles: string[]; cluster_count: number } };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function requestJSON<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { ...(options?.body instanceof Blob ? {} : { "Content-Type": "application/json" }), ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Data belum dapat dimuat.", response.status);
  return data;
}
type Dashboard = { userId: string; identity: Identity; tenant: string; summary?: Summary["selectedTenant"]; api: typeof requestJSON };
const DashboardContext = createContext<Dashboard | null>(null);
export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("DashboardShell is required");
  return context;
}

export default function DashboardShell({ userId, children }: { userId: string; children: ReactNode }) {
  const [client] = useState(createClientCache);
  return <QueryClientProvider client={client}><DashboardContent userId={userId} client={client}>{children}</DashboardContent></QueryClientProvider>;
}
function DashboardContent({ userId, client, children }: { userId: string; client: ReturnType<typeof createClientCache>; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirmation();
  const [selectedTenant, setSelectedTenant] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState("");
  const redirecting = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const leave = useCallback((destination: string) => {
    if (redirecting.current) return;
    redirecting.current = true;
    client.clear();
    window.location.assign(destination);
  }, [client]);
  const api = useCallback<typeof requestJSON>(async (url, options) => {
    try { return await requestJSON(url, options); }
    catch (error) { if (error instanceof ApiError && error.status === 401) leave("/sign-in"); throw error; }
  }, [leave]);
  const account = useQuery({ queryKey: cacheKeys.account(userId), staleTime: cacheTimes.account, queryFn: async ({ signal }) => {
    const data = await api<Identity>("/api/workspace", { signal });
    if (data.userId !== userId) { leave("/workspace"); throw new Error("Akun berubah. Memuat ulang…"); }
    return data;
  } });
  const identity = account.data;
  const tenant = identity?.tenants.some(item => item.id === selectedTenant) ? selectedTenant : identity?.tenants[0]?.id || "";
  const summary = useQuery({ queryKey: cacheKeys.summary(userId, tenant), staleTime: cacheTimes.account, enabled: !!tenant && !identity?.mustChangePassword, queryFn: ({ signal }) => api<Summary>(`/api/workspace?tenantId=${encodeURIComponent(tenant)}`, { signal }) });
  const currentSummary = summary.isError ? undefined : summary.data?.selectedTenant;
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const broadcast = new BroadcastChannel("proomahan-auth");
    channel.current = broadcast;
    broadcast.onmessage = event => { if (event.data === "signed-out") leave("/sign-in"); };
    return () => { broadcast.close(); channel.current = null; };
  }, [leave]);
  useEffect(() => {
    if (identity?.mustChangePassword && pathname !== "/workspace") router.replace("/workspace?view=password");
  }, [identity?.mustChangePassword, pathname, router]);
  async function signOut() {
    if (!await confirm({ title: "Keluar dari akun?", description: "Anda perlu masuk kembali untuk mengakses data pribadi.", confirmLabel: "Keluar" })) return;
    setLeaving(true); setMessage("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      channel.current?.postMessage("signed-out");
      leave("/sign-in");
    } catch { setMessage("Belum dapat keluar. Silakan coba lagi."); setLeaving(false); }
  }
  const view = params.get("view");
  const active = pathname === "/documents" ? "documents" : identity?.mustChangePassword || view === "password" ? "password" : view === "people" || view === "clusters" ? view : "units";
  const error = account.error || summary.error;
  return <div className="live-shell">
    <WorkspaceNavigation active={active} canManage={currentSummary?.roles.some(role => role === "super_admin" || role === "neighborhood_admin") || false} name={identity?.name || ""} disabled={!identity || identity.mustChangePassword || leaving} onChoose={resource => router.push(`/workspace?view=${resource}`)} onPassword={() => router.push("/workspace?view=password")} onSignOut={signOut} />
    <main className="live-main">
      {message && <p className="live-alert" role="alert">{message}</p>}
      {error ? <div className="live-alert" role="alert">{error.message}<button className="button secondary" onClick={() => { account.refetch(); if (tenant) summary.refetch(); }}>Coba lagi</button></div> : !identity || leaving ? <p role="status">{leaving ? "Keluar dari akun…" : "Memuat akun…"}</p> : <DashboardContext.Provider value={{ userId, identity, tenant, summary: currentSummary, api }}>
        <header className="page-heading"><div><span className="eyebrow">LINGKUNGAN TERTATA, WARGA NYAMAN</span><h1>Ruang {identity.name}</h1><p>{identity.phone}</p></div>{identity.tenants.length > 0 && <label className="field"><span>Lingkungan</span><select value={tenant} onChange={event => setSelectedTenant(event.target.value)}>{identity.tenants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</header>
        {identity.mustChangePassword && pathname !== "/workspace" ? <p role="status">Membuka pengaturan kata sandi…</p> : children}
      </DashboardContext.Provider>}
    </main>
  </div>;
}

import type { Demo } from "./demo.ts";

// shortcut: browser-local simulation only; enforce these rules in server/RLS before connecting real data.

export const TENANT_ID = "dpark-city";
export const ROLE_LABELS = {
  super_admin: "Super Administrator",
  neighborhood_admin: "Administrator warga",
  billing_admin: "Administrator penagihan",
  content_admin: "Administrator konten",
  service_admin: "Administrator layanan",
} as const;
export type StaffRole = keyof typeof ROLE_LABELS;
export type RoleAssignment = {
  id: string; userId: string; tenantId: string | null; role: StaffRole;
  startsAt: string; endsAt: string | null; revokedAt: string | null;
  assignedBy: string; reason: string; renewsId?: string;
};
export type RoleEvent = {
  id: string; assignmentId: string; actorId: string; at: string;
  action: "appointed" | "renewed" | "revoked"; reason: string;
};
export function assignmentStatus(assignment: RoleAssignment, at: string) {
  const now = Date.parse(at);
  if (!Number.isFinite(now)) throw new Error("Waktu pemeriksaan tidak valid.");
  if (!Number.isFinite(Date.parse(assignment.startsAt)) || (assignment.endsAt !== null && !Number.isFinite(Date.parse(assignment.endsAt))) ||
    (assignment.revokedAt !== null && !Number.isFinite(Date.parse(assignment.revokedAt))) ||
    (assignment.endsAt !== null && Date.parse(assignment.endsAt) <= Date.parse(assignment.startsAt)) ||
    (assignment.role !== "super_admin" && assignment.endsAt === null)) return "Tidak valid";
  if (assignment.revokedAt && Date.parse(assignment.revokedAt) <= now) return "Dicabut";
  if (Date.parse(assignment.startsAt) > now) return "Terjadwal";
  if (assignment.endsAt && Date.parse(assignment.endsAt) <= now) return "Berakhir";
  return "Aktif";
}
export function activeRoles(state: Demo, userId: string, tenantId: string, at: string): StaffRole[] {
  if (!state.accounts.some(account => account.id === userId && account.active)) return [];
  return state.assignments.filter(a => Object.hasOwn(ROLE_LABELS, a.role) && a.userId === userId && assignmentStatus(a, at) === "Aktif" &&
    (a.role === "super_admin" ? a.tenantId === null : a.tenantId === tenantId)).map(a => a.role);
}
export const ADMIN_FEATURES = ["dashboard", "units", "invoices", "payments", "reports", "cash", "templates", "fees", "news", "services", "accounts", "roles", "settings"] as const;
const ROLE_VIEWS: Record<StaffRole, readonly string[]> = {
  super_admin: ADMIN_FEATURES,
  neighborhood_admin: ["units", "accounts"],
  billing_admin: ["invoices", "payments", "reports", "cash", "templates", "fees"],
  content_admin: ["news"],
  service_admin: ["services"],
};
export function allowedViews(state: Demo, userId: string, tenantId: string, at: string) {
  return [...new Set(activeRoles(state, userId, tenantId, at).flatMap(role => ROLE_VIEWS[role]))];
}
function requireSuper(state: Demo, actorId: string, at: string) {
  if (!activeRoles(state, actorId, TENANT_ID, at).includes("super_admin")) throw new Error("Hanya Super Administrator yang dapat mengelola masa jabatan.");
}
export function appointRole(state: Demo, assignment: RoleAssignment, actorId: string, at: string): Demo {
  requireSuper(state, actorId, at);
  const account = state.accounts.find(a => a.id === assignment.userId && a.active && a.resident);
  if (!account) throw new Error("Pilih warga dengan akun aktif.");
  if (assignment.role === "super_admin" || !Object.hasOwn(ROLE_LABELS, assignment.role) || assignment.tenantId !== TENANT_ID) throw new Error("Pilih peran pengurus D'Park City.");
  const start = Date.parse(assignment.startsAt), end = Date.parse(assignment.endsAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < Date.parse(at)) throw new Error("Masa jabatan harus dimulai sekarang atau nanti, dengan waktu berakhir setelah mulai.");
  if (!assignment.reason.trim() || !assignment.id || state.assignments.some(a => a.id === assignment.id)) throw new Error("Isi alasan penetapan dan gunakan referensi baru.");
  if (state.assignments.some(a => a.userId === assignment.userId && a.role === assignment.role && a.tenantId === assignment.tenantId &&
    Math.min(Date.parse(a.endsAt || "9999-12-31"), a.revokedAt ? Date.parse(a.revokedAt) : Infinity) > Date.parse(a.startsAt) &&
    start < Math.min(Date.parse(a.endsAt || "9999-12-31"), a.revokedAt ? Date.parse(a.revokedAt) : Infinity) && end > Date.parse(a.startsAt))) throw new Error("Masa jabatan untuk peran yang sama bertumpang tindih.");
  if (assignment.renewsId) {
    const prior = state.assignments.find(a => a.id === assignment.renewsId);
    if (!prior || prior.userId !== assignment.userId || prior.role !== assignment.role || prior.tenantId !== assignment.tenantId || prior.revokedAt || start < Date.parse(prior.endsAt || "9999-12-31")) throw new Error("Perpanjangan harus mengikuti akhir masa jabatan sebelumnya.");
  }
  const next = { ...assignment, assignedBy: actorId, revokedAt: null };
  return { ...state, assignments: [...state.assignments, next], roleEvents: [...state.roleEvents,
    { id: `event-${assignment.id}`, assignmentId: assignment.id, actorId, at, action: assignment.renewsId ? "renewed" : "appointed", reason: assignment.reason.trim() }] };
}
export function revokeRole(state: Demo, id: string, actorId: string, at: string, reason: string): Demo {
  requireSuper(state, actorId, at);
  const assignment = state.assignments.find(a => a.id === id);
  if (!assignment || !["Aktif", "Terjadwal"].includes(assignmentStatus(assignment, at))) throw new Error("Penetapan ini sudah berakhir atau dicabut.");
  if (assignment.role !== "super_admin" && assignment.tenantId !== TENANT_ID) throw new Error("Lingkungan tidak sesuai.");
  if (!reason.trim()) throw new Error("Isi alasan pencabutan.");
  const next = { ...state, assignments: state.assignments.map(a => a.id === id ? { ...a, revokedAt: at } : a) };
  if (assignment.role === "super_admin" && !state.accounts.some(a => activeRoles(next, a.id, TENANT_ID, at).includes("super_admin"))) throw new Error("Super Administrator aktif terakhir tidak dapat dicabut.");
  return { ...next, roleEvents: [...state.roleEvents, { id: `revoke-${id}`, assignmentId: id, actorId, at, action: "revoked", reason: reason.trim() }] };
}

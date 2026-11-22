import { realDate } from "./core-input.ts";

export const residentAdminCapabilities = {
  neighborhood_admin: "Kelola data warga",
  billing_admin: "Kelola dan catat tagihan",
} as const;

export function assignmentInput(body: Record<string, unknown>) {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) throw new Error("Isi alasan tindakan (maksimal 500 karakter).");
  if (body.action === "revoke" && typeof body.assignmentId === "string") {
    return { assignmentId: body.assignmentId, role: null, endDate: null, reason };
  }
  if (body.action !== "assign" || typeof body.role !== "string" || !Object.hasOwn(residentAdminCapabilities, body.role)) {
    throw new Error("Pilih kemampuan administrator yang valid.");
  }
  const endDate = realDate(body.endDate);
  if (endDate.startsWith("0000")) throw new Error("Tanggal tidak valid.");
  return { assignmentId: null, role: body.role, endDate, reason };
}

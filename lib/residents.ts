import type { Demo, Unit } from "./demo.ts";
import { activeRoles, TENANT_ID } from "./access.ts";
import { validBillingDate } from "./billing.ts";

function requireResidentAdmin(state: Demo, actorId: string, at: string) {
  if (!activeRoles(state, actorId, TENANT_ID, at).some(role => role === "super_admin" || role === "neighborhood_admin")) throw new Error("Akses administrator warga aktif diperlukan.");
}
export function residentPhone(value: string, required = true) {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (!phone && !required) return "";
  if (!/^\+?\d{8,15}$/.test(phone)) throw new Error("Isi nomor telepon 8–15 digit, dengan kode negara jika diperlukan.");
  return phone;
}
export function documentStorageUrl(value: string) {
  if (!value.trim()) return "";
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Isi URL penyimpanan yang valid, diawali https://."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.href.length > 2000) throw new Error("Gunakan URL HTTPS tanpa nama pengguna atau kata sandi.");
  return url.href;
}
export function visibleDocumentUrl(value?: string) {
  try { return documentStorageUrl(value || ""); } catch { return ""; }
}
export function residentContacts(input: { ownerPhone: string; ownerDocumentsUrl: string; occupantPhone: string; occupantDocumentsUrl: string }, unit: Pick<Unit, "occupied" | "owner" | "occupant">) {
  const ownerPhone = residentPhone(input.ownerPhone);
  const ownerDocumentsUrl = documentStorageUrl(input.ownerDocumentsUrl);
  const ownerOccupied = unit.occupied && unit.occupant === unit.owner;
  return { ownerPhone, ownerDocumentsUrl,
    occupantPhone: unit.occupied ? ownerOccupied ? ownerPhone : residentPhone(input.occupantPhone) : "",
    occupantDocumentsUrl: unit.occupied ? ownerOccupied ? ownerDocumentsUrl : documentStorageUrl(input.occupantDocumentsUrl) : "" };
}
export function updateResidentContacts(state: Demo, unitId: string, input: Parameters<typeof residentContacts>[0], actorId: string, at: string): Demo {
  requireResidentAdmin(state, actorId, at);
  const unit = state.units.find(unit => unit.id === unitId);
  if (!unit) throw new Error("Unit tidak ditemukan.");
  const contacts = residentContacts(input, unit);
  return { ...state, units: state.units.map(unit => unit.id === unitId ? { ...unit, ...contacts } : unit) };
}
export function occupancyStartDate(value: string) {
  if (validBillingDate(value)) return value;
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const match = /^(\d{1,2}) (\S+) (20\d{2})$/.exec(value);
  if (!match) return "";
  const date = `${match[3]}-${String(months.indexOf(match[2]) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return validBillingDate(date) ? date : "";
}
export function updateOccupancy(state: Demo, unitId: string, input: { occupied: boolean; occupant: string; phone: string; documentsUrl: string; tenure: string; effectiveDate: string }, actorId: string, at: string): Demo {
  requireResidentAdmin(state, actorId, at);
  const unit = state.units.find(unit => unit.id === unitId);
  if (!unit) throw new Error("Unit tidak ditemukan.");
  const since = occupancyStartDate(unit.since);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  if (!validBillingDate(input.effectiveDate) || input.effectiveDate > today || since && input.effectiveDate < since) throw new Error("Tanggal perubahan harus valid, tidak di masa depan, dan tidak mendahului hunian saat ini.");
  const occupant = input.occupied ? input.occupant.trim().replace(/\s+/g, " ") : "";
  if (input.occupied && (occupant.length < 2 || occupant.length > 100 || !["Dihuni pemilik", "Disewakan"].includes(input.tenure))) throw new Error("Isi nama penghuni dan tipe hunian yang valid.");
  if (input.occupied && input.tenure === "Dihuni pemilik" && occupant !== unit.owner) throw new Error("Untuk hunian pemilik, gunakan nama pemilik yang tercatat.");
  const phone = input.occupied ? residentPhone(input.phone) : "";
  const documentsUrl = input.occupied ? documentStorageUrl(input.documentsUrl) : "";
  if (unit.occupied === input.occupied && unit.occupant === occupant && (!input.occupied || unit.tenure === input.tenure)) throw new Error("Tidak ada perubahan penghuni. Gunakan Ubah kontak dan dokumen untuk memperbarui data kontak.");
  const history = [...(unit.occupancyHistory || []), { occupant: unit.occupant, phone: unit.occupantPhone || "", documentsUrl: unit.occupantDocumentsUrl || "", tenure: unit.occupied ? unit.tenure : "Kosong", from: unit.since, to: input.effectiveDate, recordedBy: actorId, recordedAt: at }];
  const next: Unit = { ...unit, occupied: input.occupied, occupant, occupantPhone: phone, occupantDocumentsUrl: documentsUrl, tenure: input.occupied ? input.tenure : "Kosong", since: input.effectiveDate, occupancyHistory: history, forRent: input.occupied && input.tenure === "Disewakan" ? true : unit.forRent ?? unit.tenure === "Disewakan",
    ...(input.occupied && occupant === unit.owner ? { ownerPhone: phone, ownerDocumentsUrl: documentsUrl } : {}) };
  return { ...state, units: state.units.map(unit => unit.id === unitId ? next : unit) };
}

export function isRentalUnit(unit: Unit) { return unit.forRent ?? unit.tenure === "Disewakan"; }
export function checkInResident(state: Demo, unitId: string, input: { occupant: string; phone: string; documentsUrl: string; tenure: string; effectiveDate: string }, actorId: string, at: string) {
  requireResidentAdmin(state, actorId, at);
  const unit = state.units.find(unit => unit.id === unitId);
  if (!unit || unit.occupied) throw new Error("Check-out penghuni saat ini sebelum melakukan check-in baru.");
  return updateOccupancy(state, unitId, { ...input, occupied: true }, actorId, at);
}
export function checkOutResident(state: Demo, unitId: string, effectiveDate: string, actorId: string, at: string) {
  requireResidentAdmin(state, actorId, at);
  const unit = state.units.find(unit => unit.id === unitId);
  if (!unit?.occupied) throw new Error("Unit sudah kosong. Tidak ada penghuni untuk check-out.");
  return updateOccupancy(state, unitId, { occupied: false, occupant: "", phone: "", documentsUrl: "", tenure: "", effectiveDate }, actorId, at);
}
export function updateResidentProfile(state: Demo, unitId: string, input: { number: string; cluster: string; owner: string; occupant: string; since: string; tenure: string; forRent: boolean; ownerPhone: string; ownerDocumentsUrl: string; occupantPhone: string; occupantDocumentsUrl: string }, actorId: string, at: string): Demo {
  requireResidentAdmin(state, actorId, at);
  const unit = state.units.find(unit => unit.id === unitId);
  if (!unit) throw new Error("Unit tidak ditemukan.");
  const number = input.number.trim().toUpperCase(); const owner = input.owner.trim().replace(/\s+/g, " ");
  const occupant = unit.occupied ? input.occupant.trim().replace(/\s+/g, " ") : "";
  if (!/^[A-Z0-9][A-Z0-9 /-]{0,19}$/.test(number) || state.units.some(unit => unit.id !== unitId && unit.number.toUpperCase() === number)) throw new Error("Nomor unit harus unik, 1–20 karakter huruf/angka, spasi, garis miring, atau tanda hubung.");
  if (!state.clusters.some(cluster => cluster.name === input.cluster && (!cluster.archived || cluster.name === unit.cluster))) throw new Error("Pilih klaster aktif.");
  if (owner.length < 2 || owner.length > 100 || unit.occupied && (occupant.length < 2 || occupant.length > 100 || !["Dihuni pemilik", "Disewakan"].includes(input.tenure))) throw new Error("Isi nama pemilik/penghuni dan tipe hunian dengan benar.");
  if (unit.occupied && input.tenure === "Dihuni pemilik" && occupant !== owner) throw new Error("Nama penghuni harus sama dengan pemilik untuk hunian pemilik.");
  if (unit.occupied && input.tenure === "Disewakan" && !input.forRent) throw new Error("Aktifkan rumah sewa untuk hunian yang sedang disewakan.");
  const since = occupancyStartDate(input.since);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  const lastEnd = unit.occupancyHistory?.at(-1)?.to;
  if (!since || since > today || lastEnd && since < lastEnd) throw new Error("Tanggal mulai harus valid, tidak di masa depan, dan tidak bertumpang tindih dengan riwayat sebelumnya.");
  const contacts = residentContacts(input, { ...unit, owner, occupant });
  const next: Unit = { ...unit, ...contacts, number, owner, occupant, cluster: input.cluster, since, tenure: unit.occupied ? input.tenure : "Kosong", forRent: input.forRent };
  return { ...state, units: state.units.map(unit => unit.id === unitId ? next : unit) };
}

export function matchesHousingStatus(unit: Unit, status: string) {
  if (status === "Semua status") return true;
  if (status === "Rumah sewa") return isRentalUnit(unit);
  if (status === "Sewa tersedia") return isRentalUnit(unit) && !unit.occupied;
  if (status === "Sewa terhuni") return isRentalUnit(unit) && unit.occupied;
  return status === "Terhuni" ? unit.occupied : status === "Kosong" && !unit.occupied;
}

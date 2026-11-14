import type { RoleAssignment, RoleEvent } from "./access.ts";
import { type CommunicationTemplate } from "./communications.ts";
import { applyAllocatedPayment, itemBalances, validateItemAllocations, unallocatedCredit, type ItemAllocation } from "./allocations.ts";

export type Cluster = { id: string; code: string; name: string; archived: boolean };
export type OccupancyRecord = { occupant: string; phone: string; documentsUrl: string; tenure: string; from: string; to: string; recordedBy: string; recordedAt: string };
export type Unit = { id: string; number: string; cluster: string; owner: string; occupant: string; occupied: boolean; tenure: string; since: string; ownerPhone?: string; ownerDocumentsUrl?: string; occupantPhone?: string; occupantDocumentsUrl?: string; occupancyHistory?: OccupancyRecord[]; forRent?: boolean };
export type Fee = { id: string; name: string; category: string; amount: number; frequency: string; scope: string; payer: string; vacancy: string; active: boolean; itemId?: string; effectiveFrom?: string };
export type Invoice = { unitNumber?: string; id: string; unitId: string; person: string; period: string; due: string; items: { name: string; amount: number; chargeType?: "water" }[]; paid: number; kind?: "water"; itemPaid?: number[]; legacyAllocation?: { actorId: string; at: string; allocations: ItemAllocation[] } };
export type Payment = { id: string; invoiceId: string; amount: number; method: string; date: string; reference: string; proof: string; status: "pending" | "verified" | "rejected"; reason?: string; origin?: "admin" | "resident"; recordedBy?: string; recordedAt?: string; verifiedBy?: string; verifiedAt?: string; allocations?: ItemAllocation[]; verifiedAllocations?: ItemAllocation[] };
export type WaterReading = { id: string; unitId: string; person: string; period: string; previous: number; current: number; rate: number; amount: number; due: string; invoiceId: string; recordedBy: string; recordedAt: string };
export type Request = { id: string; kind: "letter" | "report" | "guest"; title: string; person: string; unitId: string; detail: string; status: string; date: string; events: string[]; reference?: string; file?: string };
export type Post = { id: string; title: string; category: string; audience: string; body: string; date: string; art: string; image?: string };
export type CashEntry = { method?: "Tunai" | "Transfer bank"; counterparty?: string; reference?: string; id: string; direction: "income" | "expense"; date: string; amount: number; category: string; note: string; proof: string; recordedBy: string; recordedAt: string };
export type Account = { whatsappReminders?: boolean; id: string; name: string; contact: string; unit: string; resident: boolean; active: boolean };
export type Demo = { version: number; clusters: Cluster[]; units: Unit[]; fees: Fee[]; invoices: Invoice[]; payments: Payment[]; requests: Request[]; posts: Post[]; accounts: Account[]; assignments: RoleAssignment[]; roleEvents: RoleEvent[]; waterReadings: WaterReading[]; cashEntries: CashEntry[]; openingBalance: number; legacyIncome: number; templates: CommunicationTemplate[] };

export const RESIDENT_UNIT = "A-12";
export const PERIOD = "November 2026";
export const currency = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
export const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : value;
export const total = (invoice: Invoice) => invoice.items.reduce((sum, item) => sum + item.amount, 0);
export const remaining = (invoice: Invoice) => total(invoice) - invoice.paid;
export const settlement = (invoice: Invoice) => remaining(invoice) === 0 ? "Lunas" : invoice.paid > 0 ? "Sebagian dibayar" : "Belum dibayar";
export const uid = () => globalThis.crypto.randomUUID();

export function decidePayment(state: Demo, id: string, decision: "verified" | "rejected", reason = "", allocations?: ItemAllocation[]): Demo {
  const payment = state.payments.find(p => p.id === id);
  if (!payment || payment.status !== "pending") throw new Error("Pembayaran ini sudah ditinjau. Muat ulang data untuk melihat status terbaru.");
  const invoice = state.invoices.find(i => i.id === payment.invoiceId);
  if (!invoice) throw new Error("Tagihan tidak ditemukan.");
  if (decision === "rejected" && !reason.trim()) throw new Error("Isi alasan penolakan agar warga dapat memperbaiki pengajuannya.");
  if (decision === "verified" && (payment.amount <= 0 || payment.amount > remaining(invoice))) throw new Error("Nominal tidak sesuai dengan sisa tagihan. Periksa kembali pembayaran.");
  const selected = allocations ?? payment.allocations ?? [];
  const updated = decision === "verified" ? applyAllocatedPayment(invoice, selected, payment.amount) : invoice;
  return { ...state, payments: state.payments.map(p => p.id === id ? { ...p, status: decision, reason, ...(decision === "verified" ? { verifiedAllocations: selected.map(item => ({ ...item })) } : {}) } : p), invoices: state.invoices.map(i => i.id === invoice.id ? updated : i) };
}

export function submitPayment(state: Demo, payment: Payment): Demo {
  const invoice = state.invoices.find(i => i.id === payment.invoiceId && i.unitId === RESIDENT_UNIT);
  if (!invoice || !Number.isSafeInteger(payment.amount) || payment.amount <= 0 || payment.amount > remaining(invoice)) throw new Error("Masukkan nominal yang valid, maksimal sebesar sisa tagihan.");
  if (!payment.id || !["Tunai", "Transfer bank"].includes(payment.method) || !/^20\d{2}-\d{2}-\d{2}$/.test(payment.date) || !Number.isFinite(Date.parse(payment.date)) || new Date(payment.date).toISOString().slice(0, 10) !== payment.date) throw new Error("Isi metode dan tanggal pembayaran yang valid.");
  if (state.payments.some(p => p.invoiceId === invoice.id && p.status === "pending")) throw new Error("Masih ada pembayaran yang menunggu verifikasi untuk tagihan ini.");
  if (payment.method === "Transfer bank" && !payment.proof) throw new Error("Lampirkan bukti transfer terlebih dahulu.");
  if (payment.method === "Tunai" && !payment.reference.trim()) throw new Error("Isi nama penerima atau referensi penyerahan tunai.");
  if (state.payments.some(p => p.id === payment.id)) throw new Error("Konfirmasi ini sudah dikirim.");
  if (unallocatedCredit(invoice) !== 0) throw new Error("Pengurus perlu mengalokasikan pembayaran lama sebelum konfirmasi baru.");
  validateItemAllocations(invoice, payment.allocations || [], payment.amount);
  return { ...state, payments: [{ ...payment, origin: "resident", status: "pending", allocations: payment.allocations!.map(item => ({ ...item })), verifiedAllocations: undefined }, ...state.payments] };
}

export function previewInvoices(state: Demo, period: string): Invoice[] {
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const [monthName, year] = period.split(" ");
  const monthIndex = months.indexOf(monthName);
  if (monthIndex < 0 || !/^20\d{2}$/.test(year || "")) throw new Error("Pilih periode tagihan yang valid.");
  const reference = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const month = reference.slice(0, 7);
  const active = state.fees.filter(f => f.active && (f.effectiveFrom || "2026-01-01") <= (f.frequency === "Satu kali" ? `${month}-31` : reference) && (f.frequency !== "Satu kali" || (f.effectiveFrom || reference).slice(0, 7) === month));
  if (!active.length) throw new Error("Aktifkan setidaknya satu item biaya.");
  return state.units.flatMap(unit => {
    if (state.invoices.some(i => i.unitId === unit.id && i.period === period && i.kind !== "water")) return [];
    const matches = active.filter(f => f.scope === "Semua unit" || f.scope === `Klaster ${unit.cluster}` || f.scope === unit.id);
    const specificity = (f: Fee) => f.scope === unit.id ? 3 : f.scope.startsWith("Klaster ") ? 2 : 1;
    const selected = new Map<string, Fee>();
    for (const fee of matches) {
      const key = fee.itemId || fee.id;
      const prior = selected.get(key);
      if (!prior || specificity(fee) > specificity(prior) || (specificity(fee) === specificity(prior) && (fee.effectiveFrom || "2026-01-01") > (prior.effectiveFrom || "2026-01-01"))) selected.set(key, fee);
    }
    const applicable = [...selected.values()].filter(f => unit.occupied || f.vacancy === "Tetap ditagih");
    if (!applicable.length) return [];
    const payers = [...new Set(applicable.map(f => f.payer))];
    return payers.flatMap(payer => {
      const person = payer === "Pemilik utama" ? unit.owner : unit.occupant;
      if (!person) throw new Error(`Penanggung jawab unit ${unit.id} belum tersedia.`);
      return [{ id: `INV-${month}-${unit.id}-${payer === "Pemilik utama" ? "P" : "H"}`, unitId: unit.id, unitNumber: unit.number, person, period, due: `${month}-10`, items: applicable.filter(f => f.payer === payer).map(f => ({ name: f.name, amount: f.amount })), paid: 0 }];
    });
  });
}

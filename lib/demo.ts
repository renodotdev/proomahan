import type { RoleAssignment, RoleEvent } from "./access.ts";
import { DEFAULT_TEMPLATES, type CommunicationTemplate } from "./communications.ts";
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

export function createDemo(): Demo {
  const names = ["Andi Pratama", "Dewi Lestari", "Rizky Saputra", "Maya Anggraini", "Hendra Wijaya", "Putri Amelia", "Agus Setiawan", "Rina Wulandari", "Dimas Nugraha", "Sinta Maharani", "Arif Hidayat", "Budi Santoso", "Fitri Handayani", "Bayu Permana", "Nina Kartika", "Reza Ramadhan", "Yuni Astuti", "Doni Kurniawan", "Laras Puspita", "Fajar Prasetyo", "Dian Safitri", "Ilham Fauzi", "Wulan Sari", "Taufik Akbar"];
  const units = Array.from({ length: 48 }, (_, i) => ({ id: `${"ABC"[Math.floor(i / 16)]}-${String(i % 16 + 1).padStart(2, "0")}`, number: `${"ABC"[Math.floor(i / 16)]}-${String(i % 16 + 1).padStart(2, "0")}`, cluster: ["Akasia", "Bougenville", "Cendana"][Math.floor(i / 16)], owner: i === 11 ? "Sari Pertiwi" : names[i % names.length], occupant: i < 42 ? names[i % names.length] : "", occupied: i < 42, tenure: i % 4 === 3 ? "Disewakan" : "Dihuni pemilik", since: i === 11 ? "1 Juli 2026" : "1 Januari 2026" }));
  const fees = [
    { id: "dues", name: "Iuran warga", category: "Iuran lingkungan", amount: 75000 },
    { id: "clean", name: "Kebersihan", category: "Layanan lingkungan", amount: 50000 },
    { id: "security", name: "Keamanan", category: "Layanan lingkungan", amount: 100000 },
    { id: "water", name: "Air", category: "Utilitas", amount: 75000 },
  ].map(f => ({ ...f, frequency: "Bulanan", scope: "Semua unit", payer: "Penghuni utama", vacancy: "Tidak ditagih", active: f.id !== "water" }));
  const invoices = units.filter(u => u.occupied).map((unit, i) => ({ id: `INV-2026-${String(i + 1).padStart(4, "0")}`, unitId: unit.id, person: unit.occupant, period: PERIOD, due: "10 Nov 2026", items: fees.map(f => ({ name: f.name, amount: f.amount, ...(f.id === "water" ? { chargeType: "water" as const } : {}) })), paid: [11, 30, 31, 32].includes(i) ? 100000 : i < 30 ? 300000 : 0 }));
  // These opening item allocations belong to the fictional seed, not migrated resident records.
  const allocatedInvoices = invoices.map(invoice => ({ ...invoice, itemPaid: invoice.paid === 300000 ? [75000, 50000, 100000, 75000] : invoice.paid === 100000 ? [75000, 25000, 0, 0] : [0, 0, 0, 0] }));
  return { version: 5, waterReadings: [], cashEntries: [], openingBalance: 0, legacyIncome: invoices.reduce((sum, invoice) => sum + invoice.paid, 0), templates: DEFAULT_TEMPLATES.map(t => ({ ...t })), clusters: [
    { id: "cluster-akasia", code: "AKS", name: "Akasia", archived: false },
    { id: "cluster-bougenville", code: "BGV", name: "Bougenville", archived: false },
    { id: "cluster-cendana", code: "CDN", name: "Cendana", archived: false },
  ], units, fees, invoices: allocatedInvoices,
    payments: [30, 33, 35].map((index, i) => ({ id: `PAY-2026-00${i + 1}`, invoiceId: invoices[index].id, amount: remaining(invoices[index]), method: i === 2 ? "Tunai" : "Transfer bank", date: "7 Nov 2026", reference: i === 2 ? "Diserahkan ke petugas kas contoh" : `TRX-CONTOH-${1032 + i}`, proof: i === 2 ? "" : "bukti-transfer-contoh.jpg", status: "pending", origin: "resident", allocations: itemBalances(allocatedInvoices[index]).filter(item => item.outstanding > 0).map(item => ({ itemIndex: item.itemIndex, amount: item.outstanding })) })),
    requests: [
      { id: "SR-001", kind: "letter", title: "Surat keterangan domisili", person: "Budi Santoso", unitId: "A-12", detail: "Keperluan administrasi tempat kerja.", status: "under_review", date: "6 Nov 2026", events: ["6 Nov · Pengajuan diterima", "7 Nov · Sedang ditinjau pengurus"] },
      { id: "SR-002", kind: "letter", title: "Surat pengantar", person: "Dewi Lestari", unitId: "A-02", detail: "Keperluan administrasi kependudukan.", status: "submitted", date: "7 Nov 2026", events: ["7 Nov · Pengajuan diterima"] },
      { id: "LP-001", kind: "report", title: "Lampu jalan di depan A-12 padam", person: "Budi Santoso", unitId: "A-12", detail: "Lampu jalan tidak menyala sejak kemarin malam. Mohon pemeriksaan petugas.", status: "under_review", date: "6 Nov 2026", events: ["6 Nov · Permintaan diterima", "7 Nov · Diteruskan kepada petugas lingkungan"] },
      { id: "LP-002", kind: "report", title: "Saluran air perlu dibersihkan", person: "Laras Puspita", unitId: "B-03", detail: "Aliran air melambat setelah hujan.", status: "submitted", date: "7 Nov 2026", events: ["7 Nov · Permintaan diterima"] },
      { id: "TM-001", kind: "guest", title: "Kunjungan keluarga — Rudi", person: "Budi Santoso", unitId: "A-12", detail: "8 November 2026, 10.00–14.00 · Kendaraan B 1234 XYZ", status: "acknowledged", date: "7 Nov 2026", events: ["7 Nov · Laporan tamu diterima", "7 Nov · Diketahui petugas keamanan"] },
    ],
    posts: [
      { id: "news-1", title: "Lingkungan bersih, akhir pekan lebih nyaman", category: "Kegiatan warga", audience: "Semua warga", date: "7 November 2026", art: "garden", body: "Mari ikut kerja bakti bersama pada Minggu, 15 November 2026 pukul 07.00. Kita berkumpul di taman lingkungan untuk membersihkan area bersama dan merawat tanaman. Bawa sarung tangan dan semangat kebersamaan. Jadwal ini merupakan contoh untuk pratinjau." },
      { id: "news-2", title: "Perawatan gerbang utama", category: "Pengumuman", audience: "Publik", date: "5 November 2026", art: "gate", body: "Perawatan rutin gerbang akan dilakukan pada 12 November pukul 09.00–11.00. Silakan hubungi petugas keamanan untuk arahan akses. Pengumuman ini menggunakan data contoh." },
      { id: "news-3", title: "Ruang diskusi untuk lingkungan kita", category: "Agenda lingkungan", audience: "Semua warga", date: "3 November 2026", art: "community", body: "Forum warga bulan ini membahas rencana perbaikan fasilitas dan usulan kegiatan lingkungan. Kirim usulan Anda melalui menu Layanan. Agenda ini merupakan contoh." },
    ],
    assignments: [
      { id: "platform-founder", userId: "admin", tenantId: null, role: "super_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: null, revokedAt: null, assignedBy: "admin", reason: "Penyiapan platform contoh" },
      { id: "elected-treasurer", userId: "account-11", tenantId: "dpark-city", role: "billing_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: "2027-01-01T00:00:00+07:00", revokedAt: null, assignedBy: "admin", reason: "Hasil pemilihan pengurus 2026" },
      { id: "elected-residents", userId: "account-0", tenantId: "dpark-city", role: "neighborhood_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: "2027-01-01T00:00:00+07:00", revokedAt: null, assignedBy: "admin", reason: "Hasil pemilihan pengurus 2026" },
    ],
    roleEvents: [],
    accounts: [
      { id: "admin", name: "Nadia Putri", contact: "admin@example.test", unit: "—", resident: false, active: true },
      ...units.filter(u => u.occupied).slice(0, 16).map((u, i) => ({ id: `account-${i}`, name: u.occupant, contact: `warga${i + 1}@example.test`, unit: u.id, resident: true, active: true })),
    ],
  };
}

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

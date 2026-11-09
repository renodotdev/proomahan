import { decidePayment, remaining, total, type Demo, type Payment, type WaterReading } from "./demo.ts";
import { activeRoles, TENANT_ID } from "./access.ts";
import { applyAllocatedPayment, itemBalances, unallocatedCredit, validateItemAllocations, type ItemAllocation } from "./allocations.ts";

// shortcut: browser-local billing simulation; production must use authorized database transactions.
export function requireBilling(state: Demo, actorId: string, at: string) {
  if (!activeRoles(state, actorId, TENANT_ID, at).some(role => role === "super_admin" || role === "billing_admin")) throw new Error("Akses penagihan aktif diperlukan.");
}
export const validBillingDate = (date: string) => /^20\d{2}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export const periodLabel = (period: string) => {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Pilih periode bulan yang valid.");
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
};
export function withMeteredBilling(state: Demo): Demo {
  const waterNames = new Set(["Air", ...state.fees.filter(f => f.id === "water").map(f => f.name)]);
  return { ...state, version: 4, waterReadings: state.waterReadings || [],
    fees: state.fees.map(f => f.id === "water" || f.itemId === "water" ? { ...f, active: false } : f),
    invoices: state.invoices.map(i => ({ ...i, items: i.items.map(item => waterNames.has(item.name) ? { ...item, chargeType: "water" } : item) })),
  };
}
export function recordAdminPayment(state: Demo, input: Payment, actorId: string, at: string): Demo {
  requireBilling(state, actorId, at);
  const invoice = state.invoices.find(i => i.id === input.invoiceId);
  if (!invoice || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > remaining(invoice)) throw new Error("Nominal harus positif dan tidak melebihi sisa tagihan.");
  if (!input.id || state.payments.some(p => p.id === input.id)) throw new Error("Pembayaran ini sudah dicatat.");
  if (state.payments.some(p => p.invoiceId === invoice.id && p.status === "pending")) throw new Error("Tinjau pengajuan pembayaran yang masih menunggu sebelum mencatat pembayaran baru.");
  if (!["Tunai", "Transfer bank"].includes(input.method) || !input.reference.trim() || !validBillingDate(input.date)) throw new Error("Isi metode, tanggal, dan referensi penerimaan atau transaksi.");
  const selected = input.allocations || [];
  const updated = applyAllocatedPayment(invoice, selected, input.amount);
  const payment: Payment = { ...input, status: "verified", origin: "admin", allocations: selected.map(item => ({ ...item })), recordedBy: actorId, recordedAt: at, verifiedBy: actorId, verifiedAt: at, verifiedAllocations: selected.map(item => ({ ...item })) };
  return { ...state, payments: [payment, ...state.payments], invoices: state.invoices.map(i => i.id === invoice.id ? updated : i) };
}
export function reviewPayment(state: Demo, id: string, decision: "verified" | "rejected", reason: string, actorId: string, at: string, allocations?: ItemAllocation[]): Demo {
  requireBilling(state, actorId, at);
  const next = decidePayment(state, id, decision, reason, allocations);
  return { ...next, payments: next.payments.map(p => p.id === id ? { ...p, origin: p.origin || "resident", verifiedBy: actorId, verifiedAt: at } : p) };
}
export function allocateLegacyCredit(state: Demo, invoiceId: string, allocations: ItemAllocation[], actorId: string, at: string): Demo {
  requireBilling(state, actorId, at);
  const invoice = state.invoices.find(i => i.id === invoiceId);
  if (!invoice || unallocatedCredit(invoice) <= 0) throw new Error("Tidak ada pembayaran lama yang perlu dialokasikan.");
  validateItemAllocations(invoice, allocations, unallocatedCredit(invoice));
  const paid = itemBalances(invoice).map(item => item.paid + (allocations.find(a => a.itemIndex === item.itemIndex)?.amount || 0));
  return { ...state, invoices: state.invoices.map(i => i.id === invoiceId ? { ...i, itemPaid: paid, legacyAllocation: { actorId, at, allocations: allocations.map(item => ({ ...item })) } } : i) };
}
export function waterAmount(previous: number, current: number, rate: number) {
  const readings = [previous, current];
  if (readings.some(n => !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 1000)) || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001) || current < previous) throw new Error("Meter akhir harus sama atau lebih besar dari meter awal, maksimal 3 angka desimal. Penggantian meter perlu proses koreksi terpisah.");
  if (!Number.isSafeInteger(rate) || rate <= 0) throw new Error("Tarif per m³ harus berupa rupiah bulat positif.");
  const amount = Math.round((Math.round(current * 1000) - Math.round(previous * 1000)) * rate / 1000);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Nominal air di luar batas yang valid.");
  return amount;
}
export function waterOverview(state: Demo, period: string) {
  const label = periodLabel(period);
  const rows = state.units.map(unit => {
    const invoice = state.invoices.find(i => i.unitId === unit.id && i.period === label && (i.kind === "water" || i.items.some(item => item.chargeType === "water")));
    const reading = state.waterReadings.find(r => r.unitId === unit.id && r.period === period);
    const billed = invoice?.items.filter(item => item.chargeType === "water" || invoice.kind === "water").reduce((sum, item) => sum + item.amount, 0) ?? 0;
    const combined = !!invoice && invoice.kind !== "water";
    return { unit, invoice, reading, billed, combined, person: invoice?.person || unit.occupant || unit.owner,
      paid: invoice && !combined ? invoice.paid : null, outstanding: invoice && !combined ? remaining(invoice) : null };
  });
  return { rows, issued: rows.filter(row => row.invoice).length, unbilled: rows.filter(row => !row.invoice).length,
    billed: rows.reduce((sum, row) => sum + row.billed, 0),
    paid: rows.reduce((sum, row) => sum + (row.paid ?? 0), 0),
    outstanding: rows.reduce((sum, row) => sum + (row.outstanding ?? 0), 0),
    combined: rows.filter(row => row.combined).length };
}
export function billingOverview(state: Demo, period: string) {
  const label = periodLabel(period);
  const rows = waterOverview(state, period).rows.map(row => {
    const invoices = state.invoices.filter(i => i.unitId === row.unit.id && i.period === label);
    const duesInvoices = invoices.filter(i => i.kind !== "water");
    const waterInvoices = invoices.filter(i => i.kind === "water" || i.items.some(item => item.chargeType === "water"));
    const billed = invoices.reduce((sum, invoice) => sum + total(invoice), 0);
    const paid = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
    const outstanding = invoices.reduce((sum, invoice) => sum + remaining(invoice), 0);
    return { ...row, invoices, duesInvoices, waterInvoices, billed, paid, outstanding,
      dues: duesInvoices.reduce((sum, invoice) => sum + invoice.items.filter(item => item.chargeType !== "water").reduce((subtotal, item) => subtotal + item.amount, 0), 0),
      water: row.billed, status: !invoices.length ? "Belum ditagih" : outstanding === 0 ? "Lunas" : paid > 0 ? "Sebagian dibayar" : "Belum dibayar" };
  });
  return { rows, billed: rows.reduce((sum, row) => sum + row.billed, 0), paid: rows.reduce((sum, row) => sum + row.paid, 0), outstanding: rows.reduce((sum, row) => sum + row.outstanding, 0), unbilled: rows.filter(row => !row.invoices.length).length };
}
export function issueWaterBill(state: Demo, input: Omit<WaterReading, "amount" | "invoiceId" | "recordedBy" | "recordedAt">, actorId: string, at: string): Demo {
  requireBilling(state, actorId, at);
  const label = periodLabel(input.period);
  const unit = state.units.find(u => u.id === input.unitId);
  if (!unit || !input.person || ![unit.owner, unit.occupant].includes(input.person)) throw new Error("Pilih unit dan penanggung jawab yang terhubung ke unit.");
  if (state.waterReadings.some(r => r.id === input.id || r.unitId === input.unitId && r.period === input.period) || state.invoices.some(i => i.unitId === input.unitId && i.period === label && (i.kind === "water" || i.items.some(item => item.chargeType === "water")))) throw new Error("Tagihan air untuk unit dan periode ini sudah terbit, termasuk air pada tagihan gabungan lama.");
  if (!validBillingDate(input.due) || input.due < `${input.period}-01`) throw new Error("Jatuh tempo harus valid dan tidak mendahului periode tagihan.");
  const history = state.waterReadings.filter(r => r.unitId === input.unitId).sort((a, b) => b.period.localeCompare(a.period));
  if (history.some(r => r.period > input.period)) throw new Error("Periode ini mendahului pembacaan yang sudah terbit. Gunakan proses koreksi, bukan menimpa riwayat.");
  if (history[0] && input.previous !== history[0].current) throw new Error("Meter awal harus mengikuti meter akhir terakhir yang sudah terbit.");
  const amount = waterAmount(input.previous, input.current, input.rate);
  const invoiceId = `AIR-${input.period}-${unit.id}`;
  if (state.invoices.some(i => i.id === invoiceId)) throw new Error("Nomor tagihan air sudah tersedia.");
  const reading: WaterReading = { ...input, amount, invoiceId, recordedBy: actorId, recordedAt: at };
  const usage = (Math.round(input.current * 1000) - Math.round(input.previous * 1000)) / 1000;
  return { ...state, waterReadings: [...state.waterReadings, reading], invoices: [...state.invoices, { id: invoiceId, kind: "water", unitId: unit.id, unitNumber: unit.number, person: input.person, period: label, due: input.due, items: [{ name: `Air: ${input.previous} → ${input.current} m³ · ${usage} m³ × Rp ${input.rate}/m³`, amount, chargeType: "water" }], paid: 0 }] };
}
export function issueWaterBatch(state: Demo, readings: Omit<WaterReading, "amount" | "invoiceId" | "recordedBy" | "recordedAt">[], actorId: string, at: string): Demo {
  requireBilling(state, actorId, at);
  if (!readings.length) throw new Error("Tidak ada pembacaan meter yang siap ditagih.");
  let next = state;
  for (const reading of readings) next = issueWaterBill(next, reading, actorId, at);
  return next;
}

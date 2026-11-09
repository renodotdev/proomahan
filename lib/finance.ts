import { currency, displayDate, remaining, settlement, total, type CashEntry, type Demo, type Invoice } from "./demo.ts";
import { itemBalances, unallocatedCredit } from "./allocations.ts";
import { requireBilling, periodLabel, validBillingDate } from "./billing.ts";
import { DEFAULT_TEMPLATES } from "./communications.ts";
import type { PdfReport } from "./report-pdf.ts";

export function withFinancials(state: Demo): Demo {
  return { ...state, version: 5, cashEntries: state.cashEntries || [], openingBalance: state.openingBalance ?? 0,
    legacyIncome: state.legacyIncome ?? Math.max(0, state.invoices.reduce((s, i) => s + i.paid, 0) - state.payments.filter(p => p.status === "verified").reduce((s, p) => s + p.amount, 0)),
    templates: state.templates || DEFAULT_TEMPLATES.map(t => ({ ...t })),
  };
}
export function addCashEntry(state: Demo, input: CashEntry, actorId: string, at: string): Demo {
  requireBilling(state, actorId, at);
  if (!input.id || state.cashEntries.some(e => e.id === input.id)) throw new Error("Transaksi ini sudah dicatat.");
  if (!["income", "expense"].includes(input.direction) || !Number.isSafeInteger(input.amount) || input.amount <= 0 || !input.note.trim() || input.note.length > 500 || !input.category.trim() || input.category.length > 70 || !validBillingDate(input.date)) throw new Error("Isi tanggal, kategori, keterangan penggunaan (maksimal 500 karakter), dan nominal rupiah positif.");
  if (input.method && !["Tunai", "Transfer bank"].includes(input.method) || (input.counterparty?.length || 0) > 100 || (input.reference?.length || 0) > 100) throw new Error("Metode, penerima/sumber, atau referensi transaksi tidak valid.");
  return { ...state, cashEntries: [{ ...input, note: input.note.trim(), category: input.category.trim(), recordedBy: actorId, recordedAt: at }, ...state.cashEntries] };
}
export function cashTransactions(state: Demo) {
  return [
    ...(state.legacyIncome > 0 ? [{ id: "legacy-income", direction: "income" as const, date: "2026-11-01", amount: state.legacyIncome, category: "Penerimaan awal contoh", note: "Pembayaran terverifikasi lama pada data contoh", proof: "", recordedBy: "admin", recordedAt: "2026-11-01", source: "legacy" }] : []),
    ...state.payments.filter(p => p.status === "verified").map(p => ({ id: p.id, direction: "income" as const, date: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : "2026-11-07", amount: p.amount, method: p.method, counterparty: state.invoices.find(invoice => invoice.id === p.invoiceId)?.person || "Warga", reference: p.reference, category: "Pembayaran tagihan", note: `${p.invoiceId} · ${p.reference || p.method}`, proof: p.proof, recordedBy: p.verifiedBy || "admin", recordedAt: p.verifiedAt || p.date, source: "payment" })),
    ...state.cashEntries.map(entry => ({ ...entry, source: "manual" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
export function cashSummary(state: Demo, period: string) {
  periodLabel(period);
  const transactions = cashTransactions(state);
  const opening = state.openingBalance + transactions.filter(e => e.date < `${period}-01`).reduce((s, e) => s + (e.direction === "income" ? e.amount : -e.amount), 0);
  const entries = transactions.filter(e => e.date.startsWith(period));
  const income = entries.filter(e => e.direction === "income").reduce((s, e) => s + e.amount, 0);
  const expenses = entries.filter(e => e.direction === "expense").reduce((s, e) => s + e.amount, 0);
  return { opening, income, expenses, closing: opening + income - expenses, entries };
}
export function invoiceReport(state: Demo, period: string): PdfReport {
  const invoices = state.invoices.filter(i => i.period === period);
  return { title: "Laporan tagihan", period, summary: [`${invoices.length} tagihan`, `Total: ${currency(invoices.reduce((s, i) => s + total(i), 0))}`, `Terbayar: ${currency(invoices.reduce((s, i) => s + i.paid, 0))}`, `Sisa: ${currency(invoices.reduce((s, i) => s + remaining(i), 0))}`], headers: ["Nomor / unit", "Penanggung jawab", "Jenis", "Total", "Terbayar", "Sisa", "Status"], widths: [160, 140, 60, 95, 95, 95, 100], rows: invoices.map(i => [`${i.id}\nUnit ${i.unitNumber || i.unitId}`, i.person, i.kind === "water" ? "Air" : "Iuran", currency(total(i)), currency(i.paid), currency(remaining(i)), settlement(i)]) };
}
export function cashStatement(state: Demo, period: string) {
  const summary = cashSummary(state, period);
  let balance = summary.opening;
  const entries = [...summary.entries].sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)).map(entry => {
    balance += entry.direction === "income" ? entry.amount : -entry.amount;
    return { ...entry, balance };
  });
  const categories = [...new Set(entries.map(entry => entry.category))].map(category => ({ category, income: entries.filter(entry => entry.category === category && entry.direction === "income").reduce((sum, entry) => sum + entry.amount, 0), expense: entries.filter(entry => entry.category === category && entry.direction === "expense").reduce((sum, entry) => sum + entry.amount, 0) }));
  return { ...summary, entries, categories };
}
export function queryCashEntries(state: Demo, period: string, filters: { search: string; direction: string; category: string; sort: string; page: number; pageSize: number }) {
  const statement = cashStatement(state, period); const search = filters.search.trim().toLowerCase();
  const matches = statement.entries.filter(entry => (filters.direction === "all" || entry.direction === filters.direction) && (!filters.category || entry.category === filters.category) && `${entry.id} ${entry.category} ${entry.note} ${"counterparty" in entry ? entry.counterparty : ""} ${"reference" in entry ? entry.reference : ""}`.toLowerCase().includes(search));
  if (filters.sort === "newest") matches.reverse();
  const pageSize = [10, 25, 50].includes(filters.pageSize) ? filters.pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize)); const page = Math.max(1, Math.min(pageCount, Math.trunc(filters.page) || 1));
  return { entries: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize, pageCount };
}
export function cashReport(state: Demo, period: string): PdfReport {
  const statement = cashStatement(state, period);
  return { title: "Laporan pemasukan dan pengeluaran", period: periodLabel(period), fileName: `laporan-keuangan-${period}.pdf`, details: ["Dasar kas: hanya penerimaan terverifikasi dan transaksi kas tercatat.", "Saldo berjalan dihitung menurut urutan tanggal transaksi. Pengajuan pembayaran yang belum diverifikasi tidak termasuk."], summary: [`Saldo awal: ${currency(statement.opening)}`, `Pemasukan: ${currency(statement.income)}`, `Pengeluaran: ${currency(statement.expenses)}`, `Saldo akhir: ${currency(statement.closing)}`], headers: ["Tanggal / referensi", "Kategori / keterangan", "Pemasukan", "Pengeluaran", "Saldo berjalan"], widths: [135, 285, 115, 115, 120], rows: statement.entries.map(entry => [`${displayDate(entry.date)}\n${entry.id}`, `${entry.category}\n${entry.note}`, entry.direction === "income" ? currency(entry.amount) : "-", entry.direction === "expense" ? currency(entry.amount) : "-", currency(entry.balance)]) };
}
export function invoiceDocument(invoice: Invoice): PdfReport {
  const credit = unallocatedCredit(invoice);
  return { title: "Invoice tagihan", period: invoice.period, fileName: `invoice-${invoice.id}-${invoice.unitNumber || invoice.unitId}.pdf`,
    details: [`Nomor: ${invoice.id}`, `Penanggung jawab: ${invoice.person} | Unit ${invoice.unitNumber || invoice.unitId}`, `Jatuh tempo: ${displayDate(invoice.due)} | ${invoice.kind === "water" ? "Tagihan air" : "Tagihan iuran"}`, ...(credit > 0 ? [`Pembayaran lama belum dialokasikan: ${currency(credit)}. Saldo keseluruhan tetap sesuai catatan terverifikasi.`] : [])],
    summary: [`Total: ${currency(total(invoice))}`, `Terbayar: ${currency(invoice.paid)}`, `Sisa: ${currency(remaining(invoice))}`, `Status: ${settlement(invoice)}`],
    headers: ["Rincian tagihan", "Nominal", "Terbayar per rincian", "Sisa per rincian"], widths: [350, 140, 140, 140],
    rows: itemBalances(invoice).map(item => [item.name, currency(item.amount), credit > 0 ? `${currency(item.paid)} tercatat` : currency(item.paid), credit > 0 ? "Perlu alokasi sebelumnya" : currency(item.outstanding)]) };
}

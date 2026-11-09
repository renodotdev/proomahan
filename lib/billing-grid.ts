import { billingOverview } from "./billing.ts";
import { itemBalances, unallocatedCredit } from "./allocations.ts";
import type { Demo } from "./demo.ts";

export type GridSort = "unit_asc" | "unit_desc" | "name_asc" | "cluster_asc" | "balance_desc" | "balance_asc";
export type MonthBilling = ReturnType<typeof billingOverview>["rows"][number];
export function billingMonths(start: string, count: number) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(start) || ![3, 6, 12].includes(count)) throw new Error("Rentang bulan tidak valid.");
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return date.toISOString().slice(0, 7);
  }).filter(value => value.startsWith("20"));
}
export function shiftBillingMonth(start: string, amount: number) {
  const [year, month] = start.split("-").map(Number);
  const serial = Math.max(2000 * 12, Math.min(2099 * 12 + 11, year * 12 + month - 1 + amount));
  return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, "0")}`;
}
export function chargeSummary(state: Demo, row: MonthBilling, kind: "dues" | "water") {
  const invoices = kind === "water" ? row.waterInvoices : row.duesInvoices;
  const matches = (index: number, invoice: typeof invoices[number]) => kind === "water" ? invoice.kind === "water" || invoice.items[index]?.chargeType === "water" : invoice.items[index]?.chargeType !== "water";
  const items = invoices.flatMap(invoice => itemBalances(invoice).filter(item => matches(item.itemIndex, invoice)));
  const billed = items.reduce((sum, item) => sum + item.amount, 0);
  const unknown = invoices.some(invoice => unallocatedCredit(invoice) > 0);
  const paid = unknown ? null : items.reduce((sum, item) => sum + item.paid, 0);
  const pending = invoices.some(invoice => state.payments.some(payment => payment.invoiceId === invoice.id && payment.status === "pending" && (!payment.allocations || payment.allocations.some(item => matches(item.itemIndex, invoice)))));
  const status = !invoices.length ? "Belum ditagih" : pending ? "Menunggu verifikasi" : paid === null ? "Perlu alokasi" : billed === paid ? "Lunas" : paid > 0 ? "Sebagian dibayar" : "Belum dibayar";
  return { billed, paid, pending, status, issued: invoices.length > 0 };
}
export function queryBillingGrid(state: Demo, options: { start: string; count: number; search: string; clusterId: string; status: string; sort: GridSort; page: number; pageSize: number }) {
  const months = billingMonths(options.start, options.count);
  const overview = months.map(month => ({ month, overview: billingOverview(state, month) }));
  const search = options.search.trim().toLocaleLowerCase("id-ID");
  const cluster = state.clusters.find(cluster => cluster.id === options.clusterId);
  const all = state.units.map(unit => {
    const cells = overview.map(({ month, overview }) => ({ month, data: overview.rows.find(row => row.unit.id === unit.id)! }));
    const person = unit.occupant || unit.owner;
    const billed = cells.reduce((sum, cell) => sum + cell.data.billed, 0);
    const paid = cells.reduce((sum, cell) => sum + cell.data.paid, 0);
    const outstanding = cells.reduce((sum, cell) => sum + cell.data.outstanding, 0);
    const searchable = `${person} ${unit.owner} ${unit.number} ${unit.cluster} ${cells.flatMap(cell => cell.data.invoices.map(invoice => `${invoice.id} ${invoice.person}`)).join(" ")}`.toLocaleLowerCase("id-ID");
    return { unit, person, cells, billed, paid, outstanding, searchable };
  });
  const filtered = all.filter(row => (!options.clusterId || !!cluster && row.unit.cluster === cluster.name) && row.searchable.includes(search) && (options.status === "all" || row.cells.some(cell => options.status === "pending" ? cell.data.invoices.some(invoice => state.payments.some(payment => payment.invoiceId === invoice.id && payment.status === "pending")) : cell.data.status === options.status)));
  const collator = new Intl.Collator("id-ID", { numeric: true, sensitivity: "base" });
  filtered.sort((left, right) => {
    const primary = options.sort === "name_asc" ? collator.compare(left.person, right.person) : options.sort === "cluster_asc" ? collator.compare(left.unit.cluster, right.unit.cluster) : options.sort === "balance_desc" ? right.outstanding - left.outstanding : options.sort === "balance_asc" ? left.outstanding - right.outstanding : options.sort === "unit_desc" ? collator.compare(right.unit.number, left.unit.number) : collator.compare(left.unit.number, right.unit.number);
    return primary || collator.compare(left.unit.number, right.unit.number);
  });
  const pageSize = [10, 25, 50].includes(options.pageSize) ? options.pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.trunc(options.page) || 1));
  return { months, page, pageCount, pageSize, total: filtered.length, allUnits: state.units.length,
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    summary: { billed: filtered.reduce((sum, row) => sum + row.billed, 0), paid: filtered.reduce((sum, row) => sum + row.paid, 0), outstanding: filtered.reduce((sum, row) => sum + row.outstanding, 0) } };
}

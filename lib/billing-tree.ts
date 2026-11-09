import { remaining, total, type Demo, type Invoice } from "./demo.ts";
import { periodLabel } from "./billing.ts";

export function invoicePeriodKey(label: string) {
  const year = /20\d{2}/.exec(label)?.[0];
  if (!year) throw new Error("Periode tagihan tidak valid.");
  const month = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`).find(key => periodLabel(key).toLowerCase() === label.toLowerCase());
  if (!month) throw new Error("Periode tagihan tidak valid.");
  return month;
}
export const billTotals = (invoices: Invoice[]) => ({ count: invoices.length, billed: invoices.reduce((sum, invoice) => sum + total(invoice), 0), paid: invoices.reduce((sum, invoice) => sum + invoice.paid, 0), outstanding: invoices.reduce((sum, invoice) => sum + remaining(invoice), 0) });
export function queryBillingTree(state: Demo, filters: { year: string; month: string; clusterId: string; search: string; status: string; sort: string }) {
  const search = filters.search.trim().toLocaleLowerCase("id-ID");
  const cluster = state.clusters.find(cluster => cluster.id === filters.clusterId);
  const rows = state.invoices.map(invoice => { const unit = state.units.find(unit => unit.id === invoice.unitId); return { invoice, unit, period: invoicePeriodKey(invoice.period), pending: state.payments.some(payment => payment.invoiceId === invoice.id && payment.status === "pending") }; }).filter(row => {
    const status = row.pending ? "pending" : remaining(row.invoice) === 0 ? "paid" : row.invoice.paid > 0 ? "partial" : "unpaid";
    return (!filters.year || row.period.startsWith(filters.year)) && (!filters.month || row.period.slice(5) === filters.month) && (!filters.clusterId || !!cluster && row.unit?.cluster === cluster.name) && `${row.invoice.person} ${row.invoice.id} ${row.unit?.number || row.invoice.unitId} ${row.unit?.owner || ""}`.toLocaleLowerCase("id-ID").includes(search) && (filters.status === "all" || status === filters.status);
  });
  const collator = new Intl.Collator("id-ID", { numeric: true, sensitivity: "base" });
  const years = [...new Set(rows.map(row => row.period.slice(0, 4)))].sort().reverse().map(year => ({ year, ...billTotals(rows.filter(row => row.period.startsWith(year)).map(row => row.invoice)), periods: [...new Set(rows.filter(row => row.period.startsWith(year)).map(row => row.period))].sort().reverse().map(period => {
    const periodRows = rows.filter(row => row.period === period);
    return { period, ...billTotals(periodRows.map(row => row.invoice)), clusters: [...new Set(periodRows.map(row => row.unit?.cluster || "Unit tidak tersedia"))].sort(collator.compare).map(name => {
      const clusterRows = periodRows.filter(row => (row.unit?.cluster || "Unit tidak tersedia") === name);
      const people = [...new Set(clusterRows.map(row => JSON.stringify([row.invoice.unitId, row.invoice.person])))].map(key => {
        const [unitId, person] = JSON.parse(key) as [string, string]; const personRows = clusterRows.filter(row => row.invoice.unitId === unitId && row.invoice.person === person);
        const invoices = personRows.map(row => row.invoice).sort((a, b) => a.id.localeCompare(b.id));
        return { key, unitId, number: personRows[0].unit?.number || unitId, person, invoices, ...billTotals(invoices) };
      }).sort((a, b) => (filters.sort === "balance" ? b.outstanding - a.outstanding : filters.sort === "name" ? collator.compare(a.person, b.person) : collator.compare(a.number, b.number)) || collator.compare(a.key, b.key));
      return { name, people, ...billTotals(clusterRows.map(row => row.invoice)) };
    }) };
  }) }));
  return { years, ...billTotals(rows.map(row => row.invoice)) };
}

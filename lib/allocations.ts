import type { Invoice } from "./demo.ts";

export type ItemAllocation = { itemIndex: number; amount: number };
export const allocationTotal = (allocations: ItemAllocation[]) => allocations.reduce((sum, item) => sum + item.amount, 0);
export function itemBalances(invoice: Invoice) {
  const invoiceTotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);
  return invoice.items.map((item, itemIndex) => {
    const paid = invoice.paid === invoiceTotal ? item.amount : invoice.items.length === 1 ? invoice.paid : invoice.itemPaid?.[itemIndex] ?? 0;
    if (!Number.isSafeInteger(paid) || paid < 0 || paid > item.amount) throw new Error("Alokasi rincian tagihan tidak valid.");
    return { ...item, itemIndex, paid, outstanding: item.amount - paid };
  });
}
export const unallocatedCredit = (invoice: Invoice) => invoice.paid - itemBalances(invoice).reduce((sum, item) => sum + item.paid, 0);
export function validateItemAllocations(invoice: Invoice, allocations: ItemAllocation[], amount: number) {
  if (!allocations.length || !Number.isSafeInteger(amount) || amount <= 0 || allocationTotal(allocations) !== amount) throw new Error("Centang rincian yang dibayar. Total alokasi harus sama dengan nominal pembayaran.");
  const balances = itemBalances(invoice);
  const selected = new Set<number>();
  for (const allocation of allocations) {
    const item = balances[allocation.itemIndex];
    if (!Number.isSafeInteger(allocation.itemIndex) || !item || selected.has(allocation.itemIndex) || !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0 || allocation.amount > item.outstanding) throw new Error("Alokasi harus positif, unik, dan tidak melebihi sisa setiap rincian tagihan.");
    selected.add(allocation.itemIndex);
  }
}
export function applyAllocatedPayment(invoice: Invoice, allocations: ItemAllocation[], amount: number): Invoice {
  if (unallocatedCredit(invoice) !== 0) throw new Error("Pengurus perlu mengalokasikan pembayaran lama ke rincian tagihan terlebih dahulu.");
  validateItemAllocations(invoice, allocations, amount);
  const paid = itemBalances(invoice).map(item => item.paid + (allocations.find(a => a.itemIndex === item.itemIndex)?.amount || 0));
  return { ...invoice, paid: invoice.paid + amount, itemPaid: paid };
}

import { remaining, type Demo, type Invoice } from "./demo.ts";
import { invoicePeriodKey } from "./billing-tree.ts";
import { validBillingDate } from "./billing.ts";
import { occupancyStartDate } from "./residents.ts";

export const DEMO_RESIDENT_ID = "account-11";
// shortcut: demo relationships use account/unit and bill-to names; production must use stable person IDs and server/RLS checks.
export function residentPortal(state: Demo, accountId = DEMO_RESIDENT_ID) {
  const account = state.accounts.find(account => account.id === accountId && account.active && account.resident);
  const unit = account ? state.units.find(unit => unit.id === account.unit) : undefined;
  const owner = !!account && unit?.owner === account.name;
  const occupant = !!account && !!unit?.occupied && unit.occupant === account.name;
  const invoices = account ? state.invoices.filter(invoice => invoice.unitId === account.unit && invoice.person === account.name) : [];
  const requests = account ? state.requests.filter(request => request.unitId === account.unit && request.person === account.name).sort((a, b) => portalDateKey(b.date).localeCompare(portalDateKey(a.date))) : [];
  const payments = state.payments.filter(payment => invoices.some(invoice => invoice.id === payment.invoiceId));
  const previous = account ? [...(unit?.occupancyHistory || [])].reverse().find(stay => stay.occupant === account.name) : undefined;
  const phone = owner ? unit?.ownerPhone : occupant ? unit?.occupantPhone : previous?.phone;
  return { account, unit, owner, occupant, canViewUnit: owner || occupant, invoices, requests, payments, phone: phone || "", outstanding: invoices.reduce((sum, invoice) => sum + remaining(invoice), 0) };
}
export function residentView(view: string | null) { return view && ["home", "invoices", "news", "services", "account", "unit"].includes(view) ? view : "home"; }
export function portalPosts(state: Demo, audience: "public" | "resident" | "admin") {
  return state.posts.filter(post => audience === "admin" || post.audience === "Publik" || audience === "resident" && post.audience === "Semua warga").sort((a, b) => portalDateKey(b.date).localeCompare(portalDateKey(a.date)));
}
export function residentModalAllowed(state: Demo, spec: { type: string; id?: string }, accountId = DEMO_RESIDENT_ID) {
  const portal = residentPortal(state, accountId);
  if (["contacts", "help"].includes(spec.type)) return true;
  if (!portal.account) return false;
  if (["invoice", "submitPayment"].includes(spec.type)) return portal.invoices.some(invoice => invoice.id === spec.id);
  if (spec.type === "request") return portal.requests.some(request => request.id === spec.id);
  if (spec.type === "unit") return portal.canViewUnit && portal.unit?.id === spec.id;
  if (spec.type === "requestForm") return portal.canViewUnit;
  if (spec.type === "post") return portalPosts(state, "resident").some(post => post.id === spec.id);
  return ["notifications", "changePassword"].includes(spec.type);
}
export function invoiceKindLabel(invoice: Invoice) { return invoice.kind === "water" ? "Tagihan air" : invoice.items.some(item => item.chargeType === "water") ? "Iuran dan air" : "Tagihan iuran"; }
export function residentInvoiceGroups(invoices: Invoice[], period: string, status: string, search: string, pendingIds: string[]) {
  const scoped = invoices.filter(invoice => !period || invoice.period === period);
  const needle = search.trim().toLowerCase();
  const shown = scoped.filter(invoice => {
    const matchesStatus = status === "all" || (status === "pending" ? pendingIds.includes(invoice.id) : status === "paid" ? remaining(invoice) === 0 : status === "partial" ? invoice.paid > 0 && remaining(invoice) > 0 : invoice.paid === 0 && remaining(invoice) > 0);
    return matchesStatus && `${invoice.id} ${invoice.person} ${invoice.unitNumber || invoice.unitId} ${invoiceKindLabel(invoice)}`.toLowerCase().includes(needle);
  });
  const periods = [...new Set(invoices.map(invoice => invoice.period))].sort((a, b) => invoicePeriodKey(b).localeCompare(invoicePeriodKey(a)));
  return { scoped, shown, periods, groups: periods.map(period => ({ period, invoices: shown.filter(invoice => invoice.period === period) })).filter(group => group.invoices.length) };
}
export function setResidentWhatsAppPreference(state: Demo, enabled: boolean, accountId = DEMO_RESIDENT_ID): Demo {
  const portal = residentPortal(state, accountId);
  if (!portal.account) throw new Error("Akun warga tidak aktif.");
  return { ...state, accounts: state.accounts.map(account => account.id === accountId ? { ...account, whatsappReminders: enabled } : account) };
}

export function invoiceAllowsWhatsApp(state: Demo, invoice: Invoice) {
  return !state.accounts.some(account => account.unit === invoice.unitId && account.name === invoice.person && account.whatsappReminders === false);
}

export function portalDateKey(value: string) {
  const fullDate = occupancyStartDate(value);
  if (fullDate) return fullDate;
  const match = /^(\d{1,2}) (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des) (20\d{2})$/.exec(value);
  if (!match) return "";
  const month = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"].indexOf(match[2]) + 1;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return validBillingDate(date) ? date : "";
}

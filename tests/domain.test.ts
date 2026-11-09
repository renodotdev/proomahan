import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, currency, decidePayment, submitPayment, previewInvoices, remaining, type Payment } from "../lib/demo.ts";

test("a submission leaves the balance outstanding until verified and cannot be applied twice", () => {
  const before = createDemo();
  const invoice = before.invoices.find(i => i.unitId === "A-12")!;
  const payment: Payment = { id: "new-payment", invoiceId: invoice.id, amount: 100000, method: "Tunai", date: "2026-11-07", reference: "Petugas kas contoh", proof: "", status: "pending", allocations: [{ itemIndex: 2, amount: 100000 }] };
  const pending = submitPayment(before, payment);
  assert.equal(remaining(pending.invoices.find(i => i.id === invoice.id)!), 200000);
  const verified = decidePayment(pending, payment.id, "verified");
  assert.equal(remaining(verified.invoices.find(i => i.id === invoice.id)!), 100000);
  assert.throws(() => decidePayment(verified, payment.id, "verified"));
  assert.throws(() => submitPayment(before, { ...payment, amount: 200001 }));
  assert.throws(() => submitPayment(pending, { ...payment, id: "duplicate" }));
});

test("rejection requires a reason and preserves the balance", () => {
  const state = createDemo();
  const payment = state.payments[0];
  assert.throws(() => decidePayment(state, payment.id, "rejected"));
  const rejected = decidePayment(state, payment.id, "rejected", "Referensi belum cocok");
  assert.deepEqual(rejected.invoices, state.invoices);
});

test("fee changes affect future invoices while existing snapshots and generation stay stable", () => {
  const state = createDemo();
  const prior = structuredClone(state.invoices);
  state.fees[0].amount = 150000;
  const preview = previewInvoices(state, "Desember 2026");
  assert.equal(preview[0].items[0].amount, 150000);
  assert.deepEqual(state.invoices, prior);
  assert.equal(previewInvoices(state, "November 2026").length, 0);
  assert.equal(previewInvoices({ ...state, invoices: [...state.invoices, ...preview] }, "Desember 2026").length, 0);
});

test("a unit override replaces its general tariff and future or one-time rates respect dates", () => {
  const state = createDemo();
  state.fees.push({ ...state.fees[0], id: "special", itemId: "dues", scope: "A-12", amount: 125000, effectiveFrom: "2026-12-01" });
  state.fees.push({ ...state.fees[0], id: "future", name: "Future charge", effectiveFrom: "2027-01-01" });
  state.fees.push({ ...state.fees[0], id: "one-time", name: "Past event", frequency: "Satu kali", effectiveFrom: "2026-11-15" });
  const preview = previewInvoices(state, "Desember 2026");
  const special = preview.find(i => i.unitId === "A-12")!;
  const ordinary = preview.find(i => i.unitId === "A-01")!;
  assert.equal(special.items.filter(i => i.name === "Iuran warga").length, 1);
  assert.equal(special.items.find(i => i.name === "Iuran warga")!.amount, 125000);
  assert.equal(ordinary.items.find(i => i.name === "Iuran warga")!.amount, 75000);
  assert.equal(special.items.some(i => i.name === "Future charge" || i.name === "Past event"), false);
});

// Access fixtures use explicit offsets; a term ends at the exact exclusive boundary.
import { activeRoles, allowedViews, appointRole, revokeRole, assignmentStatus, TENANT_ID, type RoleAssignment } from "../lib/access.ts";
const ACCESS_NOW = "2026-11-07T12:00:00+07:00";
const appointment = (changes: Partial<RoleAssignment> = {}): RoleAssignment => ({ id: "new-term", userId: "account-11", tenantId: TENANT_ID, role: "content_admin", startsAt: ACCESS_NOW, endsAt: "2027-01-01T00:00:00+07:00", revokedAt: null, assignedBy: "admin", reason: "Hasil pemilihan", ...changes });

test("elected access observes exact start, exclusive expiry, tenant and account gates", () => {
  const state = createDemo();
  assert.deepEqual(activeRoles(state, "account-11", TENANT_ID, "2025-12-31T23:59:59+07:00"), []);
  assert.deepEqual(activeRoles(state, "account-11", TENANT_ID, "2026-01-01T00:00:00+07:00"), ["billing_admin"]);
  assert.deepEqual(activeRoles(state, "account-11", TENANT_ID, "2026-12-31T16:59:59Z"), ["billing_admin"]);
  assert.deepEqual(activeRoles(state, "account-11", TENANT_ID, "2026-12-31T17:00:00Z"), []);
  assert.deepEqual(activeRoles(state, "account-11", "other-neighborhood", ACCESS_NOW), []);
  assert.equal(state.accounts.find(a => a.id === "account-11")!.resident, true);
  state.accounts.find(a => a.id === "account-11")!.active = false;
  assert.deepEqual(activeRoles(state, "account-11", TENANT_ID, ACCESS_NOW), []);
});

test("roles combine capabilities without granting role management or unrelated modules", () => {
  const state = appointRole(createDemo(), appointment(), "admin", ACCESS_NOW);
  const views = allowedViews(state, "account-11", TENANT_ID, ACCESS_NOW);
  assert(views.includes("payments") && views.includes("news"));
  assert(!views.includes("roles") && !views.includes("accounts") && !views.includes("dashboard"));
  assert.throws(() => appointRole(state, appointment({ id: "self-extension" }), "account-11", ACCESS_NOW));
  assert.throws(() => revokeRole(state, "elected-treasurer", "account-11", ACCESS_NOW, "Self action"));
});

test("appointments reject missing or overlapping terms and cross-tenant escalation", () => {
  const state = createDemo();
  for (const changes of [{ endsAt: null }, { startsAt: "bad" }, { endsAt: ACCESS_NOW }, { startsAt: "2026-01-01" }, { reason: " " }, { role: "super_admin" as const }, { tenantId: "other" }, { userId: "missing" }, { role: "billing_admin" as const }]) {
    assert.throws(() => appointRole(state, appointment(changes), "admin", ACCESS_NOW));
  }
  assert.equal(assignmentStatus(appointment({ endsAt: null }), ACCESS_NOW), "Tidak valid");
  assert.equal(assignmentStatus(appointment({ startsAt: "bad" }), ACCESS_NOW), "Tidak valid");
});

test("renewal preserves the previous term and switches at the handover boundary", () => {
  const state = createDemo();
  const renewed = appointRole(state, appointment({ role: "billing_admin", startsAt: "2027-01-01T00:00:00+07:00", endsAt: "2028-01-01T00:00:00+07:00", renewsId: "elected-treasurer" }), "admin", ACCESS_NOW);
  assert.deepEqual(renewed.assignments.find(a => a.id === "elected-treasurer"), state.assignments.find(a => a.id === "elected-treasurer"));
  assert.equal(assignmentStatus(renewed.assignments.at(-1)!, ACCESS_NOW), "Terjadwal");
  assert.deepEqual(activeRoles(renewed, "account-11", TENANT_ID, "2027-01-01T00:00:00+07:00"), ["billing_admin"]);
  assert.equal(renewed.roleEvents.at(-1)?.action, "renewed");
});

test("revocation preserves resident access and history; last permanent super admin is protected", () => {
  const state = createDemo();
  assert.throws(() => revokeRole(state, "elected-treasurer", "admin", ACCESS_NOW, " "));
  const revoked = revokeRole(state, "elected-treasurer", "admin", ACCESS_NOW, "Hasil rapat warga");
  assert.deepEqual(activeRoles(revoked, "account-11", TENANT_ID, ACCESS_NOW), []);
  assert.deepEqual(revoked.accounts, state.accounts);
  assert.equal(revoked.roleEvents.at(-1)?.reason, "Hasil rapat warga");
  assert.throws(() => revokeRole(revoked, "elected-treasurer", "admin", ACCESS_NOW, "Again"));
  assert.deepEqual(activeRoles(state, "admin", TENANT_ID, "2040-01-01T00:00:00Z"), ["super_admin"]);
  assert.throws(() => revokeRole(state, "platform-founder", "admin", ACCESS_NOW, "Remove last"));
});

import { addUnit, saveCluster, setClusterArchived, validateFeeScope, withManagedClusters } from "../lib/clusters.ts";

test("managed clusters migrate existing browser data without discarding billing or appointment history", () => {
  const state = createDemo();
  const { clusters: _clusters, ...legacy } = state;
  const upgraded = withManagedClusters({ ...legacy, version: 2 });
  assert.equal(upgraded.version, 3);
  assert.deepEqual(upgraded.clusters.map(c => c.name), ["Akasia", "Bougenville", "Cendana"]);
  assert.deepEqual(upgraded.units, state.units);
  assert.deepEqual(upgraded.invoices, state.invoices);
  assert.deepEqual(upgraded.assignments, state.assignments);
  assert.deepEqual(withManagedClusters(upgraded), upgraded);
});

test("cluster names and codes are normalized and unique including archived entries", () => {
  const initial = createDemo();
  const added = saveCluster(initial, { id: "dahlia", code: " dhl ", name: " Dahlia  Indah ", archived: false });
  assert.equal(added.clusters.at(-1)!.name, "Dahlia Indah");
  assert.equal(added.clusters.at(-1)!.code, "DHL");
  const archived = setClusterArchived(added, "dahlia", true);
  assert.throws(() => saveCluster(archived, { id: "duplicate", code: "DHL", name: "Other", archived: false }));
  assert.throws(() => saveCluster(archived, { id: "duplicate", code: "NEW", name: "dahlia indah", archived: false }));
  assert.throws(() => saveCluster(initial, { id: "bad", code: "bad code", name: "Dahlia", archived: false }));
  assert.throws(() => saveCluster(initial, { id: "bad", code: "DHL", name: "  ", archived: false }));
});

test("renaming a cluster updates linked units and fee scopes while preserving issued invoices", () => {
  const state = createDemo();
  state.fees.push({ ...state.fees[0], id: "cluster-tariff", itemId: "dues", scope: "Klaster Akasia", amount: 125000 });
  const prior = structuredClone(state.invoices);
  const before = previewInvoices(state, "Desember 2026");
  const renamed = saveCluster(state, { ...state.clusters[0], name: "Akasia Indah", code: "AKI" });
  assert.equal(renamed.units.find(u => u.id === "A-12")!.cluster, "Akasia Indah");
  assert.equal(renamed.fees.find(f => f.id === "cluster-tariff")!.scope, "Klaster Akasia Indah");
  assert.deepEqual(previewInvoices(renamed, "Desember 2026"), before);
  assert.deepEqual(renamed.invoices, prior);
  assert.equal(renamed.clusters[0].id, state.clusters[0].id);
});

test("archiving preserves existing units and billing but rejects new assignments until restored", () => {
  const state = createDemo();
  state.fees.push({ ...state.fees[0], id: "cluster-tariff", itemId: "dues", scope: "Klaster Akasia", amount: 125000 });
  const archived = setClusterArchived(state, state.clusters[0].id, true);
  assert.deepEqual(archived.units, state.units);
  assert.deepEqual(previewInvoices(archived, "Desember 2026"), previewInvoices(state, "Desember 2026"));
  const unit = { ...state.units[0], id: "A-17", number: "A-17" };
  assert.throws(() => addUnit(archived, unit));
  assert.throws(() => validateFeeScope(archived, "Klaster Akasia"));
  assert.doesNotThrow(() => validateFeeScope(archived, "Klaster Akasia", "Klaster Akasia"));
  assert.throws(() => validateFeeScope(archived, "Klaster Unknown"));
  assert.throws(() => addUnit(state, { ...unit, cluster: "Unknown" }));
  const restored = setClusterArchived(archived, state.clusters[0].id, false);
  assert.equal(addUnit(restored, unit).units.length, state.units.length + 1);
  assert.doesNotThrow(() => validateFeeScope(restored, "Klaster Akasia"));
  assert.throws(() => addUnit(restored, state.units[0]));
});

import { issueWaterBill, recordAdminPayment, reviewPayment, validBillingDate, waterAmount, withMeteredBilling } from "../lib/billing.ts";
import { addCashEntry, cashSummary, invoiceReport, withFinancials } from "../lib/finance.ts";
import { renderMessage, validateTemplate } from "../lib/communications.ts";
const waterInput = { id: "meter-1", unitId: "A-12", person: "Budi Santoso", period: "2026-12", previous: 100, current: 115, rate: 5000, due: "2026-12-10" };

test("billing staff can record partial or full direct payments without a resident submission", () => {
  const state = createDemo();
  const invoice = state.invoices.find(i => i.unitId === "A-12")!;
  const payment: Payment = { id: "manual-1", invoiceId: invoice.id, amount: 100000, method: "Tunai", date: "2026-11-07", reference: "Nadia / KWT-001", proof: "", status: "pending", allocations: [{ itemIndex: 2, amount: 100000 }] };
  const after = recordAdminPayment(state, payment, "admin", ACCESS_NOW);
  assert.equal(remaining(after.invoices.find(i => i.id === invoice.id)!), 100000);
  assert.equal(after.payments[0].origin, "admin");
  assert.equal(after.payments[0].verifiedBy, "admin");
  assert.equal(after.payments[0].status, "verified");
  assert.throws(() => recordAdminPayment(after, payment, "admin", ACCESS_NOW));
  assert.throws(() => recordAdminPayment(after, { ...payment, id: "over", amount: 100001 }, "admin", ACCESS_NOW));
  assert.throws(() => recordAdminPayment(state, payment, "account-0", ACCESS_NOW));
  const final = recordAdminPayment(after, { ...payment, id: "manual-2", allocations: [{ itemIndex: 1, amount: 25000 }, { itemIndex: 3, amount: 75000 }] }, "admin", ACCESS_NOW);
  assert.equal(remaining(final.invoices.find(i => i.id === invoice.id)!), 0);
  const pending = state.payments[0];
  assert.throws(() => recordAdminPayment(state, { ...payment, id: "pending-dup", invoiceId: pending.invoiceId }, "admin", ACCESS_NOW));
});

test("meter bills freeze consumption, tariff and resident and cannot duplicate existing water", () => {
  const state = createDemo();
  const next = issueWaterBill(state, waterInput, "admin", ACCESS_NOW);
  assert.equal(next.waterReadings[0].amount, 75000);
  assert.equal(next.invoices.at(-1)!.person, "Budi Santoso");
  assert.equal(next.invoices.at(-1)!.kind, "water");
  assert.throws(() => issueWaterBill(next, { ...waterInput, id: "duplicate" }, "admin", ACCESS_NOW));
  assert.throws(() => issueWaterBill(state, { ...waterInput, period: "2026-11" }, "admin", ACCESS_NOW));
  assert.throws(() => issueWaterBill(next, { ...waterInput, id: "new", period: "2027-01", due: "2027-01-10", previous: 114, current: 130 }, "admin", ACCESS_NOW));
  const second = issueWaterBill(next, { ...waterInput, id: "new", period: "2027-01", due: "2027-01-10", previous: 115, current: 130, rate: 6000 }, "admin", ACCESS_NOW);
  assert.equal(second.waterReadings[1].amount, 90000);
  assert.equal(second.invoices.find(i => i.id === next.invoices.at(-1)!.id)!.items[0].amount, 75000);
  assert.equal(waterAmount(100, 100.125, 5000), 625);
  assert.throws(() => waterAmount(100, 99, 5000));
  assert.throws(() => waterAmount(100, 101, 0));
  assert.equal(previewInvoices(next, "Desember 2026").length, 42);
});

test("billing migration preserves invoices while retiring the static water tariff", () => {
  const state = createDemo(); state.fees.find(f => f.id === "water")!.active = true;
  const prior = structuredClone(state.invoices);
  const upgraded = withMeteredBilling(state);
  assert.equal(upgraded.fees.find(f => f.id === "water")!.active, false);
  assert.deepEqual(upgraded.invoices, prior);
  assert.equal(previewInvoices(upgraded, "Desember 2026")[0].items.some(i => i.name === "Air"), false);
});

test("cash reports reconcile verified receipts once and exclude pending payments", () => {
  let state = withFinancials(createDemo());
  const base = cashSummary(state, "2026-11");
  assert.equal(base.income, 9100000);
  const pending = state.payments[0];
  state = reviewPayment(state, pending.id, "verified", "", "admin", ACCESS_NOW);
  assert.equal(cashSummary(state, "2026-11").income, 9300000);
  state = addCashEntry(state, { id: "expense-1", direction: "expense", date: "2026-11-07", amount: 150000, category: "Perawatan", note: "Pembelian lampu jalan", proof: "nota.jpg", recordedBy: "spoof", recordedAt: "spoof" }, "admin", ACCESS_NOW);
  const report = cashSummary(state, "2026-11");
  assert.equal(report.expenses, 150000);
  assert.equal(report.closing, 9150000);
  assert.equal(cashSummary(state, "2026-12").opening, report.closing);
  assert.equal(state.cashEntries[0].recordedBy, "admin");
  assert.throws(() => addCashEntry(state, state.cashEntries[0], "admin", ACCESS_NOW));
  assert.equal(invoiceReport(state, "November 2026").rows.length, 42);
});

test("WhatsApp templates use validated placeholders and substitute transaction values", () => {
  const state = createDemo();
  state.templates[0].body = "Halo {nama}: {nominal}, unit {unit}";
  assert.equal(renderMessage(state, "invoice", { nama: "Budi", nominal: "Rp 200.000", unit: "A-12" }), "Halo Budi: Rp 200.000, unit A-12");
  assert.throws(() => validateTemplate("invoice", "Unknown {saldo_akhir}"));
  assert.throws(() => validateTemplate("expense", " "));
  assert.throws(() => renderMessage(state, "invoice", {}));
});

test("billing dates reject impossible calendar days", () => {
  assert.equal(validBillingDate("2026-02-30"), false);
  assert.equal(validBillingDate("2026-13-01"), false);
  assert.equal(validBillingDate("2028-02-29"), true);
});

import { waterOverview } from "../lib/billing.ts";

test("water landing summary includes every unit and reconciles dedicated water invoices", () => {
  let state = issueWaterBill(createDemo(), waterInput, "admin", ACCESS_NOW);
  const invoice = state.invoices.at(-1)!;
  state = recordAdminPayment(state, { id: "water-receipt", invoiceId: invoice.id, amount: 25000, method: "Tunai", date: "2026-11-07", reference: "KWT-AIR-001", proof: "", status: "verified", allocations: [{ itemIndex: 0, amount: 25000 }] }, "admin", ACCESS_NOW);
  const overview = waterOverview(state, "2026-12");
  assert.equal(overview.rows.length, state.units.length);
  assert.equal(overview.issued, 1);
  assert.equal(overview.unbilled, 47);
  assert.equal(overview.billed, 75000);
  assert.equal(overview.paid, 25000);
  assert.equal(overview.outstanding, 50000);
  const row = overview.rows.find(row => row.unit.id === "A-12")!;
  assert.equal(row.person, "Budi Santoso");
  assert.equal(row.reading?.current, 115);
  assert.equal(overview.rows.find(row => row.unit.id === "A-01")!.invoice, undefined);
});

test("legacy combined invoices do not invent a water-only settlement allocation", () => {
  const overview = waterOverview(createDemo(), "2026-11");
  assert.equal(overview.issued, 42);
  assert.equal(overview.unbilled, 6);
  assert.equal(overview.combined, 42);
  assert.equal(overview.billed, 3150000);
  const row = overview.rows.find(row => row.unit.id === "A-12")!;
  assert.equal(row.billed, 75000);
  assert.equal(row.paid, null);
  assert.equal(row.outstanding, null);
});

import { billingOverview } from "../lib/billing.ts";

test("unified billing splits legacy charge types without double-counting combined invoice totals", () => {
  const overview = billingOverview(createDemo(), "2026-11");
  const row = overview.rows.find(row => row.unit.id === "A-12")!;
  assert.equal(row.dues, 225000);
  assert.equal(row.water, 75000);
  assert.equal(row.billed, 300000);
  assert.equal(row.outstanding, 200000);
  assert.equal(row.duesInvoices[0].id, row.waterInvoices[0].id);
  assert.equal(overview.billed, 12600000);
  assert.equal(overview.paid, 9100000);
});

test("unified billing combines separately issued dues and water and supports later months", () => {
  const state = issueWaterBill(createDemo(), waterInput, "admin", ACCESS_NOW);
  const dues = previewInvoices(state, "Desember 2026").filter(invoice => invoice.unitId === "A-12");
  const combined = { ...state, invoices: [...state.invoices, ...dues] };
  const row = billingOverview(combined, "2026-12").rows.find(row => row.unit.id === "A-12")!;
  assert.equal(row.dues, 225000);
  assert.equal(row.water, 75000);
  assert.equal(row.billed, 300000);
  assert.equal(row.invoices.length, 2);
  const january = previewInvoices(state, "Januari 2027");
  assert(january.every(invoice => invoice.period === "Januari 2027" && invoice.due === "2027-01-10"));
  assert.throws(() => previewInvoices(state, "Invalid month"));
});

import { allocationTotal, itemBalances, unallocatedCredit } from "../lib/allocations.ts";
import { allocateLegacyCredit, issueWaterBatch } from "../lib/billing.ts";
import { scopedUnitIds } from "../lib/billing-scope.ts";
import { ADMIN_FEATURES } from "../lib/access.ts";
import { invoiceDocument } from "../lib/finance.ts";

test("self assessment preserves proposed items and verification records the exact confirmed allocation", () => {
  const state = createDemo(); const invoice = state.invoices.find(i => i.unitId === "A-12")!;
  const payment: Payment = { id: "self-items", invoiceId: invoice.id, amount: 100000, method: "Tunai", date: "2026-11-07", reference: "KWT-ITEMS", proof: "", status: "pending", allocations: [{ itemIndex: 2, amount: 100000 }] };
  const pending = submitPayment(state, payment);
  assert.deepEqual(pending.invoices, state.invoices);
  assert.equal(pending.payments[0].origin, "resident");
  assert.throws(() => reviewPayment(pending, payment.id, "verified", "", "admin", ACCESS_NOW, [{ itemIndex: 2, amount: 90000 }]));
  const confirmed = [{ itemIndex: 2, amount: 80000 }, { itemIndex: 3, amount: 20000 }];
  const verified = reviewPayment(pending, payment.id, "verified", "", "admin", ACCESS_NOW, confirmed);
  const after = verified.invoices.find(i => i.id === invoice.id)!;
  assert.equal(after.paid, 200000);
  assert.deepEqual(itemBalances(after).map(item => item.paid), [75000, 25000, 80000, 20000]);
  assert.deepEqual(verified.payments[0].allocations, payment.allocations);
  assert.deepEqual(verified.payments[0].verifiedAllocations, confirmed);
  assert.equal(cashSummary(verified, "2026-11").income, 9200000);
});

test("assisted payments reject missing, duplicate, excessive or unbalanced item selections", () => {
  const state = createDemo(); const invoice = state.invoices.find(i => i.unitId === "A-12")!;
  const payment: Payment = { id: "invalid-items", invoiceId: invoice.id, amount: 100000, method: "Tunai", date: "2026-11-07", reference: "KWT-ITEMS", proof: "", status: "verified" };
  for (const allocations of [[], [{ itemIndex: 2, amount: 50000 }, { itemIndex: 2, amount: 50000 }], [{ itemIndex: 0, amount: 100000 }], [{ itemIndex: 99, amount: 100000 }], [{ itemIndex: 2, amount: 99999 }]]) assert.throws(() => recordAdminPayment(state, { ...payment, allocations }, "admin", ACCESS_NOW));
  const after = recordAdminPayment(state, { ...payment, allocations: [{ itemIndex: 2, amount: 100000 }] }, "admin", ACCESS_NOW);
  assert.equal(itemBalances(after.invoices.find(i => i.id === invoice.id)!)[2].outstanding, 0);
  assert.equal(after.payments[0].origin, "admin");
  assert.equal(allocationTotal(after.payments[0].verifiedAllocations!), 100000);
});

test("legacy allocation requires explicit staff action and does not create another cash receipt", () => {
  const state = createDemo(); const invoice = state.invoices.find(i => i.unitId === "A-12")!; delete invoice.itemPaid;
  assert.equal(unallocatedCredit(invoice), 100000);
  const before = cashSummary(state, "2026-11");
  assert.throws(() => allocateLegacyCredit(state, invoice.id, [{ itemIndex: 2, amount: 100000 }], "account-0", ACCESS_NOW));
  const next = allocateLegacyCredit(state, invoice.id, [{ itemIndex: 2, amount: 100000 }], "admin", ACCESS_NOW);
  const after = next.invoices.find(i => i.id === invoice.id)!;
  assert.equal(unallocatedCredit(after), 0);
  assert.equal(after.paid, invoice.paid);
  assert.equal(after.legacyAllocation?.actorId, "admin");
  assert.deepEqual(next.payments, state.payments);
  assert.deepEqual(cashSummary(next, "2026-11"), before);
  assert.throws(() => allocateLegacyCredit(next, invoice.id, [{ itemIndex: 1, amount: 100000 }], "admin", ACCESS_NOW));
});

test("super administrator has every administration feature, including the complete finance workspace", () => {
  const state = createDemo();
  assert.deepEqual(allowedViews(state, "admin", TENANT_ID, ACCESS_NOW), [...ADMIN_FEATURES]);
  for (const role of ["neighborhood_admin", "billing_admin", "content_admin", "service_admin"] as const) {
    const appointed = appointRole(state, appointment({ role, userId: "account-1" }), "admin", ACCESS_NOW);
    for (const view of allowedViews(appointed, "account-1", TENANT_ID, ACCESS_NOW)) assert(allowedViews(state, "admin", TENANT_ID, ACCESS_NOW).includes(view));
  }
  for (const view of ["cash", "reports", "templates"]) assert(allowedViews(state, "account-11", TENANT_ID, ACCESS_NOW).includes(view));
});

test("billing scopes support one whole period, selected units, and an individual unit", () => {
  const state = createDemo();
  assert.equal(scopedUnitIds(state, "period", [], "").length, 48);
  assert.deepEqual(scopedUnitIds(state, "selected", ["A-01", "A-12", "A-01"], ""), ["A-01", "A-12"]);
  assert.deepEqual(scopedUnitIds(state, "individual", [], "A-12"), ["A-12"]);
  assert.throws(() => scopedUnitIds(state, "selected", [], ""));
  assert.throws(() => scopedUnitIds(state, "selected", ["missing"], ""));
});

test("bulk water entry uses per-unit meters and fails atomically if any reading is invalid", () => {
  const state = createDemo(); const before = structuredClone(state);
  const rows = [{ ...waterInput, id: "bulk-1", unitId: "A-01", person: "Andi Pratama", previous: 20, current: 30 }, { ...waterInput, id: "bulk-2", unitId: "A-02", person: "Dewi Lestari", previous: 10, current: 16 }];
  assert.throws(() => issueWaterBatch(state, [rows[0], { ...rows[1], current: 9 }], "admin", ACCESS_NOW));
  assert.deepEqual(state, before);
  const next = issueWaterBatch(state, rows, "admin", ACCESS_NOW);
  assert.deepEqual(next.waterReadings.map(reading => reading.amount), [50000, 30000]);
  assert.equal(next.invoices.length, state.invoices.length + 2);
  assert.throws(() => issueWaterBatch(next, rows, "admin", ACCESS_NOW));
});

test("each resident invoice PDF contains its own bill and item-level settlement only", () => {
  const invoice = createDemo().invoices.find(i => i.unitId === "A-12")!;
  const document = invoiceDocument(invoice);
  assert(document.details!.some(line => line.includes("Budi Santoso") && line.includes("A-12")));
  assert.equal(document.rows.length, invoice.items.length);
  assert.equal(document.rows[0][2], currency(75000));
  assert.equal(document.rows[1][3], currency(25000));
  assert(!JSON.stringify(document).includes("Andi Pratama"));
});

import { billingMonths, shiftBillingMonth, chargeSummary, queryBillingGrid } from "../lib/billing-grid.ts";
const gridOptions = { start: "2026-11", count: 3, search: "", clusterId: "", status: "all", sort: "unit_asc" as const, page: 1, pageSize: 10 };
test("billing matrix paginates units while retaining full filtered totals", () => {
  const state = createDemo();
  const first = queryBillingGrid(state, gridOptions);
  const last = queryBillingGrid(state, { ...gridOptions, page: 99 });
  assert.equal(first.total, 48); assert.equal(first.rows.length, 10); assert.equal(first.pageCount, 5);
  assert.equal(last.page, 5); assert.equal(last.rows.length, 8); assert.deepEqual(last.summary, first.summary);
  assert.equal(first.summary.billed, state.invoices.reduce((sum, invoice) => sum + invoice.items.reduce((n, item) => n + item.amount, 0), 0));
  assert.equal(queryBillingGrid(state, { ...gridOptions, pageSize: 25 }).pageCount, 2);
  assert.equal(queryBillingGrid(state, { ...gridOptions, pageSize: 50 }).rows.length, 48);
});
test("matrix combines cluster, status, and name/reference search before pagination", () => {
  const state = createDemo();
  const cluster = state.clusters.find(cluster => cluster.name === state.units.find(unit => unit.id === "A-12")!.cluster)!;
  const result = queryBillingGrid(state, { ...gridOptions, clusterId: cluster.id, search: "a-12", status: "Sebagian dibayar", page: 9 });
  assert.equal(result.total, 1); assert.equal(result.page, 1); assert.equal(result.rows[0].unit.id, "A-12");
  const empty = queryBillingGrid(state, { ...gridOptions, search: "no matching unit" });
  assert.equal(empty.total, 0); assert.equal(empty.pageCount, 1); assert.equal(empty.page, 1); assert.equal(empty.summary.billed, 0);
  const invoice = state.invoices.find(invoice => invoice.unitId === "A-12")!;
  assert.equal(queryBillingGrid(state, { ...gridOptions, search: invoice.id }).total, 1);
});
test("matrix sorts naturally and filters pending status across any visible month", () => {
  const state = createDemo();
  assert.equal(queryBillingGrid(state, gridOptions).rows[1].unit.id, "A-02");
  const result = queryBillingGrid(state, { ...gridOptions, sort: "balance_desc", pageSize: 50 });
  assert.ok(result.rows.every((row, index) => !index || result.rows[index - 1].outstanding >= row.outstanding));
  const pending = queryBillingGrid(state, { ...gridOptions, status: "pending", pageSize: 50 });
  assert.ok(pending.total > 0);
  assert.ok(pending.rows.every(row => row.cells.some(cell => cell.data.invoices.some(invoice => state.payments.some(payment => payment.invoiceId === invoice.id && payment.status === "pending")))));
});
test("matrix charge lines preserve combined invoice allocations without double counting", () => {
  const state = createDemo();
  const row = billingOverview(state, "2026-11").rows.find(row => row.unit.id === "A-12")!;
  const dues = chargeSummary(state, row, "dues"); const water = chargeSummary(state, row, "water");
  assert.equal(dues.billed, 225000); assert.equal(water.billed, 75000); assert.equal(dues.billed + water.billed, row.billed);
  assert.equal(dues.paid! + water.paid!, row.paid);
  const old = structuredClone(state); delete old.invoices.find(invoice => invoice.unitId === "A-12")!.itemPaid;
  assert.equal(chargeSummary(old, billingOverview(old, "2026-11").rows.find(row => row.unit.id === "A-12")!, "dues").paid, null);
});
test("matrix month windows cross years and clamp navigation at supported boundaries", () => {
  assert.deepEqual(billingMonths("2026-11", 3), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(billingMonths("2026-11", 12).length, 12); assert.equal(billingMonths("2026-11", 6).length, 6);
  assert.deepEqual(billingMonths("2099-12", 3), ["2099-12"]);
  assert.equal(shiftBillingMonth("2000-01", -3), "2000-01"); assert.equal(shiftBillingMonth("2099-12", 12), "2099-12");
  assert.throws(() => billingMonths("2026-13", 3)); assert.throws(() => billingMonths("2026-11", 4));
});

import { insertTemplateText } from "../lib/communications.ts";
import { residentPhone, documentStorageUrl, visibleDocumentUrl, updateResidentContacts, updateOccupancy, occupancyStartDate } from "../lib/residents.ts";
test("template variable insertion replaces selection, restores caret, and bounds length", () => {
  assert.deepEqual(insertTemplateText("Halo warga!", "{nama}", 5, 10), { body: "Halo {nama}!", cursor: 11 });
  assert.deepEqual(insertTemplateText("👋 ", "{nama}", 3, 3), { body: "👋 {nama}", cursor: 9 });
  assert.deepEqual(insertTemplateText("Halo", "\n", 99, 99), { body: "Halo\n", cursor: 5 });
  assert.throws(() => insertTemplateText("a".repeat(2000), "{nama}", 0, 0));
  assert.equal(insertTemplateText("a".repeat(2000), "{nama}", 0, 6).body.length, 2000);
});
test("resident contacts validate phone and external storage links without unsafe schemes", () => {
  assert.equal(residentPhone("+62 (812) 3456-7890"), "+6281234567890");
  assert.throws(() => residentPhone("123")); assert.throws(() => residentPhone("phone@example.test"));
  assert.equal(documentStorageUrl(" https://drive.google.com/drive/folders/demo "), "https://drive.google.com/drive/folders/demo");
  for (const url of ["javascript:alert(1)", "http://drive.google.com/demo", "https://user:pass@example.test", "not a URL"]) assert.throws(() => documentStorageUrl(url));
  assert.equal(visibleDocumentUrl("javascript:alert(1)"), "");
  const state = createDemo(); const before = structuredClone(state.invoices);
  const next = updateResidentContacts(state, "A-12", { ownerPhone: "+6281200000001", ownerDocumentsUrl: "https://drive.google.com/drive/folders/owner-demo", occupantPhone: "+6281200000002", occupantDocumentsUrl: "https://drive.google.com/drive/folders/resident-demo" }, "admin", ACCESS_NOW);
  assert.equal(next.units.find(unit => unit.id === "A-12")!.occupantPhone, "+6281200000002");
  assert.equal(state.units.find(unit => unit.id === "A-12")!.occupantPhone, undefined);
  assert.deepEqual(next.invoices, before);
  assert.throws(() => updateResidentContacts(state, "A-12", { ownerPhone: "+6281200000001", ownerDocumentsUrl: "", occupantPhone: "+6281200000002", occupantDocumentsUrl: "" }, "account-11", ACCESS_NOW));
});
test("occupancy changes retain previous resident documents and freeze old billing and login", () => {
  const state = createDemo(); const unit = state.units.find(unit => unit.id === "A-12")!;
  unit.occupantPhone = "+6281200000001"; unit.occupantDocumentsUrl = "https://drive.google.com/drive/folders/previous-demo";
  const input = { occupied: true, occupant: "Penghuni Baru Contoh", phone: "+6281200000002", documentsUrl: "https://drive.google.com/drive/folders/new-demo", tenure: "Disewakan", effectiveDate: "2026-11-07" };
  const next = updateOccupancy(state, unit.id, input, "admin", ACCESS_NOW); const updated = next.units.find(unit => unit.id === "A-12")!;
  assert.equal(updated.occupant, input.occupant); assert.equal(updated.occupancyHistory!.length, 1);
  assert.equal(updated.occupancyHistory![0].occupant, "Budi Santoso"); assert.equal(updated.occupancyHistory![0].documentsUrl, unit.occupantDocumentsUrl);
  assert.deepEqual(next.invoices, state.invoices); assert.deepEqual(next.payments, state.payments); assert.deepEqual(next.accounts, state.accounts); assert.deepEqual(next.assignments, state.assignments);
  assert.equal(state.units.find(candidate => candidate.id === unit.id)!.occupancyHistory, undefined);
  const vacant = updateOccupancy(next, unit.id, { ...input, occupied: false }, "admin", ACCESS_NOW).units.find(unit => unit.id === "A-12")!;
  assert.equal(vacant.occupied, false); assert.equal(vacant.occupantPhone, ""); assert.equal(vacant.occupantDocumentsUrl, ""); assert.equal(vacant.occupancyHistory!.length, 2);
  assert.throws(() => updateOccupancy(state, unit.id, { ...input, effectiveDate: "2026-01-01" }, "admin", ACCESS_NOW));
  assert.throws(() => updateOccupancy(state, unit.id, { ...input, effectiveDate: "2026-11-08" }, "admin", ACCESS_NOW));
  assert.throws(() => updateOccupancy(state, unit.id, { ...input, effectiveDate: "2026-02-30" }, "admin", ACCESS_NOW));
  assert.throws(() => updateOccupancy(state, unit.id, { ...input, tenure: "Dihuni pemilik" }, "admin", ACCESS_NOW));
  assert.throws(() => updateOccupancy(state, unit.id, input, "account-11", ACCESS_NOW));
  assert.equal(occupancyStartDate("1 Juli 2026"), "2026-07-01");
});
test("owner occupation shares contact fields and vacancy cannot retain another active document link", () => {
  const state = createDemo();
  const unit = state.units.find(unit => unit.id === "A-01")!;
  const next = updateResidentContacts(state, unit.id, { ownerPhone: "+6281200000001", ownerDocumentsUrl: "https://drive.google.com/drive/folders/owner-demo", occupantPhone: "", occupantDocumentsUrl: "" }, "admin", ACCESS_NOW);
  const same = next.units.find(candidate => candidate.id === unit.id)!;
  assert.equal(same.ownerPhone, same.occupantPhone); assert.equal(same.ownerDocumentsUrl, same.occupantDocumentsUrl);
  const vacant = updateOccupancy(next, unit.id, { occupied: false, occupant: "", phone: "", documentsUrl: "", tenure: "", effectiveDate: "2026-11-07" }, "admin", ACCESS_NOW);
  const vac = vacant.units.find(candidate => candidate.id === unit.id)!;
  assert.equal(vac.ownerDocumentsUrl, same.ownerDocumentsUrl); assert.equal(vac.occupantDocumentsUrl, "");
  assert.equal(vac.occupancyHistory![0].documentsUrl, same.occupantDocumentsUrl);
});

import { checkInResident, checkOutResident, isRentalUnit, updateResidentProfile } from "../lib/residents.ts";
import { billTotals, invoicePeriodKey, queryBillingTree } from "../lib/billing-tree.ts";
import { cashStatement, cashReport, queryCashEntries } from "../lib/finance.ts";
test("complete profile edits validate fields and retain stable relationships and issued bills", () => {
  const state = createDemo(); const unit = state.units.find(unit => unit.id === "A-12")!;
  const profile = { number: "A-120", cluster: "Bougenville", owner: "Pemilik Contoh", occupant: "Nama Penghuni Dikoreksi", since: "2026-07-01", tenure: "Disewakan", forRent: true, ownerPhone: "+6281200000001", occupantPhone: "+6281200000002", ownerDocumentsUrl: "https://drive.google.com/drive/folders/owner", occupantDocumentsUrl: "https://drive.google.com/drive/folders/occupant" };
  const next = updateResidentProfile(state, unit.id, profile, "admin", ACCESS_NOW); const updated = next.units.find(unit => unit.id === "A-12")!;
  assert.equal(updated.number, "A-120"); assert.equal(updated.cluster, "Bougenville"); assert.equal(updated.owner, profile.owner); assert.equal(updated.occupant, profile.occupant); assert.equal(updated.since, "2026-07-01"); assert.equal(updated.forRent, true);
  assert.equal(previewInvoices(next, "Desember 2026").find(invoice => invoice.unitId === unit.id)!.unitNumber, "A-120");
  assert.deepEqual(next.invoices, state.invoices); assert.deepEqual(next.accounts, state.accounts); assert.deepEqual(next.assignments, state.assignments);
  assert.throws(() => updateResidentProfile(state, unit.id, { ...profile, number: "A-01" }, "admin", ACCESS_NOW));
  assert.throws(() => updateResidentProfile(state, unit.id, { ...profile, since: "2027-01-01" }, "admin", ACCESS_NOW));
  assert.throws(() => updateResidentProfile(state, unit.id, { ...profile, forRent: false }, "admin", ACCESS_NOW));
  assert.throws(() => updateResidentProfile(state, unit.id, profile, "account-11", ACCESS_NOW));
});
test("rental check-in and check-out enforce one active stay and retain closed stays", () => {
  const state = createDemo(); const unit = state.units.find(unit => unit.id === "C-16")!;
  const input = { occupant: "Penyewa Pertama", phone: "+6281200000001", documentsUrl: "https://drive.google.com/drive/folders/tenant-one", tenure: "Disewakan", effectiveDate: "2026-10-01" };
  const checkedIn = checkInResident(state, unit.id, input, "admin", ACCESS_NOW);
  assert.equal(checkedIn.units.find(unit => unit.id === "C-16")!.occupied, true);
  assert.throws(() => checkInResident(checkedIn, unit.id, input, "admin", ACCESS_NOW));
  const checkedOut = checkOutResident(checkedIn, unit.id, "2026-11-01", "admin", ACCESS_NOW); const empty = checkedOut.units.find(unit => unit.id === "C-16")!;
  assert.equal(empty.occupied, false); assert.equal(isRentalUnit(empty), true); assert.equal(empty.occupantDocumentsUrl, "");
  assert.equal(empty.occupancyHistory!.at(-1)!.occupant, input.occupant); assert.equal(empty.occupancyHistory!.at(-1)!.from, "2026-10-01"); assert.equal(empty.occupancyHistory!.at(-1)!.to, "2026-11-01");
  assert.throws(() => checkOutResident(checkedOut, unit.id, "2026-11-02", "admin", ACCESS_NOW));
  assert.throws(() => checkInResident(checkedOut, unit.id, { ...input, effectiveDate: "2026-10-31" }, "admin", ACCESS_NOW));
  const second = checkInResident(checkedOut, unit.id, { ...input, occupant: "Penyewa Kedua", effectiveDate: "2026-11-02" }, "admin", ACCESS_NOW);
  assert.equal(second.units.find(unit => unit.id === "C-16")!.occupant, "Penyewa Kedua"); assert.deepEqual(second.invoices, state.invoices);
});
const treeFilters = { year: "", month: "", clusterId: "", search: "", status: "all", sort: "unit" };
test("billing hierarchy groups year, period, cluster, historical resident, and unique invoices", () => {
  const state = createDemo(); const invoice = state.invoices.find(invoice => invoice.unitId === "A-12")!;
  state.invoices.push({ ...invoice, id: "TEST-2027", period: "Januari 2027", paid: 0, itemPaid: undefined });
  const tree = queryBillingTree(state, treeFilters); assert.equal(tree.years[0].year, "2027"); assert.equal(tree.years[1].year, "2026");
  const leaves = tree.years.flatMap(year => year.periods.flatMap(period => period.clusters.flatMap(cluster => cluster.people.flatMap(person => person.invoices))));
  assert.equal(leaves.length, state.invoices.length); assert.equal(new Set(leaves.map(invoice => invoice.id)).size, leaves.length); assert.deepEqual(billTotals(leaves), { count: tree.count, billed: tree.billed, paid: tree.paid, outstanding: tree.outstanding });
  const unit = state.units.find(unit => unit.id === "A-12")!; unit.occupant = "Nouveau locataire";
  const old = queryBillingTree(state, { ...treeFilters, year: "2026", search: invoice.id });
  assert.equal(old.years[0].periods[0].clusters[0].people[0].person, "Budi Santoso"); assert.equal(old.count, 1);
  assert.equal(invoicePeriodKey("Januari 2027"), "2027-01"); assert.throws(() => invoicePeriodKey("invalid"));
});
test("hierarchical filters combine before aggregation and pending bills appear once", () => {
  const state = createDemo(); const cluster = state.clusters.find(cluster => cluster.name === "Akasia")!;
  const result = queryBillingTree(state, { ...treeFilters, year: "2026", month: "11", clusterId: cluster.id, search: "A-12", status: "partial" });
  assert.equal(result.count, 1); assert.equal(result.outstanding, 200000);
  const pending = queryBillingTree(state, { ...treeFilters, status: "pending" });
  assert.equal(pending.count, state.payments.filter(payment => payment.status === "pending").length);
  assert.equal(queryBillingTree(state, { ...treeFilters, search: "absent invoice" }).years.length, 0);
});
test("cash statement running balances reconcile across filtering, ordering and monthly rollover", () => {
  let state = createDemo();
  for (const [id, direction, amount] of [["cash-out", "expense", 125000], ["cash-in", "income", 50000]] as const) state = addCashEntry(state, { id, direction, amount, date: "2026-11-07", category: direction === "income" ? "Donasi" : "Kebersihan", note: "Catatan contoh", proof: "", method: "Tunai", counterparty: "Petugas contoh", reference: "QA-REF", recordedBy: "admin", recordedAt: ACCESS_NOW }, "admin", ACCESS_NOW);
  const statement = cashStatement(state, "2026-11");
  assert.equal(statement.entries.at(-1)!.balance, statement.closing); assert.equal(statement.closing, statement.opening + statement.income - statement.expenses);
  const expenses = queryCashEntries(state, "2026-11", { search: "QA-REF", direction: "expense", category: "Kebersihan", sort: "newest", page: 99, pageSize: 10 });
  assert.equal(expenses.total, 1); assert.equal(expenses.page, 1); assert.equal(expenses.entries[0].balance, statement.entries.find(entry => entry.id === "cash-out")!.balance);
  assert.equal(cashStatement(state, "2026-12").opening, statement.closing);
  const report = cashReport(state, "2026-11"); assert.equal(report.rows.length, statement.entries.length); assert.equal(report.rows.at(-1)!.at(-1), currency(statement.closing)); assert.equal(report.fileName, "laporan-keuangan-2026-11.pdf");
  assert.equal(statement.categories.reduce((sum, category) => sum + category.income, 0), statement.income); assert.equal(statement.categories.reduce((sum, category) => sum + category.expense, 0), statement.expenses);
});

import { matchesHousingStatus } from "../lib/residents.ts";
test("rental list filters distinguish available and occupied rental homes", () => {
  const unit = { ...createDemo().units[0], forRent: true, occupied: false };
  assert.equal(matchesHousingStatus(unit, "Sewa tersedia"), true); assert.equal(matchesHousingStatus(unit, "Sewa terhuni"), false);
  assert.equal(matchesHousingStatus({ ...unit, occupied: true }, "Sewa terhuni"), true);
  assert.equal(matchesHousingStatus({ ...unit, forRent: false }, "Rumah sewa"), false);
  assert.equal(matchesHousingStatus(unit, "Kosong"), true);
});
test("cash pagination keeps monthly totals and balances independent of page and filter", () => {
  let state = createDemo();
  for (let index = 0; index < 12; index++) state = addCashEntry(state, { id: `pagination-${index}`, direction: "expense", amount: 1000, date: "2026-11-07", category: "Operasional", note: "Pengeluaran contoh", proof: "", recordedBy: "admin", recordedAt: ACCESS_NOW }, "admin", ACCESS_NOW);
  const first = queryCashEntries(state, "2026-11", { search: "", direction: "expense", category: "", sort: "oldest", page: 1, pageSize: 10 });
  const last = queryCashEntries(state, "2026-11", { search: "", direction: "expense", category: "", sort: "oldest", page: 99, pageSize: 10 });
  assert.equal(first.total, 12); assert.equal(first.entries.length, 10); assert.equal(last.page, 2); assert.equal(last.entries.length, 2);
  const empty = queryCashEntries(state, "2026-11", { search: "unknown", direction: "all", category: "", sort: "newest", page: 9, pageSize: 25 });
  assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.equal(empty.pageCount, 1);
  assert.equal(last.entries.at(-1)!.balance, cashStatement(state, "2026-11").closing);
});

import { DEMO_RESIDENT_ID, invoiceAllowsWhatsApp, invoiceKindLabel, portalPosts, residentInvoiceGroups, residentModalAllowed, residentPortal, residentView, setResidentWhatsAppPreference } from "../lib/resident-portal.ts";
test("resident portal scopes invoices and requests to the account and bill-to person", () => {
  const state = createDemo(); const own = state.invoices.find(invoice => invoice.unitId === "A-12")!;
  state.invoices.push({ ...own, id: "owner-only", person: "Sari Pertiwi" });
  state.requests.push({ ...state.requests[0], id: "other-occupant-request", person: "Other occupant" });
  const portal = residentPortal(state);
  assert.equal(portal.account!.id, DEMO_RESIDENT_ID); assert.equal(portal.canViewUnit, true);
  assert.equal(portal.invoices.length, 1); assert.equal(portal.invoices[0].id, own.id);
  assert.ok(portal.requests.every(request => request.person === portal.account!.name));
  assert.equal(residentModalAllowed(state, { type: "invoice", id: "owner-only" }), false);
  assert.equal(residentModalAllowed(state, { type: "request", id: "other-occupant-request" }), false);
  assert.equal(residentModalAllowed(state, { type: "review", id: state.payments[0].id }), false);
  assert.equal(residentModalAllowed(state, { type: "occupancy", id: "A-12" }), false);
  assert.equal(residentModalAllowed(state, { type: "invoice", id: own.id }), true);
});
test("checkout removes current household access while retaining the previous resident's own debts", () => {
  const state = createDemo(); state.units.find(unit => unit.id === "A-12")!.occupantPhone = "+6281200000001";
  const vacant = checkOutResident(state, "A-12", "2026-11-07", "admin", ACCESS_NOW);
  const next = checkInResident(vacant, "A-12", { occupant: "Penghuni Baru", phone: "+6281200000002", documentsUrl: "https://drive.google.com/drive/folders/new-private-docs", tenure: "Disewakan", effectiveDate: "2026-11-07" }, "admin", ACCESS_NOW);
  const portal = residentPortal(next);
  assert.equal(portal.canViewUnit, false); assert.equal(portal.phone, "+6281200000001");
  assert.equal(portal.invoices.length, 1); assert.equal(portal.outstanding, 200000);
  assert.equal(residentModalAllowed(next, { type: "unit", id: "A-12" }), false);
  assert.equal(residentModalAllowed(next, { type: "requestForm" }), false);
  assert.equal(residentModalAllowed(next, { type: "submitPayment", id: portal.invoices[0].id }), true);
});
test("owners do not inherit occupant invoices and inactive accounts have no personal portal data", () => {
  const state = createDemo(); const account = state.accounts.find(account => account.id === DEMO_RESIDENT_ID)!;
  account.name = "Sari Pertiwi";
  const owner = residentPortal(state); assert.equal(owner.owner, true); assert.equal(owner.canViewUnit, true); assert.equal(owner.invoices.length, 0);
  account.active = false;
  const inactive = residentPortal(state); assert.equal(inactive.account, undefined); assert.equal(inactive.canViewUnit, false); assert.deepEqual(inactive.requests, []);
  assert.equal(residentModalAllowed(state, { type: "notifications" }), false);
  assert.equal(residentModalAllowed(state, { type: "contacts" }), true);
});
test("resident billing offers only personal periods, correct combined labels and non-mutating pending filters", () => {
  const state = createDemo(); const own = residentPortal(state).invoices[0];
  const invoices = [own, { ...own, id: "water-dec", kind: "water" as const, period: "Desember 2026", items: [{ name: "Air", amount: 50000 }], paid: 0, itemPaid: undefined }];
  const pending = residentInvoiceGroups(invoices, "", "pending", "", ["water-dec"]);
  assert.equal(pending.scoped.length, 2); assert.equal(pending.shown.length, 1); assert.equal(pending.groups[0].period, "Desember 2026");
  assert.deepEqual(pending.periods, ["Desember 2026", "November 2026"]); assert.equal(pending.shown[0].paid, 0);
  assert.equal(invoiceKindLabel(own), "Iuran dan air"); assert.equal(invoiceKindLabel(invoices[1]), "Tagihan air");
  assert.equal(residentInvoiceGroups(invoices, "November 2026", "partial", own.id, []).shown.length, 1);
  assert.deepEqual(residentInvoiceGroups([], "", "all", "", []).groups, []);
});
test("news visibility and sorting are explicit and tolerate an empty feed", () => {
  const state = createDemo(); state.posts.push({ ...state.posts[0], id: "new-public", audience: "Publik", date: "2026-11-08" }, { ...state.posts[0], id: "staff-only", audience: "Pengurus", date: "2026-11-09" });
  assert.equal(portalPosts(state, "public")[0].id, "new-public");
  assert.ok(portalPosts(state, "public").every(post => post.audience === "Publik"));
  assert.ok(portalPosts(state, "resident").every(post => ["Publik", "Semua warga"].includes(post.audience)));
  assert.equal(portalPosts(state, "admin")[0].id, "staff-only");
  assert.deepEqual(portalPosts({ ...state, posts: [] }, "resident"), []);
});
test("WhatsApp preference survives state saves and is respected by the matching reminder only", () => {
  const state = createDemo(); const own = residentPortal(state).invoices[0];
  const next = setResidentWhatsAppPreference(state, false);
  assert.equal(next.accounts.find(account => account.id === DEMO_RESIDENT_ID)!.whatsappReminders, false);
  assert.equal(state.accounts.find(account => account.id === DEMO_RESIDENT_ID)!.whatsappReminders, undefined);
  assert.equal(invoiceAllowsWhatsApp(next, own), false);
  assert.equal(invoiceAllowsWhatsApp(next, { ...own, unitId: "C-04" }), true);
  assert.equal(invoiceAllowsWhatsApp(setResidentWhatsAppPreference(next, true), own), true);
  assert.throws(() => setResidentWhatsAppPreference(state, false, "unknown"));
});
test("resident routes fall back to home for admin-only and unknown pages", () => {
  for (const view of [null, "cash", "roles", "unknown"]) assert.equal(residentView(view), "home");
  assert.equal(residentView("invoices"), "invoices"); assert.equal(residentView("unit"), "unit");
});

import { portalDateKey } from "../lib/resident-portal.ts";
test("portal activity sorts dates consistently across ISO, full and abbreviated Indonesian dates", () => {
  assert.equal(portalDateKey("7 Nov 2026"), "2026-11-07"); assert.equal(portalDateKey("7 November 2026"), "2026-11-07");
  assert.equal(portalDateKey("2026-11-08"), "2026-11-08"); assert.equal(portalDateKey("31 Feb 2026"), "");
  const requests = residentPortal(createDemo()).requests;
  assert.equal(requests[0].id, "TM-001");
});

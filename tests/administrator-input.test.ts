import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentInput } from "../lib/neon/resident-admin.ts";
import { billScheduleInput, invoiceInput, meterCharge, meterInput, occursInPeriod } from "../lib/neon/invoice-input.ts";

test("Super Administrator assignments accept only the two delegable capabilities", () => {
  const body = { action: "assign", endDate: "2027-01-01", reason: "  Elected staff  " };
  for (const role of ["neighborhood_admin", "billing_admin"]) {
    assert.deepEqual(assignmentInput({ ...body, role }), { assignmentId: null, role, endDate: body.endDate, reason: "Elected staff" });
  }
  assert.throws(() => assignmentInput({ ...body, role: "super_admin" }));
  assert.throws(() => assignmentInput({ ...body, role: "constructor" }));
  assert.throws(() => assignmentInput({ ...body, role: "billing_admin", endDate: "2027-02-29" }));
  assert.throws(() => assignmentInput({ action: "revoke", assignmentId: ["id"], reason: "End term" }));
});

test("manual invoices use exact integer rupiah and valid dated terms", () => {
  const invoice = { item: "  Iuran   warga ", amount: "125000", period: "2026-11", issueDate: "2026-11-01", dueDate: "2026-11-30" };
  assert.deepEqual(invoiceInput(invoice), { ...invoice, item: "Iuran warga", period: "2026-11-01" });
  assert.throws(() => invoiceInput({ ...invoice, amount: "125.500" }));
  assert.throws(() => invoiceInput({ ...invoice, amount: "999999999999999" }));
  assert.throws(() => invoiceInput({ ...invoice, dueDate: "2026-10-31" }));
  assert.throws(() => invoiceInput({ ...invoice, period: ["2026-11"] }));
});

test("billing occurrences follow the configured monthly or annual anchor", () => {
  const start = { start_date: "2026-11-01", end_date: null };
  assert.equal(occursInPeriod({ ...start, recurrence: "one_time" }, "2026-11-01"), true);
  assert.equal(occursInPeriod({ ...start, recurrence: "one_time" }, "2027-11-01"), false);
  assert.equal(occursInPeriod({ ...start, recurrence: "monthly" }, "2027-01-01"), true);
  assert.equal(occursInPeriod({ ...start, recurrence: "annual" }, "2027-01-01"), false);
  assert.equal(occursInPeriod({ ...start, recurrence: "annual" }, "2027-11-01"), true);
  assert.equal(occursInPeriod({ ...start, recurrence: "monthly" }, "2026-10-01"), false);
  assert.equal(occursInPeriod({ ...start, recurrence: "monthly", end_date: "2027-01-01" }, "2027-01-01"), false);
});

test("meter billing validates rate and cumulative readings", () => {
  const schedule = { item: "Air", amount: "12000", recurrence: "monthly", period: "2026-11", pricing: "water" };
  assert.deepEqual(billScheduleInput(schedule), { ...schedule, period: "2026-11-01" });
  assert.throws(() => billScheduleInput({ ...schedule, pricing: "unsupported" }));
  assert.deepEqual(meterInput({ serial: " M-1 ", previous: "20.123", current: "21.340" }), { serial: "M-1", previous: "20.123", current: "21.340" });
  assert.throws(() => meterInput({ serial: "M-1", previous: "20.123", current: "20.122" }));
  assert.throws(() => meterInput({ serial: "M-1", previous: "20.1234", current: "21.000" }));
  assert.equal(meterCharge(meterInput({ serial: "M-1", previous: "0", current: "1.500" }), "101"), "152");
  assert.equal(meterCharge(meterInput({ serial: "M-1", previous: "500", current: "500.000" }), "101"), "0");
});

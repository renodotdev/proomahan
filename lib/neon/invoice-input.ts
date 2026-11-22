import { realDate } from "./core-input.ts";

function chargeInput(body: Record<string, unknown>) {
  const item = typeof body.item === "string" ? body.item.trim().replace(/\s+/g, " ") : "";
  const amount = typeof body.amount === "string" ? body.amount : "";
  if (!item || item.length > 100) throw new Error("Isi nama iuran (maksimal 100 karakter).");
  if (!/^[1-9]\d{0,13}$/.test(amount)) throw new Error("Masukkan nominal rupiah bulat dan lebih dari nol.");
  if (typeof body.period !== "string") throw new Error("Periode tagihan tidak valid.");
  const period = realDate(`${body.period}-01`);
  if (period.startsWith("0000")) throw new Error("Periode tagihan tidak valid.");
  return { item, amount, period };
}

export function invoiceInput(body: Record<string, unknown>) {
  const charge = chargeInput(body);
  const issueDate = realDate(body.issueDate);
  const dueDate = realDate(body.dueDate);
  if ([issueDate, dueDate].some(date => date.startsWith("0000"))) throw new Error("Tanggal tidak valid.");
  if (dueDate < issueDate) throw new Error("Jatuh tempo tidak boleh sebelum tanggal terbit.");
  return { ...charge, issueDate, dueDate };
}

export const billingFrequencies = { one_time: "Sekali", monthly: "Bulanan", annual: "Tahunan" } as const;
export type BillingFrequency = keyof typeof billingFrequencies;
export type BillSchedule = {
  id: string; name: string; amount: string; recurrence: BillingFrequency;
  start_date: string; end_date: string | null; pricing: "fixed" | "water";
};

export function occursInPeriod(schedule: Pick<BillSchedule, "start_date" | "end_date" | "recurrence">, period: string) {
  if (period < schedule.start_date || (schedule.end_date && period >= schedule.end_date)) return false;
  if (schedule.recurrence === "one_time") return period === schedule.start_date;
  return schedule.recurrence !== "annual" || schedule.start_date.slice(5, 7) === period.slice(5, 7);
}

export function billScheduleInput(body: Record<string, unknown>) {
  const { pricing, recurrence } = body;
  if ((pricing !== "fixed" && pricing !== "water") || typeof recurrence !== "string" || !Object.hasOwn(billingFrequencies, recurrence)) {
    throw new Error("Pilih jenis biaya dan frekuensi yang valid.");
  }
  const { item, amount, period } = chargeInput(body);
  return { item, amount, period, recurrence: recurrence as BillingFrequency, pricing };
}

export function meterInput(body: Record<string, unknown>) {
  const serial = typeof body.serial === "string" ? body.serial.trim() : "";
  const { previous, current } = body;
  const meterNumber = /^\d{1,10}(?:\.\d{1,3})?$/;
  if (!serial || serial.length > 60 || typeof previous !== "string" || typeof current !== "string" ||
      !meterNumber.test(previous) || !meterNumber.test(current) || Number(current) < Number(previous)) {
    throw new Error("Isi nomor meter dan angka meter yang valid. Angka akhir tidak boleh lebih kecil dari angka awal.");
  }
  return { serial, previous, current };
}

export function meterCharge(reading: ReturnType<typeof meterInput>, rate: string) {
  function thousandths(value: string) {
    const [whole, fractional = ""] = value.split(".");
    return BigInt(whole + fractional.padEnd(3, "0"));
  }
  const consumption = thousandths(reading.current) - thousandths(reading.previous);
  return ((consumption * BigInt(rate) + 500n) / 1000n).toString();
}

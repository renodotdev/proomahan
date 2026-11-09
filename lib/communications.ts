import type { Demo } from "./demo.ts";
export type TemplateKind = "invoice" | "water" | "expense" | "cash_report";
export type CommunicationTemplate = { kind: TemplateKind; label: string; body: string };
export const TEMPLATE_TOKENS: Record<TemplateKind, string[]> = {
  invoice: ["nama", "unit", "periode", "nominal", "jatuh_tempo"],
  water: ["nama", "unit", "periode", "nominal", "jatuh_tempo"],
  expense: ["tanggal", "kategori", "nominal", "catatan"],
  cash_report: ["periode", "saldo_awal", "pemasukan", "pengeluaran", "saldo_akhir"],
};
export const DEFAULT_TEMPLATES: CommunicationTemplate[] = [
  { kind: "invoice", label: "Pengingat tagihan", body: "Halo {nama}, pengingat tagihan D'Park City unit {unit}, periode {periode}. Sisa tagihan {nominal}, jatuh tempo {jatuh_tempo}. Jika sudah membayar, silakan hubungi pengurus. Terima kasih." },
  { kind: "water", label: "Tagihan air", body: "Halo {nama}, tagihan air D'Park City unit {unit}, periode {periode}, sebesar {nominal}. Jatuh tempo {jatuh_tempo}. Rincian meter tersedia di portal warga." },
  { kind: "expense", label: "Pengeluaran kas", body: "Informasi kas D'Park City: pengeluaran {nominal} pada {tanggal}, kategori {kategori}. Penggunaan: {catatan}. Terima kasih." },
  { kind: "cash_report", label: "Laporan kas bulanan", body: "Laporan kas D'Park City - {periode}\nSaldo awal: {saldo_awal}\nPemasukan: {pemasukan}\nPengeluaran: {pengeluaran}\nSaldo akhir: {saldo_akhir}" },
];
export function validateTemplate(kind: TemplateKind, body: string) {
  if (!body.trim() || body.length > 2000) throw new Error("Template harus berisi 1–2.000 karakter.");
  const tokens = [...body.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  if (tokens.some(token => !TEMPLATE_TOKENS[kind].includes(token)) || body.replace(/\{[^{}]+\}/g, "").match(/[{}]/)) throw new Error("Gunakan hanya variabel yang tersedia untuk jenis template ini.");
}
export function renderMessage(state: Demo, kind: TemplateKind, values: Record<string, string>) {
  const template = state.templates.find(t => t.kind === kind) || DEFAULT_TEMPLATES.find(t => t.kind === kind)!;
  validateTemplate(kind, template.body);
  return template.body.replace(/\{([^{}]+)\}/g, (_, token: string) => {
    if (values[token] === undefined) throw new Error(`Variabel ${token} belum terisi.`);
    return values[token];
  });
}

// Textarea selection offsets use UTF-16, matching slice and the browser caret.
export function insertTemplateText(body: string, text: string, start: number, end: number) {
  const from = Math.max(0, Math.min(body.length, Math.trunc(start) || 0));
  const to = Math.max(from, Math.min(body.length, Math.trunc(end) || 0));
  const next = body.slice(0, from) + text + body.slice(to);
  if (next.length > 2000) throw new Error("Template maksimal 2.000 karakter. Kurangi isi pesan sebelum menyisipkan teks.");
  return { body: next, cursor: from + text.length };
}

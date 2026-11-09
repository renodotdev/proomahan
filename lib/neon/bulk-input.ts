import type { CoreResource } from "./core-input.ts";

export const bulkRowLimit = 50;
export const recordBodyLimit = 16_384;

export const bulkColumns = {
 clusters: [
  { key: "code", label: "Kode klaster *", example: "A" },
  { key: "name", label: "Nama klaster *", example: "Klaster Anggrek" },
 ],
 people: [
  { key: "fullName", label: "Nama lengkap *", example: "Warga Contoh" },
  { key: "phone", label: "Nomor telepon *", example: "081234567890" },
  { key: "email", label: "Email kontak", example: "warga@example.com" },
  { key: "documentsUrl", label: "URL dokumen", example: "https://drive.google.com/example" },
 ],
 units: [
  { key: "number", label: "Nomor unit *", example: "A-01" },
  { key: "clusterCode", label: "Kode klaster aktif *", example: "A" },
  { key: "addressDetail", label: "Detail alamat", example: "Jalan Anggrek No. 1" },
  { key: "availableForRent", label: "Disewakan (Ya/Tidak)", example: "Tidak" },
 ],
} satisfies Record<CoreResource, { key: string; label: string; example: string }[]>;

export function bulkInput(resource: CoreResource, text: unknown) {
 if (typeof text !== "string") throw new Error("Tempel data dari spreadsheet.");
 const columns = bulkColumns[resource];
 const records: { line: number; body: Record<string, unknown> }[] = [];
 for (const [index, value] of text.split(/\r\n|\n|\r/).entries()) {
  if (!value.trim()) continue;
  const line = index + 1;
  if (records.length === bulkRowLimit) throw new Error(`Maksimal ${bulkRowLimit} baris per penyimpanan.`);
  const cells = value.split("\t");
  if (cells.length > columns.length) throw new Error(`Baris ${line}: jumlah kolom melebihi format.`);
  const body: Record<string, unknown> = {};
  for (const [column, { key }] of columns.entries()) {
   let cell = (cells[column] ?? "").trim();
   if (cell.startsWith('"')) {
    // shortcut: each spreadsheet record must fit on one line, upgrade the parser for multiline cells.
    if (!/^"(?:[^"]|"")*"$/.test(cell)) throw new Error(`Baris ${line}: sel berpetik tidak valid. Gunakan satu baris per data.`);
    cell = cell.slice(1, -1).replaceAll('""', '"').trim();
   }
   if (key === "availableForRent") {
    const rent = cell.toLowerCase();
    if (rent && rent !== "ya" && rent !== "tidak") throw new Error(`Baris ${line}: isi status sewa dengan Ya atau Tidak.`);
    body[key] = rent === "ya";
   } else {
    body[key] = cell;
   }
  }
  records.push({ line, body });
 }
 if (!records.length) throw new Error("Tempel minimal satu baris data.");
 return records;
}

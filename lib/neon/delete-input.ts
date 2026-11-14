export type DeleteRecord = { id: string; rowVersion: string };
export const deleteLimit = 20;

export function deleteInput(value: unknown): DeleteRecord[] {
 if (!Array.isArray(value) || !value.length || value.length > deleteLimit) {
  throw new Error(`Pilih 1–${deleteLimit} data untuk dihapus.`);
 }
 const ids = new Set<string>();
 return value.map(record => {
  if (!record || typeof record !== "object" ||
   typeof record.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) ||
   typeof record.rowVersion !== "string" || !/^[1-9][0-9]{0,18}$/.test(record.rowVersion) ||
   BigInt(record.rowVersion) > 9223372036854775807n) {
   throw new Error("Identitas atau versi data tidak valid. Muat ulang halaman.");
  }
  const id = record.id.toLowerCase();
  if (ids.has(id)) throw new Error("Pilihan data berulang.");
  ids.add(id);
  return { id, rowVersion: record.rowVersion };
 });
}

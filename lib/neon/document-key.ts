export const MAX_DOCUMENT_SIZE = 3 * 1024 * 1024;
export function documentPrefix(userId: string) {
  return `residents/${encodeURIComponent(userId)}/`;
}
export function ownedDocumentKey(userId: string, key: string) {
  const prefix = documentPrefix(userId);
  return key.startsWith(prefix) && /^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(key.slice(prefix.length));
}
export function documentExtension(bytes: Uint8Array): "pdf" | "png" | "jpg" | null {
  if (Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-") return "pdf";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  return null;
}

export function readDocumentName(encoded: string | null | undefined) {
  if (!encoded || encoded.length > 2400) return null;
  try {
    const name = decodeURIComponent(encoded).normalize().replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
    return Array.from(name).slice(0, 180).join("") || null;
  } catch {
    return null;
  }
}

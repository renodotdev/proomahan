export function normalizePhone(value: string): string {
  let phone=value.trim().replace(/[\s().-]/g,"");
  if (phone.startsWith("0")) phone="+62"+phone.slice(1);
  else if (phone.startsWith("62")) phone="+"+phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Gunakan nomor telepon yang valid, misalnya 081234567890 atau +6281234567890.");
  return phone;
}

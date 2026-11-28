import { normalizePhone } from "./phone.ts";

export type CommunityContact = {
  href: string;
  channel: "WhatsApp" | "Telepon";
  number: string;
};

export function contactLink(phone: string, whatsapp: string | null): CommunityContact | null {
  if (whatsapp) {
    try {
      const number = normalizePhone(whatsapp);
      return { href: `https://wa.me/${number.slice(1)}`, channel: "WhatsApp", number };
    } catch {
      // An invalid WhatsApp number can still have a valid phone fallback.
    }
  }
  try {
    const number = normalizePhone(phone);
    return { href: `tel:${number}`, channel: "Telepon", number };
  } catch {
    return null;
  }
}

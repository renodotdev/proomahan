import type { ReactNode } from "react";
import type { CommunityContact } from "@/lib/community-contact";

export default function CommunityHelp({ title, contact, children }: {
  title: string;
  contact: CommunityContact | null;
  children: ReactNode;
}) {
  return <details className="community-help">
    <summary>{title}</summary>
    <div className="community-help-body">
      <p>{children}</p>
      {contact ? <a className="button secondary" href={contact.href}>
        {contact.channel === "WhatsApp" ? "WhatsApp pengurus" : "Telepon pengurus"} ({contact.number})
      </a> : <p>Gunakan kanal komunikasi lingkungan yang biasa Anda pakai atau datang ke kantor pengurus.</p>}
      <p className="muted">Sebutkan nama dan nomor unit Anda. Rahasiakan kata sandi Anda.</p>
    </div>
  </details>;
}

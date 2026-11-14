"use client";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { Building2, FileText, Globe, House, KeyRound, LogOut, Menu, UsersRound, X } from "lucide-react";
import type { CoreResource } from "@/lib/neon/core-input";

type Props = {
  active: CoreResource | "password" | "documents";
  canManage: boolean;
  name: string;
  disabled: boolean;
  onChoose: (resource: CoreResource) => void;
  onPassword: () => void;
  onSignOut: () => void;
};

export default function WorkspaceNavigation({ active, canManage, name, disabled, onChoose, onPassword, onSignOut }: Props) {
  const drawer = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drawerId = useId();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  function choose(resource: CoreResource) {
    drawer.current?.close();
    onChoose(resource);
  }
  const content = <>
    <Link href="/" className="live-brand" onClick={() => drawer.current?.close()}>proomahan<span>.</span></Link>
    <div className="workspace-nav-heading"><span className="eyebrow">{canManage ? "ADMINISTRASI" : "RUANG WARGA"}</span><strong>{name || "Memuat akun…"}</strong></div>
    <nav aria-label="Menu dashboard">
      <span className="workspace-nav-label">{canManage ? "Data lingkungan" : "Data saya"}</span>
      <button type="button" className={`nav-item ${active === "units" ? "active" : ""}`} aria-current={active === "units" ? "page" : undefined} disabled={disabled} onClick={() => choose("units")}><House size={18} />{canManage ? "Unit hunian" : "Hunian saya"}</button>
      <button type="button" className={`nav-item ${active === "people" ? "active" : ""}`} aria-current={active === "people" ? "page" : undefined} disabled={disabled} onClick={() => choose("people")}><UsersRound size={18} />{canManage ? "Warga" : "Profil saya"}</button>
      {canManage && <button type="button" className={`nav-item ${active === "clusters" ? "active" : ""}`} aria-current={active === "clusters" ? "page" : undefined} disabled={disabled} onClick={() => choose("clusters")}><Building2 size={18} />Klaster</button>}
      {disabled ? <button type="button" className="nav-item" disabled><FileText size={18} />Dokumen saya</button> : <Link href="/documents" className={`nav-item ${active === "documents" ? "active" : ""}`} aria-current={active === "documents" ? "page" : undefined} onClick={() => drawer.current?.close()}><FileText size={18} />Dokumen saya</Link>}
      <span className="workspace-nav-label">Akun</span>
      <button type="button" className={`nav-item ${active === "password" ? "active" : ""}`} aria-current={active === "password" ? "page" : undefined} disabled={disabled} onClick={() => { drawer.current?.close(); onPassword(); }}><KeyRound size={18} />Ubah kata sandi</button>
      <Link href="/" className="nav-item" onClick={() => drawer.current?.close()}><Globe size={18} />Halaman publik</Link>
    </nav>
    <button type="button" className="nav-item workspace-sign-out" onClick={() => { drawer.current?.close(); onSignOut(); }}><LogOut size={18} />Keluar</button>
  </>;
  return <>
    <aside className="workspace-sidebar" aria-label="Navigasi dashboard">{content}</aside>
    <div className="workspace-mobile-bar"><button type="button" className="button secondary" aria-label="Buka menu dashboard" aria-haspopup="dialog" aria-controls={drawerId} onClick={() => drawer.current?.showModal()}><Menu size={20} />Menu</button><Link href="/" className="live-brand">proomahan<span>.</span></Link></div>
    <dialog ref={drawer} id={drawerId} className="workspace-drawer" aria-labelledby={titleId}>
      <div className="workspace-drawer-heading"><h2 id={titleId}>Menu dashboard</h2><button type="button" className="button secondary compact" aria-label="Tutup menu dashboard" onClick={() => drawer.current?.close()}><X size={20} /></button></div>
      {content}
    </dialog>
  </>;
}

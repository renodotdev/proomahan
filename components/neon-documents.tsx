"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FileText, Upload, Download, Trash2, LogOut } from "lucide-react";
import { authClient } from "@/lib/neon/auth-client";

type Document = { key: string; size: number };
export default function NeonDocuments() {
  const [files, setFiles] = useState<Document[]>([]);
  const [owner, setOwner] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  async function load(next?: string) {
    const response = await fetch(`/api/documents${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/sign-in"); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setOwner(data.owner); setFiles(data.files); setCursor(data.cursor);
  }
  useEffect(() => { load().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }, []);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const file = new FormData(form).get("document");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 3 * 1024 * 1024) { setMessage("Ukuran dokumen maksimal 3 MB."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/documents", { method: "POST", body: file });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await load(); form.reset(); setMessage("Dokumen berhasil disimpan.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Dokumen belum tersimpan."); }
    finally { setBusy(false); }
  }
  async function remove(key: string) {
    if (!window.confirm("Hapus dokumen ini secara permanen?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/documents?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Dokumen belum dapat dihapus.");
      await load(); setMessage("Dokumen dihapus.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Terjadi kesalahan."); }
    finally { setBusy(false); }
  }
  return <main className="neon-workspace"><header className="neon-documents-header"><div><span className="eyebrow">PROOMAHAN · D'PARK CITY</span><h1>Dokumen saya</h1><p>{owner ? `Ruang pribadi ${owner}. ` : ""}Dokumen hanya dapat diakses oleh pemilik akun ini.</p></div><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { const result = await authClient.signOut(); if (result.error) throw new Error(); window.location.assign("/sign-in"); } catch { setMessage("Belum dapat keluar. Silakan coba lagi."); setBusy(false); } }}><LogOut size={16} />Keluar</button></header><section className="panel neon-documents-panel"><h2>Unggah dokumen</h2><p>PDF, JPG, atau PNG · Maksimal 3 MB per dokumen</p><form onSubmit={upload}><label htmlFor="document">Pilih dokumen</label><input id="document" name="document" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} /><button className="button primary" disabled={busy}><Upload size={16} />{busy ? "Memproses…" : "Simpan dokumen"}</button></form></section>{message && <p role="status" className="info-note">{message}</p>}<section className="panel neon-documents-panel"><h2>Dokumen tersimpan</h2>{!files.length && <p>{busy ? "Memuat dokumen…" : "Belum ada dokumen. Unggah dokumen pertama Anda."}</p>}<ul className="neon-document-list">{files.map((file, index) => <li key={file.key}><FileText size={20} /><span>Dokumen {index + 1} · {file.key.split(".").pop()?.toUpperCase()}<small>{Math.ceil(file.size / 1024)} KB</small></span><a className="button secondary" href={`/api/documents?key=${encodeURIComponent(file.key)}`}><Download size={16} /><span>Unduh</span></a><button className="button secondary" aria-label={`Hapus dokumen ${index + 1}`} disabled={busy} onClick={() => remove(file.key)}><Trash2 size={16} /></button></li>)}</ul>{cursor && <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { await load(cursor); } catch { setMessage("Halaman belum dapat dimuat."); } finally { setBusy(false); } }}>Halaman berikutnya</button>}</section><p className="muted">Layanan dokumen ini memakai penyimpanan langsung. Halaman pratinjau utama masih menggunakan data contoh.</p></main>;
}

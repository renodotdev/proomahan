"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FileText, Upload, Download, Trash2, LogOut } from "lucide-react";
import DeleteConfirmation from "@/components/delete-confirmation";
import { authClient } from "@/lib/neon/auth-client";

type Document = { key: string; size: number };
export default function NeonDocuments() {
  const [files, setFiles] = useState<Document[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [deleting,setDeleting]=useState<Document[]|null>(null);
  const [owner, setOwner] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  async function load(next?: string) {
    const response = await fetch(`/api/documents${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/sign-in"); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setOwner(data.owner); setFiles(data.files); setCursor(data.cursor); setSelected([]);
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
  async function remove() {
    if(!deleting)return;
    const response=await fetch("/api/documents",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({keys:deleting.map(file=>file.key)})});
    if(response.status===401){window.location.assign("/sign-in");throw new Error("Silakan masuk terlebih dahulu.");}
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Dokumen belum dapat dihapus.");
    const deleted=new Set<string>(result.deleted);
    setFiles(current=>current.filter(file=>!deleted.has(file.key)));
    setSelected(current=>current.filter(key=>!deleted.has(key)));
    if(result.failed.length) {
      setDeleting(current=>current?.filter(file=>!deleted.has(file.key))||null);
      throw new Error(`${result.deleted.length} dokumen dihapus. ${result.failed.length} dokumen gagal dihapus. Coba lagi untuk dokumen yang tersisa.`);
    }
    setDeleting(null);
    setMessage(`${result.deleted.length} dokumen berhasil dihapus.`);
  }
  return <main className="neon-workspace"><header className="neon-documents-header"><div><span className="eyebrow">PROOMAHAN · D'PARK CITY</span><h1>Dokumen saya</h1><p>{owner ? `Ruang pribadi ${owner}. ` : ""}Dokumen hanya dapat diakses oleh pemilik akun ini.</p></div><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { const result = await authClient.signOut(); if (result.error) throw new Error(); window.location.assign("/sign-in"); } catch { setMessage("Belum dapat keluar. Silakan coba lagi."); setBusy(false); } }}><LogOut size={16} />Keluar</button></header><section className="panel neon-documents-panel"><h2>Unggah dokumen</h2><p>PDF, JPG, atau PNG · Maksimal 3 MB per dokumen</p><form onSubmit={upload}><label htmlFor="document">Pilih dokumen</label><input id="document" name="document" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} /><button className="button primary" disabled={busy}><Upload size={16} />{busy ? "Memproses…" : "Simpan dokumen"}</button></form></section>{message && <p role="status" className="info-note">{message}</p>}<section className="panel neon-documents-panel"><h2>Dokumen tersimpan</h2><div className="live-selection-toolbar"><label className="live-check"><input type="checkbox" disabled={busy||!files.length} checked={!!files.length&&selected.length===files.length} ref={element=>{if(element)element.indeterminate=selected.length>0&&selected.length<files.length;}} onChange={event=>setSelected(event.target.checked?files.map(file=>file.key):[])}/>Pilih semua pada halaman ini</label><button className="button secondary live-danger-outline" disabled={busy||!selected.length} onClick={()=>setDeleting(files.filter(file=>selected.includes(file.key)))}><Trash2 size={16}/>Hapus terpilih ({selected.length})</button></div>{!files.length && <p>{busy ? "Memuat dokumen…" : "Belum ada dokumen. Unggah dokumen pertama Anda."}</p>}<ul className="neon-document-list">{files.map((file, index) => <li key={file.key}><input type="checkbox" aria-label={`Pilih dokumen ${index+1}`} disabled={busy} checked={selected.includes(file.key)} onChange={event=>setSelected(current=>event.target.checked?[...current,file.key]:current.filter(key=>key!==file.key))}/><FileText size={20} /><span>Dokumen {index + 1} · {file.key.split(".").pop()?.toUpperCase()}<small>{Math.ceil(file.size / 1024)} KB</small></span><a className="button secondary" href={`/api/documents?key=${encodeURIComponent(file.key)}`}><Download size={16} /><span>Unduh</span></a><button className="button secondary" aria-label={`Hapus dokumen ${index + 1}`} disabled={busy} onClick={() => setDeleting([file])}><Trash2 size={16} /></button></li>)}</ul>{cursor && <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { await load(cursor); } catch { setMessage("Halaman belum dapat dimuat."); } finally { setBusy(false); } }}>Halaman berikutnya</button>}</section>{deleting&&<DeleteConfirmation labels={deleting.map(file=>`Dokumen ${files.findIndex(item=>item.key===file.key)+1} · ${file.key.split(".").pop()?.toUpperCase()}`)} description="Dokumen terpilih akan dihapus permanen dari penyimpanan pribadi. Jika layanan terganggu, hasil penghapusan ditampilkan dan dokumen yang gagal dapat dicoba lagi." onClose={()=>setDeleting(null)} onConfirm={remove}/>}<p className="muted">Layanan dokumen ini memakai penyimpanan langsung. Halaman pratinjau utama masih menggunakan data contoh.</p></main>;
}

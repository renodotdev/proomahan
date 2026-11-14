"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FileText, Upload, Download, Trash2 } from "lucide-react";
import { useConfirmation } from "@/components/action-confirmation";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard-shell";
import { cacheKeys, cacheTimes } from "@/lib/client-cache";
import DeleteConfirmation from "@/components/delete-confirmation";

type Document = { key: string; size: number };
export default function NeonDocuments() {
  const confirm = useConfirmation();
  const {userId,api}=useDashboard();
  const client=useQueryClient();
  const router=useRouter();
  const params=useSearchParams();
  const currentCursor=params.get("cursor")||"";
  const [selected,setSelected]=useState<string[]>([]);
  const [deleting,setDeleting]=useState<Document[]|null>(null);
  const [mutating,setMutating]=useState(false);
  const [localMessage,setMessage]=useState("");
  const documents=useQuery({queryKey:[...cacheKeys.documents(userId),currentCursor],staleTime:cacheTimes.documents,queryFn:({signal})=>api<{owner:string;files:Document[];cursor?:string}>(`/api/documents${currentCursor?`?cursor=${encodeURIComponent(currentCursor)}`:""}`,{signal})});
  const files=documents.isError?[]:documents.data?.files||[];
  const owner=documents.data?.owner||"";
  const cursor=documents.data?.cursor;
  const busy=mutating||documents.isFetching;
  const message=documents.error?.message||localMessage;
  useEffect(()=>{setSelected([]);setDeleting(null);},[currentCursor]);
  useEffect(()=>{setSelected([]);},[documents.dataUpdatedAt]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const file = new FormData(form).get("document");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 3 * 1024 * 1024) { setMessage("Ukuran dokumen maksimal 3 MB."); return; }
    if (!await confirm({ title: "Simpan dokumen?", description: `Unggah ${file.name} ke penyimpanan pribadi Anda.`, confirmLabel: "Simpan dokumen" })) return;
    setMutating(true); setMessage("");
    try {
      await api("/api/documents", { method: "POST", body: file });
      await client.invalidateQueries({queryKey:cacheKeys.documents(userId)}); router.replace("/documents"); form.reset(); setMessage("Dokumen berhasil disimpan.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Dokumen belum tersimpan."); }
    finally { setMutating(false); }
  }
  async function remove() {
    if(!deleting)return;
    const result=await api<{deleted:string[];failed:string[]}>("/api/documents",{method:"DELETE",body:JSON.stringify({keys:deleting.map(file=>file.key)})});
    const deleted=new Set<string>(result.deleted);
    client.setQueriesData<{owner:string;files:Document[];cursor?:string}>({queryKey:cacheKeys.documents(userId)},current=>current?{...current,files:current.files.filter(file=>!deleted.has(file.key))}:current);
    await client.invalidateQueries({queryKey:cacheKeys.documents(userId)});
    setSelected(current=>current.filter(key=>!deleted.has(key)));
    if(result.failed.length) {
      setDeleting(current=>current?.filter(file=>!deleted.has(file.key))||null);
      throw new Error(`${result.deleted.length} dokumen dihapus. ${result.failed.length} dokumen gagal dihapus. Coba lagi untuk dokumen yang tersisa.`);
    }
    setDeleting(null);
    setMessage(`${result.deleted.length} dokumen berhasil dihapus.`);
  }
  return <><header className="neon-documents-header"><div><span className="eyebrow">PROOMAHAN · D'PARK CITY</span><h1>Dokumen saya</h1><p>{owner ? `Ruang pribadi ${owner}. ` : ""}Dokumen hanya dapat diakses oleh pemilik akun ini.</p></div></header><section className="panel neon-documents-panel"><h2>Unggah dokumen</h2><p>PDF, JPG, atau PNG · Maksimal 3 MB per dokumen</p><form onSubmit={upload}><label htmlFor="document">Pilih dokumen</label><input id="document" name="document" type="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} /><button className="button primary" disabled={busy}><Upload size={16} />{busy ? "Memproses…" : "Simpan dokumen"}</button></form></section>{message && <p role="status" className="info-note">{message}{documents.isError&&<button className="text-button" onClick={()=>documents.refetch()}>Coba lagi</button>}</p>}<section className="panel neon-documents-panel"><h2>Dokumen tersimpan</h2><div className="live-selection-toolbar"><label className="live-check"><input type="checkbox" disabled={busy||!files.length} checked={!!files.length&&selected.length===files.length} ref={element=>{if(element)element.indeterminate=selected.length>0&&selected.length<files.length;}} onChange={event=>setSelected(event.target.checked?files.map(file=>file.key):[])}/>Pilih semua pada halaman ini</label><button className="button secondary live-danger-outline" disabled={busy||!selected.length} onClick={()=>setDeleting(files.filter(file=>selected.includes(file.key)))}><Trash2 size={16}/>Hapus terpilih ({selected.length})</button></div>{!files.length && <p>{busy ? "Memuat dokumen…" : "Belum ada dokumen. Unggah dokumen pertama Anda."}</p>}<ul className="neon-document-list">{files.map((file, index) => <li key={file.key}><input type="checkbox" aria-label={`Pilih dokumen ${index+1}`} disabled={busy} checked={selected.includes(file.key)} onChange={event=>setSelected(current=>event.target.checked?[...current,file.key]:current.filter(key=>key!==file.key))}/><FileText size={20} /><span>Dokumen {index + 1} · {file.key.split(".").pop()?.toUpperCase()}<small>{Math.ceil(file.size / 1024)} KB</small></span><a className="button secondary" href={`/api/documents?key=${encodeURIComponent(file.key)}`}><Download size={16} /><span>Unduh</span></a><button className="button secondary" aria-label={`Hapus dokumen ${index + 1}`} disabled={busy} onClick={() => setDeleting([file])}><Trash2 size={16} /></button></li>)}</ul>{cursor && <button className="button secondary" disabled={busy} onClick={() => router.push(`/documents?cursor=${encodeURIComponent(cursor)}`)}>Halaman berikutnya</button>}</section>{deleting&&<DeleteConfirmation labels={deleting.map(file=>`Dokumen ${files.findIndex(item=>item.key===file.key)+1} · ${file.key.split(".").pop()?.toUpperCase()}`)} description="Dokumen terpilih akan dihapus permanen dari penyimpanan pribadi. Jika layanan terganggu, hasil penghapusan ditampilkan dan dokumen yang gagal dapat dicoba lagi." onClose={()=>setDeleting(null)} onConfirm={remove}/>}<p className="muted">Dokumen disimpan di penyimpanan pribadi Neon.</p></>;
}

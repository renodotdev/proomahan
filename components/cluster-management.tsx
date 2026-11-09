"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Plus } from "lucide-react";
import { saveCluster, setClusterArchived } from "@/lib/clusters";
import { uid, type Cluster, type Demo } from "@/lib/demo";

export function ClusterManagement({ data, save, notify }: { data: Demo; save: (data: Demo) => void; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<Cluster | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<Cluster | null>(null);
  const [error, setError] = useState("");
  const [inspect, setInspect] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const unitHeading = useRef<HTMLHeadingElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (inspect) unitHeading.current?.focus(); }, [inspect]);
  useEffect(() => { if (confirm) confirmHeading.current?.focus(); }, [confirm]);
  const startEdit = (cluster: Cluster | null) => { setEditing(cluster); setConfirm(null); setError(""); };
  const commit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const fields = new FormData(event.currentTarget);
    try {
      save(saveCluster(data, { id: editing?.id || uid(), code: String(fields.get("code") || ""), name: String(fields.get("name") || ""), archived: editing?.archived || false }));
      setEditing(undefined); notify(editing ? "Perubahan klaster contoh tersimpan. Label unit dan cakupan biaya ikut diperbarui." : "Klaster contoh ditambahkan dan tersedia untuk unit baru.");
    } catch (error) { setError(error instanceof Error ? error.message : "Periksa data klaster."); }
  };
  const filtered = data.clusters.filter(c => `${c.name} ${c.code}`.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")) && (status === "all" || c.archived === (status === "archived")));
  const selected = data.clusters.find(c => c.id === inspect);
  const units = data.units.filter(u => u.cluster === selected?.name);
  return <div className="cluster-manager">
    <div className="cluster-heading"><div><span className="eyebrow">D&apos;PARK CITY</span><h3>Daftar klaster</h3><p>{data.clusters.filter(c => !c.archived).length} aktif · {data.clusters.filter(c => c.archived).length} diarsipkan</p></div><button className="button primary" onClick={() => startEdit(null)}><Plus size={16} />Tambah klaster</button></div>
    {editing !== undefined && <form className="cluster-editor" key={editing?.id || "new"} onSubmit={commit}><h3>{editing ? "Ubah klaster" : "Tambah klaster"}</h3><div className="form-grid"><label className="field"><span>Nama klaster</span><input name="name" defaultValue={editing?.name} required minLength={2} maxLength={60} placeholder="Contoh: Dahlia" autoFocus /></label><label className="field"><span>Kode klaster</span><input name="code" defaultValue={editing?.code} required maxLength={12} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,11}" placeholder="Contoh: DHL" /><small>Unik di lingkungan ini. Kode tidak mengubah nomor unit yang sudah ada.</small></label></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="cluster-form-actions"><button className="button secondary" type="button" onClick={() => { setEditing(undefined); setError(""); }}>Batal</button><button className="button primary" type="submit">Simpan klaster</button></div></form>}
    {confirm && <section className="cluster-editor" aria-label="Konfirmasi arsip klaster"><h3 ref={confirmHeading} tabIndex={-1}>Arsipkan {confirm.name}?</h3><div className="info-note">Klaster tidak lagi tersedia untuk unit atau cakupan biaya baru. {data.units.filter(u => u.cluster === confirm.name).length} unit yang sudah terhubung tetap tersimpan. Aturan biaya yang sudah ada tetap berlaku. Anda dapat memulihkan klaster kapan saja.</div><div className="cluster-form-actions"><button className="button secondary" onClick={() => setConfirm(null)}>Batal</button><button className="button danger" onClick={() => { save(setClusterArchived(data, confirm.id, true)); setConfirm(null); notify("Klaster contoh diarsipkan. Unit dan aturan biaya yang sudah ada tetap tersimpan."); }}>Arsipkan klaster</button></div></section>}
    <div className="table-toolbar cluster-toolbar"><div className="input-search"><input aria-label="Cari klaster" placeholder="Cari nama atau kode klaster..." value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Status klaster" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Semua klaster</option><option value="active">Aktif</option><option value="archived">Diarsipkan</option></select></div>
    <div className="table-scroll" role="region" aria-label="Daftar klaster" tabIndex={0}><table><thead><tr><th>Klaster / kode</th><th>Unit</th><th>Terhuni</th><th>Kosong</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{filtered.map(cluster => {
      const related = data.units.filter(u => u.cluster === cluster.name);
      return <tr key={cluster.id}><td><strong>{cluster.name}</strong><small className="role-line">{cluster.code}</small></td><td data-label="Unit">{related.length}</td><td data-label="Terhuni">{related.filter(u => u.occupied).length}</td><td data-label="Kosong">{related.filter(u => !u.occupied).length}</td><td><span className={`badge ${cluster.archived ? "gray" : "green"}`}>{cluster.archived ? "Diarsipkan" : "Aktif"}</span></td><td><div className="row-actions"><button className="table-action" onClick={() => { setInspect(cluster.id); setEditing(undefined); setConfirm(null); }}>Lihat unit</button><button className="table-action" onClick={() => startEdit(cluster)}>Ubah</button>{cluster.archived ? <button className="table-action" onClick={() => { save(setClusterArchived(data, cluster.id, false)); notify("Klaster contoh dipulihkan dan dapat dipilih kembali."); }}>Pulihkan</button> : <button className="text-button muted" onClick={() => { setConfirm(cluster); setEditing(undefined); setError(""); }}>Arsipkan</button>}</div></td></tr>;
    })}</tbody></table>{!filtered.length && <div className="access-empty">Tidak ada klaster yang sesuai. Tambahkan klaster atau ubah pencarian.</div>}</div>
    {selected && <section className="cluster-units"><div className="cluster-heading"><h3 ref={unitHeading} tabIndex={-1}><Building2 size={18} /> Unit di {selected.name}</h3><button className="text-button" onClick={() => setInspect(null)}>Tutup daftar unit</button></div>{units.length ? <div className="cluster-unit-grid">{units.map(unit => <div key={unit.id}><strong>{unit.number}</strong><span>{unit.occupied ? unit.occupant : "Belum ada penghuni"}</span><small>{unit.occupied ? "Terhuni" : "Kosong"} · Pemilik: {unit.owner}</small></div>)}</div> : <div className="access-empty">Belum ada unit di klaster ini. Gunakan Tambah unit pada halaman Warga dan unit.</div>}</section>}
    <div className="info-note">Klaster merupakan data lingkungan bersama. Perubahan nama mengikuti unit dan cakupan biaya; tagihan yang sudah terbit tetap mempertahankan nilainya.</div>
  </div>;
}

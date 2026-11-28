"use client";
import { useCallback,useDeferredValue,useEffect,useId,useRef,useState,type FormEvent,type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard-shell";
import { cacheKeys, cacheTimes, invalidateRecords } from "@/lib/client-cache";
import { useConfirmation } from "@/components/action-confirmation";
import OccupancyDetails from "@/components/occupancy-details";
import Modal from "@/components/workspace-modal";
import ResidentAdminEditor from "@/components/resident-admin-editor";
import { BulletinWorkspace, PublicPageWorkspace, RentalWorkspace, WorkspaceSummary } from "@/components/workspace-portal";
import { StaffPayments } from "@/components/workspace-payments";
import ResidentWorkspace from "@/components/resident-workspace";
import DeleteConfirmation from "@/components/delete-confirmation";
import { Building2,Plus,ListPlus,Trash2,Search,Pencil,ChevronLeft,ChevronRight,LogOut,LogIn,KeyRound,ShieldCheck,RefreshCw,MoveHorizontal,Ellipsis,House,UsersRound } from "lucide-react";
import { bulkColumns,bulkInput,bulkRowLimit,recordBodyLimit } from "@/lib/neon/bulk-input";
import type { CoreResource } from "@/lib/neon/core-input";

type Row={has_account?:boolean;id:string;row_version:string;code?:string;name?:string;full_name?:string;phone?:string|null;email?:string;documents_url?:string;cluster_id?:string;cluster_name?:string;number?:string;address_detail?:string;available_for_rent?:boolean;owner?:string;occupant?:string;archived_at?:string|null};
type Listing={rows:Row[];total:number;page:number;pageSize:number;canManage:boolean};
const titles={clusters:"Klaster",people:"Warga",units:"Unit hunian"};
const emptyListing: Listing = {rows:[],total:0,page:1,pageSize:20,canManage:false};
function useRecords(resource:CoreResource, parameters:{q:string;status:string;page:number;cluster:string}, enabled:boolean, staleTime=cacheTimes.records) {
 const {userId,tenant,api}=useDashboard();
 return useQuery({queryKey:[...cacheKeys.records(userId,tenant,resource),parameters],enabled:enabled&&!!tenant,staleTime,queryFn:({signal})=>api<Listing>(`/api/neighborhoods/${tenant}/records/${resource}?`+new URLSearchParams({q:parameters.q,status:parameters.status,page:String(parameters.page),...(parameters.cluster?{cluster:parameters.cluster}:{})}),{signal})});
}
function useRecordChoices(resource:CoreResource,q:string,enabled=true) {
 return useRecords(resource,{q,status:"active",page:1,cluster:""},enabled,cacheTimes.choices);
}
export default function LiveWorkspace(){
 const {identity,tenant,summary,userId}=useDashboard();
 const client=useQueryClient();
 const router=useRouter();
 const params=useSearchParams();
 const view=params.get("view");
 if(identity.mustChangePassword||view==="password")return <><PasswordForm required={identity.mustChangePassword} onDone={async()=>{await client.resetQueries({queryKey:cacheKeys.user(userId)});router.replace("/workspace");}}/>{!identity.mustChangePassword&&<button className="button secondary" onClick={()=>router.push("/workspace")}>Kembali</button>}</>;
 if(!tenant)return <section className="panel live-panel"><h2>Akses lingkungan belum tersedia</h2><p>Minta pengurus mengaktifkan keanggotaan Anda.</p></section>;
 if(!summary)return <p role="status">Memuat akses lingkungan…</p>;
 const roles = summary.roles;
 if(view==="bulletin") return <BulletinWorkspace key={tenant} />;
 if(roles.length && (!view || view==="summary")) return <WorkspaceSummary key={tenant} />;
 if(roles.length && view==="rentals") {
  const status=params.get("status");
  const filter=status==="available"||status==="rented"||status==="vacant"?status:"";
  return <RentalWorkspace key={`${tenant}:${filter}`} initialStatus={filter} />;
 }
 if(view==="public-page" && roles.includes("super_admin")) return <PublicPageWorkspace key={tenant} />;
 if(view==="payments" && (roles.includes("super_admin") || roles.includes("billing_admin"))) return <StaffPayments key={tenant} />;
 if(!summary.roles.some(role=>role==="super_admin"||role==="neighborhood_admin"))return <ResidentWorkspace showProfile={view==="people"}/>;
 return <ManagementWorkspace key={tenant}/>;
}

function ManagementWorkspace(){
 const {tenant,summary,userId,api}=useDashboard();
 const client=useQueryClient();
 const router=useRouter();
 const params=useSearchParams();
 const view=params.get("view");
 const resource:CoreResource=view==="people"||view==="clusters"?view:"units";
 const search=params.get("q")||"";
 const status=params.get("status")==="archived"?"archived":params.get("status")==="all"?"all":"active";
 const page=Math.max(1,Math.min(100000,Math.trunc(Number(params.get("page")))||1));
 const cluster=resource==="units"?params.get("cluster")||"":"";
 const [query,setQuery]=useState(search);
 const [clusterSearch,setClusterSearch]=useState("");
 const clusterQuery=useDeferredValue(clusterSearch.trim());
 const [detailUnit,setDetailUnit]=useState<Row|null>(null);
 const [notice,setNotice]=useState("");const [editing,setEditing]=useState<Row|null|undefined>(undefined);const [occupancy,setOccupancy]=useState<{unit:Row;action:string}|null>(null);
 const [accountPerson,setAccountPerson]=useState<Row|null>(null);
 const [rolePerson,setRolePerson]=useState<Row|null>(null);
 const [bulkEditing,setBulkEditing]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);
 const [deleting,setDeleting]=useState<Row[]|null>(null);
 const updateFilters=useCallback((changes:Record<string,string>)=>{
  const next=new URLSearchParams(params.toString());
  for(const [key,value] of Object.entries(changes)){if(value)next.set(key,value);else next.delete(key);}
  router.replace(`/workspace?${next}`,{scroll:false});
 },[params,router]);
 useEffect(()=>{setQuery(search);},[search,resource,tenant]);
 useEffect(()=>{if(query.trim()===search)return;const timer=setTimeout(()=>updateFilters({q:query.trim(),page:"1"}),250);return()=>clearTimeout(timer);},[query,search,updateFilters]);
 const records=useRecords(resource,{q:search,status,page,cluster},true);
 const choices=useRecords("clusters",{q:clusterQuery,status:"all",page:1,cluster:""},resource==="units",cacheTimes.choices);
 const selectedCluster=useRecords("clusters",{q:"",status:"all",page:1,cluster},!!cluster&&resource==="units",cacheTimes.choices);
 const listing=records.isError?emptyListing:records.data||emptyListing;
 const clusters=choices.isError?[]:choices.data?.rows||[];
 const retainedCluster=selectedCluster.data?.rows[0];
 const clusterOptions=retainedCluster&&!clusters.some(row=>row.id===retainedCluster.id)?[retainedCluster,...clusters]:clusters;
 useEffect(()=>{setClusterSearch("");},[tenant,resource]);
 const busy=records.isFetching;
 const error=records.error?.message||(resource==="units"?choices.error?.message:"");
 useEffect(()=>{setSelected([]);setNotice("");setEditing(undefined);setBulkEditing(false);setOccupancy(null);setAccountPerson(null);setRolePerson(null);setDeleting(null);setDetailUnit(null);},[tenant,resource,search,status,page,cluster]);
 useEffect(()=>{setSelected([]);},[records.dataUpdatedAt]);
 async function load(){await records.refetch();if(resource==="units")await choices.refetch();}
 function choose(value:CoreResource){router.push(`/workspace?view=${value}`);}
 async function save(body:object,row?:Row){
  await api(`/api/neighborhoods/${tenant}/records/${resource}${row?'/'+row.id:''}`,{method:row?"PATCH":"POST",body:JSON.stringify({...body,...(row?{rowVersion:row.row_version}:{})})});
  setEditing(undefined);setNotice("Data berhasil disimpan.");await invalidateRecords(client,userId,tenant,resource);
 }
 const hasRowActions=listing.canManage||resource==="units";
 function rowActions(row:Row) {
  const label=row.name||row.full_name||row.number||row.id;
  return <RowActionMenu label={label}>
    {resource==="units"&&<button type="button" onClick={()=>setDetailUnit(row)}><House size={16} aria-hidden="true"/>Detail hunian</button>}
    {listing.canManage&&<>
     <button type="button" onClick={()=>setEditing(row)}><Pencil size={16} aria-hidden="true"/>Ubah</button>
     {resource==="people"&&!row.archived_at&&summary?.roles.includes("super_admin")&&<button type="button" onClick={()=>setAccountPerson(row)}>
      <KeyRound size={16} aria-hidden="true"/>{row.has_account?"Atur ulang sandi":"Buat akun"}
     </button>}
     {resource==="people"&&row.has_account&&summary?.roles.includes("super_admin")&&<button type="button" onClick={()=>setRolePerson(row)}>
      <ShieldCheck size={16} aria-hidden="true"/>Hak administrator
     </button>}
     {resource==="units"&&!row.archived_at&&<>
      <button type="button" onClick={()=>setOccupancy({unit:row,action:row.occupant?"check_out":"check_in"})}>
       {row.occupant?<LogOut size={16} aria-hidden="true"/>:<LogIn size={16} aria-hidden="true"/>}{row.occupant?"Check-out":"Check-in"}
      </button>
      {row.occupant && <button type="button" onClick={()=>setOccupancy({unit:row,action:"add_member"})}><UsersRound size={16} aria-hidden="true"/>Tambah anggota hunian</button>}
      <button type="button" onClick={()=>setOccupancy({unit:row,action:"owner"})}><KeyRound size={16} aria-hidden="true"/>Pemilik</button>
     </>}
     <button type="button" className="workspace-row-delete" aria-label={`Hapus ${label}`} disabled={busy} onClick={()=>setDeleting([row])}>
      <Trash2 size={16} aria-hidden="true"/>Hapus
     </button>
    </>}
  </RowActionMenu>;
 }
 return <>{error&&<div className="live-alert" role="alert">{error}<button className="text-button" onClick={load}><RefreshCw size={15}/>Coba lagi</button></div>}{notice&&<div className="info-note" role="status">{notice}</div>}<section className="panel live-panel"><div className="live-section-heading"><div><h2>{titles[resource]}</h2><p>{listing.total} data lingkungan</p></div>{listing.canManage&&<div className="live-section-actions">{(resource!=="units"||!!summary?.cluster_count)&&<button className="button secondary" disabled={busy} onClick={()=>setBulkEditing(true)}><ListPlus size={16}/>Tambah sekaligus</button>}<button className="button primary" disabled={busy} onClick={()=>resource==="units"&&summary?.cluster_count===0?choose("clusters"):setEditing(null)}><Plus size={16}/>{resource==="units"&&summary?.cluster_count===0?"Tambah klaster dahulu":`Tambah ${titles[resource].toLowerCase()}`}</button></div>}</div><div className="live-filters"><label className="live-search"><Search size={18}/><input aria-label="Cari data" value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Cari ${titles[resource].toLowerCase()}…`}/></label><label className="field"><span>Status</span><select value={status} onChange={e=>updateFilters({status:e.target.value,page:"1"})}><option value="active">Aktif</option><option value="archived">Diarsipkan</option><option value="all">Semua status</option></select></label>{resource==="units"&&<div className="workspace-cluster-filter"><label className="field">
  <span className="workspace-icon-label"><Search size={15} aria-hidden="true"/>Cari klaster</span>
  <input value={clusterSearch} onChange={event=>setClusterSearch(event.target.value)} placeholder="Nama atau kode klaster" maxLength={100}/>
 </label><label className="field"><span>Klaster</span>
  <select value={cluster} onChange={e=>updateFilters({cluster:e.target.value,page:"1"})}>
   <option value="">Semua klaster</option>
   {cluster&&!clusterOptions.some(row=>row.id===cluster)&&<option value={cluster}>Klaster terpilih</option>}
   {clusterOptions.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
  </select>
  {(choices.isFetching||choices.isSuccess&&(choices.data.total>clusters.length||clusterQuery&&!clusters.length))&&<small role="status">{choices.isFetching?"Mencari klaster…":clusters.length?"Cari nama atau kode untuk melihat klaster lainnya.":"Tidak ada klaster yang cocok."}</small>}
 </label></div>}</div>{listing.canManage&&<div className="live-selection-toolbar"><span>{selected.length} data dipilih · pilihan hanya pada halaman ini</span><button className="button secondary live-danger-outline" disabled={busy||!selected.length} onClick={()=>setDeleting(listing.rows.filter(row=>selected.includes(row.id)))}><Trash2 size={16}/>Hapus terpilih ({selected.length})</button></div>}<p className="workspace-table-hint"><MoveHorizontal size={16} aria-hidden="true" />{listing.canManage ? "Geser tabel untuk melihat kolom dan aksi lainnya." : "Geser tabel untuk melihat kolom lainnya."}</p><div aria-busy={busy} className="live-table-wrap" role="region" aria-label={`Tabel ${titles[resource].toLowerCase()}`} tabIndex={0}><table className="live-table"><thead><tr>{listing.canManage&&<th className="live-selection-cell"><input type="checkbox" aria-label="Pilih semua data pada halaman ini" disabled={busy||!listing.rows.length} checked={!!listing.rows.length&&selected.length===listing.rows.length} ref={element=>{if(element)element.indeterminate=selected.length>0&&selected.length<listing.rows.length;}} onChange={event=>setSelected(event.target.checked?listing.rows.map(row=>row.id):[])}/></th>}{resource==="clusters"?<><th>Nama klaster</th><th>Kode</th></>:resource==="people"?<><th>Nama warga</th><th>Nomor telepon</th><th>Dokumen</th></>:<><th>Unit</th><th>Klaster</th><th>Pemilik</th><th>Penghuni</th></>}<th>Status</th>{hasRowActions&&<th scope="col" className="workspace-table-actions">Aksi</th>}</tr></thead><tbody>{listing.rows.map(row=><tr key={row.id}>{listing.canManage&&<td className="live-selection-cell"><input type="checkbox" aria-label={`Pilih ${row.name||row.full_name||row.number}`} disabled={busy} checked={selected.includes(row.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,row.id]:current.filter(id=>id!==row.id))}/></td>}{resource==="clusters"?<><td><strong>{row.name}</strong></td><td>{row.code}</td></>:resource==="people"?<><td><strong>{row.full_name}</strong>{row.email&&<small>{row.email}</small>}</td><td>{row.phone || "Belum diisi"}</td><td>{row.documents_url?<a className="text-button" href={row.documents_url} target="_blank" rel="noopener noreferrer">Buka dokumen ↗</a>:"Belum diisi"}</td></>:<><td><strong>{row.number}</strong>{row.available_for_rent&&<small>Unit sewa</small>}</td><td>{row.cluster_name}</td><td>{row.owner||"Belum ditetapkan"}</td><td>{row.occupant||"Kosong"}</td></>}<td><span className={`live-status ${row.archived_at?'archived':''}`}>{row.archived_at?"Diarsipkan":"Aktif"}</span></td>{hasRowActions&&<td className="workspace-table-actions">{rowActions(row)}</td>}</tr>)}</tbody></table>{!listing.rows.length&&!busy&&<div className="live-empty"><Building2 size={30}/><h3>{search||status!=="active"?"Tidak ada data yang sesuai":"Belum ada data"}</h3><p>{listing.canManage?"Tambahkan data pertama atau ubah pencarian dan filter.":"Data yang berhak Anda akses akan tampil di sini."}</p></div>}{busy&&<p className="live-loading" role="status">Memuat data…</p>}</div><div className="live-pagination"><span>{listing.total?`${(listing.page-1)*20+1}–${Math.min(listing.page*20,listing.total)} dari ${listing.total}`:"0 data"}</span><div><button className="button secondary compact" disabled={busy||listing.page<=1} onClick={()=>updateFilters({page:String(listing.page-1)})}><ChevronLeft size={16}/>Sebelumnya</button><span>Halaman {listing.page} dari {Math.ceil(listing.total/20)||1}</span><button className="button secondary compact" disabled={busy||listing.page*20>=listing.total} onClick={()=>updateFilters({page:String(listing.page+1)})}>Berikutnya<ChevronRight size={16}/></button></div></div></section>{detailUnit&&<OccupancyDetails key={`${tenant}:${detailUnit.id}`} unitId={detailUnit.id} label={detailUnit.number||detailUnit.id} close={()=>setDetailUnit(null)}/ >}{deleting&&<DeleteConfirmation labels={deleting.map(row=>row.name||row.full_name||row.number||row.id)} description="Data terpilih akan dihapus permanen. Data yang terhubung dengan akun, unit, atau riwayat lain harus diarsipkan. Jika satu data gagal, seluruh penghapusan dibatalkan." onClose={()=>setDeleting(null)} onConfirm={async()=>{const result=await api(`/api/neighborhoods/${tenant}/records/${resource}`,{method:"DELETE",body:JSON.stringify({records:deleting.map(row=>({id:row.id,rowVersion:row.row_version}))})});setDeleting(null);setSelected([]);setNotice(`${result.deleted} data berhasil dihapus.`);await invalidateRecords(client,userId,tenant,resource);}}/>}{rolePerson&&summary?.roles.includes("super_admin")&&<ResidentAdminEditor key={`${tenant}:${rolePerson.id}`} personId={rolePerson.id} name={rolePerson.full_name||""} close={()=>setRolePerson(null)}/ >}{accountPerson&&<AccountEditor person={accountPerson} tenant={tenant} onClose={()=>setAccountPerson(null)} onSaved={async()=>{setAccountPerson(null);setNotice("Akun diperbarui. Sampaikan akses sementara kepada warga secara pribadi.");await invalidateRecords(client,userId,tenant,"people");}}/>}{bulkEditing&&<BulkEditor resource={resource} tenant={tenant} onClose={()=>setBulkEditing(false)} onSaved={async count=>{setBulkEditing(false);setNotice(`${count} data berhasil ditambahkan.`);await invalidateRecords(client,userId,tenant,resource);}}/>}{editing!==undefined&&<RecordEditor resource={resource} row={editing} tenant={tenant} onClose={()=>setEditing(undefined)} onSave={save}/ >}{occupancy&&<OccupancyEditor {...occupancy} tenant={tenant} onClose={()=>setOccupancy(null)} onSaved={async()=>{setOccupancy(null);setNotice("Riwayat hunian berhasil diperbarui.");await invalidateRecords(client,userId,tenant,"people");}}/>}</>;
}
function RowActionMenu({label,children}:{label:string;children:ReactNode}) {
 const id=useId();
 const trigger=useRef<HTMLButtonElement>(null);
 return <>
  <button ref={trigger} type="button" className="workspace-row-trigger" aria-label={`Aksi untuk ${label}`} title="Aksi" popoverTarget={id}>
   <Ellipsis size={20} aria-hidden="true"/>
  </button>
  <div id={id} className="workspace-row-popover" popover="auto" role="group" aria-label={`Aksi untuk ${label}`} onClick={event=>{
   if(event.target instanceof Element&&event.target.closest("button:enabled")) {
    event.currentTarget.hidePopover?.();
    trigger.current?.focus({preventScroll:true});
   }
  }}>{children}</div>
 </>;
}
function BulkEditor({resource,tenant,onClose,onSaved}:{resource:CoreResource;tenant:string;onClose:()=>void;onSaved:(count:number)=>Promise<void>}) {
 const {api}=useDashboard();
 const confirm=useConfirmation();
 const [text,setText]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const columns=bulkColumns[resource];
 const example=columns.map(column=>column.example).join("\t");

 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setError("");
  const body=JSON.stringify({bulkText:text});
  try {
   if(new TextEncoder().encode(body).length>recordBodyLimit) throw new Error("Data terlalu panjang. Bagi data menjadi beberapa kelompok.");
   const records=bulkInput(resource,text);
   if(!await confirm({title:"Simpan data sekaligus?",description:`Tambahkan ${records.length} data ${titles[resource].toLowerCase()} ke lingkungan ini.`,confirmLabel:"Simpan semua"}))return;
   setBusy(true);
   const {created}=await api(`/api/neighborhoods/${tenant}/records/${resource}`,{method:"POST",body});
   await onSaved(created);
  } catch(error) {
   setError(error instanceof Error?error.message:"Data belum tersimpan.");
   setBusy(false);
  }
 }

 return <Modal title={`Tambah ${titles[resource].toLowerCase()} sekaligus`} close={busy?()=>{}:onClose}>
  <form onSubmit={submit}>
   <div className="form-body live-form live-bulk-form">
    <p id="bulk-instructions">Salin hingga {bulkRowLimit} baris dari Excel atau Google Sheets, tanpa judul kolom. Kolom bertanda * wajib diisi. Atur nomor telepon dan kode sebagai teks agar nol di depan tetap tersalin.</p>
    <div className="live-bulk-example">
     <strong>Urutan kolom</strong>
     <p id="bulk-columns">{columns.map(column=>column.label).join(" · ")}</p>
     <strong>Contoh satu baris</strong>
     <pre>{example}</pre>
    </div>
    <label className="field"><span>Tempel data spreadsheet</span>
     <textarea value={text} onChange={event=>{setText(event.target.value);setError("");}} aria-describedby="bulk-instructions bulk-columns" required disabled={busy} spellCheck={false}/>
    </label>
    <p>Semua baris disimpan bersama. Jika ada kesalahan, perbaiki baris tersebut lalu coba lagi.</p>
    {error&&<p className="live-alert" role="alert">{error}</p>}
   </div>
   <div className="form-footer">
    <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Batal</button>
    <button className="button primary" disabled={busy||!text.trim()}>{busy?"Menyimpan…":"Simpan semua"}</button>
   </div>
  </form>
 </Modal>;
}

function RecordEditor({resource,row,tenant,onClose,onSave}:{resource:CoreResource;row:Row|null;tenant:string;onClose:()=>void;onSave:(body:object,row?:Row)=>Promise<void>}){
 const {api}=useDashboard();
 const confirm=useConfirmation();
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [q,setQ]=useState("");
 const clusterChoices=useRecordChoices("clusters",q,resource==="units");const choices=clusterChoices.isError?[]:clusterChoices.data?.rows||[];
 useEffect(()=>{if(clusterChoices.error)setError("Daftar klaster belum dapat dimuat.");},[clusterChoices.error]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const body=Object.fromEntries(f);if(!await confirm({title:"Simpan data?",description:`${row?"Perbarui":"Tambahkan"} data ${titles[resource].toLowerCase()}${row?(f.get("archived")==="on"?" dan arsipkan data ini":" dengan status aktif"):""}.`,confirmLabel:"Simpan"}))return;setBusy(true);setError("");try{await onSave({...body,archived:f.get("archived")==="on",availableForRent:f.get("availableForRent")==="on"},row||undefined);}catch(e){setError(e instanceof Error?e.message:"Data belum tersimpan.");setBusy(false);}}
 return <Modal title={`${row?'Ubah':'Tambah'} ${titles[resource].toLowerCase()}`} close={busy?()=>{}:onClose}><form onSubmit={submit}><div className="form-body live-form">{resource==="clusters"?<><label className="field"><span>Nama klaster *</span><input name="name" defaultValue={row?.name} required maxLength={100}/></label><label className="field"><span>Kode klaster *</span><input name="code" defaultValue={row?.code} required maxLength={20} placeholder="Contoh: A"/></label></>:resource==="people"?<><label className="field"><span>Nama lengkap *</span><input name="fullName" defaultValue={row?.full_name} required maxLength={200}/></label><label className="field"><span>Nomor telepon</span><input name="phone" type="tel" defaultValue={row?.phone ?? ""} maxLength={25}/><small>Nomor kontak ini tidak otomatis mengubah nomor login.</small></label><label className="field"><span>Email kontak (opsional)</span><input name="email" type="email" defaultValue={row?.email}/></label><label className="field"><span>URL penyimpanan dokumen (opsional)</span><input name="documentsUrl" type="url" defaultValue={row?.documents_url} placeholder="https://drive.google.com/…"/></label></>:<><label className="field"><span>Nomor unit *</span><input name="number" defaultValue={row?.number} required maxLength={50}/></label><label className="field"><span>Cari klaster</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ketik nama atau kode klaster"/></label><label className="field"><span>Klaster *</span><select name="clusterId" defaultValue={row?.cluster_id||""} required><option value="">Pilih klaster</option>{row?.cluster_id&&!choices.some(c=>c.id===row.cluster_id)&&<option value={row.cluster_id}>{row.cluster_name}</option>}{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Detail alamat</span><input name="addressDetail" defaultValue={row?.address_detail} maxLength={500}/></label><label className="live-check"><input name="availableForRent" type="checkbox" defaultChecked={row?.available_for_rent}/>Unit tersedia untuk disewakan</label></>}{row&&<label className="live-check"><input name="archived" type="checkbox" defaultChecked={!!row.archived_at}/>Arsipkan data ini</label>}{error&&<div className="live-alert" role="alert">{error}</div>}</div><div className="form-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy?'Menyimpan…':'Simpan'}</button></div></form></Modal>;
}
function OccupancyEditor({unit,action,tenant,onClose,onSaved}:{unit:Row;action:string;tenant:string;onClose:()=>void;onSaved:()=>Promise<void>}){
 const {api}=useDashboard();
 const confirm=useConfirmation();
 const [q,setQ]=useState("");
 const peopleChoices=useRecordChoices("people",q,action!=="check_out");const people=peopleChoices.isError?[]:peopleChoices.data?.rows||[];const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [person,setPerson]=useState("");
 useEffect(()=>{if(peopleChoices.error)setError("Daftar warga belum dapat dimuat.");},[peopleChoices.error]);
 const title=action==='owner'?'Tetapkan pemilik':action==='check_in'?'Check-in penghuni':action==='add_member'?'Tambah anggota hunian':'Check-out penghuni';
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const body={...Object.fromEntries(f),action};if(!await confirm({title:`${title}?`,description:`Perbarui riwayat hunian unit ${unit.number} mulai ${f.get("date")}.`,confirmLabel:title}))return;setBusy(true);setError("");try{await api(`/api/neighborhoods/${tenant}/units/${unit.id}/occupancy`,{method:'POST',body:JSON.stringify(body)});await onSaved();}catch(e){setError(e instanceof Error?e.message:'Belum tersimpan.');setBusy(false);}}
 return <Modal title={`${title} · ${unit.number}`} close={busy?()=>{}:onClose}><form onSubmit={submit}><div className="form-body live-form">{action!=='check_out'&&<><label className="field"><span>Cari warga</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nama atau nomor telepon"/></label><label className="field"><span>Nama warga *</span><select name="personId" required value={person} onChange={e=>setPerson(e.target.value)}><option value="">Pilih warga</option>{people.map(p=><option key={p.id} value={p.id}>{p.full_name}{p.phone ? ` · ${p.phone}` : ""}</option>)}</select></label></>}{action==='check_in'&&<label className="field"><span>Jenis hunian</span><select name="occupancyType"><option value="rented">Disewa</option><option value="owner_occupied">Dihuni pemilik</option><option value="caretaker">Penjaga rumah</option><option value="other">Lainnya</option></select></label>}<label className="field"><span>{action==='check_out'?'Tanggal keluar':'Tanggal mulai'} *</span><input name="date" type="date" required/><small>{action==='check_out'?'Mulai tanggal ini, penghuni tidak lagi menempati unit.':'Riwayat sebelumnya dan tagihan terbit tetap disimpan.'}</small></label>{action==='check_out'&&<p>Penghuni saat ini: <strong>{unit.occupant}</strong></p>}{error&&<div className="live-alert" role="alert">{error}</div>}</div><div className="form-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy?'Menyimpan…':title}</button></div></form></Modal>;
}
function PasswordForm({onDone,required}:{onDone:()=>Promise<void>;required:boolean}){
 const {api}=useDashboard();
 const confirm=useConfirmation();
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");const f=new FormData(e.currentTarget);if(f.get('newPassword')!==f.get('confirmation')){setError('Konfirmasi kata sandi belum sama.');return;}if(!await confirm({title:"Ubah kata sandi?",description:"Kata sandi baru akan digunakan untuk masuk. Sesi Anda di perangkat lain akan ditutup.",confirmLabel:"Ubah kata sandi"}))return;setBusy(true);try{await api('/api/account/password',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});await onDone();}catch(e){setError(e instanceof Error?e.message:'Belum tersimpan.');}finally{setBusy(false);}}
 return <section className="panel neon-auth-card">
  <h2>{required?"Atur kata sandi Anda":"Ubah kata sandi"}</h2>
  {required&&<p>Ganti kata sandi sementara sebelum mengakses data lingkungan.</p>}
  <p id="new-password-rules">Gunakan 12–128 karakter dan pilih kata sandi yang berbeda dari kata sandi {required?"sementara":"saat ini"}.</p>
  <form onSubmit={submit}>
   <label>{required?"Kata sandi sementara":"Kata sandi saat ini"}<input type="password" name="currentPassword" autoComplete="current-password" required/></label>
   <label>Kata sandi baru<input type="password" name="newPassword" autoComplete="new-password" aria-describedby="new-password-rules" minLength={12} maxLength={128} required/></label>
   <label>Ulangi kata sandi baru<input type="password" name="confirmation" autoComplete="new-password" required/></label>
   {error&&<p className="live-alert" role="alert">{error}</p>}
   <button className="button primary" disabled={busy}>{busy?'Menyimpan…':'Simpan kata sandi'}</button>
  </form>
 </section>;
}

function AccountEditor({person,tenant,onClose,onSaved}:{person:Row;tenant:string;onClose:()=>void;onSaved:()=>Promise<void>}){
 const {api}=useDashboard();
 const confirm=useConfirmation();
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const body={...Object.fromEntries(new FormData(e.currentTarget)),tenantId:tenant,personId:person.id};if(!await confirm({title:person.has_account?"Atur ulang kata sandi?":"Buat akun warga?",description:person.has_account?`Atur ulang kata sandi ${person.full_name} dan tutup seluruh sesi aktifnya.`:`Buat akses masuk untuk ${person.full_name}. Warga wajib mengganti kata sandi sementara.`,confirmLabel:person.has_account?"Atur ulang sandi":"Buat akun"}))return;setBusy(true);setError("");try{await api(person.has_account?'/api/accounts/reset-password':'/api/accounts',{method:'POST',body:JSON.stringify(body)});await onSaved();}catch(e){setError(e instanceof Error?e.message:'Akun belum dibuat.');setBusy(false);}}
 return <Modal title={`${person.has_account?"Atur ulang kata sandi":"Buat akun"} · ${person.full_name}`} close={busy?()=>{}:onClose}><form onSubmit={submit}><div className="form-body live-form">{!person.has_account&&<label className="field"><span>Nomor telepon untuk login *</span><input name="phone" type="tel" required disabled={person.has_account} defaultValue={person.phone ?? ""}/><small>Harus unik. Nomor kontak warga tetap disimpan terpisah.</small></label>}{person.has_account&&<p>Nomor login tidak berubah. Sesi aktif warga akan ditutup setelah kata sandi diatur ulang.</p>}<label className="field"><span>Kata sandi sementara *</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/><small>Minimal 12 karakter. Warga wajib menggantinya saat masuk pertama kali.</small></label><div className="info-note">Tidak ada SMS, email verifikasi, atau pendaftaran publik. Sampaikan akses ini kepada warga secara pribadi.</div>{error&&<p className="live-alert" role="alert">{error}</p>}</div><div className="form-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Batal</button><button className="button primary" disabled={busy}>{busy?'Menyimpan…':person.has_account?'Atur ulang sandi':'Buat akun'}</button></div></form></Modal>;
}

"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";

export default function DeleteConfirmation({ labels, description, onClose, onConfirm }: {
 labels: string[];
 description: string;
 onClose: () => void;
 onConfirm: () => Promise<void>;
}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const cancelButton=useRef<HTMLButtonElement>(null);
 const titleId=useId();
 const descriptionId=useId();
 const [busy,setBusy]=useState(false);
 const [acknowledged,setAcknowledged]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{dialog.current?.showModal();cancelButton.current?.focus();},[]);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(!acknowledged||busy)return;
  setBusy(true);setError("");
  try { await onConfirm(); }
  catch(error) { setError(error instanceof Error?error.message:"Data belum dapat dihapus.");setBusy(false); }
 }
 return <dialog ref={dialog} className="modal live-modal" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <div className="modal-heading">
   <h2 id={titleId}>Hapus {labels.length} data?</h2>
   <button type="button" className="button secondary compact" aria-label="Tutup" disabled={busy} onClick={onClose}><X size={18}/></button>
  </div>
  <form onSubmit={submit}>
   <div className="form-body live-form live-delete-form">
    <p id={descriptionId}>{description}</p>
    <ul className="live-delete-list">{labels.map((label,index)=><li key={index}>{label}</li>)}</ul>
    <label className="live-check"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} disabled={busy} required/>Saya memahami bahwa data yang dihapus tidak dapat dikembalikan melalui aplikasi.</label>
    {error&&<p className="live-alert" role="alert">{error}</p>}
   </div>
   <div className="form-footer">
    <button ref={cancelButton} type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button>
    <button className="button live-danger" disabled={busy||!acknowledged}><Trash2 size={16}/>{busy?"Menghapus…":"Hapus permanen"}</button>
   </div>
  </form>
 </dialog>;
}

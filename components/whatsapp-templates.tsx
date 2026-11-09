"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Copy, Droplets, Eye, FileText, Info, ListPlus, MessageCircle, Plus, RotateCcw, Save, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { requireBilling } from "@/lib/billing";
import { DEFAULT_TEMPLATES, TEMPLATE_TOKENS, insertTemplateText, renderMessage, validateTemplate, type TemplateKind } from "@/lib/communications";
import type { Demo } from "@/lib/demo";

type Props = { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void };
const CATEGORIES: { kind: TemplateKind; icon: LucideIcon; description: string }[] = [
  { kind: "invoice", icon: FileText, description: "Pengingat iuran warga" },
  { kind: "water", icon: Droplets, description: "Tagihan pemakaian air" },
  { kind: "expense", icon: Wallet, description: "Informasi penggunaan kas" },
  { kind: "cash_report", icon: ListPlus, description: "Ringkasan kas lingkungan" },
];
const VARIABLES: Record<string, { label: string; example: string }> = {
  nama: { label: "Nama warga", example: "Budi Santoso" }, unit: { label: "Nomor unit", example: "A-12" },
  periode: { label: "Periode", example: "November 2026" }, nominal: { label: "Nominal", example: "Rp 250.000" },
  jatuh_tempo: { label: "Jatuh tempo", example: "10 Nov 2026" }, tanggal: { label: "Tanggal transaksi", example: "7 Nov 2026" },
  kategori: { label: "Kategori", example: "Perawatan fasilitas" }, catatan: { label: "Keterangan", example: "Penggantian lampu jalan klaster Akasia" },
  saldo_awal: { label: "Saldo awal", example: "Rp 5.000.000" }, pemasukan: { label: "Pemasukan", example: "Rp 2.000.000" },
  pengeluaran: { label: "Pengeluaran", example: "Rp 250.000" }, saldo_akhir: { label: "Saldo akhir", example: "Rp 6.750.000" },
};

export function WhatsAppTemplates(a: Props) {
  const [kind, setKind] = useState<TemplateKind>("invoice");
  const [drafts, setDrafts] = useState(() => Object.fromEntries(a.data.templates.map(template => [template.kind, template.body])) as Record<TemplateKind, string>);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const template = a.data.templates.find(template => template.kind === kind)!;
  const body = drafts[kind];
  const dirty = body !== template.body;
  let validation = ""; let preview = "";
  try {
    validateTemplate(kind, body);
    preview = renderMessage({ ...a.data, templates: [{ ...template, body }] }, kind, Object.fromEntries(Object.entries(VARIABLES).map(([key, value]) => [key, value.example])));
  } catch (error) { validation = (error as Error).message; }
  const edit = (next: string) => { setDrafts(previous => ({ ...previous, [kind]: next })); setError(""); setCopied(false); };
  const insert = (text: string) => {
    const field = textarea.current!;
    try {
      const result = insertTemplateText(body, text, field.selectionStart, field.selectionEnd);
      edit(result.body);
      requestAnimationFrame(() => { field.focus(); field.setSelectionRange(result.cursor, result.cursor); });
    } catch (error) { setError((error as Error).message); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      requireBilling(a.data, a.actorId, a.at); validateTemplate(kind, body);
      a.save({ ...a.data, templates: a.data.templates.map(template => template.kind === kind ? { ...template, body } : template) });
      a.notify("Template tersimpan. Pesan dapat ditinjau sebelum dikirim melalui WhatsApp.");
    } catch (error) { setError((error as Error).message); }
  };
  return <>
    <div className="page-heading"><div><span className="eyebrow">KOMUNIKASI WARGA</span><h1>Template WhatsApp</h1><p>Susun pesan sekali. Data warga dan transaksi akan mengisi variabel saat pesan digunakan.</p></div><span className="template-manual-badge"><MessageCircle size={16} />Pengiriman manual</span></div>
    <div className="template-category-list" role="group" aria-label="Jenis template">{CATEGORIES.map(({ kind: value, icon: Icon, description }) => {
      const item = a.data.templates.find(template => template.kind === value)!;
      const unsaved = drafts[value] !== item.body;
      return <button key={value} className={`template-category ${kind === value ? "active" : ""}`} aria-pressed={kind === value} onClick={() => { setKind(value); setError(""); setCopied(false); }}><span className="grid-stat-icon"><Icon size={20} /></span><span><strong>{item.label}</strong><small>{description}</small>{unsaved && <em>Belum disimpan</em>}</span>{kind === value && <Check size={16} />}</button>;
    })}</div>
    <div className="template-workspace"><section className="panel template-editor"><div className="template-panel-heading"><div><h2><FileText size={18} />{template.label}</h2><p>Perubahan disimpan per jenis template.</p></div><span className={`template-save-status ${dirty ? "unsaved" : ""}`}>{dirty ? "Belum disimpan" : "Tersimpan"}</span></div>
      <form onSubmit={save}><div className="template-editor-body"><div className="template-variable-heading"><strong><Plus size={16} />Sisipkan variabel</strong><small>Klik untuk memasukkan pada posisi kursor.</small></div><div className="template-variable-chips">{TEMPLATE_TOKENS[kind].map(token => <button type="button" key={token} title={`Contoh: ${VARIABLES[token].example}`} onClick={() => insert(`{${token}}`)}><Plus size={13} />{VARIABLES[token].label}<code>{`{${token}}`}</code></button>)}</div><label className="field"><span>Isi pesan</span><textarea ref={textarea} name="body" rows={9} required maxLength={2000} value={body} onChange={event => edit(event.target.value)} aria-describedby="template-editor-help" /></label><div className="template-editor-meta"><button type="button" className="text-button" onClick={() => insert("\n")}><Plus size={14} />Baris baru</button><span>{body.length.toLocaleString("id-ID")} / 2.000 karakter</span></div><p id="template-editor-help" className="template-help"><Info size={15} />Variabel dalam tanda kurung kurawal diganti otomatis saat menyiapkan pesan dari tagihan atau laporan.</p>{(error || validation) && <div className="form-error" role="alert">{error || validation}</div>}</div><div className="template-editor-footer"><div><button type="button" className="text-button" title="Mengganti draf dengan contoh bawaan. Simpan untuk menerapkan." onClick={() => edit(DEFAULT_TEMPLATES.find(template => template.kind === kind)!.body)}><RotateCcw size={15} />Contoh bawaan</button><button type="button" className="text-button" disabled={!dirty} onClick={() => edit(template.body)}><Undo2 size={15} />Batalkan perubahan</button></div><button className="button primary" type="submit" disabled={!dirty || !!validation}><Save size={16} />Simpan template</button></div></form>
    </section><aside className="panel template-preview"><div className="template-panel-heading"><div><h2><Eye size={18} />Pratinjau pesan</h2><p>Contoh tampilan dengan data simulasi.</p></div></div><div className="wa-preview-surface"><div className="wa-preview-contact"><span className="grid-stat-icon"><MessageCircle size={20} /></span><div><strong>Proomahan · D&apos;Park City</strong><small>Pesan untuk warga</small></div></div><div className="wa-preview-bubble" aria-label="Pratinjau isi pesan">{validation ? <span className="muted">Perbaiki isi template untuk melihat pratinjau.</span> : preview}</div><span className="wa-preview-caption">Data contoh · bukan pesan yang telah dikirim</span></div><div className="template-preview-footer"><button className="button secondary" disabled={!!validation} onClick={async () => { try { await navigator.clipboard.writeText(preview); setCopied(true); } catch { a.notify("Pesan belum dapat disalin. Pilih teks pratinjau untuk menyalin manual."); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Tersalin" : "Salin contoh pesan"}</button><p>Pratinjau mengikuti draf. Gunakan <strong>Simpan template</strong> untuk menerapkan perubahan pada pesan tagihan dan laporan.</p></div></aside></div>
  </>;
}

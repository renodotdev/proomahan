"use client";
import { useDeferredValue, useState, type FormEvent } from "react";
import { Archive, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleAlert,
  CircleHelp, Clock3, Droplets, House, ReceiptText, RefreshCw, Search, WalletCards, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmation } from "@/components/action-confirmation";
import { useDashboard } from "@/components/dashboard-shell";
import { InvoicePayment } from "@/components/workspace-payments";
import WorkspaceModal from "@/components/workspace-modal";
import { billingFrequencies, meterCharge, meterInput, occursInPeriod, type BillSchedule } from "@/lib/neon/invoice-input";
import { cacheKeys } from "@/lib/client-cache";

type Invoice = {
  id: string; unread: boolean; invoice_number: string; period: string; issue_date: string; due_date: string;
  status: "draft" | "issued" | "void"; kind: "dues" | "water"; items: string | null; void_reason: string | null;
  total_amount: string; paid_amount: string; consumption: string | null; bill_to_name_snapshot: string; unit_label_snapshot: string;
};
type Recipient = { unit_id: string; person_id: string; name: string; unit_label: string; occupants: number };
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const yearMonth = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Asia/Jakarta" });
const periodFormat = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

export default function WorkspaceBills() {
  const { tenant } = useDashboard();
  return tenant ? <BillsList key={tenant} /> : <p>Akses lingkungan belum tersedia.</p>;
}

function BillsList() {
  const { tenant, userId, api, summary } = useDashboard();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"ongoing" | "all">("ongoing");
  const [mineOverride, setMineOverride] = useState<boolean>();
  const mine = mineOverride ?? ((summary?.unread_bills ?? 0) > 0);
  const [paymentInvoice, setPaymentInvoice] = useState<string>();
  const staff = summary?.roles.some(role => role === "super_admin" || role === "billing_admin");
  const [configuring, setConfiguring] = useState(false);
  const [editor, setEditor] = useState<{ invoice?: Invoice }>();
  const [notice, setNotice] = useState("");
  const url = `/api/neighborhoods/${tenant}/invoices`;
  const billKey = [...cacheKeys.tenant(userId, tenant), "invoices"];
  const query = useQuery({
    queryKey: [...billKey, status, page, mine], staleTime: 0,
    queryFn: ({ signal }) => api<{ rows: Invoice[]; hasNext: boolean; canManage: boolean }>(`${url}?page=${page}&status=${status}${mine ? "&mine=1" : ""}`, { signal }),
  });

  const canManage = !mine && (query.data?.canManage ?? !!staff);
  const scheduleKey = [...cacheKeys.tenant(userId, tenant), "bill-schedules"];
  const catalog = useQuery({
    queryKey: scheduleKey, enabled: canManage,
    queryFn: ({ signal }) => api<{ schedules: BillSchedule[] }>(`${url}?schedules=1`, { signal }),
  });
  const schedules = catalog.isSuccess ? catalog.data.schedules : [];

  function openPayment(invoice: Invoice) {
    setMineOverride(mine);
    setPaymentInvoice(invoice.id);
    if (invoice.unread) {
      void api(`/api/neighborhoods/${tenant}/payments`, {
        method: "POST", body: JSON.stringify({ action: "read", invoice: invoice.id }),
      }).then(() => Promise.all([client.invalidateQueries({ queryKey: billKey }),
        client.invalidateQueries({ queryKey: cacheKeys.summary(userId, tenant) })])).catch(() => undefined);
    }
  }

  return <>
    <section className="panel live-panel workspace-billing">
      <div className="live-section-heading">
        <h2 className="workspace-icon-label"><ReceiptText size={21} aria-hidden="true" />{query.isSuccess && !canManage ? "Tagihan saya" : "Tagihan"}</h2>
        {canManage && <button className="button primary" onClick={() => setEditor({})}><ReceiptText size={17} aria-hidden="true" />Catat tagihan</button>}
      </div>
      {staff && <div className="portal-actions" role="group" aria-label="Tampilan tagihan">
        <button className="button secondary compact" aria-pressed={!mine} onClick={() => { setMineOverride(false); setPage(1); }}>Tagihan lingkungan</button>
        <button className="button secondary compact" aria-pressed={mine} onClick={() => { setMineOverride(true); setPage(1); }}>Tagihan saya</button>
      </div>}
      <div className="workspace-bill-filters" role="group" aria-label="Filter tagihan">
        <button className="button secondary compact" aria-pressed={status === "ongoing"} onClick={() => { setStatus("ongoing"); setPage(1); }}><Clock3 size={16} aria-hidden="true" />Sedang berjalan</button>
        <button className="button secondary compact" aria-pressed={status === "all"} onClick={() => { setStatus("all"); setPage(1); }}><Archive size={16} aria-hidden="true" />Semua tagihan</button>
      </div>
      {notice && <p className="info-note" role="status">{notice}</p>}
      {query.isPending && <p role="status">Memuat tagihan…</p>}
      {query.error && <p className="live-alert" role="alert">{query.error.message} <button className="text-button" onClick={() => query.refetch()}>Coba lagi</button></p>}
      {query.isSuccess && (query.data.rows.length > 0 ? <ul className="workspace-bill-grid">
        {query.data.rows.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice}
          onVoid={canManage ? () => setEditor({ invoice }) : undefined} onPayment={!canManage ? () => openPayment(invoice) : undefined} />)}
      </ul> : <div className="live-empty">
        <ReceiptText size={28} aria-hidden="true" />
        <h3>{status === "ongoing" ? "Tidak ada tagihan berjalan" : "Belum ada tagihan pada halaman ini"}</h3>
        {status === "ongoing" && <p>Lihat <strong>Semua tagihan</strong> untuk riwayat tagihan.</p>}
      </div>)}
      {query.isSuccess && (page > 1 || query.data.hasNext) && <div className="live-pagination"><div>
        <button className="button secondary compact" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} aria-hidden="true" />Sebelumnya</button>
        <span>Halaman {page}</span>
        <button className="button secondary compact" disabled={!query.data.hasNext} onClick={() => setPage(page + 1)}>Berikutnya<ChevronRight size={16} aria-hidden="true" /></button>
      </div></div>}
    </section>
    {canManage && <section className="panel live-panel workspace-billing workspace-schedule-panel">
      <div className="live-section-heading">
        <div><h2 className="workspace-icon-label"><CalendarDays size={21} aria-hidden="true" />Jadwal tagihan</h2>
          <p>Gunakan jadwal untuk menerbitkan tagihan lewat <strong>Catat tagihan</strong>.</p>
        </div>
        <button className="button secondary" disabled={!catalog.isSuccess} onClick={() => setConfiguring(true)}><CalendarPlus size={17} aria-hidden="true" />Tambah jadwal</button>
      </div>
      {catalog.isPending && <p role="status">Memuat jadwal…</p>}
      {catalog.error && <p className="live-alert" role="alert"><span className="workspace-icon-label"><CircleAlert size={17} aria-hidden="true" />{catalog.error.message}</span><button className="text-button" onClick={() => catalog.refetch()}><RefreshCw size={15} aria-hidden="true" />Coba lagi</button></p>}
      {catalog.isSuccess && (schedules.length ? <ul className="workspace-bill-grid">
        {schedules.map(schedule => <li key={schedule.id} className="workspace-bill-card">
          <h3 className="workspace-icon-label">{schedule.pricing === "water" ? <Droplets size={18} aria-hidden="true" /> : <WalletCards size={18} aria-hidden="true" />}{schedule.name}</h3>
          <p>{billingFrequencies[schedule.recurrence]} · {periodFormat.format(new Date(schedule.start_date))}</p>
          <strong>{rupiah.format(BigInt(schedule.amount))}{schedule.pricing === "water" ? " / m³" : " · Tetap"}</strong>
        </li>)}
      </ul> : <div className="live-empty"><CalendarDays size={28} aria-hidden="true" /><h3>Belum ada jadwal tagihan</h3></div>)}
    </section>}
    {paymentInvoice && <InvoicePayment invoice={paymentInvoice} close={() => setPaymentInvoice(undefined)} />}
    {configuring && canManage && catalog.isSuccess && <ScheduleEditor url={url} close={() => setConfiguring(false)} onSaved={async () => {
      setNotice("Jadwal tagihan tersimpan.");
      setConfiguring(false);
      await client.invalidateQueries({ queryKey: scheduleKey });
    }} />}
    {editor && canManage && (editor.invoice || canManage) && <InvoiceEditor invoice={editor.invoice} url={url} schedules={schedules} close={() => setEditor(undefined)} onSaved={async ({ id }) => {
      setNotice(editor.invoice ? "Tagihan dibatalkan." : id ? "Tagihan berhasil dicatat." : "Angka meter tersimpan. Tidak ada biaya yang ditagihkan.");
      setEditor(undefined);
      if (!editor.invoice) setPage(1);
      await Promise.all([client.invalidateQueries({ queryKey: billKey }),
        client.invalidateQueries({ queryKey: cacheKeys.summary(userId, tenant) })]);
    }} />}
  </>;
}

function InvoiceCard({ invoice, onVoid, onPayment }: { invoice: Invoice; onVoid?: () => void; onPayment?: () => void }) {
  const paid = BigInt(invoice.paid_amount);
  const total = BigInt(invoice.total_amount);
  const settled = invoice.status === "issued" && paid >= total;
  const status = invoice.status === "void" ? "Dibatalkan" : invoice.status === "draft" ? "Draf" : settled ? "Lunas" : paid > 0n ? "Terbayar sebagian" : "Belum dibayar";
  const name = invoice.items || (invoice.kind === "dues" ? "Iuran" : "Air");

  return <li className="workspace-bill-card">
    <div className="workspace-bill-card-heading">
      <h3 className="workspace-icon-label">{invoice.kind === "water" ? <Droplets size={18} aria-hidden="true" /> : <ReceiptText size={18} aria-hidden="true" />}{name}</h3>
      <span className={`live-status ${settled ? "" : invoice.status === "issued" ? "workspace-bill-unpaid" : "archived"}`}>{status}</span>
    </div>
    <p className="workspace-icon-label"><House size={15} aria-hidden="true" />{invoice.unit_label_snapshot} · {invoice.bill_to_name_snapshot}</p>
    <p className="workspace-icon-label"><CalendarDays size={15} aria-hidden="true" />{periodFormat.format(new Date(invoice.period))} · Jatuh tempo {dateFormat.format(new Date(invoice.due_date))}</p>
    {invoice.consumption !== null && <p className="workspace-icon-label"><Droplets size={15} aria-hidden="true" />Pemakaian {Number(invoice.consumption).toLocaleString("id-ID")} m³</p>}
    <dl className="workspace-bill-amounts">
      {invoice.status === "issued" && <div><dt>Sisa tagihan</dt><dd>{rupiah.format(total - paid)}</dd></div>}
      <div><dt>Total</dt><dd>{rupiah.format(total)}</dd></div>
      <div><dt>Terbayar</dt><dd>{rupiah.format(paid)}</dd></div>
    </dl>
    {invoice.void_reason && <p>Alasan pembatalan: {invoice.void_reason}</p>}
    <div className="workspace-bill-card-footer">
      <small>{invoice.invoice_number}</small>
      {invoice.unread && <span className="live-status">Baru</span>}
      {onPayment && <button className="button secondary compact" onClick={onPayment}>Rincian tagihan</button>}
      {onVoid && invoice.status === "issued" && paid === 0n && <button className="button secondary compact live-danger-outline" onClick={onVoid}
        aria-label={`Batalkan ${name}, unit ${invoice.unit_label_snapshot}`}><XCircle size={16} aria-hidden="true" />Batalkan</button>}
    </div>
  </li>;
}

function InvoiceEditor({ invoice, url, schedules, close, onSaved }: { invoice?: Invoice; url: string; schedules: BillSchedule[]; close: () => void; onSaved: (result: { id: string | null }) => Promise<void> }) {
  const { tenant, userId, api } = useDashboard();
  const confirm = useConfirmation();
  const [period, setPeriod] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const applicable = schedules.filter(schedule => occursInPeriod(schedule, `${period}-01`));
  const schedule = applicable.find(item => item.id === scheduleId);
  const pastPeriod = !!period && period < yearMonth.format(new Date());
  const [search, setSearch] = useState("");
  const [readingError, setReadingError] = useState("");
  const [recipientKey, setRecipientKey] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const recipients = useQuery({
    queryKey: [...cacheKeys.tenant(userId, tenant), "invoice-recipients", period, deferredSearch],
    enabled: !invoice && !!period,
    queryFn: ({ signal }) => api<{ recipients: Recipient[] }>(url + "?" + new URLSearchParams({ recipientPeriod: period, q: deferredSearch }), { signal }),
  });
  const mutation = useMutation({
    mutationFn: (body: object) => api<{ id: string | null }>(url, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });

  const choices = recipients.isSuccess ? recipients.data.recipients : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { recipient, ...data } = Object.fromEntries(new FormData(event.currentTarget));
    const [unitId, personId] = String(recipient || "").split(":");
    const title = invoice ? "Batalkan tagihan" : "Catat tagihan";
    setReadingError("");
    const payer = choices.find(person => person.unit_id === unitId && person.person_id === personId);
    if (!invoice && !payer) return;
    const recipientLabel = payer ? `${payer.name} · ${payer.unit_label}` : "";
    let description = invoice ? invoice.invoice_number : `${schedule?.name ?? data.item} sebesar ${rupiah.format(BigInt(schedule?.amount ?? String(data.amount)))} untuk ${recipientLabel}.`;
    if (schedule?.pricing === "water") {
      try {
        const charge = meterCharge(meterInput(data), schedule.amount);
        description = charge === "0" ? `Simpan angka meter dengan biaya Rp0 untuk ${recipientLabel}.` : `${schedule.name} sebesar ${rupiah.format(BigInt(charge))} untuk ${recipientLabel}.`;
      } catch (error) {
        setReadingError((error as Error).message);
        return;
      }
    }
    if (!invoice && pastPeriod) description += " Periode ini sudah berlalu. Tagihan akan diberikan kepada penghuni aktif yang tercatat saat ini.";
    if (!await confirm({ title: `${title}?`, description, confirmLabel: title })) return;
    mutation.mutate(invoice ? { ...data, action: "void", invoiceId: invoice.id } : { ...data, action: "record", unitId, personId });
  }

  return <WorkspaceModal title={invoice ? "Batalkan tagihan" : "Catat tagihan"} icon={invoice ? XCircle : ReceiptText} busy={mutation.isPending} close={close}>
    <form onSubmit={submit}>
      <div className="form-body live-form workspace-guided-form">
        {invoice ? <>
          <p className="workspace-help"><CircleAlert size={18} aria-hidden="true" /><span><strong>{invoice.items || "Tagihan"}</strong> · {invoice.unit_label_snapshot}<br />Tagihan yang dibatalkan tetap terlihat di riwayat.</span></p>
          <label className="field"><span>Alasan pembatalan</span><textarea name="reason" required maxLength={500} /></label>
        </> : <>
          <fieldset className="workspace-form-section">
            <legend className="workspace-icon-label"><CalendarDays size={18} aria-hidden="true" />Periode dan biaya</legend>
            <label className="field"><span>Bulan tagihan</span><input name="period" type="month" placeholder="YYYY-MM" required value={period} onChange={event => { setPeriod(event.target.value); setScheduleId(""); setRecipientKey(""); setReadingError(""); }} /></label>
            <label className="field"><span>Jadwal tagihan</span><select name="scheduleId" disabled={!period} value={scheduleId} onChange={event => { setScheduleId(event.target.value); setReadingError(""); }}>
              <option value="">Iuran manual</option>
              {applicable.map(item => <option key={item.id} value={item.id}>{item.name} · {billingFrequencies[item.recurrence]}</option>)}
            </select><small>{!period ? "Pilih bulan untuk melihat jadwal yang berlaku." : "Pilih jadwal yang berlaku atau gunakan Iuran manual."}</small></label>
            {schedule ? <p className="workspace-help"><WalletCards size={18} aria-hidden="true" /><span>{rupiah.format(BigInt(schedule.amount))}{schedule.pricing === "water" ? " per m³" : " · Biaya tetap"}</span></p> : <div className="workspace-form-columns">
              <label className="field"><span>Nama iuran</span><input name="item" required maxLength={100} /></label>
              <label className="field"><span>Nominal (Rp)</span><input name="amount" required inputMode="numeric" pattern="[1-9][0-9]{0,13}" maxLength={14} /></label>
            </div>}
          </fieldset>
          <fieldset className="workspace-form-section">
            <legend className="workspace-icon-label"><House size={18} aria-hidden="true" />Unit tagihan</legend>
            <label className="field"><span className="workspace-icon-label"><Search size={16} aria-hidden="true" />Cari unit, klaster, atau penghuni</span>
              <input value={search} disabled={!period} placeholder="Nomor unit, klaster, atau nama" onChange={event => { setSearch(event.target.value); setRecipientKey(""); }} maxLength={100} />
            </label>
            <label className="field"><span>Unit</span>
              <select key={`${period}:${deferredSearch}`} name="recipient" required value={recipientKey} onChange={event => setRecipientKey(event.target.value)} disabled={!choices.length || search.trim() !== deferredSearch}>
                <option value="">{choices.length ? "Pilih unit" : "Belum ada pilihan"}</option>
                {choices.map(person => <option key={`${person.unit_id}:${person.person_id}`} value={`${person.unit_id}:${person.person_id}`}>{person.unit_label} · {person.name}</option>)}
              </select>
              {choices.filter(choice => recipientKey === `${choice.unit_id}:${choice.person_id}`).map(choice => <small key={choice.unit_id}>{choice.occupants ? `${choice.occupants} penghuni tercatat akan menerima akses tagihan di portal.` : "Unit ini tidak memiliki penghuni aktif. Tagihan akan dicatat atas nama pemilik yang ditampilkan."}</small>)}
              {pastPeriod && <small>Periode lampau menggunakan data penghuni aktif saat ini. Periksa penerima sebelum menerbitkan.</small>}
              <small role="status">{!period ? "Pilih bulan tagihan dahulu." : recipients.isError ? "Pencarian belum berhasil." : recipients.isFetching || search.trim() !== deferredSearch ? "Mencari penanggung…" : !choices.length ? "Tidak ada hasil. Coba kata pencarian lain." : `${choices.length} pilihan ditemukan.`}</small>
            </label>
            {recipients.error && <p className="live-alert" role="alert">{recipients.error.message} <button type="button" className="text-button" onClick={() => recipients.refetch()}><RefreshCw size={15} aria-hidden="true" />Coba lagi</button></p>}
          </fieldset>
          {schedule?.pricing === "water" && <fieldset className="workspace-form-section">
            <legend className="workspace-icon-label"><Droplets size={18} aria-hidden="true" />Pembacaan meter air</legend>
            <label className="field"><span>Nomor meter unit</span><input name="serial" required maxLength={60} /></label>
            <div className="workspace-form-columns">
              <label className="field"><span>Angka meter awal (m³)</span><input name="previous" type="number" min="0" max="9999999999.999" step="0.001" required /></label>
              <label className="field"><span>Angka meter akhir (m³)</span><input name="current" type="number" min="0" max="9999999999.999" step="0.001" required /></label>
            </div>
            <p className="workspace-help"><CircleHelp size={18} aria-hidden="true" /><span>Biaya dihitung dari selisih angka meter dikali tarif per m³. Periksa total sebelum menerbitkan.</span></p>
          </fieldset>}
          <fieldset className="workspace-form-section">
            <legend className="workspace-icon-label"><Clock3 size={18} aria-hidden="true" />Tanggal penerbitan</legend>
            <div className="workspace-form-columns">
              <label className="field"><span>Tanggal terbit</span><input name="issueDate" type="date" required /></label>
              <label className="field"><span>Jatuh tempo</span><input name="dueDate" type="date" required /></label>
            </div>
          </fieldset>
        </>}
        {(readingError || mutation.error) && <p className="live-alert" role="alert">{readingError || mutation.error?.message}</p>}
      </div>
      <div className="form-footer">
        <button className="button secondary" type="button" onClick={close} disabled={mutation.isPending}>Batal</button>
        <button className={`button primary${invoice ? " live-danger" : ""}`} disabled={mutation.isPending || (!invoice && (!recipientKey || search.trim() !== deferredSearch))}>{invoice ? <XCircle size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{mutation.isPending ? "Menyimpan…" : invoice ? "Batalkan tagihan" : "Tinjau tagihan"}</button>
      </div>
    </form>
  </WorkspaceModal>;
}

function ScheduleEditor({ url, close, onSaved }: { url: string; close: () => void; onSaved: () => Promise<void> }) {
  const { api } = useDashboard();
  const [pricing, setPricing] = useState("fixed");
  const [frequency, setFrequency] = useState<keyof typeof billingFrequencies>("monthly");
  const mutation = useMutation({
    mutationFn: (body: object) => api(url, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ ...Object.fromEntries(new FormData(event.currentTarget)), action: "create-schedule" });
  }

  return <WorkspaceModal title="Tambah jadwal tagihan" icon={CalendarPlus} busy={mutation.isPending} close={close}>
    <form onSubmit={submit}>
      <div className="form-body live-form workspace-guided-form">
        <label className="field"><span>Nama tagihan</span><input name="item" required maxLength={100} placeholder="Contoh: Iuran keamanan" /></label>
        <label className="field"><span>Jenis biaya</span><select name="pricing" value={pricing} onChange={event => setPricing(event.target.value)}>
          <option value="fixed">Tetap</option>
          <option value="water">Pemakaian air berdasarkan meter</option>
        </select><small>{pricing === "water" ? "Tagihan mengikuti selisih angka meter." : "Nominal yang sama digunakan setiap kali tagihan diterbitkan."}</small></label>
        <label className="field"><span>{pricing === "water" ? "Tarif (Rp per m³)" : "Nominal (Rp)"}</span><input name="amount" required inputMode="numeric" pattern="[1-9][0-9]{0,13}" maxLength={14} /></label>
        <label className="field"><span>Frekuensi</span><select name="recurrence" value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)}>
          {Object.entries(billingFrequencies).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field"><span>{frequency === "one_time" ? "Bulan tagihan" : "Bulan mulai"}</span><input name="period" type="month" placeholder="YYYY-MM" required />
          <small>{frequency === "annual" ? "Jadwal berlaku pada bulan yang sama setiap tahun." : frequency === "monthly" ? "Jadwal berlaku setiap bulan mulai dari bulan ini." : "Jadwal hanya berlaku untuk bulan yang dipilih."}</small></label>
        <p className="workspace-help"><CircleHelp size={18} aria-hidden="true" /><span>Setelah menyimpan jadwal, gunakan <strong>Catat tagihan</strong> untuk memilih penanggung dan menerbitkan tagihan.</span></p>
        {mutation.error && <p className="live-alert" role="alert">{mutation.error.message}</p>}
      </div>
      <div className="form-footer">
        <button className="button secondary" type="button" onClick={close} disabled={mutation.isPending}>Batal</button>
        <button className="button primary" disabled={mutation.isPending}><Check size={17} aria-hidden="true" />{mutation.isPending ? "Menyimpan…" : "Simpan jadwal"}</button>
      </div>
    </form>
  </WorkspaceModal>;
}

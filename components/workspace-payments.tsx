"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard-shell";
import WorkspaceModal from "@/components/workspace-modal";
import { cacheKeys } from "@/lib/client-cache";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const statusLabels = { submitted: "Menunggu verifikasi", verified: "Terverifikasi", rejected: "Ditolak" };
type Payment = { id: string; status: keyof typeof statusLabels; amount: string; claimed_paid_at: string; rejection_reason: string | null };
type Details = {
  bill: { status: string; unit_label_snapshot: string; invoice_number: string };
  items: { id: string; name: string; total: string; remaining: string }[];
  payments: Payment[];
};

export function InvoicePayment({ invoice, close }: { invoice: string; close: () => void }) {
  const { tenant, userId, api } = useDashboard();
  const client = useQueryClient();
  const url = `/api/neighborhoods/${tenant}/payments`;
  const query = useQuery({
    queryKey: [...cacheKeys.tenant(userId, tenant), "payment-details", invoice],
    queryFn: ({ signal }) => api<Details>(`${url}?invoice=${invoice}`, { signal }),
  });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const upload = useRef<{ file: File; proof?: string; key: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("proof");
    const items = Object.entries(amounts).map(([id, amount]) => ({ id, amount }));
    if (!(file instanceof File) || !file.size || !items.length) {
      setError("Pilih item yang dibayar dan unggah bukti pembayaran.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) { setError("Ukuran bukti maksimal 3 MB."); return; }
    if (!upload.current || upload.current.file.name !== file.name || upload.current.file.size !== file.size || upload.current.file.lastModified !== file.lastModified) {
      upload.current = { file, key: crypto.randomUUID() };
    }
    const submission = upload.current;
    setBusy(true);
    setError("");
    setResult("");
    try {
      if (!submission.proof) {
        const response = await api<{ id: string }>(`${url}/proof?invoice=${invoice}`, {
          method: "POST", body: file, headers: { "x-document-name": encodeURIComponent(file.name) },
        });
        submission.proof = response.id;
      }
      await api(url, { method: "POST", body: JSON.stringify({
        action: "submit", invoice, proof: submission.proof, key: submission.key, method: data.get("method"), date: data.get("date"), items,
      }) });
      upload.current = null;
      setAmounts({});
      form.reset();
      setResult("Bukti pembayaran telah dikirim untuk diperiksa.");
      await client.invalidateQueries({ queryKey: cacheKeys.tenant(userId, tenant) });
    } catch (failure) {
      setError((failure as Error).message);
    } finally { setBusy(false); }
  }

  const details = query.data;
  const canPay = details?.bill.status === "issued" && details.items.some(item => BigInt(item.remaining) > 0n);
  return <WorkspaceModal title="Rincian tagihan" close={close} busy={busy}>
    <div className="form-body live-form">
      {query.isPending && <p role="status">Memuat tagihan…</p>}
      {query.error && <p className="live-alert" role="alert">{query.error.message}</p>}
      {details && <>
        <p><strong>{details.bill.unit_label_snapshot}</strong> · {details.bill.invoice_number}</p>
        <form className="portal-stack" onSubmit={submit}>
          <fieldset className="workspace-form-section" disabled={busy}>
            <legend>{canPay ? "Konfirmasi mandiri" : "Item tagihan"}</legend>
            {details.items.map(item => <div key={item.id} className="portal-item">
              <label className="live-check">
                {canPay && BigInt(item.remaining) > 0n && <input type="checkbox" checked={Object.hasOwn(amounts,item.id)} onChange={event => {
                  const checked = event.target.checked;
                  setAmounts(current => {
                    const next = { ...current };
                    if (checked) next[item.id] = item.remaining;
                    else delete next[item.id];
                    return next;
                  });
                }} />}
                <span>{item.name}<br /><small>Sisa {rupiah.format(BigInt(item.remaining))} dari {rupiah.format(BigInt(item.total))}</small></span>
              </label>
              {Object.hasOwn(amounts,item.id) && <label className="field"><span>Nominal untuk {item.name} (Rp)</span>
                <input inputMode="numeric" required pattern="[1-9][0-9]{0,13}" value={amounts[item.id]}
                  onChange={event => setAmounts({ ...amounts, [item.id]: event.target.value })} />
              </label>}
            </div>)}
          </fieldset>
          {canPay && <fieldset className="workspace-form-section" disabled={busy}>
            <legend>Bukti pembayaran</legend>
            <p>Bayar melalui rekening atau petugas yang diinformasikan pengurus, lalu kirim bukti di sini.</p>
            <label className="field"><span>Metode</span><select name="method"><option value="bank_transfer">Transfer bank</option><option value="cash">Tunai</option></select></label>
            <label className="field"><span>Tanggal pembayaran</span><input required type="date" name="date" /></label>
            <label className="field"><span>Bukti pembayaran</span><input required type="file" name="proof" accept="application/pdf,image/jpeg,image/png" onChange={() => { upload.current = null; }} /><small>PDF, JPG, atau PNG hingga 3 MB.</small></label>
            <button className="button primary" disabled={busy || !Object.keys(amounts).length}>{busy ? "Mengirim…" : "Kirim bukti pembayaran"}</button>
          </fieldset>}
        </form>
        {details.payments.length > 0 && <section className="portal-stack" aria-label="Riwayat konfirmasi Anda">
          <h3>Riwayat konfirmasi Anda</h3>
          {details.payments.map(payment => <div key={payment.id}>
            <strong>{statusLabels[payment.status]} · {rupiah.format(BigInt(payment.amount))}</strong>
            <p>{payment.claimed_paid_at}{payment.rejection_reason && ` · ${payment.rejection_reason}`}</p>
          </div>)}
        </section>}
      </>}
      {error && <p className="live-alert" role="alert">{error}</p>}
      {result && <p className="info-note" role="status">{result}</p>}
    </div>
  </WorkspaceModal>;
}

type ReviewedPayment = Payment & { unit: string; invoice_number: string; method: "cash" | "bank_transfer"; submitter: string; items: string | null; has_proof: boolean };
type Account = { id: string; name: string; kind: "cash" | "bank" };

export function StaffPayments() {
  const { tenant, userId, api } = useDashboard();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReviewedPayment | "account">();
  const [status, setStatus] = useState<"verify" | "reject">("verify");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const url = `/api/neighborhoods/${tenant}/payments`;
  const query = useQuery({
    queryKey: [...cacheKeys.tenant(userId, tenant), "payment-review", page],
    queryFn: ({ signal }) => api<{ payments: ReviewedPayment[]; accounts: Account[]; next: boolean }>(`${url}?page=${page}`, { signal }),
  });
  const accounts = query.data?.accounts.filter(account => selected && selected !== "account" &&
    account.kind === (selected.method === "cash" ? "cash" : "bank")) ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(url, { method: "POST", body: JSON.stringify({
        ...Object.fromEntries(new FormData(event.currentTarget)), action: selected === "account" ? "account" : status,
        payment: selected === "account" ? undefined : selected.id,
      }) });
      setNotice(selected === "account" ? "Akun penerima ditambahkan." : "Status pembayaran diperbarui.");
      setSelected(undefined);
      await client.invalidateQueries({ queryKey: cacheKeys.tenant(userId, tenant) });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="panel live-panel portal-stack">
    <div className="live-section-heading">
      <h2>Verifikasi Pembayaran</h2>
      <button className="button secondary" onClick={() => { setError(""); setSelected("account"); }}>Tambah akun penerima</button>
    </div>
    {notice && <p className="info-note" role="status">{notice}</p>}
    {query.error && <p className="live-alert" role="alert">{query.error.message}</p>}
    {query.isPending && <p role="status">Memuat pembayaran…</p>}
    {query.data?.payments.length === 0 && <p>Belum ada pengiriman bukti pembayaran.</p>}
    {!!query.data?.payments.length && <ul className="workspace-bill-grid">{query.data.payments.map(payment => <li className="workspace-bill-card" key={payment.id}>
      <h3>{payment.unit}</h3>
      <p>{payment.invoice_number} · {payment.submitter}</p>
      <p>{payment.method === "cash" ? "Tunai" : "Transfer bank"} · {payment.claimed_paid_at}</p>
      {payment.items && <p>{payment.items}</p>}
      <strong>{rupiah.format(BigInt(payment.amount))} · {statusLabels[payment.status]}</strong>
      {payment.rejection_reason && <p>{payment.rejection_reason}</p>}
      <div className="portal-actions">
        {payment.has_proof && <a className="button secondary compact" href={`${url}/proof?payment=${payment.id}`}>Unduh bukti</a>}
        {payment.status === "submitted" && <button className="button primary compact" onClick={() => {
          setError(""); setStatus("verify"); setSelected(payment);
        }}>Periksa pembayaran</button>}
      </div>
    </li>)}</ul>}
    {(page > 1 || query.data?.next) && <div className="portal-actions">
      <button className="button secondary compact" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
      <button className="button secondary compact" disabled={!query.data?.next} onClick={() => setPage(page + 1)}>Berikutnya</button>
    </div>}
    {selected && <WorkspaceModal title={selected === "account" ? "Tambah akun penerima" : "Periksa pembayaran"} close={() => setSelected(undefined)} busy={busy}>
      <form onSubmit={submit}>
        <div className="form-body live-form">
          {selected === "account" ? <>
            <label className="field"><span>Nama akun</span><input required name="name" maxLength={120} /></label>
            <label className="field"><span>Jenis akun</span><select name="kind"><option value="bank">Bank</option><option value="cash">Kas tunai</option></select></label>
          </> : <>
            <p>{selected.unit} · {rupiah.format(BigInt(selected.amount))}</p>
            {selected.has_proof && <a className="button secondary compact" href={`${url}/proof?payment=${selected.id}`}>Unduh bukti</a>}
            <label className="field"><span>Hasil pemeriksaan</span><select value={status} onChange={event => setStatus(event.target.value === "reject" ? "reject" : "verify")}>
              <option value="verify">Verifikasi pembayaran</option><option value="reject">Tolak pembayaran</option>
            </select></label>
            {status === "verify" ? <label className="field"><span>Akun penerima</span>
              <select required name="account" defaultValue=""><option value="">Pilih akun penerima</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select>
              {!accounts.length && <small>Tambahkan akun penerima dengan jenis yang sesuai terlebih dahulu.</small>}
            </label> : <label className="field"><span>Alasan penolakan</span><textarea required name="reason" maxLength={500} /></label>}
          </>}
          {error && <p className="live-alert" role="alert">{error}</p>}
        </div>
        <div className="form-footer"><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
      </form>
    </WorkspaceModal>}
  </section>;
}

"use client";

import { useState, type FormEvent } from "react";
import { CheckCheck, ClipboardCheck, FileCheck2, Receipt, Send, Wallet } from "lucide-react";
import { allocationTotal, itemBalances, unallocatedCredit, type ItemAllocation } from "@/lib/allocations";
import { allocateLegacyCredit, recordAdminPayment, reviewPayment } from "@/lib/billing";
import { currency, displayDate, remaining, submitPayment, uid, type Demo, type Invoice, type Payment } from "@/lib/demo";

type Props = { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void; invoice: Invoice; close: () => void };

function AssessmentContext({ invoice, review = false }: { invoice: Invoice; review?: boolean }) {
  return <><div className="assessment-context"><span className="grid-stat-icon"><Receipt size={21} /></span><div><strong>Unit {invoice.unitNumber || invoice.unitId} · {invoice.person}</strong><small>{invoice.period} · {invoice.id}</small></div><div><small>Sisa tagihan</small><b>{currency(remaining(invoice))}</b></div></div><ol className="assessment-steps"><li><ClipboardCheck size={15} />1. Pilih rincian</li><li><Wallet size={15} />2. Cocokkan pembayaran</li><li><FileCheck2 size={15} />3. {review ? "Verifikasi" : "Konfirmasi"}</li></ol></>;
}

export function ItemChecklist({ invoice, value, change, target }: { invoice: Invoice; value: ItemAllocation[]; change: (items: ItemAllocation[]) => void; target?: number }) {
  return <fieldset className="item-checklist"><legend>Rincian tagihan yang dibayar</legend><p>Centang rincian dan isi nominalnya. Pembayaran sebagian per rincian diperbolehkan.</p><div className="checklist-tools">{target === undefined && <button className="text-button" type="button" onClick={() => change(itemBalances(invoice).filter(item => item.outstanding > 0).map(item => ({ itemIndex: item.itemIndex, amount: item.outstanding })))}><CheckCheck size={14} />Pilih semua yang belum lunas</button>}<button className="text-button" type="button" onClick={() => change([])}>Kosongkan pilihan</button></div>{itemBalances(invoice).map(item => {
    const selected = value.find(allocation => allocation.itemIndex === item.itemIndex);
    return <div className={`allocation-item ${selected ? "selected" : ""} ${item.outstanding === 0 ? "settled" : ""}`} key={item.itemIndex}><label><input type="checkbox" checked={item.outstanding === 0 || !!selected} disabled={item.outstanding === 0} onChange={event => change(event.target.checked ? [...value, { itemIndex: item.itemIndex, amount: Math.min(item.outstanding, target === undefined ? item.outstanding : Math.max(0, target - allocationTotal(value))) }] : value.filter(allocation => allocation.itemIndex !== item.itemIndex))} /><span><strong>{item.name}</strong><small>{item.outstanding === 0 ? "Sudah lunas" : `Terbayar ${currency(item.paid)} · Sisa ${currency(item.outstanding)}`}</small></span></label>{selected && item.outstanding > 0 && <label className="field allocation-amount"><span>Nominal {item.name} (Rp)</span><input type="number" min={1} max={item.outstanding} step={1} required value={selected.amount || ""} onChange={event => change(value.map(allocation => allocation.itemIndex === item.itemIndex ? { ...allocation, amount: Number(event.target.value) } : allocation))} /></label>}</div>;
  })}<div className="allocation-total" aria-live="polite"><span>Total dipilih</span><strong>{currency(allocationTotal(value))}{target !== undefined && <small> / {currency(target)}</small>}</strong></div></fieldset>;
}

export function LegacyAllocation(a: Omit<Props, "close">) {
  const [value, setValue] = useState<ItemAllocation[]>([]);
  const [error, setError] = useState("");
  const credit = unallocatedCredit(a.invoice);
  if (credit <= 0) return null;
  return <section className="legacy-allocation"><h3>Alokasikan pembayaran sebelumnya</h3><div className="info-note">Ada {currency(credit)} pembayaran lama yang belum ditentukan rinciannya. Alokasikan sesuai catatan yang benar sebelum konfirmasi baru. Saldo invoice dan pemasukan kas tidak bertambah.</div><ItemChecklist invoice={a.invoice} value={value} change={setValue} target={credit} />{error && <div className="form-error" role="alert">{error}</div>}<button className="button secondary" onClick={() => { try { a.save(allocateLegacyCredit(a.data, a.invoice.id, value, a.actorId, a.at)); a.notify("Rincian pembayaran lama diperbarui tanpa membuat penerimaan baru."); } catch (error) { setError((error as Error).message); } }}>Simpan alokasi sebelumnya</button></section>;
}

export function AdminAssistedPayment(a: Props) {
  const [value, setValue] = useState<ItemAllocation[]>([]);
  const [error, setError] = useState("");
  if (unallocatedCredit(a.invoice) > 0) return <div className="modal-body"><LegacyAllocation {...a} /></div>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const fields = new FormData(event.currentTarget);
    try {
      const proof = fields.get("proof") as File | null;
      a.save(recordAdminPayment(a.data, { id: `PAY-${uid()}`, invoiceId: a.invoice.id, amount: allocationTotal(value), method: String(fields.get("method")), date: String(fields.get("date")), reference: String(fields.get("reference") || "").trim(), proof: proof?.size ? proof.name : "", status: "verified", allocations: value }, a.actorId, a.at));
      a.close(); a.notify("Konfirmasi dibantu pengurus tersimpan. Hanya rincian terpilih yang menerima pembayaran.");
    } catch (error) { setError((error as Error).message); }
  };
  return <form onSubmit={submit}><div className="modal-body"><AssessmentContext invoice={a.invoice} /><div className="info-note assessment-intro"><strong>Konfirmasi dibantu pengurus.</strong> Gunakan saat warga memerlukan bantuan atau membayar langsung. Tidak memerlukan pengajuan mandiri warga.</div><ItemChecklist invoice={a.invoice} value={value} change={setValue} /><h3 className="assessment-section-title"><Wallet size={17} />Data penerimaan</h3><div className="form-grid"><label className="field"><span>Nominal pembayaran (Rp)</span><input readOnly value={allocationTotal(value)} /></label><label className="field"><span>Tanggal pembayaran</span><input name="date" type="date" required defaultValue={a.at.slice(0, 10)} /></label><label className="field"><span>Metode pembayaran</span><select name="method"><option>Tunai</option><option>Transfer bank</option></select></label><label className="field"><span>Penerima / referensi transaksi</span><input name="reference" required placeholder="Nama petugas / nomor kuitansi atau referensi bank" /></label></div><label className="field"><span>Bukti contoh (opsional)</span><input name="proof" type="file" accept="image/jpeg,image/png,application/pdf" /></label><label className="billing-confirm"><input type="checkbox" required />Saya sudah mencocokkan pembayaran dan rincian terpilih dengan penerimaan tunai atau transaksi bank.</label><p className="billing-helper">Dicatat dan diverifikasi oleh {a.data.accounts.find(account => account.id === a.actorId)?.name}.</p>{error && <div className="form-error" role="alert">{error}</div>}</div><div className="form-footer"><button className="button secondary" type="button" onClick={a.close}>Batal</button><button className="button primary" type="submit" disabled={allocationTotal(value) <= 0}><FileCheck2 size={16} />Catat dan verifikasi</button></div></form>;
}

export function ResidentSelfAssessment(a: Omit<Props, "actorId">) {
  const [value, setValue] = useState<ItemAllocation[]>([]);
  const [method, setMethod] = useState("Transfer bank");
  const [error, setError] = useState("");
  if (unallocatedCredit(a.invoice) > 0) return <div className="modal-body"><div className="info-note">Pengurus perlu menentukan alokasi pembayaran lama sebesar {currency(unallocatedCredit(a.invoice))} sebelum konfirmasi baru. Hubungi pengurus untuk bantuan.</div><button className="button secondary" onClick={a.close}>Tutup</button></div>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const fields = new FormData(event.currentTarget);
    try {
      const proof = fields.get("proof") as File | null;
      a.save(submitPayment(a.data, { id: `PAY-${uid()}`, invoiceId: a.invoice.id, amount: allocationTotal(value), method, date: String(fields.get("date")), reference: String(fields.get("reference") || ""), proof: proof?.size ? proof.name : "", status: "pending", allocations: value, recordedBy: "account-11", recordedAt: a.at }));
      a.close(); a.notify("Konfirmasi mandiri dikirim. Pengurus akan meninjau rincian dan bukti pembayaran.");
    } catch (error) { setError((error as Error).message); }
  };
  return <form onSubmit={submit}><div className="modal-body"><AssessmentContext invoice={a.invoice} /><div className="info-note assessment-intro"><strong>Konfirmasi mandiri oleh warga.</strong> Pilih rincian yang sudah dibayar. Saldo berubah setelah pengurus memverifikasi.</div><ItemChecklist invoice={a.invoice} value={value} change={setValue} /><h3 className="assessment-section-title"><Wallet size={17} />Data pembayaran</h3><div className="form-grid"><label className="field"><span>Total konfirmasi (Rp)</span><input readOnly value={allocationTotal(value)} /></label><label className="field"><span>Tanggal pembayaran</span><input name="date" type="date" required defaultValue={a.at.slice(0, 10)} /></label><label className="field"><span>Metode pembayaran</span><select value={method} onChange={event => setMethod(event.target.value)}><option>Transfer bank</option><option>Tunai</option></select></label><label className="field"><span>{method === "Tunai" ? "Nama penerima / referensi penyerahan" : "Referensi bank (opsional)"}</span><input name="reference" required={method === "Tunai"} /></label></div><label className="field"><span>{method === "Transfer bank" ? "Bukti transfer" : "Bukti penerimaan (opsional)"}</span><input name="proof" type="file" accept="image/jpeg,image/png,application/pdf" required={method === "Transfer bank"} /><small>Gunakan berkas contoh. Mockup menyimpan nama berkas saja.</small></label>{error && <div className="form-error" role="alert">{error}</div>}</div><div className="form-footer"><button className="button secondary" type="button" onClick={a.close}>Batal</button><button className="button primary" type="submit" disabled={allocationTotal(value) <= 0}><Send size={16} />Kirim konfirmasi</button></div></form>;
}

export function PaymentReview(a: Props & { payment: Payment }) {
  const [value, setValue] = useState<ItemAllocation[]>(() => (a.payment.allocations || []).map(item => ({ ...item })));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const pending = a.payment.status === "pending";
  const legacy = unallocatedCredit(a.invoice) > 0;
  const decide = (decision: "verified" | "rejected") => { try { a.save(reviewPayment(a.data, a.payment.id, decision, reason, a.actorId, a.at, value)); a.close(); a.notify(decision === "verified" ? "Pembayaran dan alokasi rincian telah diverifikasi." : "Pengajuan ditolak. Rincian dan saldo tidak berubah."); } catch (error) { setError((error as Error).message); } };
  return <><div className="modal-body"><AssessmentContext invoice={a.invoice} review /><div className="assessment-review-summary"><div><h3>{a.invoice.person} · Unit {a.invoice.unitNumber || a.invoice.unitId}</h3><p>{a.invoice.period} · {a.payment.origin === "admin" ? "Konfirmasi dibantu pengurus" : "Konfirmasi mandiri warga"}</p></div><strong>{currency(a.payment.amount)}</strong></div><div className="detail-grid"><div className="detail-pair"><span>Metode / tanggal</span><strong>{a.payment.method} · {displayDate(a.payment.date)}</strong></div><div className="detail-pair"><span>Referensi / bukti contoh</span><strong>{a.payment.reference || "—"} · {a.payment.proof || "Tanpa lampiran"}</strong></div></div>{pending ? <>{legacy ? <LegacyAllocation {...a} /> : <ItemChecklist invoice={a.invoice} value={value} change={setValue} target={a.payment.amount} />}<div className={`assessment-match ${allocationTotal(value) === a.payment.amount ? "matched" : ""}`} role="status"><strong>{allocationTotal(value) === a.payment.amount ? "Nominal rincian cocok" : "Nominal rincian belum cocok"}</strong><span>Dipilih {currency(allocationTotal(value))} · Bukti {currency(a.payment.amount)}{allocationTotal(value) !== a.payment.amount && ` · Selisih ${currency(Math.abs(a.payment.amount - allocationTotal(value)))}`}</span></div><div className="info-note">Cocokkan bukti dengan catatan bank atau penerimaan tunai. Total rincian yang dicentang harus sama dengan nominal pembayaran. Jika bukti tidak cocok, tolak dengan alasan.</div><label className="field"><span>Alasan penolakan (jika ditolak)</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} /></label></> : <><span className={`badge ${a.payment.status === "verified" ? "green" : "gray"}`}>{a.payment.status === "verified" ? "Terverifikasi" : "Ditolak"}</span><PaymentAllocationHistory invoice={a.invoice} payment={a.payment} />{a.payment.reason && <p>{a.payment.reason}</p>}</>}{error && <div className="form-error" role="alert">{error}</div>}</div>{pending && <div className="form-footer"><button className="button danger" disabled={!reason.trim()} onClick={() => decide("rejected")}>Tolak pengajuan</button><button className="button primary" disabled={legacy || allocationTotal(value) !== a.payment.amount || allocationTotal(value) <= 0} onClick={() => decide("verified")}><FileCheck2 size={16} />Verifikasi pembayaran</button></div>}</>;
}

export function PaymentAllocationHistory({ invoice, payment }: { invoice: Invoice; payment: Payment }) {
  const allocations = payment.verifiedAllocations || payment.allocations;
  const changed = payment.status === "verified" && payment.allocations && payment.verifiedAllocations && (payment.allocations.length !== payment.verifiedAllocations.length || payment.allocations.some(item => !payment.verifiedAllocations!.some(final => final.itemIndex === item.itemIndex && final.amount === item.amount)));
  return allocations?.length ? <span className="payment-allocation-history">{changed && <><small>Rincian awal yang diajukan warga</small>{payment.allocations!.map(item => <small key={`proposed-${item.itemIndex}`}>{invoice.items[item.itemIndex]?.name} · {currency(item.amount)}</small>)}</>}<small>{payment.status === "verified" ? "Rincian pembayaran terverifikasi" : "Rincian yang diajukan"}</small>{allocations.map(item => <small key={item.itemIndex}>{invoice.items[item.itemIndex]?.name} · {currency(item.amount)}</small>)}</span> : <small>Alokasi per rincian belum tercatat pada pembayaran lama.</small>;
}

export function InvoiceItemStatus({ invoice }: { invoice: Invoice }) {
  return <>{itemBalances(invoice).map(item => <div key={item.itemIndex}><span>{item.name}<small className="invoice-item-status">{item.outstanding === 0 ? "Lunas" : `Terbayar ${currency(item.paid)} · Sisa ${currency(item.outstanding)}`}</small></span><strong>{currency(item.amount)}</strong></div>)}{unallocatedCredit(invoice) > 0 && <div className="info-note">Pembayaran lama {currency(unallocatedCredit(invoice))} belum dialokasikan ke rincian. Total saldo invoice tetap sesuai pembayaran terverifikasi.</div>}</>;
}

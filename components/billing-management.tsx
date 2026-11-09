"use client";

import { BillingScopePicker } from "@/components/billing-scope";
import { WaterBatchForm } from "@/components/water-batch";
import { scopedUnitIds, type BillingScope } from "@/lib/billing-scope";
import { useEffect, useState, type FormEvent } from "react";
import { issueWaterBill, periodLabel, waterAmount } from "@/lib/billing";
import { invoiceAllowsWhatsApp } from "@/lib/resident-portal";
import { renderMessage } from "@/lib/communications";
import { currency, displayDate, remaining, settlement, uid, type Demo, type Invoice } from "@/lib/demo";

type BillingProps = { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void };

export { AdminAssistedPayment as AdminPaymentForm } from "./payment-assessment";

export function WaterBillForm(a: BillingProps & { initialUnit: string; initialPeriod: string; initialScope?: BillingScope; openInvoice: (id: string) => void; onIssued: (period: string) => void; cancel: () => void }) {
  const [scope, setScope] = useState<BillingScope>(a.initialScope || "individual");
  const [selected, setSelected] = useState<string[]>([]);
  const [individual, setIndividual] = useState(a.initialUnit);
  const [period, setPeriod] = useState(a.initialPeriod);
  let ids: string[] = []; try { ids = scopedUnitIds(a.data, scope, selected, individual); } catch { /* Selection is required below. */ }
  return <><div className="water-form-scope"><label className="field"><span>Periode air</span><input type="month" min="2000-01" max="2099-12" required value={period} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setPeriod(event.target.value); }} /></label><BillingScopePicker units={a.data.units} scope={scope} setScope={setScope} selected={selected} setSelected={setSelected} individual={individual} setIndividual={setIndividual} /></div>{scope === "individual" ? <IndividualWaterBillForm {...a} key={`${individual}-${period}`} initialUnit={individual} initialPeriod={period} /> : <div className="water-form water-modal-form"><WaterBatchForm {...a} key={period} period={period} unitIds={ids} /></div>}</>;
}

function IndividualWaterBillForm(a: BillingProps & { initialUnit: string; initialPeriod: string; openInvoice: (id: string) => void; onIssued: (period: string) => void; cancel: () => void }) {
  const unitId = a.initialUnit;
  const period = a.initialPeriod;
  const [previous, setPrevious] = useState("");
  const [current, setCurrent] = useState("");
  const [rate, setRate] = useState("5000");
  const [due, setDue] = useState(`${a.initialPeriod}-10`);
  const [error, setError] = useState("");
  const unit = a.data.units.find(u => u.id === unitId);
  const last = a.data.waterReadings.filter(r => r.unitId === unitId && r.period < period).sort((x, y) => y.period.localeCompare(x.period))[0];
  const saved = a.data.waterReadings.find(r => r.unitId === unitId && r.period === period);
  let periodName = ""; try { periodName = periodLabel(period); } catch { /* Submission explains invalid periods. */ }
  const existingInvoice = a.data.invoices.find(i => i.unitId === unitId && i.period === periodName && (i.kind === "water" || i.items.some(item => item.chargeType === "water")));
  useEffect(() => { setPrevious(saved ? String(saved.previous) : last ? String(last.current) : ""); setCurrent(saved ? String(saved.current) : ""); setRate(String(saved?.rate || last?.rate || 5000)); if (saved) setDue(saved.due); setError(""); }, [unitId, period, last?.id, last?.current, saved?.id, saved?.previous, saved?.current, saved?.rate, saved?.due]);
  let amount: number | null = null;
  try { if (previous !== "" && current !== "") amount = waterAmount(Number(previous), Number(current), Number(rate)); } catch { /* Show the validation reason on submission. */ }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const fields = new FormData(event.currentTarget);
    try {
      const next = issueWaterBill(a.data, { id: uid(), unitId, person: String(fields.get("person")), period, previous: Number(previous), current: Number(current), rate: Number(rate), due }, a.actorId, a.at);
      a.save(next); a.onIssued(period); a.notify("Tagihan air contoh diterbitkan. Rincian meter dan tarif tersimpan pada tagihan warga.");
    } catch (error) { setError(error instanceof Error ? error.message : "Periksa data meter."); }
  };
  return <div className="water-form water-modal-form"><form onSubmit={submit}>{existingInvoice && <div className="info-note">Air untuk unit dan periode ini sudah ditagih. Rincian yang sudah terbit tetap tersimpan.<button type="button" className="text-button" onClick={() => a.openInvoice(existingInvoice.id)}>Lihat tagihan air</button></div>}<div className="form-grid"><label className="field"><span>Penanggung jawab tagihan</span><select name="person" required key={`${unitId}-${saved?.id || "new"}`} disabled={!!saved} defaultValue={saved?.person || unit?.occupant || unit?.owner}>{[...new Set([saved?.person, unit?.occupant, unit?.owner].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select></label><label className="field"><span>Jatuh tempo</span><input type="date" required readOnly={!!saved} value={due} min={`${period}-01`} onChange={e => setDue(e.target.value)} /></label><label className="field"><span>Meter awal (m³)</span><input type="number" min={0} step="0.001" required readOnly={!!last || !!saved} value={previous} onChange={e => setPrevious(e.target.value)} placeholder="Contoh: 100" /><small>{last ? `Dari meter akhir ${periodLabel(last.period)}` : "Pembacaan pertama: isi angka awal meter yang sebenarnya."}</small></label><label className="field"><span>Meter akhir (m³)</span><input type="number" min={previous || 0} step="0.001" required readOnly={!!saved} value={current} onChange={e => setCurrent(e.target.value)} placeholder="Contoh: 115" /></label><label className="field"><span>Tarif per m³ (Rp)</span><input type="number" min={1} step={1} required readOnly={!!saved} value={rate} onChange={e => setRate(e.target.value)} /></label></div><div className="water-calculation" aria-live="polite"><span>{amount !== null ? `${(Math.round(Number(current) * 1000) - Math.round(Number(previous) * 1000)) / 1000} m³ × ${currency(Number(rate))}/m³` : "Isi angka meter untuk menghitung pemakaian"}</span><strong>{amount === null ? "—" : currency(amount)}</strong><small>Dibulatkan ke rupiah terdekat. Meter, tarif, dan penanggung jawab dibekukan saat tagihan terbit.</small></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="cluster-form-actions"><button type="button" className="button secondary" onClick={a.cancel}>Batal</button><button className="button primary" type="submit" disabled={!!existingInvoice}>{existingInvoice ? "Air sudah ditagih" : "Terbitkan tagihan air"}</button></div></form></div>;
}

export function ReminderTemplate({ data, invoice, close }: { data: Demo; invoice: Invoice; close: () => void }) {
  if (!invoiceAllowsWhatsApp(data, invoice)) return <div className="modal-body"><div className="info-note">Warga menonaktifkan pengingat WhatsApp pada preferensi akun. Gunakan metode komunikasi lain yang telah disepakati.</div><button className="button secondary" onClick={close}>Tutup</button></div>;
  return <MessagePreview initialMessage={renderMessage(data, invoice.kind === "water" ? "water" : "invoice", { nama: invoice.person, unit: invoice.unitNumber || invoice.unitId, periode: invoice.period, nominal: currency(remaining(invoice)), jatuh_tempo: displayDate(invoice.due) })} close={close} />;
}
export function MessagePreview({ initialMessage, close }: { initialMessage: string; close: () => void }) {
  const [message, setMessage] = useState(initialMessage);
  return <><div className="modal-body"><label className="field"><span>Pesan WhatsApp</span><textarea rows={7} value={message} onChange={e => setMessage(e.target.value)} /></label><div className="info-note">Periksa penerima sebelum mengirim. Buka WhatsApp untuk memilih kontak dan meninjau pesan; platform tidak mengirim otomatis. Semua data pratinjau adalah contoh.</div></div><div className="form-footer"><button className="button secondary" onClick={close}>Tutup</button><a className="button primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" aria-disabled={!message.trim()} onClick={e => { if (!message.trim()) e.preventDefault(); }}>Buka WhatsApp</a></div></>;
}

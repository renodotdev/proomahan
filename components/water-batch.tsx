"use client";
import { useState, type FormEvent } from "react";
import { issueWaterBatch, waterAmount, waterOverview } from "@/lib/billing";
import { currency, uid, type Demo } from "@/lib/demo";

type ReadingInput = { previous: string; current: string; rate: string; person: string };
export function WaterBatchForm(a: { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void; period: string; unitIds: string[]; cancel: () => void; onIssued: (period: string) => void }) {
  const [values, setValues] = useState<Record<string, ReadingInput>>({});
  const [due, setDue] = useState(`${a.period}-10`);
  const [error, setError] = useState("");
  const candidates = waterOverview(a.data, a.period).rows.filter(row => a.unitIds.includes(row.unit.id));
  const ready = candidates.filter(row => !row.invoice);
  const getValue = (id: string): ReadingInput => {
    const unit = a.data.units.find(unit => unit.id === id)!;
    const last = a.data.waterReadings.filter(reading => reading.unitId === id && reading.period < a.period).sort((x, y) => y.period.localeCompare(x.period))[0];
    return values[id] || { previous: last ? String(last.current) : "", current: "", rate: String(last?.rate || 5000), person: unit.occupant || unit.owner };
  };
  const update = (id: string, field: keyof ReadingInput, value: string) => setValues(previous => ({ ...previous, [id]: { ...(previous[id] || getValue(id)), [field]: value } }));
  let total = 0; let complete = 0;
  for (const row of ready) { const value = getValue(row.unit.id); try { if (value.previous !== "" && value.current !== "") { total += waterAmount(Number(value.previous), Number(value.current), Number(value.rate)); complete++; } } catch { /* The complete batch is revalidated before save. */ } }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      if (ready.some(row => getValue(row.unit.id).previous === "" || getValue(row.unit.id).current === "")) throw new Error("Lengkapi meter setiap unit yang akan ditagih.");
      const readings = ready.map(row => { const value = getValue(row.unit.id); return { id: uid(), unitId: row.unit.id, person: value.person, period: a.period, previous: Number(value.previous), current: Number(value.current), rate: Number(value.rate), due }; });
      a.save(issueWaterBatch(a.data, readings, a.actorId, a.at)); a.onIssued(a.period); a.notify(`${readings.length} tagihan air contoh diterbitkan. Seluruh pembacaan dan nominal tersimpan.`);
    } catch (error) { setError((error as Error).message); }
  };
  return <form onSubmit={submit}><label className="field"><span>Jatuh tempo seluruh tagihan air</span><input type="date" required min={`${a.period}-01`} value={due} onChange={event => setDue(event.target.value)} /></label><div className="info-note">{ready.length} unit siap dicatat · {candidates.length - ready.length} unit sudah ditagih dan dilewati. Isi pembacaan setiap unit; tidak ada pemakaian yang ditebak atau disalin ke semua warga.</div><div className="table-scroll meter-batch-table" role="region" aria-label="Pembacaan meter air unit terpilih" tabIndex={0}><table><thead><tr><th>Unit / penanggung jawab</th><th>Meter awal</th><th>Meter akhir</th><th>Tarif / m³</th><th>Nominal</th></tr></thead><tbody>{ready.map(row => {
    const value = getValue(row.unit.id); const hasPrevious = a.data.waterReadings.some(reading => reading.unitId === row.unit.id && reading.period < a.period);
    let amount: number | null = null; try { if (value.previous !== "" && value.current !== "") amount = waterAmount(Number(value.previous), Number(value.current), Number(value.rate)); } catch { /* Validation appears on submission. */ }
    return <tr key={row.unit.id}><td><strong>{row.unit.id} · {row.unit.cluster}</strong><select aria-label={`Penanggung jawab ${row.unit.id}`} value={value.person} onChange={event => update(row.unit.id, "person", event.target.value)}>{[...new Set([row.unit.occupant, row.unit.owner].filter(Boolean))].map(person => <option key={person}>{person}</option>)}</select></td><td data-label="Meter awal (m³)"><input aria-label={`Meter awal ${row.unit.id}`} type="number" min={0} step="0.001" required readOnly={hasPrevious} value={value.previous} onChange={event => update(row.unit.id, "previous", event.target.value)} /></td><td data-label="Meter akhir (m³)"><input aria-label={`Meter akhir ${row.unit.id}`} type="number" min={value.previous || 0} step="0.001" required value={value.current} onChange={event => update(row.unit.id, "current", event.target.value)} /></td><td data-label="Tarif / m³ (Rp)"><input aria-label={`Tarif ${row.unit.id}`} type="number" min={1} step={1} required value={value.rate} onChange={event => update(row.unit.id, "rate", event.target.value)} /></td><td data-label="Nominal"><strong>{amount === null ? "—" : currency(amount)}</strong></td></tr>;
  })}</tbody></table></div><div className="water-calculation"><span>{complete} dari {ready.length} pembacaan lengkap</span><strong>{currency(total)}</strong></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="cluster-form-actions"><button className="button secondary" type="button" onClick={a.cancel}>Batal</button><button className="button primary" disabled={!ready.length || complete !== ready.length} type="submit">Terbitkan {ready.length} tagihan air</button></div></form>;
}

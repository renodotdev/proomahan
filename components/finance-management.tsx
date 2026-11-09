"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { invoiceReport, invoiceDocument } from "@/lib/finance";
import { downloadReport, type PdfReport } from "@/lib/report-pdf";
import { type Demo, type Invoice } from "@/lib/demo";

type Props = { data: Demo; save: (data: Demo) => void; actorId: string; at: string; notify: (message: string) => void };
export function ExportPdf({ report, notify, label = "Ekspor PDF" }: { report: PdfReport; notify: (message: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  return <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { await downloadReport(report); notify("Laporan PDF contoh siap diunduh."); } catch { notify("PDF belum berhasil dibuat. Coba ekspor kembali."); } finally { setBusy(false); } }}><Download size={16} />{busy ? "Menyiapkan PDF..." : label}</button>;
}
export function InvoiceDownload({ invoice, notify }: { invoice: Invoice; notify: (message: string) => void }) { return <ExportPdf report={invoiceDocument(invoice)} notify={notify} label="Unduh invoice (PDF)" />; }
export function BillingReports(a: Props) {
  const periods = [...new Set(a.data.invoices.map(i => i.period))];
  const [period, setPeriod] = useState("November 2026");
  const report = invoiceReport(a.data, period);
  return <><div className="page-heading"><div><h1>Laporan tagihan</h1><p>Ringkasan tagihan iuran dan air, pembayaran terverifikasi, dan sisa tagihan.</p></div><ExportPdf report={report} notify={a.notify} /></div><section className="panel"><div className="table-toolbar"><label className="field"><span>Periode tagihan</span><select value={period} onChange={e => setPeriod(e.target.value)}>{periods.map(p => <option key={p}>{p}</option>)}</select></label></div><div className="finance-summary">{report.summary.map(value => <strong key={value}>{value}</strong>)}</div><div className="table-scroll" tabIndex={0} role="region" aria-label="Rincian laporan tagihan"><table><thead><tr>{report.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{row.map((cell, n) => <td key={n}>{cell}</td>)}</tr>)}</tbody></table></div></section><div className="info-note">Pembayaran menunggu verifikasi belum mengurangi sisa tagihan. Angka terbayar menunjukkan posisi saat laporan dibuat, bukan penerimaan kas menurut tanggal transaksi.</div></>;
}

export { CashLedger } from "./financial-workspace";

export { WhatsAppTemplates } from "./whatsapp-templates";

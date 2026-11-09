export type PdfReport = { title: string; period: string; fileName?: string; details?: string[]; summary: string[]; headers: string[]; widths: number[]; rows: string[][] };
export async function makeReportPdf(report: PdfReport): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.19, 0.22), teal = rgb(0.07, 0.43, 0.38), muted = rgb(0.36, 0.41, 0.44);
  const safe = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00a0\u202f]/g, " ").replace(/[–—→]/g, "-").replace(/[^\x20-\x7e\n]/g, "");
  const widths = report.widths.map(w => w / report.widths.reduce((s, x) => s + x, 0) * 770);
  let page = document.addPage([842, 595]); let y = 0;
  const text = (value: string, x: number, top: number, size = 9, strong = false, color = ink) => page.drawText(safe(value), { x, y: top, size, font: strong ? bold : regular, color });
  const header = (first: boolean) => {
    text("PROOMAHAN / D'PARK CITY", 36, 560, 10, true, teal);
    text(report.title, 36, 533, 21, true);
    text(`${report.period}  |  Data contoh - bukan laporan keuangan produksi`, 36, 515, 9, false, muted);
    y = first ? 479 : 485;
    if (first && report.details) { for (const detail of report.details) { for (const line of wrap(detail, 770)) { text(line, 36, y, 9); y -= 13; } } y -= 12; }
    if (first) { report.summary.forEach((line, index) => text(line, 36 + index * 193, y, 9, true)); y -= 34; }
    page.drawRectangle({ x: 36, y: y - 12, width: 770, height: 26, color: rgb(0.9, 0.95, 0.93) });
    let x = 43; report.headers.forEach((label, index) => { text(label, x, y - 2, 8, true, teal); x += widths[index]; }); y -= 30;
  };
  const wrap = (value: string, width: number) => {
    const output: string[] = [];
    for (const paragraph of safe(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (line && regular.widthOfTextAtSize(`${line} ${word}`, 8) > width - 14) { output.push(line); line = ""; }
        if (regular.widthOfTextAtSize(word, 8) > width - 14) {
          for (const char of word) { if (line && regular.widthOfTextAtSize(line + char, 8) > width - 14) { output.push(line); line = ""; } line += char; }
        } else line += `${line ? " " : ""}${word}`;
      }
      output.push(line);
    }
    return output;
  };
  header(true);
  if (!report.rows.length) text("Tidak ada transaksi untuk periode ini.", 43, y, 10);
  for (const row of report.rows) {
    const cells = row.map((value, index) => wrap(value, widths[index]));
    const height = Math.max(...cells.map(lines => lines.length)) * 11 + 15;
    if (y - height < 45) { page = document.addPage([842, 595]); header(false); }
    let x = 43;
    cells.forEach((lines, index) => { lines.forEach((line, n) => text(line, x, y - n * 11, 8)); x += widths[index]; });
    y -= height; page.drawLine({ start: { x: 36, y: y + 13 }, end: { x: 806, y: y + 13 }, thickness: 0.5, color: rgb(0.88, 0.91, 0.91) });
  }
  const pages = document.getPages(); pages.forEach((item, index) => { page = item; text(`Proomahan - pratinjau | ${index + 1} / ${pages.length}`, 36, 23, 8, false, muted); });
  document.setTitle(`${report.title} - ${report.period}`); document.setAuthor("Proomahan");
  return document.save();
}
export async function downloadReport(report: PdfReport) {
  const bytes = await makeReportPdf(report);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = (report.fileName || `${report.title}-${report.period}.pdf`).replace(/[^a-zA-Z0-9.-]/g, "-"); link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

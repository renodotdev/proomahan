import { PERIOD, remaining, type Demo } from "../../lib/demo.ts";
import { itemBalances } from "../../lib/allocations.ts";
import { DEFAULT_TEMPLATES } from "../../lib/communications.ts";

export function createDemo(): Demo {
  const names = ["Andi Pratama", "Dewi Lestari", "Rizky Saputra", "Maya Anggraini", "Hendra Wijaya", "Putri Amelia", "Agus Setiawan", "Rina Wulandari", "Dimas Nugraha", "Sinta Maharani", "Arif Hidayat", "Budi Santoso", "Fitri Handayani", "Bayu Permana", "Nina Kartika", "Reza Ramadhan", "Yuni Astuti", "Doni Kurniawan", "Laras Puspita", "Fajar Prasetyo", "Dian Safitri", "Ilham Fauzi", "Wulan Sari", "Taufik Akbar"];
  const units = Array.from({ length: 48 }, (_, i) => ({ id: `${"ABC"[Math.floor(i / 16)]}-${String(i % 16 + 1).padStart(2, "0")}`, number: `${"ABC"[Math.floor(i / 16)]}-${String(i % 16 + 1).padStart(2, "0")}`, cluster: ["Akasia", "Bougenville", "Cendana"][Math.floor(i / 16)], owner: i === 11 ? "Sari Pertiwi" : names[i % names.length], occupant: i < 42 ? names[i % names.length] : "", occupied: i < 42, tenure: i % 4 === 3 ? "Disewakan" : "Dihuni pemilik", since: i === 11 ? "1 Juli 2026" : "1 Januari 2026" }));
  const fees = [
    { id: "dues", name: "Iuran warga", category: "Iuran lingkungan", amount: 75000 },
    { id: "clean", name: "Kebersihan", category: "Layanan lingkungan", amount: 50000 },
    { id: "security", name: "Keamanan", category: "Layanan lingkungan", amount: 100000 },
    { id: "water", name: "Air", category: "Utilitas", amount: 75000 },
  ].map(f => ({ ...f, frequency: "Bulanan", scope: "Semua unit", payer: "Penghuni utama", vacancy: "Tidak ditagih", active: f.id !== "water" }));
  const invoices = units.filter(u => u.occupied).map((unit, i) => ({ id: `INV-2026-${String(i + 1).padStart(4, "0")}`, unitId: unit.id, person: unit.occupant, period: PERIOD, due: "10 Nov 2026", items: fees.map(f => ({ name: f.name, amount: f.amount, ...(f.id === "water" ? { chargeType: "water" as const } : {}) })), paid: [11, 30, 31, 32].includes(i) ? 100000 : i < 30 ? 300000 : 0 }));
  // These opening item allocations belong to the fictional seed, not migrated resident records.
  const allocatedInvoices = invoices.map(invoice => ({ ...invoice, itemPaid: invoice.paid === 300000 ? [75000, 50000, 100000, 75000] : invoice.paid === 100000 ? [75000, 25000, 0, 0] : [0, 0, 0, 0] }));
  return { version: 5, waterReadings: [], cashEntries: [], openingBalance: 0, legacyIncome: invoices.reduce((sum, invoice) => sum + invoice.paid, 0), templates: DEFAULT_TEMPLATES.map(t => ({ ...t })), clusters: [
    { id: "cluster-akasia", code: "AKS", name: "Akasia", archived: false },
    { id: "cluster-bougenville", code: "BGV", name: "Bougenville", archived: false },
    { id: "cluster-cendana", code: "CDN", name: "Cendana", archived: false },
  ], units, fees, invoices: allocatedInvoices,
    payments: [30, 33, 35].map((index, i) => ({ id: `PAY-2026-00${i + 1}`, invoiceId: invoices[index].id, amount: remaining(invoices[index]), method: i === 2 ? "Tunai" : "Transfer bank", date: "7 Nov 2026", reference: i === 2 ? "Diserahkan ke petugas kas contoh" : `TRX-CONTOH-${1032 + i}`, proof: i === 2 ? "" : "bukti-transfer-contoh.jpg", status: "pending", origin: "resident", allocations: itemBalances(allocatedInvoices[index]).filter(item => item.outstanding > 0).map(item => ({ itemIndex: item.itemIndex, amount: item.outstanding })) })),
    requests: [
      { id: "SR-001", kind: "letter", title: "Surat keterangan domisili", person: "Budi Santoso", unitId: "A-12", detail: "Keperluan administrasi tempat kerja.", status: "under_review", date: "6 Nov 2026", events: ["6 Nov · Pengajuan diterima", "7 Nov · Sedang ditinjau pengurus"] },
      { id: "SR-002", kind: "letter", title: "Surat pengantar", person: "Dewi Lestari", unitId: "A-02", detail: "Keperluan administrasi kependudukan.", status: "submitted", date: "7 Nov 2026", events: ["7 Nov · Pengajuan diterima"] },
      { id: "LP-001", kind: "report", title: "Lampu jalan di depan A-12 padam", person: "Budi Santoso", unitId: "A-12", detail: "Lampu jalan tidak menyala sejak kemarin malam. Mohon pemeriksaan petugas.", status: "under_review", date: "6 Nov 2026", events: ["6 Nov · Permintaan diterima", "7 Nov · Diteruskan kepada petugas lingkungan"] },
      { id: "LP-002", kind: "report", title: "Saluran air perlu dibersihkan", person: "Laras Puspita", unitId: "B-03", detail: "Aliran air melambat setelah hujan.", status: "submitted", date: "7 Nov 2026", events: ["7 Nov · Permintaan diterima"] },
      { id: "TM-001", kind: "guest", title: "Kunjungan keluarga — Rudi", person: "Budi Santoso", unitId: "A-12", detail: "8 November 2026, 10.00–14.00 · Kendaraan B 1234 XYZ", status: "acknowledged", date: "7 Nov 2026", events: ["7 Nov · Laporan tamu diterima", "7 Nov · Diketahui petugas keamanan"] },
    ],
    posts: [
      { id: "news-1", title: "Lingkungan bersih, akhir pekan lebih nyaman", category: "Kegiatan warga", audience: "Semua warga", date: "7 November 2026", art: "garden", body: "Mari ikut kerja bakti bersama pada Minggu, 15 November 2026 pukul 07.00. Kita berkumpul di taman lingkungan untuk membersihkan area bersama dan merawat tanaman. Bawa sarung tangan dan semangat kebersamaan. Jadwal ini merupakan contoh untuk pratinjau." },
      { id: "news-2", title: "Perawatan gerbang utama", category: "Pengumuman", audience: "Publik", date: "5 November 2026", art: "gate", body: "Perawatan rutin gerbang akan dilakukan pada 12 November pukul 09.00–11.00. Silakan hubungi petugas keamanan untuk arahan akses. Pengumuman ini menggunakan data contoh." },
      { id: "news-3", title: "Ruang diskusi untuk lingkungan kita", category: "Agenda lingkungan", audience: "Semua warga", date: "3 November 2026", art: "community", body: "Forum warga bulan ini membahas rencana perbaikan fasilitas dan usulan kegiatan lingkungan. Kirim usulan Anda melalui menu Layanan. Agenda ini merupakan contoh." },
    ],
    assignments: [
      { id: "platform-founder", userId: "admin", tenantId: null, role: "super_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: null, revokedAt: null, assignedBy: "admin", reason: "Penyiapan platform contoh" },
      { id: "elected-treasurer", userId: "account-11", tenantId: "dpark-city", role: "billing_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: "2027-01-01T00:00:00+07:00", revokedAt: null, assignedBy: "admin", reason: "Hasil pemilihan pengurus 2026" },
      { id: "elected-residents", userId: "account-0", tenantId: "dpark-city", role: "neighborhood_admin", startsAt: "2026-01-01T00:00:00+07:00", endsAt: "2027-01-01T00:00:00+07:00", revokedAt: null, assignedBy: "admin", reason: "Hasil pemilihan pengurus 2026" },
    ],
    roleEvents: [],
    accounts: [
      { id: "admin", name: "Nadia Putri", contact: "admin@example.test", unit: "—", resident: false, active: true },
      ...units.filter(u => u.occupied).slice(0, 16).map((u, i) => ({ id: `account-${i}`, name: u.occupant, contact: `warga${i + 1}@example.test`, unit: u.id, resident: true, active: true })),
    ],
  };
}


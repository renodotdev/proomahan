export const publicPageFields = [
  { key: "headline", label: "Judul halaman", max: 140 },
  { key: "intro", label: "Pengantar", max: 700 },
  { key: "community", label: "Informasi paguyuban", max: 1500 },
  { key: "contact", label: "Kontak publik", max: 300 },
] as const;

export type PublicPageContent = Partial<Record<typeof publicPageFields[number]["key"], string>>;

import type { Metadata } from "next";
import "./globals.css";
import RemovePreviewData from "@/components/remove-preview-data";

export const metadata: Metadata = {
  title: "Proomahan — D'Park City",
  description: "Platform pengelolaan lingkungan D'Park City: data warga, hunian, dan layanan dalam satu tempat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><RemovePreviewData />{children}</body></html>;
}

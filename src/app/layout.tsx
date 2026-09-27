import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// Inter mengikuti referensi desain (nobruf/shadcn-landing-page).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "MomenKita",
  description: "Undangan digital, buku tamu QR, dan kamera POV tamu dalam satu platform.",
};

// Layout ini juga membungkus halaman kamera tamu (target JS awal ≤ 150KB gzip, PRD §8):
// jangan tambahkan provider atau client berat di sini.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={cn("h-full antialiased font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

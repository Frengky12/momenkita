"use client";

import { Inter } from "next/font/google";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";
import "./globals.css";

// Root layout ikut tergantikan, jadi font dan judul tab dipasang ulang di sini.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Error render yang tidak tertangkap di mana pun menggantikan seluruh halaman, termasuk root layout.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error, error.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <html lang="id" className={inter.variable}>
      <head>
        <title>Terjadi kesalahan · MomenKita</title>
      </head>
      <body className="flex min-h-screen items-center justify-center bg-background px-4 font-sans text-foreground">
        <main className="flex max-w-sm flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold">Terjadi kesalahan</h1>
          <p className="text-sm text-muted-foreground">
            Halaman ini gagal dimuat. Coba muat ulang; data yang sudah tersimpan tidak hilang.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Muat ulang
          </button>
        </main>
      </body>
    </html>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { mapImportRows, type ImportRow, type SessionRef } from "@/lib/guests";
import { importGuests, type ImportResult } from "./actions";

type Parsed = { fileName: string; rows: ImportRow[]; error?: string };

// Parser dimuat saat file dipilih, jadi tidak membebani halaman bagi host yang tidak mengimpor.
async function readTable(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    // Delimiter dideteksi otomatis: Excel berbahasa Indonesia menyimpan CSV dengan titik koma.
    const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
    return result.data;
  }
  const { readSheet } = await import("read-excel-file/browser");
  const data = await readSheet(file);
  return data.map((row) =>
    row.map((cell) => (cell == null ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell))),
  );
}

export function ImportGuests({ eventId, sessions }: { eventId: string; sessions: SessionRef[] }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const invalid = parsed?.rows.filter((r) => r.errors.length) ?? [];
  const ready = parsed && !parsed.error && parsed.rows.length > 0 && invalid.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Isi <a href="/template-tamu-momenkita.xlsx" download className="font-medium text-primary underline underline-offset-4">template Excel</a>{" "}
        (lihat sheet Petunjuk), lalu unggah di sini. CSV juga diterima.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="guest-file">File tamu (.xlsx atau .csv)</Label>
        <input
          id="guest-file"
          type="file"
          accept=".xlsx,.csv"
          className="text-sm file:mr-3 file:h-11 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setResult(null);
            if (!file) return setParsed(null);
            setReading(true);
            try {
              const table = await readTable(file);
              setParsed({ fileName: file.name, ...mapImportRows(table, sessions) });
            } catch {
              setParsed({ fileName: file.name, rows: [], error: "File tidak bisa dibaca. Pastikan formatnya .xlsx atau .csv." });
            } finally {
              setReading(false);
            }
          }}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {reading && <p className="text-sm text-muted-foreground">Membaca file...</p>}

        {parsed?.error && (
          <Alert variant="destructive">
            <AlertDescription>{parsed.error}</AlertDescription>
          </Alert>
        )}

        {parsed && !parsed.error && parsed.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada baris tamu di {parsed.fileName}. Isi data mulai baris ke-2.</p>
        )}

        {invalid.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">
                {invalid.length} baris perlu diperbaiki di file, lalu unggah ulang. Belum ada tamu yang ditambahkan.
              </p>
              <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto">
                {invalid.slice(0, 50).map((r) => (
                  <li key={r.row}>
                    Baris {r.row}: {r.errors.join(", ")}
                  </li>
                ))}
                {invalid.length > 50 && <li>dan {invalid.length - 50} baris lainnya.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {ready && (
          <Button
            type="button"
            className="h-11 self-start"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await importGuests(eventId, parsed.rows.map((r) => r.fields));
                setResult(res);
                if (res.status === "done") setParsed(null);
              })
            }
          >
            {pending ? "Mengimpor..." : `Impor ${parsed.rows.length} tamu`}
          </Button>
        )}

        {result?.status === "done" && <p className="text-sm font-medium">{result.inserted} tamu berhasil ditambahkan.</p>}
        {result?.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

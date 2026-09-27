"use client";

import { downloadZip } from "client-zip";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { StaffClient } from "@/lib/staff/access";

// Unduh album sebagai ZIP yang dibuat di browser (PRD §5.5): tanpa kompresi ulang dan tanpa beban server.
// Chrome/Edge desktop menulis langsung ke disk (File System Access), jadi 1.000 foto tidak menumpuk di memori.
// Browser lain menerima ZIP per 300 foto.

type Variant = "display" | "original";
type ManifestFile = { id: string; uploader_name: string; caption: string | null; created_at: string; ext: string; url: string };
type SaveFilePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable: () => Promise<WritableStream<Uint8Array>>;
}>;

const PAGE = 200;
const PART_SIZE = 300;

type Status =
  | { kind: "idle" }
  | { kind: "listing" }
  | { kind: "downloading"; done: number; total: number; part?: { index: number; count: number } }
  | { kind: "finished"; total: number; skipped: number; parts: number }
  | { kind: "error"; message: string };

function safeName(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tamu";
}

// Nama file berurutan waktu, mudah dipilah fotografer: 0001_rina_20260926-2338.webp
function fileName(index: number, file: ManifestFile, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(file.created_at))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const stamp = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
  return `${String(index + 1).padStart(4, "0")}_${safeName(file.uploader_name).toLowerCase()}_${stamp}.${file.ext}`;
}

async function fetchWithRetry(url: string, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return res;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

export function ZipDownload({
  client,
  eventId,
  slug,
  timezone,
  total,
  allowOriginal,
}: {
  client: StaffClient;
  eventId: string;
  slug: string;
  timezone: string;
  total: number;
  allowOriginal: boolean;
}) {
  const [variant, setVariant] = useState<Variant>("display");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const busy = status.kind === "listing" || status.kind === "downloading";

  async function manifest(signal: AbortSignal) {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) throw new Error("no_session");
    const files: ManifestFile[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetch(`/api/staff/events/${eventId}/download?variant=${variant}&offset=${offset}&limit=${PAGE}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const page = ((await res.json()) as { files: ManifestFile[] }).files;
      files.push(...page);
      if (page.length < PAGE) return files;
    }
  }

  // Foto diambil satu per satu tepat sebelum ditulis ke ZIP; foto yang tetap gagal setelah 3 percobaan dilewati.
  async function* entries(files: ManifestFile[], startIndex: number, signal: AbortSignal, onProgress: () => void, onSkip: () => void) {
    for (const [i, file] of files.entries()) {
      const res = await fetchWithRetry(file.url, signal);
      if (!res) {
        onSkip();
        continue;
      }
      yield { name: fileName(startIndex + i, file, timezone), lastModified: new Date(file.created_at), input: res };
      onProgress();
    }
  }

  async function start() {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const suffix = variant === "original" ? "asli" : "tampilan";
    // Dialog simpan harus dibuka langsung dari klik, sebelum ada proses async lain.
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    let writable: WritableStream<Uint8Array> | null = null;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: `${slug}-foto-${suffix}.zip`, types: [{ description: "Arsip ZIP", accept: { "application/zip": [".zip"] } }] });
        writable = await handle.createWritable();
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        writable = null;
      }
    }

    let done = 0;
    let skipped = 0;
    try {
      setStatus({ kind: "listing" });
      const files = await manifest(signal);
      if (!files.length) {
        setStatus({ kind: "error", message: "Belum ada foto yang bisa diunduh." });
        return;
      }
      const progress = (part?: { index: number; count: number }) => setStatus({ kind: "downloading", done, total: files.length, part });

      if (writable) {
        progress();
        const zip = downloadZip(entries(files, 0, signal, () => { done++; progress(); }, () => skipped++));
        await zip.body!.pipeTo(writable, { signal });
        setStatus({ kind: "finished", total: files.length - skipped, skipped, parts: 1 });
        return;
      }

      const count = Math.ceil(files.length / PART_SIZE);
      for (let index = 0; index < count; index++) {
        const part = files.slice(index * PART_SIZE, (index + 1) * PART_SIZE);
        const info = count > 1 ? { index: index + 1, count } : undefined;
        progress(info);
        const blob = await downloadZip(entries(part, index * PART_SIZE, signal, () => { done++; progress(info); }, () => skipped++)).blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = count > 1 ? `${slug}-foto-${suffix}-bagian-${index + 1}.zip` : `${slug}-foto-${suffix}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setStatus({ kind: "finished", total: files.length - skipped, skipped, parts: count });
    } catch (error) {
      if (signal.aborted) {
        setStatus({ kind: "idle" });
        return;
      }
      const message = (error as Error).message === "403" ? "Akses unduhan ditolak. Link staf mungkin sudah berakhir." : "Unduhan terputus. Periksa koneksi lalu coba lagi.";
      setStatus({ kind: "error", message });
      await writable?.abort().catch(() => {});
    } finally {
      abortRef.current = null;
    }
  }

  if (total === 0) return <p className="text-sm text-muted-foreground">Belum ada foto yang bisa diunduh. Foto muncul di sini setelah disetujui.</p>;

  const numberFormat = new Intl.NumberFormat("id-ID");
  return (
    <div className="flex flex-col gap-4">
      {allowOriginal && (
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1 text-sm font-medium">Kualitas</legend>
          {(
            [
              ["display", "Tampilan (maks. 1920px)", "Ukuran kecil, cocok untuk dibagikan."],
              ["original", "Asli", "Resolusi penuh dari kamera tamu. Ukuran jauh lebih besar."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary">
              <input type="radio" name="zip-variant" value={value} checked={variant === value} onChange={() => setVariant(value)} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-11" disabled={busy} onClick={start}>
          {busy ? "Sedang mengunduh..." : `Unduh ZIP (${numberFormat.format(total)} foto)`}
        </Button>
        {busy && (
          <Button type="button" variant="outline" className="h-11" onClick={() => abortRef.current?.abort()}>
            Batalkan
          </Button>
        )}
      </div>

      <div aria-live="polite" className="text-sm">
        {status.kind === "idle" && (
          <p className="text-xs text-muted-foreground">
            Di Chrome atau Edge komputer, ZIP ditulis langsung ke folder pilihan Anda. Di browser lain, album dibagi per {PART_SIZE} foto per file.
          </p>
        )}
        {status.kind === "listing" && <p>Menyiapkan daftar foto...</p>}
        {status.kind === "downloading" && (
          <div className="flex flex-col gap-2">
            <p>
              Mengunduh {numberFormat.format(status.done)} dari {numberFormat.format(status.total)} foto
              {status.part ? ` (bagian ${status.part.index} dari ${status.part.count})` : ""}. Biarkan halaman ini tetap terbuka.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.done} aria-label="Kemajuan unduhan">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(status.done / status.total) * 100}%` }} />
            </div>
          </div>
        )}
        {status.kind === "finished" && (
          <p>
            Selesai: {numberFormat.format(status.total)} foto{status.parts > 1 ? ` dalam ${status.parts} file ZIP` : ""}.
            {status.skipped > 0 && ` ${status.skipped} foto gagal diunduh; ulangi unduhan untuk mencobanya lagi.`}
          </p>
        )}
        {status.kind === "error" && <p className="text-destructive">{status.message}</p>}
      </div>
    </div>
  );
}

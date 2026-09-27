"use client";

import { useEffect, useMemo, useState } from "react";
import type { QueueEntry } from "@/lib/camera/queue";

function statusLabel(entry: QueueEntry) {
  if (entry.stage === "failed") return entry.error ?? "Gagal dikirim";
  if (entry.stage === "queued") return entry.attempts > 0 ? "Menunggu sinyal, dicoba lagi otomatis" : "Menunggu dikirim";
  if (entry.stage === "confirmed") return "Terkirim, file asli sedang diunggah";
  return entry.photoStatus === "pending" ? "Terkirim, menunggu persetujuan panitia" : "Terkirim";
}

function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- blob URL lokal
  return <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />;
}

export function MyPhotos({
  entries,
  onClose,
  onRetry,
  onDelete,
}: {
  entries: QueueEntry[];
  onClose: () => void;
  onRetry: (entry: QueueEntry) => void;
  onDelete: (entry: QueueEntry) => Promise<void>;
}) {
  // Hapus butuh beberapa detik (data + file R2); tombol dikunci agar tidak ditekan berulang.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="my-photos-title" className="fixed inset-0 z-20 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 id="my-photos-title" className="text-lg font-semibold">
          Foto saya
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 px-3 font-medium" autoFocus>
          Tutup
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-10 text-center text-white/75">Belum ada foto. Foto yang kamu ambil akan muncul di sini.</p>
      ) : (
        <ul className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-6 sm:grid-cols-3">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2">
              <Thumb blob={entry.thumb} />
              <p className="text-xs text-white/80">{statusLabel(entry)}</p>
              <div className="flex gap-2">
                {entry.stage === "failed" && (
                  <button type="button" onClick={() => onRetry(entry)} className="min-h-11 flex-1 rounded-full border border-white/60 text-sm">
                    Coba lagi
                  </button>
                )}
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={async () => {
                    if (!window.confirm("Hapus foto ini? Foto juga hilang dari layar acara dan galeri.")) return;
                    setDeletingId(entry.id);
                    await onDelete(entry);
                    setDeletingId(null);
                  }}
                  className="min-h-11 flex-1 rounded-full border border-white/60 text-sm disabled:opacity-60"
                >
                  {deletingId === entry.id ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

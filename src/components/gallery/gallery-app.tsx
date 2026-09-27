"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryPhoto } from "@/lib/gallery";

// Galeri tamu memakai polling (PRD §6.3): foto baru dicek berkala selama halaman terbuka, tanpa koneksi Realtime.
const POLL_MS = 45_000;

const REASONS = [
  { value: "privacy", label: "Saya ada di foto ini dan ingin foto ini dihapus" },
  { value: "inappropriate", label: "Foto tidak pantas" },
  { value: "other", label: "Alasan lain" },
] as const;

type ReportState = { photoId: string; reason: string; status: "choosing" | "sending" | "sent" | "error" } | null;

const pillButton =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-(--inv-field) px-5 text-sm font-medium transition-colors hover:bg-(--inv-band) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text) disabled:opacity-60";

export function GalleryApp({ slug, timezone, initial }: { slug: string; timezone: string; initial: { photos: GalleryPhoto[]; hasMore: boolean } }) {
  const [photos, setPhotos] = useState(initial.photos);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const time = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone });

  async function loadMore() {
    const oldest = photos.at(-1);
    if (!oldest) return;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/events/${slug}/gallery?before=${encodeURIComponent(oldest.created_at)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { photos: GalleryPhoto[]; hasMore: boolean };
      setPhotos((list) => [...list, ...page.photos.filter((p) => !list.some((x) => x.id === p.id))]);
      setHasMore(page.hasMore);
    } catch {
      setLoadError(true);
    }
    setLoadingMore(false);
  }

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const newest = photosRef.current[0]?.created_at;
    try {
      const res = await fetch(`/api/events/${slug}/gallery${newest ? `?after=${encodeURIComponent(newest)}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const { photos: incoming } = (await res.json()) as { photos: GalleryPhoto[] };
      const added = incoming.filter((p) => !photosRef.current.some((x) => x.id === p.id));
      if (!added.length) return;
      setPhotos((list) => [...added, ...list]);
      setFresh((n) => n + added.length);
      // Indeks foto yang sedang dibuka bergeser karena foto baru ditambahkan di depan.
      setOpenIndex((i) => (i === null ? i : i + added.length));
    } catch {
      // Polling berikutnya mencoba lagi.
    }
  }, [slug]);

  useEffect(() => {
    const id = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  if (!photos.length) {
    return <p className="py-16 text-center text-(--inv-muted)">Belum ada foto di galeri. Foto dari tamu akan muncul di sini setelah disetujui.</p>;
  }

  return (
    <>
      <p className="text-center text-sm text-(--inv-muted)" aria-live="polite">
        {fresh > 0 ? `${fresh} foto baru ditambahkan.` : `${photos.length}${hasMore ? "+" : ""} foto`}
      </p>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="block aspect-square w-full overflow-hidden rounded-md bg-(--inv-band) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
              aria-label={`Buka foto dari ${photo.uploader_name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
              <img src={photo.thumb_url} alt="" loading={index < 12 ? "eager" : "lazy"} className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={pillButton}>
            {loadingMore ? "Memuat..." : "Muat foto lainnya"}
          </button>
          {loadError && (
            <p role="alert" className="text-sm text-(--inv-error)">
              Foto gagal dimuat. Periksa koneksi lalu coba lagi.
            </p>
          )}
        </div>
      )}
      {openIndex !== null && photos[openIndex] && (
        <Lightbox
          slug={slug}
          photo={photos[openIndex]}
          time={time}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : null}
          onNext={openIndex < photos.length - 1 ? () => setOpenIndex(openIndex + 1) : null}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  slug,
  photo,
  time,
  onPrev,
  onNext,
  onClose,
}: {
  slug: string;
  photo: GalleryPhoto;
  time: (iso: string) => string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  const [report, setReport] = useState<ReportState>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const reportState = report?.photoId === photo.id ? report : null;

  async function sendReport() {
    if (!reportState) return;
    setReport({ ...reportState, status: "sending" });
    try {
      const res = await fetch(`/api/events/${slug}/gallery/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: photo.id, reason: reportState.reason }),
      });
      setReport({ ...reportState, status: res.ok ? "sent" : "error" });
    } catch {
      setReport({ ...reportState, status: "error" });
    }
  }

  const dark = "inline-flex min-h-11 items-center justify-center rounded-full border border-white/50 px-4 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lightbox-title" className="fixed inset-0 z-30 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <h2 id="lightbox-title" className="min-w-0 truncate text-sm font-semibold">
          {photo.uploader_name} · {time(photo.created_at)}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 px-3 font-medium" autoFocus>
          Tutup
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
        <img key={photo.id} src={photo.display_url} alt={photo.caption ?? `Foto dari ${photo.uploader_name}`} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
        {photo.caption && <p className="text-sm text-white/90">{photo.caption}</p>}
        {reportState ? (
          <div className="flex flex-col gap-3 rounded-xl bg-white/10 p-3">
            {reportState.status === "sent" ? (
              <p role="status">Terima kasih. Laporan sudah dikirim ke tuan rumah.</p>
            ) : (
              <>
                <fieldset className="flex flex-col gap-1" disabled={reportState.status === "sending"}>
                  <legend className="mb-1 text-sm font-semibold">Kenapa foto ini perlu ditinjau?</legend>
                  {REASONS.map((r) => (
                    <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name="report-reason"
                        value={r.value}
                        checked={reportState.reason === r.value}
                        onChange={() => setReport({ ...reportState, reason: r.value })}
                        className="size-4"
                      />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                {reportState.status === "error" && (
                  <p role="alert" className="text-sm text-amber-300">
                    Laporan gagal dikirim. Coba lagi.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={sendReport} disabled={!reportState.reason || reportState.status === "sending"} className={dark}>
                    {reportState.status === "sending" ? "Mengirim..." : "Kirim laporan"}
                  </button>
                  <button type="button" onClick={() => setReport(null)} className={dark}>
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} className={dark}>
                Sebelumnya
              </button>
              <button type="button" onClick={onNext ?? undefined} disabled={!onNext} className={dark}>
                Berikutnya
              </button>
            </div>
            <button type="button" onClick={() => setReport({ photoId: photo.id, reason: "", status: "choosing" })} className={dark}>
              Laporkan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

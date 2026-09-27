"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { processPhoto } from "@/lib/camera/processor";
import { GALLERY_MAX, MEDIA_KINDS, MUSIC_MAX_BYTES, musicTypeOf, type MediaKind } from "@/lib/invitation/media-kinds";
import type { InvitationMedia, MediaItem, MusicItem } from "@/lib/invitation/media";
import { confirmMediaUpload, confirmMusicUpload, deleteMedia, prepareMediaUpload, prepareMusicUpload } from "./media-actions";

type Status = { kind: MediaKind; text: string; error?: boolean } | null;

// Foto dikompres di browser dengan pipeline yang sama dengan kamera tamu (putar EXIF, WebP/JPEG, ≤ 400 KB),
// lalu diunggah langsung ke R2 lewat URL bertanda tangan. Server tidak pernah menerima file mentah.
export function MediaManager({ eventId, media }: { eventId: string; media: InvitationMedia }) {
  const [status, setStatus] = useState<Status>(null);
  const busy = status !== null && !status.error;

  async function upload(kind: Exclude<MediaKind, "music">, files: File[]) {
    for (const [index, file] of files.entries()) {
      const counter = files.length > 1 ? ` (${index + 1}/${files.length})` : "";
      try {
        setStatus({ kind, text: `Memproses foto${counter}...` });
        const out = await processPhoto({ source: file, filter: "asli", wantOriginal: false });
        setStatus({ kind, text: `Mengunggah${counter}...` });
        const prepared = await prepareMediaUpload(eventId, kind, out.format, { display: out.display.size, thumb: out.thumb.size });
        if (!prepared.ok) return setStatus({ kind, text: prepared.message, error: true });
        const puts = await Promise.all([
          fetch(prepared.displayUrl, { method: "PUT", headers: { "Content-Type": out.format }, body: out.display }),
          fetch(prepared.thumbUrl, { method: "PUT", headers: { "Content-Type": out.format }, body: out.thumb }),
        ]);
        if (puts.some((r) => !r.ok)) return setStatus({ kind, text: "Unggahan gagal. Periksa koneksi lalu coba lagi.", error: true });
        const confirmed = await confirmMediaUpload(eventId, prepared.mediaId, kind, out.format, { width: out.width, height: out.height });
        if (!confirmed.ok) return setStatus({ kind, text: confirmed.message, error: true });
      } catch {
        return setStatus({ kind, text: "Foto tidak bisa dibaca. Pilih file gambar JPG, PNG, WebP, atau HEIC.", error: true });
      }
    }
    setStatus(null);
  }

  async function uploadMusic(file: File, rightsConfirmed: boolean) {
    const type = musicTypeOf(file);
    if (!type) return setStatus({ kind: "music", text: "Format lagu harus MP3, M4A, atau AAC.", error: true });
    if (file.size > MUSIC_MAX_BYTES) return setStatus({ kind: "music", text: `Ukuran lagu ${(file.size / 1048576).toFixed(1)} MB, maksimal 8 MB.`, error: true });
    try {
      setStatus({ kind: "music", text: "Mengunggah lagu..." });
      const prepared = await prepareMusicUpload(eventId, type, file.size, rightsConfirmed);
      if (!prepared.ok) return setStatus({ kind: "music", text: prepared.message, error: true });
      const put = await fetch(prepared.url, { method: "PUT", headers: { "Content-Type": type }, body: file });
      if (!put.ok) return setStatus({ kind: "music", text: "Unggahan gagal. Periksa koneksi lalu coba lagi.", error: true });
      const confirmed = await confirmMusicUpload(eventId, prepared.mediaId, type);
      if (!confirmed.ok) return setStatus({ kind: "music", text: confirmed.message, error: true });
      setStatus(null);
    } catch {
      setStatus({ kind: "music", text: "Unggahan gagal. Periksa koneksi lalu coba lagi.", error: true });
    }
  }

  async function remove(kind: MediaKind, item: { id: string }) {
    if (!window.confirm(`Hapus ${MEDIA_KINDS[kind].label.toLowerCase()} ini?`)) return;
    setStatus({ kind, text: "Menghapus..." });
    const result = await deleteMedia(eventId, item.id);
    setStatus(result.ok ? null : { kind, text: result.message, error: true });
  }

  const single = (kind: Exclude<MediaKind, "gallery" | "music">) => (
    <Slot
      kind={kind}
      items={media[kind] ? [media[kind]] : []}
      max={1}
      busy={busy}
      status={status?.kind === kind ? status : null}
      onFiles={(files) => upload(kind, files.slice(0, 1))}
      onRemove={(item) => remove(kind, item)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {single("cover")}
      <div className="grid gap-6 sm:grid-cols-2">
        {single("groom")}
        {single("bride")}
      </div>
      <Slot
        kind="gallery"
        items={media.gallery}
        max={GALLERY_MAX}
        busy={busy}
        status={status?.kind === "gallery" ? status : null}
        onFiles={(files) => upload("gallery", files.slice(0, GALLERY_MAX - media.gallery.length))}
        onRemove={(item) => remove("gallery", item)}
      />
      {single("qris")}
      <MusicSlot
        music={media.music}
        busy={busy}
        status={status?.kind === "music" ? status : null}
        onFile={uploadMusic}
        onRemove={(item) => remove("music", item)}
      />
    </div>
  );
}

// Lagu diunggah apa adanya (tanpa kompresi) dan hanya setelah host menyatakan berhak memakainya.
function MusicSlot({
  music,
  busy,
  status,
  onFile,
  onRemove,
}: {
  music: MusicItem | null;
  busy: boolean;
  status: Status;
  onFile: (file: File, rightsConfirmed: boolean) => void;
  onRemove: (item: MusicItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [rights, setRights] = useState(false);
  const { label, hint } = MEDIA_KINDS.music;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {music && (
        <div className="flex flex-col gap-2">
          {/* preload="none": host baru mengunduh lagu saat menekan putar. */}
          <audio controls preload="none" src={music.url} className="w-full max-w-md" aria-label="Putar musik latar" />
          <Button type="button" variant="outline" className="h-11 w-fit" disabled={busy} onClick={() => onRemove(music)}>
            Hapus lagu
          </Button>
        </div>
      )}
      <label htmlFor={`${id}-rights`} className="flex min-h-11 items-start gap-3 text-sm">
        <input id={`${id}-rights`} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span>Saya berhak memakai lagu ini di undangan dan bertanggung jawab atas hak ciptanya.</span>
      </label>
      <input
        ref={input}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,.mp3,.m4a,.aac"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onFile(file, rights);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-11" disabled={busy || !rights} onClick={() => input.current?.click()}>
          {music ? "Ganti lagu" : "Pilih lagu"}
        </Button>
        {!rights && !status && <p className="text-sm text-muted-foreground">Centang pernyataan di atas untuk memilih lagu.</p>}
        {status && (
          <p aria-live="polite" className={status.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Slot({
  kind,
  items,
  max,
  busy,
  status,
  onFiles,
  onRemove,
}: {
  kind: MediaKind;
  items: MediaItem[];
  max: number;
  busy: boolean;
  status: Status;
  onFiles: (files: File[]) => void;
  onRemove: (item: MediaItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { label, hint } = MEDIA_KINDS[kind];
  const full = items.length >= max;
  const addLabel = max === 1 ? (items.length ? "Ganti foto" : "Pilih foto") : "Tambah foto";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">
          {label}
          {max > 1 && <span className="font-normal text-muted-foreground"> ({items.length}/{max})</span>}
        </p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {items.length > 0 && (
        <ul className={max > 1 ? "grid grid-cols-3 gap-2 sm:grid-cols-4" : "flex"}>
          {items.map((item) => (
            <li key={item.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
              <img
                src={item.thumbUrl}
                alt={label}
                width={item.width}
                height={item.height}
                className={max > 1 ? "aspect-square w-full rounded-lg border object-cover" : "max-h-48 w-auto rounded-lg border object-contain"}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-11 w-full"
                disabled={busy}
                onClick={() => onRemove(item)}
                aria-label={`Hapus ${label.toLowerCase()}`}
              >
                Hapus
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {!(max > 1 && full) && (
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => input.current?.click()}>
            {addLabel}
          </Button>
        )}
        {max > 1 && full && <p className="text-sm text-muted-foreground">Galeri penuh. Hapus satu foto untuk menambah.</p>}
        {status && (
          <p aria-live="polite" className={status.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

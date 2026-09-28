"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/invitation/media";
import { confirmStoryPhoto, removeStoryPhoto } from "./media-actions";
import { uploadPhoto } from "./upload-photo";

// Foto satu bab Love Story. Tersimpan langsung saat dipilih (tidak menunggu tombol Simpan Love Story), sehingga
// hanya muncul untuk bab yang sudah tersimpan. Tombol di sini type="button" agar tidak mengirim form bab.
export function StoryPhoto({ eventId, chapterId, title, photo }: { eventId: string; chapterId: string; title: string; photo: MediaItem | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const busy = status !== null && !status.error;

  async function onFile(file: File) {
    const result = await uploadPhoto(
      eventId,
      "story",
      file,
      (step) => setStatus({ text: step === "process" ? "Memproses foto..." : "Mengunggah..." }),
      (mediaId, format, dimensions) => confirmStoryPhoto(eventId, mediaId, chapterId, format, dimensions),
    );
    setStatus(result.ok ? null : { text: result.message, error: true });
  }

  async function onRemove() {
    if (!window.confirm(`Hapus foto bab "${title}"?`)) return;
    setStatus({ text: "Menghapus..." });
    const result = await removeStoryPhoto(eventId, chapterId);
    setStatus(result.ok ? null : { text: result.message, error: true });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Foto bab (opsional)</p>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL R2
        <img src={photo.thumbUrl} alt={`Foto bab ${title}`} width={photo.width} height={photo.height} className="max-h-40 w-fit rounded-lg border object-contain" />
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => input.current?.click()}>
          {photo ? "Ganti foto" : "Pilih foto"}
        </Button>
        {photo && (
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={onRemove}>
            Hapus foto
          </Button>
        )}
        {status && (
          <p aria-live="polite" className={status.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

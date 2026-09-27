"use client";

import { useRef, useState } from "react";
import type { MediaItem } from "@/lib/invitation/media";

const control =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/90 px-4 text-sm font-semibold text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

// Grid thumbnail; ketukan membuka foto ukuran tampilan di <dialog> bawaan browser (Esc menutup, fokus dikembalikan otomatis).
export function Gallery({ items, alt }: { items: MediaItem[]; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  // Foto besar baru dirender saat penampil dibuka, agar tidak ikut terunduh oleh setiap tamu yang hanya menggulir.
  const [open, setOpen] = useState(false);
  const current = items[index];
  const step = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length);

  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <li key={item.id} className={i === 0 && items.length % 2 === 1 ? "col-span-2" : undefined}>
            <button
              type="button"
              className="block w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
              onClick={() => {
                setIndex(i);
                setOpen(true);
                dialog.current?.showModal();
              }}
              aria-label={`Buka foto ${i + 1} dari ${items.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
              <img
                src={item.thumbUrl}
                alt=""
                width={item.width}
                height={item.height}
                loading="lazy"
                className={`w-full object-cover ${i === 0 && items.length % 2 === 1 ? "aspect-[4/3]" : "aspect-square"}`}
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        aria-label={`${alt}, foto ${index + 1} dari ${items.length}`}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/90"
        onClose={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        {open && current && (
          <div className="flex h-dvh w-screen flex-col items-center justify-center gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
            <img src={current.url} alt={`${alt}, foto ${index + 1}`} width={current.width} height={current.height} className="max-h-[80dvh] w-auto max-w-full rounded-lg object-contain" />
            <div className="flex items-center gap-3">
              {items.length > 1 && (
                <button type="button" className={control} onClick={() => step(-1)} aria-label="Foto sebelumnya">
                  ‹
                </button>
              )}
              <p className="min-w-16 text-center text-sm text-white tabular-nums">
                {index + 1} / {items.length}
              </p>
              {items.length > 1 && (
                <button type="button" className={control} onClick={() => step(1)} aria-label="Foto berikutnya">
                  ›
                </button>
              )}
              <button type="button" className={control} onClick={() => dialog.current?.close()} autoFocus>
                Tutup
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// Browser HP melarang audio berbunyi sebelum ada sentuhan, jadi musik dimulai oleh klik pada elemen [data-music-start]
// (tombol "Buka undangan"): play() dipanggil langsung di handler klik agar tetap dianggap aksi pengguna.
// Tombol mengambang memenuhi WCAG 1.4.2 (audio > 3 detik harus bisa dihentikan). Musik jeda saat tab disembunyikan.
// Pratinjau host berperilaku sama dengan undangan tamu, agar host merasakan pengalaman yang sama.
export function MusicPlayer({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    let resumeOnVisible = false;

    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-music-start]") && el.paused) {
        el.play().catch(() => undefined);
      }
    };
    const onVisibility = () => {
      if (document.hidden && !el.paused) {
        resumeOnVisible = true;
        el.pause();
      } else if (!document.hidden && resumeOnVisible) {
        resumeOnVisible = false;
        el.play().catch(() => undefined);
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (failed) return null;

  return (
    <>
      <audio
        ref={audio}
        src={url}
        preload="none"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        aria-label={playing ? "Jeda musik" : "Putar musik"}
        aria-pressed={playing}
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (el.paused) el.play().catch(() => setFailed(true));
          else el.pause();
        }}
        className="fixed right-4 bottom-4 z-20 inline-flex size-12 items-center justify-center rounded-full bg-(--inv-button) text-(--inv-button-text) shadow-md transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="16" r="2.5" />
          </svg>
        )}
      </button>
    </>
  );
}

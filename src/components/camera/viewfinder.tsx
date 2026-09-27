"use client";

import { useEffect, useRef, useState } from "react";
import { FILTERS, cssFilter, type FilterId } from "@/lib/camera/filters";
import type { ProcessOutput } from "@/lib/camera/process";
import { processPhoto } from "@/lib/camera/processor";

// Keputusan produk #6: tidak ada unggah dari galeri. Pemilih file cadangan kadang tetap menawarkan galeri,
// jadi file yang dibuat lebih dari 5 menit sebelum dipilih ditolak (pengaman best-effort, PRD §5.3).
const MAX_FILE_AGE_MS = 5 * 60 * 1000;
const IN_APP_BROWSER = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i;

type Mode = "starting" | "live" | "fallback" | "denied";

// mediaDevices tidak ada di konteks tidak aman (http non-localhost) dan di sebagian in-app browser.
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === "function";

export function Viewfinder({
  couple,
  luxury,
  status,
  photoCount,
  onCaptured,
  onOpenPhotos,
}: {
  couple: string;
  luxury: boolean;
  status: string;
  photoCount: number;
  onCaptured: (output: ProcessOutput) => void;
  onOpenPhotos: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(() => (cameraSupported() ? "starting" : "fallback"));
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [filter, setFilter] = useState<FilterId>("asli");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inApp = IN_APP_BROWSER.test(navigator.userAgent);

  useEffect(() => {
    if (!cameraSupported()) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 4096 } }, audio: false })
      .then(async (s) => {
        stream = s;
        if (cancelled || !videoRef.current) return s.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        setMode("live");
      })
      .catch((e: DOMException) => setMode(e.name === "NotAllowedError" ? "denied" : "fallback"));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  async function process(source: Blob | ImageBitmap) {
    setBusy(true);
    setError(null);
    try {
      onCaptured(await processPhoto({ source, filter, wantOriginal: luxury }));
    } catch {
      setError("Foto gagal diproses. Coba ambil lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || busy) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    process(await createImageBitmap(video));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (Date.now() - file.lastModified > MAX_FILE_AGE_MS) {
      setError("Foto ini bukan jepretan baru. Ambil foto langsung dari kamera.");
      return;
    }
    process(file);
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <p className="min-w-0 truncate text-sm font-medium">{couple}</p>
        <button type="button" onClick={onOpenPhotos} className="min-h-11 shrink-0 px-2 text-sm font-medium">
          Foto saya ({photoCount})
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {mode !== "fallback" && mode !== "denied" && (
          <video
            ref={videoRef}
            playsInline
            muted
            className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            style={{ filter: cssFilter(filter) }}
            aria-label="Pratinjau kamera"
          />
        )}
        {mode === "starting" && <p className="absolute inset-0 flex items-center justify-center text-white/80">Membuka kamera...</p>}
        {(mode === "fallback" || mode === "denied") && (
          <div className="flex size-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="font-medium">{mode === "denied" ? "Izin kamera ditolak" : "Kamera langsung tidak tersedia di browser ini"}</p>
            <p className="text-sm text-white/80">
              {mode === "denied"
                ? "Izinkan kamera di pengaturan browser, atau pakai kamera HP lewat tombol di bawah."
                : "Pakai kamera HP lewat tombol di bawah. Filter tetap diterapkan setelah foto diambil."}
            </p>
            {inApp && <p className="text-sm text-white/80">Untuk kamera dengan filter langsung, buka link ini di Chrome atau Safari.</p>}
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white/80" aria-hidden />}
        {busy && <p className="absolute inset-x-0 bottom-3 text-center text-sm">Memproses foto...</p>}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3" role="radiogroup" aria-label="Filter">
        {(Object.keys(FILTERS) as FilterId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${filter === id ? "bg-[#c9a86a] text-[#3b2a1e]" : "bg-white/15 text-white"}`}
          >
            {FILTERS[id].label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="px-4 pb-2 text-center text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 items-center px-4 pb-6">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="min-h-11 justify-self-start text-sm font-medium">
          Kamera HP
        </button>
        {mode === "live" ? (
          <button
            type="button"
            onClick={shoot}
            disabled={busy}
            aria-label="Ambil foto"
            className="size-18 justify-self-center rounded-full border-4 border-white bg-white/90 transition-transform active:scale-95 disabled:opacity-50"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="min-h-11 justify-self-center rounded-full bg-[#c9a86a] px-5 font-semibold text-[#3b2a1e]"
          >
            Ambil foto
          </button>
        )}
        {mode === "live" ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="min-h-11 justify-self-end text-sm font-medium"
          >
            Balik kamera
          </button>
        ) : (
          <span />
        )}
      </div>
      <p className="px-4 pb-4 text-center text-xs text-white/75" aria-live="polite">
        {status}
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
    </div>
  );
}

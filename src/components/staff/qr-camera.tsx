"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// BarcodeDetector belum ada di lib.dom TypeScript. Tersedia di Chrome Android; iOS Safari dan Chrome Windows memakai jsQR.
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

const SCAN_INTERVAL_MS = 200;
const SAME_CODE_COOLDOWN_MS = 3000;

async function createDecoder(canvas: HTMLCanvasElement): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  // Dimuat hanya bila perlu, agar tidak menambah JS awal di HP yang punya BarcodeDetector.
  const jsQR = (await import("jsqr")).default;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    const scale = Math.min(1, 640 / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (!width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    return jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function QrCamera({ paused, onCode }: { paused: boolean; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<"idle" | "starting" | "running" | "denied" | "unavailable">("idle");

  useEffect(() => {
    pausedRef.current = paused;
    onCodeRef.current = onCode;
  }, [paused, onCode]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (state !== "running") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { code: "", at: 0 };
    (async () => {
      const decode = await createDecoder(canvasRef.current!);
      const tick = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (!pausedRef.current && video && video.readyState >= 2) {
          const code = await decode(video).catch(() => null);
          const now = Date.now();
          if (code && !(code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS)) {
            last = { code, at: now };
            onCodeRef.current(code);
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state]);

  async function start() {
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setState("unavailable");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setState("running");
    } catch (error) {
      setState((error as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }

  const running = state === "running" || state === "starting";
  return (
    <div className="flex flex-col gap-3">
      <div className={`relative aspect-square w-full overflow-hidden rounded-xl bg-black ${running ? "" : "hidden"}`}>
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        {/* Bingkai bidik membantu penerima tamu memposisikan QR di tengah. */}
        <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        {state === "starting" && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Membuka kamera...</p>}
        {paused && state === "running" && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">Scan dijeda</p>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {running ? (
        <Button type="button" variant="outline" className="h-11" onClick={stop}>
          Tutup kamera
        </Button>
      ) : (
        <>
          <Button type="button" className="h-12 text-base" onClick={start}>
            Buka kamera scan
          </Button>
          {state === "denied" && (
            <p className="text-sm text-destructive">Izin kamera ditolak. Izinkan kamera di pengaturan browser, atau cari nama tamu secara manual.</p>
          )}
          {state === "unavailable" && (
            <p className="text-sm text-destructive">Kamera tidak bisa dibuka di perangkat ini. Pakai scanner USB/Bluetooth atau cari nama tamu.</p>
          )}
        </>
      )}
    </div>
  );
}

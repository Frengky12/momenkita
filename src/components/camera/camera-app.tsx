"use client";

import { Cormorant_Garamond } from "next/font/google";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Onboarding } from "@/components/camera/onboarding";
import { Viewfinder } from "@/components/camera/viewfinder";
import type { ProcessOutput } from "@/lib/camera/process";
import { deletePhoto, drainQueue, listEntries, retryEntry, saveEntry, type QueueEntry } from "@/lib/camera/queue";
import { clearSession, parseSession, readSessionRaw, saveSession, subscribeSession } from "@/lib/camera/session";

// Tanpa preload: font judul tidak berebut bandwidth dengan CSS saat sinyal gedung lemah; teks tampil dulu dengan fallback.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-cormorant", preload: false });

const DRAIN_INTERVAL_MS = 4000;

// Baru dibutuhkan setelah tamu memotret, jadi tidak ikut membebani JS awal (anggaran ≤150KB, PRD §8).
const Review = dynamic(() => import("@/components/camera/review").then((m) => m.Review), { ssr: false });
const MyPhotos = dynamic(() => import("@/components/camera/my-photos").then((m) => m.MyPhotos), { ssr: false });

type Props = { slug: string; couple: string; accepting: boolean; luxury: boolean; curated: boolean; invitationSlug: string | null };

// Layar pembuka dirender server agar teksnya tampil sebelum JS selesai dimuat (LCP, PRD §8);
// tamu yang sudah punya sesi langsung beralih ke kamera setelah hidrasi.
export function CameraApp(props: Props) {
  return (
    <div className={`${display.variable} min-h-dvh bg-black`}>
      <CameraClient {...props} />
    </div>
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function CameraClient({ slug, couple, accepting, luxury, curated, invitationSlug }: Props) {
  const rawSession = useSyncExternalStore(subscribeSession, () => readSessionRaw(slug), () => null);
  const session = useMemo(() => parseSession(rawSession), [rawSession]);
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [review, setReview] = useState<ProcessOutput | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const tokenRef = useRef<string | null>(session?.token ?? null);
  const drainRef = useRef<() => void>(() => {});

  useEffect(() => {
    tokenRef.current = session?.token ?? null;
  }, [session]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const result = session ? await drainQueue(slug, () => tokenRef.current) : "idle";
      if (stopped) return;
      if (result === "session_expired") {
        clearSession(slug);
        setNotice("Sesi kamera berakhir. Masukkan nama lagi; foto yang belum terkirim tetap tersimpan.");
      }
      setEntries(await listEntries(slug));
    };
    drainRef.current = tick;
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, DRAIN_INTERVAL_MS);
    window.addEventListener("online", tick);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("online", tick);
    };
  }, [session, slug]);

  const send = useCallback(
    async (output: ProcessOutput, caption: string) => {
      await saveEntry({
        id: crypto.randomUUID(),
        slug,
        createdAt: Date.now(),
        caption,
        width: output.width,
        height: output.height,
        format: output.format,
        display: output.display,
        thumb: output.thumb,
        original: output.original,
        originalType: output.originalType,
        stage: "queued",
        attempts: 0,
        nextAttemptAt: 0,
      });
      setReview(null);
      drainRef.current();
    },
    [slug],
  );

  if (!accepting) {
    return (
      <main className="theme-klasik flex min-h-dvh flex-col items-center justify-center gap-3 bg-(--inv-bg) px-6 text-center text-(--inv-text)">
        <h1 className="font-display text-3xl font-semibold">{couple}</h1>
        <p className="max-w-sm text-(--inv-muted)">Kamera tamu belum dibuka untuk acara ini.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <Onboarding
        slug={slug}
        couple={couple}
        invitationSlug={invitationSlug}
        notice={notice}
        onStarted={(s) => {
          setNotice(null);
          saveSession(slug, s);
        }}
      />
    );
  }

  if (review) {
    return <Review output={review} curated={curated} onSend={(caption) => send(review, caption)} onRetake={() => setReview(null)} />;
  }

  const waiting = entries.filter((e) => e.stage === "queued" || e.stage === "confirmed").length;
  const failed = entries.filter((e) => e.stage === "failed").length;
  const status = !online
    ? `Offline. ${waiting} foto menunggu dan dikirim otomatis saat sinyal kembali.`
    : waiting
      ? `Mengirim ${waiting} foto...`
      : failed
        ? `${failed} foto gagal dikirim. Buka Foto saya untuk mencoba lagi.`
        : entries.length
          ? "Semua foto terkirim."
          : `Halo, ${session.displayName}. Foto pertama kamu menunggu.`;

  return (
    <>
      <Viewfinder
        couple={couple}
        luxury={luxury}
        status={status}
        photoCount={entries.length}
        onCaptured={setReview}
        onOpenPhotos={() => setShowPhotos(true)}
      />
      {showPhotos && (
        <MyPhotos
          entries={entries}
          onClose={() => setShowPhotos(false)}
          onRetry={async (entry) => {
            await retryEntry(entry);
            drainRef.current();
          }}
          onDelete={async (entry) => {
            try {
              await deletePhoto(entry, session.token);
            } catch {
              window.alert("Foto gagal dihapus. Periksa koneksi lalu coba lagi.");
            }
            setEntries(await listEntries(slug));
          }}
        />
      )}
    </>
  );
}

// Error tracking browser yang tidak menambah JS awal (halaman kamera tamu dibatasi 150 KB, PRD §8):
// SDK Sentry baru diunduh saat error pertama terjadi. Sampai SDK siap, error ditahan di antrean.
// Kalau unduhan gagal (misalnya kamera sedang offline), antrean dipertahankan dan dicoba lagi saat online.

import { beforeBreadcrumb, beforeSend, dataCollection } from "@/lib/sentry-privacy";

type SentryModule = typeof import("./sentry-browser");
type Pending = { error: unknown; context?: Record<string, unknown> };

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const MAX_QUEUE = 20;

let sentry: SentryModule | null = null;
let loading = false;
const queue: Pending[] = [];

function send(s: SentryModule, { error, context }: Pending) {
  s.withScope((scope) => {
    if (context) scope.setContext("detail", context);
    s.captureException(error);
  });
}

function load() {
  if (loading || sentry || typeof window === "undefined") return;
  loading = true;
  import("./sentry-browser")
    .then((s) => {
      s.init({
        dsn: DSN,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        tracesSampleRate: 0,
        dataCollection,
        beforeSend,
        beforeBreadcrumb,
        // Error global sudah ditangkap listener di bawah; handler bawaan SDK dimatikan agar tidak terkirim dua kali.
        integrations: (defaults) => defaults.filter((i) => i.name !== "GlobalHandlers"),
      });
      sentry = s;
      for (const pending of queue.splice(0)) send(s, pending);
    })
    .catch(() => {
      loading = false;
      window.addEventListener("online", load, { once: true });
    });
}

export function reportClientError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) return;
  if (sentry) return send(sentry, { error, context });
  if (queue.length < MAX_QUEUE) queue.push({ error, context });
  load();
}

// Dipasang sekali oleh <ErrorListener /> di root layout.
export function listenForGlobalErrors() {
  if (!DSN) return () => {};
  const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

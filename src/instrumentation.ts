import * as Sentry from "@sentry/nextjs";
import { beforeBreadcrumb, beforeSend, dataCollection } from "@/lib/sentry-privacy";

// Error tracking sisi server (Server Component, Route Handler, server action, proxy). Tanpa DSN, SDK tidak aktif.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Hanya error, tanpa tracing, agar kuota paket gratis tidak habis oleh transaksi.
    tracesSampleRate: 0,
    dataCollection,
    beforeSend,
    beforeBreadcrumb,
  });
}

export const onRequestError = Sentry.captureRequestError;

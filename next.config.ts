import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Source map diunggah ke Sentry saat build (butuh SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT di Vercel), lalu dihapus
// dari output agar tidak ikut tersaji publik. Tanpa token, build tetap jalan dan hanya melewati unggahan.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  telemetry: false,
});

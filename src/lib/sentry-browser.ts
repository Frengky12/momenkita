// Dimuat lewat import() oleh client-errors.ts hanya saat ada error. Hanya fungsi yang dipakai yang diekspor
// agar bundler membuang sisanya (replay, feedback, tracing); import namespace @sentry/nextjs menghasilkan ±150 KB.
export { captureException, init, withScope } from "@sentry/browser";

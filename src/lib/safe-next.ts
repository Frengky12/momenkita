// Hanya path internal; menolak "//evil.com" dan URL absolut agar redirect setelah login tidak bisa dibajak.
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

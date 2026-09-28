import { LEGAL, LEGAL_PLACEHOLDERS } from "@/lib/legal";

// Menampilkan identitas pengelola dari lib/legal.ts; yang belum diisi tampil sebagai penanda yang mencolok.
export function Fill({ field }: { field: keyof typeof LEGAL }) {
  const value = LEGAL[field];
  if (value) return <>{value}</>;
  return <mark className="rounded bg-amber-100 px-1 text-amber-950">[isi {LEGAL_PLACEHOLDERS[field]}]</mark>;
}

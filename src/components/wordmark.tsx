import { cn } from "@/lib/utils";

// Wordmark teks sampai ada logo resmi. Gradien pink→oranye dari referensi hanya di "Kita" sebagai motif identitas;
// ukurannya dijaga teks besar tebal karena pink di atas putih hanya 3.9:1 (lolos AA untuk teks besar saja).
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-xl font-bold tracking-tight", className)}>
      Momen
      <span className="bg-linear-to-r from-(--brand-pink) to-primary bg-clip-text text-transparent">Kita</span>
    </span>
  );
}

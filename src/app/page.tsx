import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { PACKAGE_LABEL } from "@/lib/admin";
import { getPromoStatus, promoEndLabel } from "@/lib/promo";

// Halaman depan sementara sampai landing page lengkap siap (butuh materi visual asli, harga final, S&K, Kebijakan Privasi).
// Sengaja tanpa angka, testimoni, atau klaim: belum ada data nyata sebelum pilot.
// Pengguna yang sudah login langsung diteruskan oleh /login ke tujuan `next`.
export default async function HomePage() {
  const promo = await getPromoStatus();
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border bg-card px-3 py-1.5 shadow-inner sm:mx-auto sm:w-full sm:max-w-3xl">
        <span className="inline-flex min-h-11 items-center px-1">
          <Wordmark className="text-lg" />
        </span>
        <Button asChild variant="ghost" className="h-11">
          <Link href="/login?next=/dashboard">Masuk</Link>
        </Button>
      </header>

      <main className="relative flex flex-1 items-center overflow-hidden px-4 py-16">
        {/* Glow yang sama dengan halaman login: satu titik fokus di belakang judul. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-80 w-[min(90%,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Undangan digital yang berlanjut sampai{" "}
            {/* Motif gradien wordmark, hanya di teks besar tebal (pink di atas putih 3.9:1, lolos AA teks besar). */}
            <span className="bg-linear-to-r from-(--brand-pink) to-primary bg-clip-text whitespace-nowrap text-transparent">hari-H</span>
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Kirim undangan dan terima RSVP, sambut tamu dengan <span className="whitespace-nowrap">QR check-in</span>, lalu biarkan tamu memotret dari HP mereka tanpa instal
            aplikasi. Fotonya tampil di layar panggung dan terkumpul di satu galeri.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild className="h-11 px-6">
              <Link href="/login?next=/dashboard/events/new">Buat undangan</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6">
              <Link href="/contoh-botani">Lihat contoh undangan</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {promo.active
              ? `Selama masa peluncuran, paket ${PACKAGE_LABEL[promo.package]} gratis untuk ${promo.per_account === 1 ? "satu event" : `${promo.per_account} event`} per akun${promo.ends_at ? ` sampai ${promoEndLabel(promo.ends_at)}` : ""}.`
              : "Rakit dan pratinjau undangan gratis. Bayar paket saat undangan siap dipublikasikan."}
          </p>
        </div>
      </main>

      <footer className="flex flex-wrap justify-center gap-x-4 px-4 pb-6 text-sm text-muted-foreground">
        <Link href="/legal/syarat" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          Syarat &amp; Ketentuan
        </Link>
        <Link href="/legal/privasi" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          Kebijakan Privasi
        </Link>
      </footer>
    </div>
  );
}

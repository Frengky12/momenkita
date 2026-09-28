import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { legalIsDraft } from "@/lib/legal";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border bg-card px-3 py-1.5 shadow-inner sm:mx-auto sm:w-full sm:max-w-3xl">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-md px-1">
          <Wordmark className="text-lg" />
        </Link>
        <nav aria-label="Dokumen legal" className="flex items-center gap-1 text-sm">
          <Link href="/legal/syarat" className="inline-flex min-h-11 items-center rounded-md px-2 hover:bg-muted">
            Syarat
          </Link>
          <Link href="/legal/privasi" className="inline-flex min-h-11 items-center rounded-md px-2 hover:bg-muted">
            Privasi
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        {legalIsDraft && (
          <p role="note" className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Draf untuk ditinjau. Bagian bertanda <span className="font-semibold">[isi …]</span> belum diisi, dan isi dokumen ini belum ditinjau ahli
            hukum.
          </p>
        )}
        <article className="flex flex-col gap-4 leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
      </main>
    </div>
  );
}

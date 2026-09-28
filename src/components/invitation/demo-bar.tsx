import Link from "next/link";
import { THEMES, type CoverStyle, type ThemeId } from "@/lib/invitation/content";
import { COVER_PARAM_OF, type DemoView } from "@/lib/invitation/demo";
import { cn } from "@/lib/utils";

const COVERS: [CoverStyle, string][] = [
  ["frame", "Berbingkai"],
  ["full", "Foto penuh"],
];

// Bilah pemilih di undangan contoh: tautan biasa (tanpa JavaScript), jadi pilihan bisa dibagikan lewat URL.
// Warnanya netral (bukan token tema) agar terbaca sebagai alat, bukan bagian undangan.
export function DemoBar({ slug, view }: { slug: string; view: DemoView }) {
  const href = (theme: ThemeId, cover: CoverStyle) => `/${slug}?tema=${theme}&sampul=${COVER_PARAM_OF[cover]}`;
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
      active ? "bg-white text-stone-900" : "text-white hover:bg-white/15",
    );

  return (
    <nav aria-label="Pilihan tampilan contoh" className="sticky top-0 z-30 border-b border-white/15 bg-stone-900 text-white">
      <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto px-3 py-1.5">
        <span className="shrink-0 pr-1 text-xs text-stone-300">Contoh · Tema</span>
        {(Object.keys(THEMES) as ThemeId[]).map((theme) => (
          <Link
            key={theme}
            href={href(theme, view.coverStyle)}
            scroll={false}
            aria-current={view.theme === theme ? "true" : undefined}
            className={chip(view.theme === theme)}
          >
            {THEMES[theme]}
          </Link>
        ))}
        <span className="shrink-0 pr-1 pl-2 text-xs text-stone-300">Sampul</span>
        {COVERS.map(([cover, label]) => (
          <Link
            key={cover}
            href={href(view.theme, cover)}
            scroll={false}
            aria-current={view.coverStyle === cover ? "true" : undefined}
            className={chip(view.coverStyle === cover)}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

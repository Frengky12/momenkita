import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryApp } from "@/components/gallery/gallery-app";
import { PasscodeForm } from "@/components/gallery/passcode-form";
import { galleryAccess, listGalleryPhotos, loadGalleryEvent } from "@/lib/gallery";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { cn } from "@/lib/utils";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-cormorant" });

const CLOSED_MESSAGES = {
  unavailable: "Galeri foto tidak tersedia untuk acara ini.",
  expired: "Masa simpan album acara ini sudah berakhir.",
  closed: "Galeri belum dibuka. Tuan rumah akan membagikan link galeri setelah acara.",
} as const;

export async function generateMetadata({ params }: PageProps<"/[slug]/galeri">): Promise<Metadata> {
  const event = await loadGalleryEvent((await params).slug);
  if (!event) return { title: "Galeri tidak ditemukan" };
  const [first, second] = coupleNames(parseContent(event.theme_config));
  return { title: `Galeri Foto ${first.nickname} & ${second.nickname}`, robots: { index: false, follow: false } };
}

export default async function GalleryPage({ params }: PageProps<"/[slug]/galeri">) {
  const { slug } = await params;
  const event = await loadGalleryEvent(slug);
  if (!event) notFound();

  const access = await galleryAccess(event);
  const [first, second] = coupleNames(parseContent(event.theme_config));
  const initial = access === "open" || access === "manager" ? await listGalleryPhotos(event.id) : null;

  return (
    <div className={cn(display.variable, "theme-klasik min-h-dvh bg-(--inv-bg) text-(--inv-text)")}>
      {access === "manager" && !event.gallery_public && (
        <p className="bg-(--inv-band) px-4 py-2 text-center text-sm font-medium">
          Pratinjau host: galeri ini belum dibuka untuk tamu.{" "}
          <Link href={`/dashboard/events/${event.id}/galeri`} className="underline underline-offset-4">
            Atur di dashboard
          </Link>
        </p>
      )}
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="font-display text-xl text-(--inv-accent) italic">Galeri Foto</p>
          <h1 className="font-display text-4xl leading-tight font-semibold [overflow-wrap:anywhere] sm:text-5xl">
            {first.nickname}
            <span className="mx-2 text-(--inv-accent) italic">&amp;</span>
            {second.nickname}
          </h1>
          <p className="text-sm text-(--inv-muted)">Momen dari sudut pandang para tamu.</p>
        </header>

        {initial ? (
          <GalleryApp slug={event.slug} timezone={event.timezone} initial={initial} />
        ) : access === "passcode" ? (
          <PasscodeForm slug={event.slug} />
        ) : (
          <p className="py-16 text-center text-(--inv-muted)">{CLOSED_MESSAGES[access as keyof typeof CLOSED_MESSAGES]}</p>
        )}

        <Link
          href={`/${event.slug}`}
          className="mx-auto inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
        >
          Lihat undangan
        </Link>
      </main>
    </div>
  );
}

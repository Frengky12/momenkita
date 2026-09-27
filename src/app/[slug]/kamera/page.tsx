import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CameraApp } from "@/components/camera/camera-app";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { createAdminClient } from "@/lib/supabase/admin";

async function loadEvent(slug: string) {
  const { data } = await createAdminClient()
    .from("events")
    .select("slug, status, package, moderation_mode, theme_config")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/[slug]/kamera">): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  if (!event) return { title: "Kamera tidak ditemukan" };
  const [first, second] = coupleNames(parseContent(event.theme_config));
  return { title: `Kamera Tamu ${first.nickname} & ${second.nickname}`, robots: { index: false, follow: false } };
}

// Dibuka dari QR meja atau tombol di undangan personal (?tamu=<slug personal>).
export default async function CameraPage({ params, searchParams }: PageProps<"/[slug]/kamera">) {
  const { slug } = await params;
  const query = await searchParams;
  const event = await loadEvent(slug);
  if (!event) notFound();

  const [first, second] = coupleNames(parseContent(event.theme_config));
  return (
    <CameraApp
      slug={event.slug}
      couple={`${first.nickname} & ${second.nickname}`}
      accepting={event.status === "active" && (event.package === "complete" || event.package === "luxury")}
      luxury={event.package === "luxury"}
      curated={event.moderation_mode === "curated"}
      invitationSlug={typeof query.tamu === "string" ? query.tamu : null}
    />
  );
}

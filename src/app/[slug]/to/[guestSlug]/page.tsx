import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KlasikInvitation } from "@/components/invitation/klasik";
import { coupleNames } from "@/lib/invitation/content";
import { loadPublicInvitation } from "@/lib/invitation/load";
import { requestOrigin } from "@/lib/invitation/origin";

export async function generateMetadata({ params }: PageProps<"/[slug]/to/[guestSlug]">): Promise<Metadata> {
  const { slug, guestSlug } = await params;
  const data = await loadPublicInvitation(slug, guestSlug);
  if (!data) return { title: "Undangan tidak ditemukan" };
  const [first, second] = coupleNames(data.event.content);
  return { title: `Undangan Pernikahan ${first.nickname} & ${second.nickname}`, robots: { index: false, follow: false } };
}

// Link yang salah atau ditebak berakhir di 404 tanpa menyebut apakah event-nya ada (PRD §5.1).
export default async function PersonalInvitationPage({ params }: PageProps<"/[slug]/to/[guestSlug]">) {
  const { slug, guestSlug } = await params;
  const data = await loadPublicInvitation(slug, guestSlug);
  if (!data) notFound();

  const origin = await requestOrigin();
  return <KlasikInvitation data={data} invitationUrl={`${origin}/${slug}/to/${guestSlug}`} icsBaseUrl={`/${slug}/kalender`} />;
}

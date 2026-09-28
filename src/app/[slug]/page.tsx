import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Invitation } from "@/components/invitation/invitation";
import { coupleNames } from "@/lib/invitation/content";
import { DEMO_SLUGS, demoView } from "@/lib/invitation/demo";
import { loadPublicInvitation } from "@/lib/invitation/load";
import { requestOrigin } from "@/lib/invitation/origin";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicInvitation(slug);
  if (!data) return { title: "Undangan tidak ditemukan" };
  const [first, second] = coupleNames(data.event.content);
  // Undangan berisi nama tamu dan jadwal pribadi, jadi tidak diindeks mesin pencari.
  return { title: `Undangan Pernikahan ${first.nickname} & ${second.nickname}`, robots: { index: false, follow: false } };
}

export default async function InvitationPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicInvitation(slug);
  if (!data) notFound();

  const origin = await requestOrigin();
  // Hanya event contoh yang temanya bisa diganti lewat URL; undangan milik host selalu memakai pilihan host.
  const demo = DEMO_SLUGS.has(slug) ? demoView(await searchParams, data.event.content) : undefined;
  return <Invitation data={data} invitationUrl={`${origin}/${slug}`} icsBaseUrl={`/${slug}/kalender`} demo={demo} />;
}

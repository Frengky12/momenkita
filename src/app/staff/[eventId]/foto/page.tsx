import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotographerPage } from "@/components/staff/photographer-app";
import { UUID_PATTERN } from "@/lib/uploads";

export const metadata: Metadata = { title: "Unduh Foto", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/staff/[eventId]/foto">) {
  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) notFound();
  return <PhotographerPage eventId={eventId} />;
}

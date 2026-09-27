import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModerationPage } from "@/components/staff/moderation-console";
import { UUID_PATTERN } from "@/lib/uploads";

export const metadata: Metadata = { title: "Konsol Moderasi", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/staff/[eventId]/moderasi">) {
  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) notFound();
  return <ModerationPage eventId={eventId} />;
}

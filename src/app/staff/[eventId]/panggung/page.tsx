import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StagePage } from "@/components/staff/stage-display";
import { UUID_PATTERN } from "@/lib/uploads";

export const metadata: Metadata = { title: "Layar Panggung", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/staff/[eventId]/panggung">) {
  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) notFound();
  return <StagePage eventId={eventId} />;
}

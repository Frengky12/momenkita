import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScannerPage } from "@/components/staff/scanner-app";
import { UUID_PATTERN } from "@/lib/uploads";

export const metadata: Metadata = { title: "Scanner Check-in", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/staff/[eventId]/scanner">) {
  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) notFound();
  return <ScannerPage eventId={eventId} />;
}

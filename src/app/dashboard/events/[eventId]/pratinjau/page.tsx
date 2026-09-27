import { notFound } from "next/navigation";
import { Invitation } from "@/components/invitation/invitation";
import { loadPreviewInvitation } from "@/lib/invitation/load";
import { requestOrigin } from "@/lib/invitation/origin";

export default async function PreviewPage({ params }: PageProps<"/dashboard/events/[eventId]/pratinjau">) {
  const { eventId } = await params;
  const data = await loadPreviewInvitation(eventId);
  if (!data) notFound();
  const origin = await requestOrigin();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Tampilan link umum. Undangan personal menambahkan nama tamu di sampul dan hanya menampilkan sesi yang tamu itu diundang.
      </p>
      {/* Bingkai selebar HP, karena sebagian besar tamu membuka undangan dari WhatsApp. */}
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border shadow-sm">
        <Invitation data={data} invitationUrl={`${origin}/${data.event.slug}`} icsBaseUrl={`/${data.event.slug}/kalender`} preview />
      </div>
    </div>
  );
}

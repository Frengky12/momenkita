import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Button } from "@/components/ui/button";
import { requestOrigin } from "@/lib/invitation/origin";
import { presignGet } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";
import { GallerySettings } from "./gallery-settings";
import { HostZip } from "./host-zip";
import { ReportActions } from "./report-actions";

const REASON_LABEL: Record<string, string> = {
  privacy: "Tamu ada di foto dan ingin fotonya dihapus",
  inappropriate: "Foto tidak pantas",
  other: "Alasan lain",
};

export default async function GalleryTabPage({ params }: PageProps<"/dashboard/events/[eventId]/galeri">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, slug, status, package, timezone, gallery_public, passcode_hash")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  if (event.status === "draft" || (event.package !== "complete" && event.package !== "luxury")) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="font-semibold">Galeri belum tersedia</h2>
        <p className="text-sm text-muted-foreground">Galeri foto tamu dan unduhan ZIP tersedia di paket Complete dan Luxury.</p>
        <Button asChild className="h-11 w-fit">
          <Link href={`/dashboard/events/${event.id}/publikasi`}>Lihat paket</Link>
        </Button>
      </section>
    );
  }

  const [{ data: summary }, { data: reports }] = await Promise.all([
    supabase.rpc("staff_gallery_summary", { p_event_id: event.id }),
    supabase
      .from("photo_reports")
      .select("id, reason, created_at, photo:photos(id, uploader_name, caption, key_thumb, status)")
      .eq("event_id", event.id)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const counts = (summary ?? { downloadable: 0, locked: 0, originals: 0 }) as { downloadable: number; locked: number; originals: number };
  const galleryUrl = `${await requestOrigin()}/${event.slug}/galeri`;
  const reportRows = await Promise.all(
    (reports ?? []).map(async (r) => ({ ...r, thumbUrl: r.photo ? await presignGet(r.photo.key_thumb) : null })),
  );
  const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone });

  return (
    <div className="flex flex-col gap-6">
      {reportRows.length > 0 && (
        <section className="flex flex-col gap-4 rounded-xl border-2 border-destructive/40 bg-card p-4 sm:p-6" aria-labelledby="laporan">
          <div className="flex flex-col gap-1">
            <h2 id="laporan" className="font-semibold">
              Laporan dari tamu ({reportRows.length})
            </h2>
            <p className="text-sm text-muted-foreground">Tinjau foto berikut. Menurunkan foto menghapusnya dari layar panggung, galeri, dan unduhan.</p>
          </div>
          <ul className="flex flex-col divide-y">
            {reportRows.map((report) => (
              <li key={report.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
                {report.thumbUrl && <img src={report.thumbUrl} alt="" className="size-24 shrink-0 rounded-lg object-cover" />}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-medium">{REASON_LABEL[report.reason] ?? report.reason}</p>
                  <p className="text-sm text-muted-foreground">
                    Foto dari {report.photo?.uploader_name ?? "tamu"} · dilaporkan {time(report.created_at)}
                    {report.photo?.status !== "approved" && " · foto sudah tidak tayang"}
                  </p>
                  {report.photo?.caption && <p className="text-sm">{report.photo.caption}</p>}
                </div>
                <ReportActions eventId={event.id} reportId={report.id} photoId={report.photo?.id ?? ""} photoLive={report.photo?.status === "approved"} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="akses">
        <div className="flex flex-col gap-1">
          <h2 id="akses" className="font-semibold">
            Galeri untuk tamu
          </h2>
          <p className="text-sm text-muted-foreground">
            {event.gallery_public ? "Galeri sedang terbuka untuk tamu." : "Galeri masih tertutup; hanya Anda dan pengelola event yang bisa melihatnya."}
            {event.gallery_public && event.passcode_hash && " Tamu perlu passcode."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{galleryUrl}</p>
          <CopyButton text={galleryUrl} label="Salin link galeri" />
          <Button asChild variant="outline" className="h-11">
            <a href={`/${event.slug}/galeri`} target="_blank" rel="noopener">
              Buka galeri
            </a>
          </Button>
        </div>
        <GallerySettings eventId={event.id} isPublic={event.gallery_public} hasPasscode={Boolean(event.passcode_hash)} />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="unduh-album">
        <div className="flex flex-col gap-1">
          <h2 id="unduh-album" className="font-semibold">
            Unduh album
          </h2>
          <p className="text-sm text-muted-foreground">
            {counts.downloadable} foto siap diunduh. Fotografer bisa mengunduh sendiri lewat link staf peran Fotografer di tab Hari-H.
          </p>
          {counts.locked > 0 && (
            <p className="text-sm">
              {counts.locked} foto di atas kuota masih terkunci di galeri dan unduhan.{" "}
              <Link href={`/dashboard/events/${event.id}/publikasi`} className="font-medium underline underline-offset-4">
                Tambah kuota
              </Link>
            </p>
          )}
        </div>
        <HostZip
          eventId={event.id}
          slug={event.slug}
          timezone={event.timezone}
          total={counts.downloadable}
          allowOriginal={event.package === "luxury" && counts.originals > 0}
        />
      </section>
    </div>
  );
}

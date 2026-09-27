import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { REPORT_REASON_LABEL, ago, dateTime } from "@/lib/admin";
import { presignGet } from "@/lib/r2";
import { ActionForm } from "../action-form";
import { dismissReports, takedownPhoto } from "../actions";
import { requireAdmin } from "../guard";

const PHOTO_STATUS_LABEL: Record<string, string> = {
  approved: "Tayang",
  pending: "Menunggu moderasi",
  rejected: "Ditolak moderator",
  deleted: "Sudah dihapus",
};

type ReportRow = {
  id: string;
  reason: string;
  created_at: string;
  photo: { id: string; uploader_name: string; caption: string | null; key_thumb: string; key_display: string; status: string } | null;
  event: { id: string; title: string; slug: string } | null;
};

export default async function AdminReportsPage() {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("photo_reports")
    .select("id, reason, created_at, photo:photos!photo_reports_photo_id_fkey(id, uploader_name, caption, key_thumb, key_display, status), event:events!photo_reports_event_id_fkey(id, title, slug)")
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  // Satu foto bisa dilaporkan beberapa tamu; antrean menampilkan per foto, laporan tertua di atas.
  const groups = new Map<string, { photo: NonNullable<ReportRow["photo"]>; event: ReportRow["event"]; reports: ReportRow[] }>();
  for (const report of (data ?? []) as ReportRow[]) {
    if (!report.photo) continue;
    const group = groups.get(report.photo.id) ?? { photo: report.photo, event: report.event, reports: [] };
    group.reports.push(report);
    groups.set(report.photo.id, group);
  }
  const queue = await Promise.all(
    [...groups.values()].map(async (g) => ({ ...g, thumbUrl: await presignGet(g.photo.key_thumb), displayUrl: await presignGet(g.photo.key_display) })),
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Laporan foto</h1>
        <p className="text-sm text-muted-foreground">
          Laporan dari galeri tamu yang belum ditutup, dari semua event. Takedown menghapus foto dan filenya secara permanen.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Antrean laporan gagal dimuat. Muat ulang halaman ini.</AlertDescription>
        </Alert>
      )}

      {!error && queue.length === 0 && (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center">
          <p className="font-medium">Tidak ada laporan terbuka</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Laporan baru dari tombol “Laporkan” di galeri tamu akan muncul di sini.</p>
        </div>
      )}

      {queue.length > 0 && (
        <ul className="flex flex-col gap-4">
          {queue.map(({ photo, event, reports, thumbUrl, displayUrl }) => {
            const reasons = Object.entries(
              reports.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {}),
            );
            return (
              <li key={photo.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:p-5">
                <a href={displayUrl} target="_blank" rel="noreferrer" className="shrink-0 self-start" aria-label={`Buka foto dari ${photo.uploader_name} ukuran penuh`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL presigned R2, bukan aset yang dioptimasi next/image */}
                  <img src={thumbUrl} alt={photo.caption ?? `Foto dari ${photo.uploader_name}`} className="size-40 rounded-lg border object-cover" />
                </a>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div>
                    <p className="font-medium">
                      {reports.length} laporan · {reasons.map(([reason, n]) => `${REPORT_REASON_LABEL[reason] ?? reason}${n > 1 ? ` (${n})` : ""}`).join(", ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Dari {photo.uploader_name} · {PHOTO_STATUS_LABEL[photo.status] ?? photo.status} · laporan pertama {ago(reports[0].created_at)} (
                      {dateTime(reports[0].created_at)} WIB)
                    </p>
                    {photo.caption && <p className="text-sm [overflow-wrap:anywhere]">“{photo.caption}”</p>}
                    {event && (
                      <Link href={`/admin/events/${event.id}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                        {event.title}
                      </Link>
                    )}
                  </div>
                  <div className="grid items-start gap-3 lg:grid-cols-2">
                    <details className="rounded-lg border p-3">
                      <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Takedown permanen</summary>
                      <div className="mt-2">
                        <ActionForm
                          action={takedownPhoto.bind(null, photo.id)}
                          submitLabel="Hapus foto permanen"
                          pendingLabel="Menghapus..."
                          destructive
                          confirmMessage="Foto akan hilang dari panggung, galeri, dan ZIP, dan filenya dihapus. Tidak bisa dibatalkan. Lanjutkan?"
                          reasonPlaceholder="Contoh: tamu di foto meminta dihapus lewat WA"
                        />
                      </div>
                    </details>
                    <details className="rounded-lg border p-3">
                      <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Abaikan laporan</summary>
                      <div className="mt-2">
                        <ActionForm
                          action={dismissReports.bind(null, reports.map((r) => r.id))}
                          submitLabel="Tutup laporan"
                          reasonPlaceholder="Contoh: foto wajar, tidak melanggar"
                        />
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

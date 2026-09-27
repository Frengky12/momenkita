import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MODERATION_LABEL, PACKAGE_LABEL, secondsSince, time } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";
import { requireAdmin } from "./guard";

type Session = { name: string; starts_at: string; ends_at: string | null };

// Target keandalan upload PRD: ≥ 99% foto terunggah. Di atas 1% penolakan, angka ditandai merah.
const ERROR_RATE_ALERT = 0.01;
// Panggung mengirim detak tiap 60 detik; dua detak terlewat berarti layar mati atau offline.
const STAGE_STALE_SECONDS = 120;

function stageStatus(lastSeen: string | null, live: boolean, cached: number) {
  if (!lastSeen) return { label: "Belum dibuka", detail: "Layar panggung belum pernah tersambung", alert: false };
  const age = secondsSince(lastSeen);
  if (age > STAGE_STALE_SECONDS) return { label: "Terputus", detail: `Detak terakhir ${time(lastSeen)} WIB`, alert: true };
  return live
    ? { label: "Tersambung", detail: `Realtime aktif · ${cached} foto di cache`, alert: false }
    : { label: "Tersambung tanpa realtime", detail: `Memakai polling cadangan · ${cached} foto di cache`, alert: true };
}

export default async function AdminTodayPage() {
  const supabase = await requireAdmin();
  const [{ data: events, error }, { count: openReports }] = await Promise.all([
    supabase.rpc("admin_today"),
    supabase.from("photo_reports").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acara hari ini</h1>
          <p className="text-sm text-muted-foreground">Event aktif yang punya sesi hari ini menurut zona waktunya. Data dimuat ulang tiap 30 detik.</p>
        </div>
        {!!openReports && (
          <Link href="/admin/laporan" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
            {openReports} laporan foto menunggu
          </Link>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Data monitor gagal dimuat. Halaman akan mencoba lagi otomatis.</AlertDescription>
        </Alert>
      )}

      {!error && events.length === 0 && (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center">
          <p className="font-medium">Tidak ada acara hari ini</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Event muncul di sini saat statusnya aktif dan salah satu sesinya jatuh pada tanggal hari ini.
          </p>
        </div>
      )}

      {!error && events.length > 0 && (
        <ul className="flex flex-col gap-4">
          {events.map((event) => {
            const sessions = (event.sessions ?? []) as Session[];
            const attempts = event.photos_today + event.upload_errors_today;
            const errorRate = attempts > 0 ? event.upload_errors_today / attempts : 0;
            const stage = stageStatus(event.stage_last_seen, event.stage_live, event.stage_cached);
            return (
              <li key={event.event_id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/events/${event.event_id}`} className="font-semibold underline-offset-4 hover:underline">
                      {event.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      /{event.slug} · {PACKAGE_LABEL[event.package] ?? event.package} · moderasi {MODERATION_LABEL[event.moderation_mode] ?? event.moderation_mode}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sessions
                      .map((s) => `${s.name} ${time(s.starts_at, event.timezone)}${s.ends_at ? `–${time(s.ends_at, event.timezone)}` : ""}`)
                      .join(" · ")}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Metric label="Foto hari ini" value={event.photos_today} />
                  <Metric label="Menunggu moderasi" value={event.pending} />
                  <Metric
                    label="Upload ditolak"
                    value={attempts > 0 ? `${(errorRate * 100).toFixed(1)}%` : "0%"}
                    detail={`${event.upload_errors_today} dari ${attempts} percobaan`}
                    alert={errorRate > ERROR_RATE_ALERT}
                  />
                  <Metric label="Check-in" value={`${event.checked_in}/${event.invitations}`} detail="undangan" />
                  <Metric
                    label="Laporan terbuka"
                    value={event.open_reports}
                    alert={event.open_reports > 0}
                    href={event.open_reports > 0 ? "/admin/laporan" : undefined}
                  />
                  <Metric label="Panggung" value={stage.label} detail={stage.detail} alert={stage.alert} />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Metric({ label, value, detail, alert, href }: { label: string; value: string | number; detail?: string; alert?: boolean; href?: string }) {
  const content = <span className={cn("text-lg font-semibold tabular-nums", alert && "text-destructive")}>{value}</span>;
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-col">
        {href ? (
          <Link href={href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {content}
          </Link>
        ) : (
          content
        )}
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/lib/guests";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { createClient } from "@/lib/supabase/server";
import { GuestForm, type GuestRow } from "./guest-form";
import { GuestList } from "./guest-list";
import { ImportGuests } from "./import-guests";
import { RealtimeRefresh } from "./realtime-refresh";

export default async function GuestsPage({ params }: PageProps<"/dashboard/events/[eventId]/tamu">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: sessions }, { data: guests, error }] = await Promise.all([
    supabase.from("events").select("id, slug, published_at, theme_config").eq("id", eventId).maybeSingle(),
    supabase.from("event_sessions").select("id, name").eq("event_id", eventId).order("starts_at"),
    supabase
      .from("invitations")
      .select("id, guest_name, personal_slug, phone_number, category, pax_allowed, table_number, session_ids, rsvp_status, rsvp_pax, sent_at, opened_at, checked_in_at, checked_in_pax")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);
  if (!event) notFound();

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const list = (guests ?? []) as GuestRow[];
  const sessionList = sessions ?? [];
  const content = parseContent(event.theme_config);
  const [first, second] = coupleNames(content);

  const attending = list.filter((g) => g.rsvp_status === "attending");
  const stats = {
    invitations: list.length,
    maxPeople: list.reduce((sum, g) => sum + g.pax_allowed, 0),
    attendingPeople: attending.reduce((sum, g) => sum + (g.rsvp_pax ?? 0), 0),
    attendingInvitations: attending.length,
    declined: list.filter((g) => g.rsvp_status === "declined").length,
    maybe: list.filter((g) => g.rsvp_status === "maybe").length,
    pending: list.filter((g) => g.rsvp_status === "pending").length,
    opened: list.filter((g) => g.opened_at).length,
  };
  // Rekap check-in hari-H dari scanner penerima tamu; ikut ter-update lewat RealtimeRefresh.
  const present = (guests ?? []).filter((g) => g.checked_in_at);
  const presentPeople = present.reduce((sum, g) => sum + (g.checked_in_pax ?? 0), 0);
  const presentPercent = list.length ? Math.round((present.length / list.length) * 100) : 0;
  const byCategory = Object.entries(CATEGORY_LABELS).map(([key, label]) => {
    const inCategory = (guests ?? []).filter((g) => g.category === key);
    return `${label} ${inCategory.filter((g) => g.checked_in_at).length}/${inCategory.length}`;
  });

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresh eventId={event.id} />

      {list.length > 0 && (
        <section aria-label="Ringkasan RSVP" className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
          {/* Angka hadir menjadi fokus karena itulah yang dipakai untuk katering dan kursi. */}
          <p className="text-sm text-muted-foreground">Konfirmasi hadir</p>
          <p className="text-3xl font-bold tracking-tight">
            <span className="text-primary">{stats.attendingPeople}</span> orang{" "}
            <span className="ml-1 text-base font-normal text-muted-foreground">dari {stats.attendingInvitations} undangan</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {stats.invitations} undangan untuk maksimal {stats.maxPeople} orang · {stats.declined} tidak hadir · {stats.maybe} ragu ·{" "}
            {stats.pending} belum jawab · {stats.opened} sudah membuka undangan
          </p>
        </section>
      )}

      {present.length > 0 && (
        <section aria-label="Kehadiran hari-H" className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">Sudah check-in di acara</p>
          <p className="text-3xl font-bold tracking-tight">
            <span className="text-primary">{presentPeople}</span> orang{" "}
            <span className="ml-1 text-base font-normal text-muted-foreground">
              dari {present.length} undangan ({presentPercent}%)
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{byCategory.join(" · ")}</p>
        </section>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" className="h-11">
            {/* Route handler XLSX; atribut download agar browser menyimpan file, bukan membuka tab baru. */}
            <a href={`/dashboard/events/${event.id}/tamu/laporan`} download>
              Unduh laporan XLSX
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">Daftar hadir, waktu check-in, jumlah orang, dan ucapan.</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Daftar tamu gagal dimuat. Muat ulang halaman ini.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <details className="rounded-xl border bg-card p-4 sm:p-6">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">Tambah tamu</summary>
          <div className="mt-4">
            <GuestForm eventId={event.id} sessions={sessionList} />
          </div>
        </details>
        <details className="rounded-xl border bg-card p-4 sm:p-6">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">Impor dari Excel atau CSV</summary>
          <div className="mt-4">
            <ImportGuests eventId={event.id} sessions={sessionList} />
          </div>
        </details>
      </div>

      {!error && <GuestList
          eventId={event.id}
          guests={list}
          sessions={sessionList}
          inviteBaseUrl={`${origin}/${event.slug}/to/`}
          whatsapp={event.published_at ? { template: content.texts.whatsapp, couple: `${first.nickname} & ${second.nickname}` } : null}
        />}
    </div>
  );
}

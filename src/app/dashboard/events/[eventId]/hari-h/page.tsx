import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionForm } from "@/components/dashboard/section-form";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { requestOrigin } from "@/lib/invitation/origin";
import { STAFF_ROLES } from "@/lib/staff/roles";
import { createClient } from "@/lib/supabase/server";
import { setModerationMode } from "./actions";
import { StaffLinks, type StaffLinkRow } from "./staff-links";

const MODES = [
  { value: "curated", label: "Kurasi (disarankan)", description: "Foto tamu tayang setelah disetujui moderator." },
  { value: "delayed", label: "Jeda 15 detik", description: "Foto tayang otomatis setelah 15 detik, kecuali ditolak moderator." },
  { value: "instant", label: "Instan", description: "Foto langsung tayang. Cocok untuk acara santai dengan tamu yang saling kenal." },
] as const;

function linkState(link: { revoked_at: string | null; expires_at: string }): StaffLinkRow["state"] {
  if (link.revoked_at) return "revoked";
  return Date.parse(link.expires_at) <= Date.now() ? "expired" : "active";
}

export default async function DayOfPage({ params }: PageProps<"/dashboard/events/[eventId]/hari-h">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: links }] = await Promise.all([
    supabase.from("events").select("id, slug, status, package, moderation_mode, timezone").eq("id", eventId).maybeSingle(),
    supabase.from("staff_links").select("id, role, label, expires_at, revoked_at").eq("event_id", eventId).order("created_at", { ascending: false }),
  ]);
  if (!event) notFound();

  if (event.status !== "active" || (event.package !== "complete" && event.package !== "luxury")) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="font-semibold">Fitur hari-H belum aktif</h2>
        <p className="text-sm text-muted-foreground">
          Scanner check-in, konsol moderasi foto, dan layar panggung tersedia di paket Complete dan Luxury.
        </p>
        <Button asChild className="h-11 w-fit">
          <Link href={`/dashboard/events/${event.id}/publikasi`}>Lihat paket</Link>
        </Button>
      </section>
    );
  }

  const origin = await requestOrigin();
  const cameraUrl = `${origin}/${event.slug}/kamera`;
  const rows: StaffLinkRow[] = (links ?? []).map((l) => ({ id: l.id, role: l.role, label: l.label, expiresAt: l.expires_at, state: linkState(l) }));
  const consoles = [
    { role: "receptionist", title: "Scanner check-in" },
    { role: "moderator", title: "Konsol moderasi" },
    { role: "stage", title: "Layar panggung" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Buka dari perangkat ini</h2>
          <p className="text-sm text-muted-foreground">Anda masuk sebagai host, jadi tidak perlu PIN. Untuk panitia lain, buat link staf di bawah.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {consoles.map(({ role, title }) => (
            <Button key={role} asChild variant="outline" className="h-auto min-h-11 flex-col items-start gap-0.5 py-3 text-left whitespace-normal">
              <a href={`/staff/${event.id}/${STAFF_ROLES[role].path}`} target="_blank" rel="noopener">
                <span className="font-semibold">{title}</span>
                <span className="text-xs font-normal text-muted-foreground">{STAFF_ROLES[role].description}</span>
              </a>
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Link staf</h2>
          <p className="text-sm text-muted-foreground">Panitia tidak perlu akun. Tiap link dibuka sekali dengan PIN 6 digit, lalu berlaku sampai sehari setelah acara.</p>
        </div>
        <StaffLinks eventId={event.id} origin={origin} timezone={event.timezone} links={rows} />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Mode moderasi foto</h2>
          <p className="text-sm text-muted-foreground">Menentukan kapan foto tamu tampil di layar panggung. Bisa diubah kapan saja, termasuk saat acara.</p>
        </div>
        <SectionForm action={setModerationMode.bind(null, event.id)}>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Mode moderasi</legend>
            {MODES.map((mode) => (
              <label key={mode.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary">
                <input type="radio" name="mode" value={mode.value} defaultChecked={event.moderation_mode === mode.value} className="mt-1 size-4 accent-primary" />
                <span>
                  <span className="block text-sm font-medium">{mode.label}</span>
                  <span className="block text-sm text-muted-foreground">{mode.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </SectionForm>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-6">
        <QrCode value={cameraUrl} label="QR kamera tamu" className="w-32 shrink-0 rounded-lg border" />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="font-semibold">QR meja kamera tamu</h2>
          <p className="text-sm text-muted-foreground">
            Letakkan di tiap meja. Tamu memindainya dengan kamera HP untuk mengirim foto ke layar panggung, tanpa aplikasi.
          </p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{cameraUrl}</p>
          <Button asChild variant="outline" className="h-11 w-fit">
            <Link href={`/dashboard/events/${event.id}/hari-h/qr-meja`}>Cetak kartu QR meja</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

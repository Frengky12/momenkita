import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  active: "Aktif",
  completed: "Selesai",
  expired: "Kedaluwarsa",
};

const PACKAGE_LABEL: Record<string, string> = {
  classic: "Classic",
  complete: "Complete Experience",
  luxury: "Unlimited Luxury",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  // RLS memberi Super Admin akses baca ke semua event. Dashboard tetap hanya menampilkan event yang dikelola sendiri
  // (pemilik, co-host, atau anggota organisasi), sama dengan is_event_manager.
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims.sub ?? "";
  const [{ data: cohosted }, { data: memberships }] = await Promise.all([
    supabase.from("event_cohosts").select("event_id").eq("profile_id", uid),
    supabase.from("org_members").select("organization_id").eq("profile_id", uid),
  ]);
  const managed = [`owner_id.eq.${uid}`];
  if (cohosted?.length) managed.push(`id.in.(${cohosted.map((c) => c.event_id).join(",")})`);
  if (memberships?.length) managed.push(`organization_id.in.(${memberships.map((m) => m.organization_id).join(",")})`);
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, slug, status, package")
    .or(managed.join(","))
    .order("created_at", { ascending: false });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Event kamu</h1>
        {!error && events.length > 0 && (
          <Button asChild className="h-11">
            <Link href="/dashboard/events/new">Buat undangan</Link>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Daftar event gagal dimuat. Muat ulang halaman ini; kalau masih gagal, coba lagi beberapa menit lagi.</AlertDescription>
        </Alert>
      )}

      {!error && events.length === 0 && (
        <div className="rounded-xl border border-dashed px-5 py-10 text-center">
          <p className="font-medium">Belum ada event</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Mulai dengan nama mempelai dan jadwal resepsi. Undangan bisa dirakit dan dipratinjau gratis.
          </p>
          <Button asChild className="mt-4 h-11">
            <Link href="/dashboard/events/new">Buat undangan</Link>
          </Button>
        </div>
      )}

      {!error && events.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/events/${event.id}`}
                className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{event.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">/{event.slug}</span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {STATUS_LABEL[event.status] ?? event.status}
                  {" · "}
                  {event.package ? PACKAGE_LABEL[event.package] : "Belum dibayar"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

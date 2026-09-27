import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_STATUS_LABEL, ORDER_STATUS_LABEL, PACKAGE_LABEL, dateTime, rupiah } from "@/lib/admin";
import { requireAdmin } from "../guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 20;

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/cari">) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim();
  // Karakter berikut punya arti di filter PostgREST (.or); dibuang agar kata kunci tidak bisa mengubah query.
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  const isId = UUID.test(q);
  const supabase = await requireAdmin();

  const eventQuery = supabase.from("events").select("id, title, slug, status, package, owner:profiles!events_owner_id_fkey(email)").order("created_at", { ascending: false }).limit(LIMIT);
  const profileQuery = supabase.from("profiles").select("id, email, full_name, role, created_at").order("created_at", { ascending: false }).limit(LIMIT);
  const orderQuery = supabase
    .from("orders")
    .select("id, item_code, amount_idr, status, created_at, provider_ref, item:catalog_items!orders_item_code_fkey(name), event:events!orders_event_id_fkey(id, title), profile:profiles!orders_profile_id_fkey(id, email)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const [events, profiles, orders] = await Promise.all([
    !term ? null : isId ? eventQuery.eq("id", q) : eventQuery.or(`title.ilike.%${term}%,slug.ilike.%${term}%`),
    !term ? null : isId ? profileQuery.eq("id", q) : profileQuery.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`),
    // Tanpa kata kunci: order terbaru, karena pengecekan pembayaran adalah permintaan paling sering.
    !term ? orderQuery : isId ? orderQuery.or(`id.eq.${q},event_id.eq.${q},profile_id.eq.${q}`) : orderQuery.eq("provider_ref", term),
  ]);
  const failed = events?.error || profiles?.error || orders.error;
  if (failed) console.error(`Pencarian admin gagal: ${failed.message}`);
  const empty = term && !failed && !events?.data?.length && !profiles?.data?.length && !orders.data?.length;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cari</h1>
        <p className="text-sm text-muted-foreground">
          Nama atau slug event, email atau nama pengguna, ID transaksi Midtrans, atau ID (event, pengguna, order).
        </p>
      </div>
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Kata kunci
        </label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="budi-ani, budi@gmail.com, atau ID" className="h-11 flex-1" autoFocus />
        <Button type="submit" className="h-11">
          Cari
        </Button>
      </form>

      {failed && <p className="text-sm text-destructive">Pencarian gagal dimuat. Coba lagi; kalau berulang, periksa log server.</p>}
      {empty && (
        <div className="rounded-xl border border-dashed px-5 py-8 text-center">
          <p className="font-medium">Tidak ada hasil untuk “{q}”</p>
          <p className="mt-1 text-sm text-muted-foreground">Coba sebagian nama, slug tanpa garis miring, atau alamat email lengkap.</p>
        </div>
      )}

      {!!events?.data?.length && (
        <Results title="Event">
          {events.data.map((e) => (
            <Row key={e.id} href={`/admin/events/${e.id}`} primary={e.title} secondary={`/${e.slug} · ${e.owner?.email ?? "tanpa pemilik"}`}>
              {EVENT_STATUS_LABEL[e.status] ?? e.status} · {e.package ? PACKAGE_LABEL[e.package] : "Belum dibayar"}
            </Row>
          ))}
        </Results>
      )}

      {!!profiles?.data?.length && (
        <Results title="Pengguna">
          {profiles.data.map((p) => (
            <Row key={p.id} href={`/admin/pengguna/${p.id}`} primary={p.email ?? "(tanpa email)"} secondary={p.full_name ?? "Nama belum diisi"}>
              {p.role === "admin" ? "Admin · " : ""}daftar {dateTime(p.created_at)}
            </Row>
          ))}
        </Results>
      )}

      {!!orders.data?.length && (
        <Results title={term ? "Order" : "Order terbaru"}>
          {orders.data.map((o) => (
            <Row
              key={o.id}
              href={o.event ? `/admin/events/${o.event.id}#order-${o.id}` : o.profile ? `/admin/pengguna/${o.profile.id}` : "/admin/log"}
              primary={`${o.item?.name ?? o.item_code} · ${rupiah(o.amount_idr)}`}
              secondary={`${o.event?.title ?? "tanpa event"} · ${o.profile?.email ?? "-"}`}
            >
              {ORDER_STATUS_LABEL[o.status] ?? o.status} · {dateTime(o.created_at)}
            </Row>
          ))}
        </Results>
      )}
    </>
  );
}

function Results({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">{children}</ul>
    </section>
  );
}

function Row({ href, primary, secondary, children }: { href: string; primary: string; secondary: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0">
          <span className="block truncate font-medium">{primary}</span>
          <span className="block truncate text-sm text-muted-foreground">{secondary}</span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">{children}</span>
      </Link>
    </li>
  );
}

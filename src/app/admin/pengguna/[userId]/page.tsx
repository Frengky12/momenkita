import Link from "next/link";
import { notFound } from "next/navigation";
import { Field } from "@/components/dashboard/field";
import { Input } from "@/components/ui/input";
import { EVENT_STATUS_LABEL, ORDER_STATUS_LABEL, PACKAGE_LABEL, dateTime, rupiah } from "@/lib/admin";
import { ActionForm } from "../../action-form";
import { adjustCredit } from "../../actions";
import { AuditList } from "../../audit-list";
import { requireAdmin } from "../../guard";

export default async function AdminUserPage({ params }: PageProps<"/admin/pengguna/[userId]">) {
  const { userId } = await params;
  const supabase = await requireAdmin();
  const [{ data: profile }, { data: events }, { data: orders }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, phone, role, created_at").eq("id", userId).maybeSingle(),
    supabase.from("events").select("id, title, slug, status, package").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, item_code, amount_idr, status, created_at, event_id, item:catalog_items!orders_item_code_fkey(name)")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("org_members").select("role, organization:organizations!org_members_organization_id_fkey(id, name, slug)").eq("profile_id", userId),
  ]);
  if (!profile) notFound();

  const orgs = (memberships ?? []).flatMap((m) => (m.organization ? [{ ...m.organization, role: m.role }] : []));
  const { data: ledger } = orgs.length
    ? await supabase.from("credit_ledger").select("organization_id, delta").in("organization_id", orgs.map((o) => o.id))
    : { data: [] };
  const balance = (orgId: string) => (ledger ?? []).filter((l) => l.organization_id === orgId).reduce((sum, l) => sum + l.delta, 0);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{profile.email ?? "(tanpa email)"}</h1>
        <p className="text-sm text-muted-foreground">
          {profile.full_name ?? "Nama belum diisi"}
          {profile.phone && ` · ${profile.phone}`} · {profile.role === "admin" ? "Admin" : "Host"} · daftar {dateTime(profile.created_at)} WIB
        </p>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="event">
        <h2 id="event" className="font-semibold">
          Event milik pengguna
        </h2>
        {!events?.length ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum membuat event.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/admin/events/${e.id}`}
                  className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">/{e.slug}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {EVENT_STATUS_LABEL[e.status] ?? e.status} · {e.package ? PACKAGE_LABEL[e.package] : "Belum dibayar"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="order">
        <h2 id="order" className="font-semibold">
          Order
        </h2>
        {!orders?.length ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum ada order.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {orders.map((o) => {
              const body = (
                <>
                  <span className="font-medium">
                    {o.item?.name ?? o.item_code} · {rupiah(o.amount_idr)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {ORDER_STATUS_LABEL[o.status] ?? o.status} · {dateTime(o.created_at)}
                  </span>
                </>
              );
              const rowClass = "flex min-h-11 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
              return (
                <li key={o.id}>
                  {/* Tindakan order (refund, cek ulang) ada di halaman event-nya; order tanpa event hanya ditampilkan. */}
                  {o.event_id ? (
                    <Link href={`/admin/events/${o.event_id}#order-${o.id}`} className={`${rowClass} transition-colors hover:bg-muted`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="kredit">
        <div>
          <h2 id="kredit" className="font-semibold">
            Kredit organisasi
          </h2>
          <p className="text-sm text-muted-foreground">Saldo token milik organisasi WO. Setiap penyesuaian tercatat di ledger kredit dan log admin.</p>
        </div>
        {orgs.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Pengguna ini belum tergabung di organisasi, jadi tidak punya saldo kredit.
          </p>
        ) : (
          orgs.map((org) => (
            <div key={org.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
              <p>
                <span className="font-medium">{org.name}</span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  · {org.role === "owner" ? "pemilik" : "anggota"} · saldo <span className="tabular-nums">{balance(org.id)}</span> token
                </span>
              </p>
              <ActionForm action={adjustCredit.bind(null, org.id)} submitLabel="Simpan penyesuaian" reasonPlaceholder="Contoh: kompensasi gangguan layar panggung 27 Sep">
                <Field label="Jumlah token (negatif untuk mengurangi)" htmlFor={`delta-${org.id}`}>
                  <Input id={`delta-${org.id}`} name="delta" type="number" step={1} min={-1000} max={1000} required className="h-11 w-40" />
                </Field>
              </ActionForm>
            </div>
          ))
        )}
      </section>

      {orgs.length > 0 && <AuditList filter={{ column: "organization_id", value: orgs.map((o) => o.id) }} title="Log kredit organisasi" />}
    </>
  );
}

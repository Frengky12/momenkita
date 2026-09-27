import Link from "next/link";
import { notFound } from "next/navigation";
import { Field, selectClassName } from "@/components/dashboard/field";
import { DOMAIN_STATUS_LABEL, EVENT_STATUS_LABEL, ORDER_STATUS_LABEL, PACKAGE_LABEL, dateTime, rupiah } from "@/lib/admin";
import { ActionForm } from "../../action-form";
import { activateEvent, reconcileOrderAction, recordRefund } from "../../actions";
import { AuditList } from "../../audit-list";
import { requireAdmin } from "../../guard";

const PACKAGES = ["classic", "complete", "luxury"];

export default async function AdminEventPage({ params }: PageProps<"/admin/events/[eventId]">) {
  const { eventId } = await params;
  const supabase = await requireAdmin();
  const [{ data: event }, { data: orders }, { count: photos }, { count: invitations }, { count: openReports }, { data: domains }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, slug, status, package, photo_quota, created_at, published_at, storage_expires_at, owner:profiles!events_owner_id_fkey(id, email, full_name), organization:organizations!events_organization_id_fkey(id, name)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, item_code, amount_idr, status, created_at, paid_at, provider_ref, item:catalog_items!orders_item_code_fkey(name, item_type)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).neq("status", "deleted"),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("photo_reports").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("resolved_at", null),
    supabase.from("custom_domains").select("id, domain, status").eq("event_id", eventId),
  ]);
  if (!event) notFound();

  const rank = event.package ? PACKAGES.indexOf(event.package) : -1;
  const upgrades = PACKAGES.slice(rank + 1);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {EVENT_STATUS_LABEL[event.status] ?? event.status} · {event.package ? PACKAGE_LABEL[event.package] : "Belum dibayar"} ·{" "}
          <a href={`/${event.slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            /{event.slug}
          </a>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3 sm:p-5">
        <Item label="Pemilik">
          {event.owner ? (
            <Link href={`/admin/pengguna/${event.owner.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4 [overflow-wrap:anywhere]">
              {event.owner.email}
            </Link>
          ) : (
            "-"
          )}
        </Item>
        <Item label="Organisasi">{event.organization?.name ?? "Pribadi"}</Item>
        <Item label="Dibuat">{dateTime(event.created_at)}</Item>
        <Item label="Dipublikasikan">{event.published_at ? dateTime(event.published_at) : "Belum"}</Item>
        <Item label="Foto">{`${(photos ?? 0).toLocaleString("id-ID")} dari kuota ${event.photo_quota.toLocaleString("id-ID")}`}</Item>
        <Item label="Undangan tamu">{invitations ?? 0}</Item>
        <Item label="Laporan terbuka">
          {openReports ? (
            <Link href="/admin/laporan" className="inline-flex min-h-11 items-center underline underline-offset-4">
              {openReports} di antrean laporan
            </Link>
          ) : (
            "0"
          )}
        </Item>
        <Item label="Penyimpanan sampai">{event.storage_expires_at ? dateTime(event.storage_expires_at) : "-"}</Item>
        <Item label="Custom domain">
          {domains?.length
            ? domains.map((d) => `${d.domain} (${DOMAIN_STATUS_LABEL[d.status] ?? d.status})`).join(", ")
            : event.package === "luxury"
              ? "Belum diatur"
              : "Hanya Luxury"}
        </Item>
      </dl>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="aktivasi">
        <div>
          <h2 id="aktivasi" className="font-semibold">
            Aktivasi manual
          </h2>
          <p className="text-sm text-muted-foreground">
            Untuk acara pilot gratis atau pembayaran di luar Midtrans. Paket hanya bisa naik; kuota foto mengikuti katalog.
          </p>
        </div>
        {upgrades.length > 0 ? (
          <ActionForm action={activateEvent.bind(null, event.id)} submitLabel="Aktifkan paket" confirmMessage="Aktifkan paket ini tanpa pembayaran Midtrans?">
            <Field label="Paket" htmlFor="package">
              <select key={upgrades[0]} id="package" name="package" className={selectClassName} defaultValue={upgrades[0]}>
                {upgrades.map((p) => (
                  <option key={p} value={p}>
                    {PACKAGE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        ) : (
          <p className="text-sm">Event sudah di paket tertinggi.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="order">
        <h2 id="order" className="font-semibold">
          Order
        </h2>
        {!orders?.length ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum ada order untuk event ini.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li key={order.id} id={`order-${order.id}`} className="flex scroll-mt-24 flex-col gap-3 rounded-xl border bg-card p-4 target:border-primary">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {order.item?.name ?? order.item_code} · {rupiah(order.amount_idr)}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      Order {order.id}
                      {order.provider_ref && ` · Midtrans ${order.provider_ref}`}
                    </p>
                  </div>
                  <p className="text-sm">
                    <span className={order.status === "paid" ? "font-medium" : undefined}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
                    <span className="text-muted-foreground"> · {dateTime(order.paid_at ?? order.created_at)}</span>
                  </p>
                </div>
                {order.status === "pending" && (
                  <details className="rounded-lg border p-3">
                    <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Cek ulang ke Midtrans</summary>
                    <div className="mt-2">
                      <ActionForm
                        action={reconcileOrderAction.bind(null, order.id)}
                        submitLabel="Cek status sekarang"
                        pendingLabel="Menghubungi Midtrans..."
                        reasonPlaceholder="Contoh: host sudah bayar tetapi paket belum aktif"
                      />
                    </div>
                  </details>
                )}
                {order.status === "paid" && (
                  <details className="rounded-lg border p-3">
                    <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Catat refund</summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        Uang dikembalikan di luar aplikasi (dashboard Midtrans atau transfer). Di sini hanya status order yang berubah.
                      </p>
                      <ActionForm
                        action={recordRefund.bind(null, order.id)}
                        submitLabel="Catat refund"
                        destructive
                        confirmMessage={`Tandai order ${rupiah(order.amount_idr)} sebagai direfund?`}
                        reasonPlaceholder="Contoh: acara batal, refund penuh sesuai kebijakan"
                      >
                        {order.item?.item_type === "event_package" && (
                          <label className="flex min-h-11 items-center gap-3 text-sm">
                            <input type="checkbox" name="revert" className="size-5 accent-primary" />
                            Kembalikan event ke draf (paket dicabut, undangan tidak lagi publik)
                          </label>
                        )}
                      </ActionForm>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AuditList filter={{ column: "event_id", value: event.id }} title="Log admin untuk event ini" />
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

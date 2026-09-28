import { notFound } from "next/navigation";
import { CopyButton } from "@/components/dashboard/copy-button";
import { SectionForm } from "@/components/dashboard/section-form";
import { invitationBase } from "@/lib/invitation/origin";
import { promoEndLabel, type PromoStatus } from "@/lib/promo";
import { createClient } from "@/lib/supabase/server";
import { claimPromo, publishEvent, startCheckout } from "./actions";
import { OrderStatus } from "./order-status";

const PACKAGE_LABEL: Record<string, string> = { classic: "Classic", complete: "Complete Experience", luxury: "Unlimited Luxury" };

// Isi paket mengikuti PRD §3.2.
const PACKAGE_FEATURES: Record<string, string[]> = {
  classic: ["Undangan web dan link personal per tamu", "RSVP, ucapan, kalender, Maps/Waze", "Amplop digital"],
  complete: ["Semua fitur Classic", "QR check-in buku tamu", "Kamera POV tamu hingga 1.000 foto", "Live slideshow dan moderasi", "Galeri dan unduh ZIP, disimpan 6 bulan"],
  luxury: ["Semua fitur Complete", "Kuota foto tanpa batas (fair use)", "Unduh kualitas asli, album disimpan selamanya", "Custom domain 1 tahun"],
};

const ORDER_STATUS: Record<string, string> = { pending: "Menunggu pembayaran", paid: "Lunas", failed: "Gagal", expired: "Kedaluwarsa", refunded: "Dikembalikan" };

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export default async function PublishPage({ params, searchParams }: PageProps<"/dashboard/events/[eventId]/publikasi">) {
  const { eventId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: event }, { data: catalog }, { data: orders }, { data: promoData }, { data: myClaims }, { data: auth }] = await Promise.all([
    supabase.from("events").select("id, slug, status, package, published_at, owner_id").eq("id", eventId).maybeSingle(),
    supabase.from("catalog_items").select("code, item_type, name, price_idr, package, from_package").eq("is_active", true).order("price_idr"),
    supabase.from("orders").select("id, item_code, amount_idr, status, created_at, paid_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.rpc("launch_promo_status"),
    // RLS promo_claims hanya mengembalikan klaim milik user ini.
    supabase.from("promo_claims").select("event_id"),
    supabase.auth.getClaims(),
  ]);
  if (!event) notFound();

  const items = catalog ?? [];
  const orderList = orders ?? [];
  const itemName = (code: string) => items.find((i) => i.code === code)?.name ?? code;
  // Midtrans menambahkan ?order_id=... ke URL kembali. Tanpa itu (host membuka tab ini sendiri),
  // pesanan pending terbaru tetap dicek agar pembayaran yang sudah masuk tidak menggantung.
  const offers = items.filter((item) => {
    if (item.item_type === "event_package") return event.package === null;
    if (item.item_type === "upgrade") return event.package !== null && item.from_package === event.package;
    if (item.item_type === "addon") return item.code === "addon_album_12m" ? event.package === "complete" : event.package === "complete" || event.package === "luxury";
    return false;
  });

  const returnedOrderId = typeof query.order_id === "string" ? query.order_id : null;
  // Pesanan pending yang itemnya tidak berlaku lagi (misalnya paket sudah aktif dari pesanan lain) tidak ditampilkan sebagai "menunggu".
  const returnedOrder =
    orderList.find((o) => o.id === returnedOrderId) ??
    orderList.find((o) => o.status === "pending" && offers.some((item) => item.code === o.item_code));
  const publicUrl = await invitationBase(supabase, event.id, event.slug);

  const promo = promoData as PromoStatus | null;
  const promoOffer = Boolean(promo?.active) && event.package === null;
  const isOwner = event.owner_id === auth?.claims.sub;
  const quotaLeft = (promo?.per_account ?? 0) - (myClaims?.length ?? 0);
  const activatedByPromo = myClaims?.some((c) => c.event_id === event.id) ?? false;

  return (
    <div className="flex flex-col gap-6">
      {returnedOrder && <OrderStatus eventId={event.id} orderId={returnedOrder.id} initial={returnedOrder.status} />}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Publikasi</h2>
          {event.published_at ? (
            <p className="text-sm text-muted-foreground">
              Dipublikasikan sejak {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(event.published_at))}. Alamat undangan sudah
              terkunci.
            </p>
          ) : event.package ? (
            <p className="text-sm text-muted-foreground">
              {activatedByPromo ? "Paket aktif gratis lewat promo peluncuran. " : "Paket sudah aktif. "}
              Setelah dipublikasikan, link bisa dibagikan dan alamat undangan terkunci.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {promoOffer ? "Aktifkan paket gratis atau pilih paket berbayar di bawah" : "Pilih dan bayar paket di bawah"} untuk bisa mempublikasikan undangan.
            </p>
          )}
        </div>
        {event.published_at ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-primary underline underline-offset-4">
              {publicUrl}
            </a>
            <CopyButton text={publicUrl} />
          </div>
        ) : (
          event.package && (
            <SectionForm
              action={publishEvent.bind(null, event.id)}
              submitLabel="Publikasikan undangan"
              pendingLabel="Mempublikasikan..."
              confirmMessage="Publikasikan sekarang? Alamat undangan tidak bisa diubah lagi setelah ini."
            />
          )
        )}
      </section>

      {promo && promoOffer && (
        <section className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-4 sm:p-6" aria-labelledby="promo">
          <div className="flex flex-col gap-1">
            <h2 id="promo" className="text-lg font-semibold">
              Gratis selama masa peluncuran
            </h2>
            <p className="text-sm text-muted-foreground">
              Paket {PACKAGE_LABEL[promo.package]} tanpa bayar, {promo.per_account === 1 ? "satu event" : `${promo.per_account} event`} per akun
              {promo.ends_at ? `, sampai ${promoEndLabel(promo.ends_at)}` : ""}. Upgrade dan add-on tetap bisa dibeli kapan saja.
            </p>
          </div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {PACKAGE_FEATURES[promo.package].map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {!isOwner ? (
            <p className="text-sm">Hanya pemilik event yang bisa mengaktifkan paket gratis.</p>
          ) : quotaLeft <= 0 ? (
            <p className="text-sm">Kuota gratis akunmu sudah terpakai untuk event lain. Paket berbayar di bawah tetap bisa dipilih.</p>
          ) : (
            <SectionForm
              action={claimPromo.bind(null, event.id)}
              submitLabel={`Aktifkan ${PACKAGE_LABEL[promo.package]} gratis`}
              pendingLabel="Mengaktifkan..."
              confirmMessage={`Pakai kuota gratis akunmu untuk event ini? Kuota tidak bisa dipindahkan ke event lain setelah dipakai.`}
            />
          )}
        </section>
      )}

      {offers.length > 0 && (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{event.package ? `Paket aktif: ${PACKAGE_LABEL[event.package]}` : promoOffer ? "Atau pilih paket berbayar" : "Pilih paket"}</h2>
            <p className="text-sm text-muted-foreground">Pembayaran lewat Midtrans: QRIS, e-wallet, atau virtual account.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {offers.map((item) => {
              const features = item.item_type === "event_package" && item.package ? PACKAGE_FEATURES[item.package] : null;
              return (
                <li key={item.code} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-lg font-bold">{rupiah(item.price_idr)}</p>
                    {features && (
                      <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                        {features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <SectionForm action={startCheckout.bind(null, event.id, item.code)} submitLabel="Bayar" pendingLabel="Membuka pembayaran..." />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Riwayat pembayaran</h2>
        {orderList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pembayaran untuk event ini.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {orderList.map((order) => (
              <li key={order.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{itemName(order.item_code)}</span>
                <span className="text-sm text-muted-foreground">
                  {rupiah(order.amount_idr)} · {ORDER_STATUS[order.status] ?? order.status} ·{" "}
                  {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(order.created_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

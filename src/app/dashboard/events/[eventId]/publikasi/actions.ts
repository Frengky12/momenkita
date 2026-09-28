"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { SaveState } from "@/components/dashboard/section-form";
import { requestOrigin } from "@/lib/invitation/origin";
import { createSnapTransaction } from "@/lib/midtrans";
import { reconcileOrder, type OrderOutcome } from "@/lib/orders";
import { reportError } from "@/lib/report-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });

// Item yang boleh dibeli bergantung paket event saat ini (PRD §3.2); harga selalu dari catalog_items, bukan dari browser.
function isApplicable(item: { item_type: string; code: string; from_package: string | null }, eventPackage: string | null) {
  if (item.item_type === "event_package") return eventPackage === null;
  if (item.item_type === "upgrade") return eventPackage !== null && item.from_package === eventPackage;
  if (item.item_type === "addon") {
    if (item.code === "addon_album_12m") return eventPackage === "complete";
    return eventPackage === "complete" || eventPackage === "luxury";
  }
  return false;
}

export async function startCheckout(eventId: string, itemCode: string): Promise<SaveState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = claims?.claims.email;
  if (!userId || !email) return failed("Sesi berakhir. Masuk lagi.");

  const [{ data: event }, { data: item }, { data: profile }] = await Promise.all([
    supabase.from("events").select("id, package").eq("id", eventId).maybeSingle(),
    supabase.from("catalog_items").select("code, item_type, name, price_idr, from_package").eq("code", itemCode).eq("is_active", true).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (!event) return failed("Event tidak ditemukan.");
  if (!item || !isApplicable(item, event.package)) return failed("Paket ini tidak bisa dibeli untuk event ini.");

  // orders tidak bisa ditulis host (RLS), jadi dibuat server dengan harga dari katalog.
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .insert({ profile_id: userId, event_id: event.id, item_code: item.code, amount_idr: item.price_idr })
    .select("id")
    .single();
  if (error) return failed("Pesanan gagal dibuat. Coba lagi.");

  let redirectUrl: string;
  try {
    const snap = await createSnapTransaction({
      orderId: order.id,
      amount: item.price_idr,
      item: { id: item.code, name: item.name },
      customer: { email, name: profile?.full_name || email },
      finishUrl: `${await requestOrigin()}/dashboard/events/${event.id}/publikasi`,
    });
    redirectUrl = snap.redirectUrl;
  } catch (e) {
    reportError("Halaman pembayaran Midtrans gagal dibuat", e, { orderId: order.id });
    await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
    return failed("Halaman pembayaran gagal dibuka. Coba lagi beberapa saat lagi.");
  }
  // Di luar try: redirect() bekerja dengan melempar error khusus Next.js.
  redirect(redirectUrl);
}

export async function checkOrder(eventId: string, orderId: string): Promise<OrderOutcome> {
  const supabase = await createClient();
  // RLS orders hanya mengembalikan pesanan milik user ini.
  const { data: order } = await supabase.from("orders").select("id").eq("id", orderId).eq("event_id", eventId).maybeSingle();
  if (!order) return "not_found";
  const outcome = await reconcileOrder(order.id);
  if (outcome === "paid") refresh();
  return outcome;
}

export async function publishEvent(eventId: string): Promise<SaveState> {
  const supabase = await createClient();
  // RLS menolak publikasi selama status masih draf (belum dibayar).
  const { data, error } = await supabase
    .from("events")
    .update({ published_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("published_at", null)
    .select("id");
  if (error) return failed("Pilih dan bayar paket dulu sebelum mempublikasikan.");
  if (!data?.length) return failed("Undangan sudah dipublikasikan.");
  refresh();
  return { status: "saved", at: Date.now() };
}

// Promo masa peluncuran: semua pengecekan (promo aktif, pemilik, kuota per akun) ada di RPC claim_launch_promo.
export async function claimPromo(eventId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_launch_promo", { p_event_id: eventId });
  if (error) {
    const message = error.message.includes("sudah terpakai")
      ? "Kuota gratis akunmu sudah terpakai untuk event lain. Paket berbayar di bawah tetap bisa dipilih."
      : error.message.includes("tidak aktif")
        ? "Promo peluncuran sudah berakhir. Pilih paket berbayar di bawah."
        : error.message.includes("pemilik")
          ? "Hanya pemilik event yang bisa mengaktifkan paket gratis."
          : error.message.includes("berpaket")
            ? "Event ini sudah punya paket."
            : "Gagal mengaktifkan paket gratis. Coba lagi.";
    return failed(message);
  }
  refresh();
  return { status: "saved", at: Date.now() };
}

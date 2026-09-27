import "server-only";
import { cancelTransaction, getTransactionStatus } from "@/lib/midtrans";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrderOutcome = "paid" | "pending" | "expired" | "failed" | "not_found" | "error";

type AdminClient = ReturnType<typeof createAdminClient>;

// Sumber kebenaran status pembayaran selalu API Midtrans, bukan isi notifikasi atau parameter URL.
// Dipanggil webhook dan halaman kembali dari Midtrans; fulfill_order idempoten sehingga aman dipanggil berulang.
export async function reconcileOrder(orderId: string): Promise<OrderOutcome> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order) return "not_found";
  if (order.status === "paid") return "paid";
  if (order.status !== "pending") return order.status === "expired" ? "expired" : "failed";

  const status = await getTransactionStatus(orderId);
  // 404: host belum memilih metode pembayaran di halaman Snap.
  if (status.status_code === "404" || !status.transaction_status) return "pending";

  const paid =
    status.transaction_status === "settlement" || (status.transaction_status === "capture" && status.fraud_status === "accept");

  if (paid) {
    const { error } = await admin.rpc("fulfill_order", {
      p_order_id: orderId,
      p_provider_ref: status.transaction_id ?? "",
      p_gross_amount: Math.round(Number(status.gross_amount)),
    });
    if (error) {
      // Dana sudah masuk tetapi pesanan tidak bisa dipenuhi (misalnya paket sudah aktif dari pesanan lain): refund manual.
      console.error(`PERLU REFUND MANUAL: order ${orderId} lunas di Midtrans tetapi fulfill_order gagal: ${error.message}`);
      return "error";
    }
    await cancelSupersededOrders(admin, orderId);
    return "paid";
  }

  const next =
    status.transaction_status === "expire" ? "expired" : ["cancel", "deny", "failure"].includes(status.transaction_status) ? "failed" : null;
  if (next) {
    await admin.from("orders").update({ status: next }).eq("id", orderId).eq("status", "pending");
    return next;
  }
  return "pending";
}

// Setelah paket/upgrade lunas, pesanan paket lain yang masih pending untuk event yang sama tidak berlaku lagi.
// Dibatalkan di Midtrans agar QR/VA lamanya tidak bisa dibayar (mencegah pembayaran ganda). Add-on tidak disentuh.
async function cancelSupersededOrders(admin: AdminClient, paidOrderId: string) {
  const { data: paid } = await admin.from("orders").select("event_id").eq("id", paidOrderId).maybeSingle();
  if (!paid?.event_id) return;

  const { data: pending } = await admin
    .from("orders")
    .select("id, catalog_items(item_type)")
    .eq("event_id", paid.event_id)
    .eq("status", "pending")
    .neq("id", paidOrderId);

  for (const order of pending ?? []) {
    if (!["event_package", "upgrade"].includes(order.catalog_items?.item_type ?? "")) continue;
    try {
      const result = await cancelTransaction(order.id);
      // Transaksi Snap tanpa metode bayar (404) tidak bisa dibatalkan; biarkan pending sampai kedaluwarsa 24 jam.
      if (result.transaction_status === "cancel" || result.transaction_status === "expire") {
        await admin.from("orders").update({ status: "failed" }).eq("id", order.id).eq("status", "pending");
      }
    } catch (e) {
      console.error(`Gagal membatalkan pesanan ${order.id}:`, e);
    }
  }
}

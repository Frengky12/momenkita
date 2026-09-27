"use server";

import { refresh } from "next/cache";
import { cancelPendingPackageOrders, reconcileOrder } from "@/lib/orders";
import { deleteObjects } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Semua tindakan Super Admin wajib beralasan (PRD §5.7). Hak akses diperiksa RPC admin_* di database (is_admin),
// sehingga action ini tidak bisa dipakai host biasa walau dipanggil langsung.

export type AdminState = { status: "idle" } | { status: "done"; message: string; at: number } | { status: "error"; message: string; at: number };

const done = (message: string): AdminState => ({ status: "done", message, at: Date.now() });
const failed = (message: string): AdminState => ({ status: "error", message, at: Date.now() });

function reasonOf(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason.length >= 5 ? reason : null;
}

// Pesan exception dari RPC sudah berbahasa Indonesia; akses ditolak disamakan agar tidak membocorkan detail.
function rpcError(error: { code?: string; message: string }) {
  if (error.code === "42501") return failed("Akses ditolak. Hanya Super Admin yang bisa melakukan ini.");
  return failed(error.message);
}

const NEED_REASON = failed("Tulis alasan minimal 5 karakter; alasan tercatat di log audit.");

export async function activateEvent(eventId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_activate_event", { p_event_id: eventId, p_package: String(formData.get("package") ?? ""), p_reason: reason });
  if (error) return rpcError(error);
  await cancelPendingPackageOrders(eventId);
  refresh();
  return done("Event aktif dengan paket baru.");
}

export async function recordRefund(orderId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_refund", { p_order_id: orderId, p_reason: reason, p_revert_event: formData.get("revert") === "on" });
  if (error) return rpcError(error);
  refresh();
  return done("Refund tercatat. Pengembalian dana dilakukan di luar aplikasi (dashboard Midtrans atau transfer).");
}

// Cek status pembayaran langsung ke Midtrans, misalnya bila webhook gagal. Memakai jalur yang sama dengan webhook.
export async function reconcileOrderAction(orderId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const supabase = await createClient();
  const [{ data: isAdmin }, { data: claims }, { data: order }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.auth.getClaims(),
    supabase.from("orders").select("event_id").eq("id", orderId).maybeSingle(),
  ]);
  if (!isAdmin || !claims?.claims) return failed("Akses ditolak. Hanya Super Admin yang bisa melakukan ini.");

  const outcome = await reconcileOrder(orderId);
  await createAdminClient().rpc("log_admin_action", {
    p_action: "reconcile_order",
    p_reason: reason,
    p_order_id: orderId,
    p_event_id: order?.event_id ?? undefined,
    p_details: { outcome },
    p_actor_id: claims.claims.sub,
  });
  refresh();
  const messages: Record<string, string> = {
    paid: "Lunas di Midtrans; event sudah diaktifkan.",
    pending: "Midtrans masih menunggu pembayaran.",
    expired: "Transaksi kedaluwarsa di Midtrans.",
    failed: "Transaksi gagal atau dibatalkan di Midtrans.",
    not_found: "Order tidak ditemukan.",
    error: "Lunas di Midtrans tetapi paket gagal dipasang (misalnya event sudah berpaket). Aktivasi manual atau catat refund.",
  };
  return outcome === "error" ? failed(messages.error) : done(messages[outcome]);
}

export async function takedownPhoto(photoId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_takedown_photo", { p_photo_id: photoId, p_reason: reason });
  if (error) return rpcError(error);
  refresh();
  try {
    await deleteObjects((data as { keys: string[] }).keys);
  } catch {
    return failed("Foto sudah diturunkan dari panggung dan galeri, tetapi file di R2 gagal dihapus. Ulangi dari log atau hapus manual.");
  }
  return done("Foto diturunkan dan filenya dihapus permanen.");
}

// Antrean dikelompokkan per foto; semua laporan terbuka untuk foto itu ditutup sekaligus.
export async function dismissReports(reportIds: string[], _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const supabase = await createClient();
  for (const reportId of reportIds) {
    const { error } = await supabase.rpc("admin_dismiss_report", { p_report_id: reportId, p_reason: reason });
    if (error) return rpcError(error);
  }
  refresh();
  return done("Laporan ditutup; foto tetap tayang.");
}

export async function adjustCredit(organizationId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const delta = Number(formData.get("delta"));
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) return failed("Isi jumlah token bulat, bukan 0 (boleh negatif).");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adjust_credit", { p_organization_id: organizationId, p_delta: delta, p_reason: reason });
  if (error) return rpcError(error);
  refresh();
  return done(`Saldo sekarang ${(data as { balance: number }).balance} token.`);
}

const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export async function upsertDomain(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  const eventId = String(formData.get("event_id") ?? "");
  if (!reason) return NEED_REASON;
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!DOMAIN_PATTERN.test(domain)) return failed("Format domain belum benar. Contoh: budi-ani.com");
  const paidBy = formData.get("paid_by") === "customer" ? "customer" : "platform";
  const until = String(formData.get("registered_until") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_domain", {
    p_domain: domain,
    p_event_id: eventId,
    p_paid_by: paidBy,
    // Tanggal boleh kosong (domain milik pelanggan); tipe hasil generate tidak menandai argumen ini nullable.
    p_registered_until: (until || null) as string,
    p_reason: reason,
  });
  if (error) return rpcError(error);
  refresh();
  return done(`Domain ${domain} tersimpan. Ubah statusnya setelah DNS valid di Vercel.`);
}

const DOMAIN_STATUSES = ["pending_dns", "active", "failed", "expired"];

export async function setDomainStatus(domainId: string, _prev: AdminState, formData: FormData): Promise<AdminState> {
  const reason = reasonOf(formData);
  if (!reason) return NEED_REASON;
  const status = String(formData.get("status") ?? "");
  if (!DOMAIN_STATUSES.includes(status)) return failed("Pilih status domain.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_domain_status", { p_domain_id: domainId, p_status: status, p_reason: reason });
  if (error) return rpcError(error);
  refresh();
  return done("Status domain diperbarui.");
}

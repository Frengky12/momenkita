// Label dan format bersama untuk area Super Admin. Waktu admin selalu WIB; waktu acara memakai zona event.

export const PACKAGE_LABEL: Record<string, string> = { classic: "Classic", complete: "Complete Experience", luxury: "Unlimited Luxury" };
export const EVENT_STATUS_LABEL: Record<string, string> = { draft: "Draf", active: "Aktif", completed: "Selesai", expired: "Kedaluwarsa" };
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu bayar",
  paid: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  refunded: "Direfund",
};
export const REPORT_REASON_LABEL: Record<string, string> = {
  privacy: "Tamu ada di foto dan ingin dihapus",
  inappropriate: "Foto tidak pantas",
  other: "Alasan lain",
};
export const DOMAIN_STATUS_LABEL: Record<string, string> = {
  pending_dns: "Menunggu DNS",
  active: "Aktif",
  failed: "Gagal",
  expired: "Kedaluwarsa",
};
export const MODERATION_LABEL: Record<string, string> = { curated: "kurasi", delayed: "jeda 15 detik", instant: "instan" };
export const ACTION_LABEL: Record<string, string> = {
  activate_event: "Aktivasi manual",
  record_refund: "Catat refund",
  reconcile_order: "Cek ulang Midtrans",
  takedown_photo: "Takedown foto",
  dismiss_report: "Abaikan laporan",
  adjust_credit: "Penyesuaian kredit",
  upsert_domain: "Simpan domain",
  set_domain_status: "Status domain",
  set_launch_promo: "Atur promo peluncuran",
  revoke_promo: "Cabut promo",
};

export const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export const dateTime = (iso: string, timeZone = "Asia/Jakarta") =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });

export const time = (iso: string, timeZone = "Asia/Jakarta") => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone });

// Dipanggil saat render server untuk umur data (laporan, detak panggung); dipisah agar render tetap mudah dibaca.
export const secondsSince = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));

export function ago(iso: string) {
  const s = secondsSince(iso);
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

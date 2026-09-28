import Link from "next/link";
import { ACTION_LABEL, DOMAIN_STATUS_LABEL, PACKAGE_LABEL, dateTime, rupiah } from "@/lib/admin";
import { requireAdmin } from "./guard";

type Details = Record<string, string | number | boolean | null>;

const OUTCOME_LABEL: Record<string, string> = {
  paid: "lunas",
  pending: "masih menunggu pembayaran",
  expired: "kedaluwarsa",
  failed: "gagal atau dibatalkan",
  not_found: "order tidak ditemukan",
  error: "lunas tetapi paket gagal dipasang",
};

// Ringkasan satu baris dari kolom details, sesuai isi yang ditulis tiap RPC admin_*.
function describe(action: string, d: Details) {
  switch (action) {
    case "activate_event":
      return `${d.from_package ? PACKAGE_LABEL[String(d.from_package)] : "Belum berpaket"} ke ${PACKAGE_LABEL[String(d.to_package)]}`;
    case "record_refund":
      return `${d.item_code} ${rupiah(Number(d.amount_idr))}${d.revert_event ? ", event kembali ke draf" : ""}`;
    case "reconcile_order":
      return `Hasil: ${OUTCOME_LABEL[String(d.outcome)] ?? d.outcome}`;
    case "takedown_photo":
      return `Foto dari ${d.uploader_name}`;
    case "dismiss_report":
      return "Foto tetap tayang";
    case "adjust_credit":
      return `${Number(d.delta) > 0 ? "+" : ""}${d.delta} token, saldo ${d.balance}`;
    case "upsert_domain":
      return `${d.domain}, dibayar ${d.paid_by === "customer" ? "pelanggan" : "platform"}`;
    case "set_launch_promo":
      return d.active ? `Aktif, ${PACKAGE_LABEL[String(d.package)]}, ${d.per_account} event per akun${d.ends_at ? `, sampai ${dateTime(String(d.ends_at))}` : ""}` : "Dimatikan";
    case "revoke_promo":
      return `Paket ${PACKAGE_LABEL[String(d.package)]} dicabut, event kembali ke draf`;
    case "set_domain_status":
      return `${d.domain}: ${DOMAIN_STATUS_LABEL[String(d.status)] ?? d.status}`;
    default:
      return "";
  }
}

export async function AuditList({
  filter,
  title,
  limit = 20,
}: {
  filter?: { column: "event_id" | "organization_id"; value: string | string[] };
  title: string;
  limit?: number;
}) {
  const supabase = await requireAdmin();
  let query = supabase
    .from("admin_actions")
    .select("id, action, reason, details, created_at, event_id, actor:profiles!admin_actions_actor_id_fkey(email), event:events!admin_actions_event_id_fkey(title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter) query = Array.isArray(filter.value) ? query.in(filter.column, filter.value) : query.eq(filter.column, filter.value);
  const { data: actions, error } = await query;

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      {error && <p className="text-sm text-destructive">Log gagal dimuat. Muat ulang halaman.</p>}
      {!error && actions.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum ada tindakan admin.</p>
      )}
      {!error && actions.length > 0 && (
        <ol className="flex flex-col divide-y rounded-xl border bg-card">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-medium">
                  {ACTION_LABEL[a.action] ?? a.action}
                  <span className="font-normal text-muted-foreground"> · {describe(a.action, a.details as Details)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(a.created_at)} WIB · {a.actor?.email ?? "sistem"}
                </p>
              </div>
              <p className="[overflow-wrap:anywhere]">Alasan: {a.reason}</p>
              {!filter && a.event && a.event_id && (
                <Link href={`/admin/events/${a.event_id}`} className="inline-flex min-h-11 w-fit items-center text-muted-foreground underline underline-offset-4">
                  {a.event.title}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

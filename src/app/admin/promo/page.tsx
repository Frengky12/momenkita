import Link from "next/link";
import { Field, selectClassName } from "@/components/dashboard/field";
import { Input } from "@/components/ui/input";
import { PACKAGE_LABEL, dateTime, rupiah } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "../action-form";
import { revokePromo, setLaunchPromo } from "../actions";
import { requireAdmin } from "../guard";

// Tanggal berakhir disimpan sebagai akhir hari WIB; input tanggal menampilkan tanggal WIB-nya kembali.
const wibDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(iso));
const isPast = (iso: string | null) => iso !== null && Date.parse(iso) <= Date.now();

export default async function AdminPromoPage() {
  const supabase = await requireAdmin();
  // launch_promo tidak bisa dibaca langsung oleh role authenticated; halaman ini sudah dijaga requireAdmin.
  const [{ data: promo }, { data: claims, error }] = await Promise.all([
    createAdminClient().from("launch_promo").select("active, package, per_account, ends_at, updated_at").maybeSingle(),
    supabase
      .from("promo_claims")
      .select("id, package, claimed_at, revoked_at, event:events!promo_claims_event_id_fkey(id, title, slug, status, package), profile:profiles!promo_claims_profile_id_fkey(email)")
      .order("claimed_at", { ascending: false })
      .limit(100),
  ]);
  const eventIds = (claims ?? []).flatMap((c) => (c.event ? [c.event.id] : []));
  const { data: paid } = eventIds.length
    ? await supabase.from("orders").select("event_id, amount_idr").eq("status", "paid").in("event_id", eventIds)
    : { data: [] };

  const active = (claims ?? []).filter((c) => !c.revoked_at).length;
  const buyers = new Set((paid ?? []).map((o) => o.event_id)).size;
  const revenue = (paid ?? []).reduce((sum, o) => sum + o.amount_idr, 0);
  const ended = promo?.active && isPast(promo.ends_at);
  const statusText = !promo?.active
    ? "Mati. Host hanya bisa memilih paket berbayar."
    : ended
      ? `Berakhir ${dateTime(promo.ends_at!)} WIB. Host hanya bisa memilih paket berbayar.`
      : `Aktif: ${PACKAGE_LABEL[promo.package]} gratis, ${promo.per_account} event per akun${promo.ends_at ? `, sampai ${dateTime(promo.ends_at)} WIB` : ", tanpa batas waktu"}.`;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promo peluncuran</h1>
        <p className="text-sm text-muted-foreground">
          Paket gratis tanpa pembayaran untuk masa peluncuran. Event yang sudah mengklaim tetap aktif walau promo dimatikan.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="pengaturan">
        <div>
          <h2 id="pengaturan" className="font-semibold">
            Pengaturan
          </h2>
          <p className="text-sm" aria-live="polite">
            {statusText}
          </p>
        </div>
        <ActionForm action={setLaunchPromo} submitLabel="Simpan pengaturan promo" reasonPlaceholder="Contoh: go-live gratis sampai akhir tahun">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={promo?.active} className="size-5 accent-primary" />
            Promo aktif
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paket gratis" htmlFor="promo-package">
              <select id="promo-package" name="package" className={selectClassName} defaultValue={promo?.package ?? "complete"}>
                {Object.entries(PACKAGE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Event gratis per akun" htmlFor="promo-per-account">
              <Input id="promo-per-account" name="per_account" type="number" min={1} max={10} step={1} defaultValue={promo?.per_account ?? 1} className="h-11" required />
            </Field>
            <Field label="Berakhir (opsional)" htmlFor="promo-ends" hint="Berlaku sampai akhir hari itu (WIB). Kosong berarti tanpa batas waktu.">
              <Input id="promo-ends" name="ends_on" type="date" defaultValue={promo?.ends_at ? wibDate(promo.ends_at) : ""} className="h-11" />
            </Field>
          </div>
        </ActionForm>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-4 sm:p-5">
        <Stat label="Klaim aktif" value={active} />
        <Stat label="Dicabut" value={(claims?.length ?? 0) - active} />
        <Stat label="Event promo yang lalu membeli" value={buyers} />
        <Stat label="Pendapatan dari event promo" value={rupiah(revenue)} />
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="klaim">
        <h2 id="klaim" className="font-semibold">
          Klaim terbaru
        </h2>
        {error && <p className="text-sm text-destructive">Daftar klaim gagal dimuat. Muat ulang halaman.</p>}
        {!error && !claims?.length && (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum ada event yang memakai promo.</p>
        )}
        {!!claims?.length && (
          <ul className="flex flex-col gap-3">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {c.event ? (
                      <Link href={`/admin/events/${c.event.id}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
                        {c.event.title}
                      </Link>
                    ) : (
                      <p className="font-medium">Event sudah dihapus</p>
                    )}
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {c.profile?.email ?? "-"} · {PACKAGE_LABEL[c.package] ?? c.package} · {dateTime(c.claimed_at)} WIB
                    </p>
                  </div>
                  <p className="text-sm font-medium">{c.revoked_at ? `Dicabut ${dateTime(c.revoked_at)}` : "Aktif"}</p>
                </div>
                {!c.revoked_at && c.event && (
                  <details className="rounded-lg border p-3">
                    <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Cabut promo</summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        Event kembali ke draf dan undangan tidak lagi publik. Kuota akun tetap terpakai. Ditolak bila event sudah punya pembayaran.
                      </p>
                      <ActionForm
                        action={revokePromo.bind(null, c.event.id)}
                        submitLabel="Cabut promo"
                        destructive
                        confirmMessage={`Cabut promo untuk ${c.event.title}?`}
                        reasonPlaceholder="Contoh: satu orang membuat banyak akun untuk promo"
                      />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

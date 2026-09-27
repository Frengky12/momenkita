import Link from "next/link";
import { Field, selectClassName } from "@/components/dashboard/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { DOMAIN_STATUS_LABEL, dateTime } from "@/lib/admin";
import { ActionForm } from "../action-form";
import { setDomainStatus, upsertDomain } from "../actions";
import { requireAdmin } from "../guard";

export default async function AdminDomainPage() {
  const supabase = await requireAdmin();
  const [{ data: domains, error }, { data: luxury }] = await Promise.all([
    supabase
      .from("custom_domains")
      .select("id, domain, status, paid_by, registered_until, verified_at, created_at, event:events!custom_domains_event_id_fkey(id, title, slug, published_at)")
      .order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, slug").eq("package", "luxury").order("title"),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Custom domain</h1>
        <p className="text-sm text-muted-foreground">Khusus paket Luxury, diatur manual sampai otomatisasi di Fase 2.</p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm sm:p-5" aria-labelledby="langkah">
        <h2 id="langkah" className="font-semibold">
          Langkah pemasangan
        </h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>Tambahkan domain di Vercel: project momenkita, Settings, Domains, Add.</li>
          <li>Atur DNS domain sesuai catatan yang ditampilkan Vercel (oleh kita atau pelanggan, tergantung siapa pemilik domainnya).</li>
          <li>Catat domain di bawah. Statusnya mulai dari Menunggu DNS.</li>
          <li>Setelah Vercel menandai domain valid dan HTTPS aktif, ubah status ke Aktif.</li>
        </ol>
        <p className="text-muted-foreground">
          Domain aktif langsung membuka undangan event (termasuk tautan pribadi tamu), dan tautan WhatsApp di halaman Tamu milik host ikut memakai domain
          ini. Undangan harus sudah dipublikasikan. Kalau aplikasi sudah punya domain utama sendiri, isi variabel PRIMARY_HOSTS di Vercel agar domain utama
          tidak dianggap custom domain.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="tambah">
        <h2 id="tambah" className="font-semibold">
          Catat domain
        </h2>
        {!luxury?.length ? (
          <p className="text-sm text-muted-foreground">Belum ada event Luxury. Custom domain hanya bisa dipasang pada event Luxury.</p>
        ) : (
          <ActionForm action={upsertDomain} submitLabel="Simpan domain" reasonPlaceholder="Contoh: domain bawaan paket Luxury, dibeli 27 Sep">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event" htmlFor="event_id">
                <select id="event_id" name="event_id" className={selectClassName} required>
                  {luxury.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} (/{e.slug})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Domain" htmlFor="domain" hint="Tanpa https:// dan tanpa garis miring, misalnya budi-ani.com">
                <Input id="domain" name="domain" required placeholder="budi-ani.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-11" />
              </Field>
              <Field label="Biaya domain ditanggung" htmlFor="paid_by">
                <select id="paid_by" name="paid_by" className={selectClassName} defaultValue="platform">
                  <option value="platform">Platform (bawaan paket)</option>
                  <option value="customer">Pelanggan</option>
                </select>
              </Field>
              <Field label="Terdaftar sampai (opsional)" htmlFor="registered_until" hint="Untuk pengingat perpanjangan domain">
                <Input id="registered_until" name="registered_until" type="date" className="h-11" />
              </Field>
            </div>
          </ActionForm>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="daftar">
        <h2 id="daftar" className="font-semibold">
          Domain tercatat
        </h2>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Daftar domain gagal dimuat. Muat ulang halaman ini.</AlertDescription>
          </Alert>
        )}
        {!error && domains.length === 0 && (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Belum ada custom domain.</p>
        )}
        {!error && domains.length > 0 && (
          <ul className="flex flex-col gap-3">
            {domains.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">{d.domain}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.event ? (
                        <Link href={`/admin/events/${d.event.id}`} className="underline underline-offset-4">
                          {d.event.title}
                        </Link>
                      ) : (
                        "Tanpa event"
                      )}
                      {d.event && !d.event.published_at && " (belum dipublikasikan)"}
                      {" · "}dibayar {d.paid_by === "customer" ? "pelanggan" : "platform"}
                      {d.registered_until && ` · terdaftar sampai ${new Date(d.registered_until).toLocaleDateString("id-ID", { dateStyle: "medium" })}`}
                    </p>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">{DOMAIN_STATUS_LABEL[d.status] ?? d.status}</span>
                    {d.verified_at && <span className="text-muted-foreground"> · diverifikasi {dateTime(d.verified_at)}</span>}
                  </p>
                </div>
                <details className="rounded-lg border p-3">
                  <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Ubah status</summary>
                  <div className="mt-2">
                    <ActionForm action={setDomainStatus.bind(null, d.id)} submitLabel="Simpan status" reasonPlaceholder="Contoh: DNS valid di Vercel, HTTPS aktif">
                      <Field label="Status" htmlFor={`status-${d.id}`}>
                        {/* key: select tak terkontrol dipasang ulang saat status berubah, agar reset formulir kembali ke status terbaru. */}
                        <select key={d.status} id={`status-${d.id}`} name="status" className={selectClassName} defaultValue={d.status}>
                          {Object.entries(DOMAIN_STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

import { notFound } from "next/navigation";
import { Field, selectClassName } from "@/components/dashboard/field";
import { SectionForm } from "@/components/dashboard/section-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LIMITS,
  MAX_GIFT_ACCOUNTS,
  MAX_STORY_CHAPTERS,
  STORY_LIMITS,
  THEMES,
  THEME_DESCRIPTIONS,
  TIMEZONE_LABELS,
  parseContent,
  parseGifts,
  toLocalParts,
  type EventTimezone,
  type Person,
} from "@/lib/invitation/content";
import { loadMedia } from "@/lib/invitation/media";
import { requestOrigin } from "@/lib/invitation/origin";
import { createClient } from "@/lib/supabase/server";
import { deleteDraftEvent, deleteSession, saveCouple, saveGifts, saveSession, saveSettings, saveStory, saveTexts, saveTheme } from "../actions";
import { MediaManager } from "./media-manager";
import { StoryPhoto } from "./story-photo";

type Session = { id: string; name: string; starts_at: string; ends_at: string; venue_name: string | null; venue_address: string | null };

export default async function InvitationEditorPage({ params }: PageProps<"/dashboard/events/[eventId]/undangan">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: sessions }, media, origin] = await Promise.all([
    supabase.from("events").select("id, slug, status, timezone, published_at, theme_config, gift_config").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_sessions")
      .select("id, name, starts_at, ends_at, venue_name, venue_address")
      .eq("event_id", eventId)
      .order("starts_at"),
    loadMedia(supabase, eventId),
    requestOrigin(),
  ]);
  if (!event) notFound();

  const content = parseContent(event.theme_config);
  const gifts = parseGifts(event.gift_config);
  const tzLabel = TIMEZONE_LABELS[event.timezone as EventTimezone] ?? event.timezone;
  const sessionList = sessions ?? [];
  const firstDate = sessionList[0] ? toLocalParts(sessionList[0].starts_at, event.timezone).date : "";

  return (
    <div className="flex flex-col gap-6">
      <Section title="Mempelai" description="Nama panggilan tampil besar di sampul; nama lengkap dan orang tua tampil di bagian profil.">
        <SectionForm action={saveCouple.bind(null, event.id)}>
          <div className="grid gap-6 md:grid-cols-2">
            <PersonFields prefix="groom" title="Mempelai pria" person={content.couple.groom} />
            <PersonFields prefix="bride" title="Mempelai wanita" person={content.couple.bride} />
          </div>
          <Field label="Urutan nama di undangan" htmlFor="order" className="sm:max-w-xs">
            <select id="order" name="order" defaultValue={content.couple.order} className={selectClassName}>
              <option value="groom-first">Pria lebih dulu</option>
              <option value="bride-first">Wanita lebih dulu</option>
            </select>
          </Field>
        </SectionForm>
      </Section>

      <Section title="Tema" description="Semua tema memakai isi yang sama; ganti kapan saja lalu lihat hasilnya di tab Pratinjau.">
        <SectionForm action={saveTheme.bind(null, event.id)} submitLabel="Simpan tema">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Tema undangan</legend>
            {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => (
              <label
                key={id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input type="radio" name="theme" value={id} defaultChecked={content.theme === id} className="mt-1 size-4 accent-primary" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{THEMES[id]}</span>
                  <span className="text-sm text-muted-foreground">{THEME_DESCRIPTIONS[id]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Gaya sampul</legend>
            {(
              [
                ["frame", "Foto berbingkai", "Foto sampul dalam bingkai sesuai tema, dengan ornamen di sekelilingnya."],
                ["full", "Foto penuh layar", "Foto sampul menutupi layar; nama dan tombol di bagian bawah. Butuh foto sampul."],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input type="radio" name="coverStyle" value={value} defaultChecked={content.coverStyle === value} className="mt-1 size-4 accent-primary" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{label}</span>
                  <span className="text-sm text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </SectionForm>
      </Section>

      <Section title="Foto" description="Foto dikompres otomatis di HP atau laptopmu sebelum diunggah, jadi tidak perlu diperkecil dulu.">
        <MediaManager eventId={event.id} media={media} />
      </Section>

      <Section title="Acara" description={`Semua waktu dalam ${tzLabel}. Alamat dipakai untuk tombol Google Maps dan Waze.`}>
        <div className="flex flex-col gap-4">
          {sessionList.map((session) => (
            <div key={session.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <SectionForm action={saveSession.bind(null, event.id)} submitLabel="Simpan sesi">
                <input type="hidden" name="sessionId" value={session.id} />
                <SessionFields session={session} timezone={event.timezone} idPrefix={session.id} />
              </SectionForm>
              {sessionList.length > 1 && (
                <SectionForm
                  action={deleteSession.bind(null, event.id, session.id)}
                  submitLabel={`Hapus sesi ${session.name}`}
                  pendingLabel="Menghapus..."
                  variant="destructive"
                  confirmMessage={`Hapus sesi ${session.name}? Tamu yang diundang ke sesi ini perlu diatur ulang.`}
                />
              )}
            </div>
          ))}
          {sessionList.length === 0 && (
            <p className="text-sm text-muted-foreground">Belum ada sesi acara. Tambahkan minimal satu agar undangan punya jadwal.</p>
          )}
          <details className="rounded-lg border border-dashed p-4">
            <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Tambah sesi (misalnya akad)</summary>
            <SectionForm action={saveSession.bind(null, event.id)} submitLabel="Tambah sesi" pendingLabel="Menambah..." className="mt-3">
              <SessionFields session={null} timezone={event.timezone} idPrefix="new" defaultDate={firstDate} />
            </SectionForm>
          </details>
        </div>
      </Section>

      <Section title="Teks undangan" description="Teks pembuka tampil setelah sampul; teks penutup di akhir undangan.">
        <SectionForm action={saveTexts.bind(null, event.id)}>
          <Field label="Teks pembuka" htmlFor="opening">
            <Textarea id="opening" name="opening" defaultValue={content.texts.opening} maxLength={LIMITS.text} rows={4} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Kutipan (opsional)" htmlFor="quote" className="sm:col-span-2" hint="Misalnya ayat, puisi, atau kata-kata favorit kalian.">
              <Textarea id="quote" name="quote" defaultValue={content.texts.quote} maxLength={LIMITS.quote} rows={3} />
            </Field>
            <Field label="Sumber kutipan" htmlFor="quoteSource">
              <Input id="quoteSource" name="quoteSource" defaultValue={content.texts.quoteSource} maxLength={LIMITS.name} className="h-11" />
            </Field>
          </div>
          <Field label="Teks penutup" htmlFor="closing">
            <Textarea id="closing" name="closing" defaultValue={content.texts.closing} maxLength={LIMITS.text} rows={4} />
          </Field>
          <Field
            label="Pesan WhatsApp"
            htmlFor="whatsapp"
            hint="Dipakai tombol Kirim WA di daftar tamu. {nama} diganti nama tamu, {link} diganti link personal, {mempelai} diganti nama kalian."
          >
            <Textarea id="whatsapp" name="whatsapp" defaultValue={content.texts.whatsapp} maxLength={LIMITS.whatsapp} rows={8} />
          </Field>
        </SectionForm>
      </Section>

      <Section
        title="Love Story"
        description={`Cerita perjalanan kalian dalam beberapa bab, maksimal ${MAX_STORY_CHAPTERS}, masing-masing boleh berfoto. Kosongkan semua isian sebuah bab untuk menghapusnya beserta fotonya. Bagian ini tidak tampil bila belum ada bab.`}
      >
        {/* key: form dipasang ulang setelah disimpan, agar bab yang dihapus atau bergeser tidak menyisakan isian lama. */}
        <SectionForm key={content.story.map((c) => `${c.id}:${c.title}`).join("|")} action={saveStory.bind(null, event.id)} submitLabel="Simpan Love Story">
          {Array.from({ length: Math.min(content.story.length + 1, MAX_STORY_CHAPTERS) }, (_, i) => {
            const chapter = content.story[i];
            return (
              <fieldset key={i} className="flex flex-col gap-4 rounded-xl border p-4">
                <legend className="px-1 text-sm font-medium">{chapter ? `Bab ${i + 1}` : "Bab baru"}</legend>
                <input type="hidden" name={`story.${i}.id`} value={chapter?.id ?? ""} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Judul" htmlFor={`story-title-${i}`}>
                    <Input
                      id={`story-title-${i}`}
                      name={`story.${i}.title`}
                      defaultValue={chapter?.title}
                      maxLength={STORY_LIMITS.title}
                      placeholder="Contoh: Awal bertemu"
                      className="h-11"
                    />
                  </Field>
                  <Field label="Waktu (opsional)" htmlFor={`story-when-${i}`}>
                    <Input
                      id={`story-when-${i}`}
                      name={`story.${i}.when`}
                      defaultValue={chapter?.when}
                      maxLength={STORY_LIMITS.when}
                      placeholder="Contoh: Maret 2022"
                      className="h-11"
                    />
                  </Field>
                </div>
                <Field label="Cerita" htmlFor={`story-text-${i}`}>
                  <Textarea id={`story-text-${i}`} name={`story.${i}.text`} defaultValue={chapter?.text} maxLength={STORY_LIMITS.text} rows={4} />
                </Field>
                {chapter ? (
                  <StoryPhoto
                    eventId={event.id}
                    chapterId={chapter.id}
                    title={chapter.title}
                    photo={media.story.find((m) => m.id === chapter.photo) ?? null}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Foto bab bisa ditambahkan setelah bab ini disimpan.</p>
                )}
              </fieldset>
            );
          })}
        </SectionForm>
      </Section>

      <Section
        title="Amplop digital"
        description="Rekening ini hanya ditampilkan ke tamu. MomenKita tidak menerima, menyimpan, atau meneruskan dana."
      >
        <SectionForm action={saveGifts.bind(null, event.id)}>
          {Array.from({ length: MAX_GIFT_ACCOUNTS }, (_, i) => {
            const account = gifts.accounts[i];
            return (
              <fieldset key={i} className="grid gap-4 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-medium">Rekening {i + 1}</legend>
                <Field label="Bank atau e-wallet" htmlFor={`bank-${i}`}>
                  <Input id={`bank-${i}`} name={`accounts.${i}.bank`} defaultValue={account?.bank} maxLength={LIMITS.bank} className="h-11" />
                </Field>
                <Field label="Nomor rekening" htmlFor={`number-${i}`}>
                  <Input
                    id={`number-${i}`}
                    name={`accounts.${i}.number`}
                    defaultValue={account?.number}
                    maxLength={LIMITS.number}
                    inputMode="numeric"
                    className="h-11"
                  />
                </Field>
                <Field label="Atas nama" htmlFor={`holder-${i}`}>
                  <Input id={`holder-${i}`} name={`accounts.${i}.holder`} defaultValue={account?.holder} maxLength={LIMITS.fullName} className="h-11" />
                </Field>
              </fieldset>
            );
          })}
          <Field label="Alamat kirim kado (opsional)" htmlFor="address">
            <Textarea id="address" name="address" defaultValue={gifts.address} maxLength={LIMITS.address} rows={2} />
          </Field>
        </SectionForm>
      </Section>

      <Section title="Pengaturan">
        <SectionForm action={saveSettings.bind(null, event.id)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Sering tertukar dengan alamat lokasi acara, jadi link lengkapnya ditampilkan. */}
            <Field
              label="Alamat link undangan"
              htmlFor="slug"
              hint={`Bagian akhir link yang dibagikan ke tamu: ${origin}/${event.slug}. Bukan alamat lokasi acara (isi lokasi di bagian Acara). ${
                event.published_at ? "Terkunci setelah dipublikasikan karena link sudah tersebar." : "Huruf kecil, angka, dan tanda hubung."
              }`}
            >
              <Input id="slug" name="slug" defaultValue={event.slug} maxLength={60} readOnly={Boolean(event.published_at)} className="h-11" />
            </Field>
            <Field label="Batas RSVP (opsional)" htmlFor="rsvpDeadline" hint="Setelah tanggal ini, form RSVP ditutup.">
              <Input id="rsvpDeadline" name="rsvpDeadline" type="date" defaultValue={content.rsvpDeadline ?? ""} className="h-11" />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Zona waktu: {tzLabel}.
          </p>
        </SectionForm>
      </Section>

      {event.status === "draft" && (
        <Section title="Hapus event" description="Hanya event draf yang bisa dihapus. Semua sesi, tamu, dan ucapan ikut terhapus.">
          <SectionForm
            action={deleteDraftEvent.bind(null, event.id)}
            submitLabel="Hapus event ini"
            pendingLabel="Menghapus..."
            variant="destructive"
            confirmMessage="Hapus event ini beserta semua datanya? Tindakan ini tidak bisa dibatalkan."
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PersonFields({ prefix, title, person }: { prefix: "groom" | "bride"; title: string; person: Person }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      <Field label="Nama panggilan" htmlFor={`${prefix}-nickname`}>
        <Input id={`${prefix}-nickname`} name={`${prefix}.nickname`} defaultValue={person.nickname} maxLength={LIMITS.name} required className="h-11" />
      </Field>
      <Field label="Nama lengkap" htmlFor={`${prefix}-fullName`}>
        <Input id={`${prefix}-fullName`} name={`${prefix}.fullName`} defaultValue={person.fullName} maxLength={LIMITS.fullName} className="h-11" />
      </Field>
      <Field label="Nama ayah" htmlFor={`${prefix}-father`}>
        <Input id={`${prefix}-father`} name={`${prefix}.father`} defaultValue={person.father} maxLength={LIMITS.parent} className="h-11" />
      </Field>
      <Field label="Nama ibu" htmlFor={`${prefix}-mother`}>
        <Input id={`${prefix}-mother`} name={`${prefix}.mother`} defaultValue={person.mother} maxLength={LIMITS.parent} className="h-11" />
      </Field>
      <Field label="Instagram (opsional)" htmlFor={`${prefix}-instagram`} hint="Tanpa @">
        <Input id={`${prefix}-instagram`} name={`${prefix}.instagram`} defaultValue={person.instagram} maxLength={LIMITS.instagram} className="h-11" />
      </Field>
    </fieldset>
  );
}

function SessionFields({
  session,
  timezone,
  idPrefix,
  defaultDate,
}: {
  session: Session | null;
  timezone: string;
  idPrefix: string;
  defaultDate?: string;
}) {
  const start = session ? toLocalParts(session.starts_at, timezone) : null;
  const end = session ? toLocalParts(session.ends_at, timezone) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Field label="Nama sesi" htmlFor={`${idPrefix}-name`} className="sm:col-span-4">
        <Input id={`${idPrefix}-name`} name="name" defaultValue={session?.name ?? "Akad"} maxLength={60} required className="h-11" />
      </Field>
      <Field label="Tanggal" htmlFor={`${idPrefix}-date`} className="sm:col-span-2">
        <Input id={`${idPrefix}-date`} name="date" type="date" defaultValue={start?.date ?? defaultDate} required className="h-11" />
      </Field>
      <Field label="Mulai" htmlFor={`${idPrefix}-start`}>
        <Input id={`${idPrefix}-start`} name="start" type="time" defaultValue={start?.time} required className="h-11" />
      </Field>
      <Field label="Selesai" htmlFor={`${idPrefix}-end`}>
        <Input id={`${idPrefix}-end`} name="end" type="time" defaultValue={end?.time} required className="h-11" />
      </Field>
      <Field label="Nama tempat" htmlFor={`${idPrefix}-venueName`} className="sm:col-span-2">
        <Input id={`${idPrefix}-venueName`} name="venueName" defaultValue={session?.venue_name ?? ""} maxLength={120} className="h-11" />
      </Field>
      <Field label="Alamat" htmlFor={`${idPrefix}-venueAddress`} className="sm:col-span-2">
        <Input id={`${idPrefix}-venueAddress`} name="venueAddress" defaultValue={session?.venue_address ?? ""} maxLength={LIMITS.address} className="h-11" />
      </Field>
    </div>
  );
}

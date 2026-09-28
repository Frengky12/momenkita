import Link from "next/link";
import { Countdown } from "@/components/invitation/countdown";
import { CopyText } from "@/components/invitation/copy-text";
import { DemoBar } from "@/components/invitation/demo-bar";
import { Gallery } from "@/components/invitation/gallery";
import { MarkOpened } from "@/components/invitation/mark-opened";
import { MusicPlayer } from "@/components/invitation/music-player";
import { RsvpForm } from "@/components/invitation/rsvp-form";
import { THEME_STYLES, type ThemeStyle } from "@/components/invitation/themes";
import { QrCode } from "@/components/qr-code";
import { TIMEZONE_LABELS, coupleNames, formatDate, formatTime, type EventTimezone, type Person } from "@/lib/invitation/content";
import { googleCalendarUrl, mapsUrl, wazeUrl } from "@/lib/invitation/links";
import type { DemoView } from "@/lib/invitation/demo";
import type { InvitationData } from "@/lib/invitation/load";
import type { MediaItem } from "@/lib/invitation/media";
import { cn } from "@/lib/utils";


const GENERAL_MAX_PAX = 5;

// Sampul foto penuh: token warna di dalam sampul diganti putih agar teks tema terbaca di atas foto. Gradasi gelap
// di bawah (minimal 55% hitam di area teks) menjaga kontras teks putih di atas 4.5:1 walau fotonya terang.
const FULL_COVER_TOKENS = {
  "--inv-text": "#ffffff",
  "--inv-muted": "rgb(255 255 255 / 0.88)",
  "--inv-accent": "#ffffff",
  "--inv-ornament": "rgb(255 255 255 / 0.7)",
} as React.CSSProperties;

const pillLink =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-(--inv-field) px-4 text-sm font-medium transition-colors hover:bg-(--inv-band) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)";

// Kerangka undangan untuk semua tema; tampilan per tema diatur THEME_STYLES (themes.tsx) dan token .theme-* di globals.css.
export function Invitation({
  data,
  invitationUrl,
  icsBaseUrl,
  preview = false,
  demo,
}: {
  data: InvitationData;
  invitationUrl: string;
  icsBaseUrl: string;
  preview?: boolean;
  // Undangan contoh: tema dan sampul dari URL, form RSVP tidak menyimpan, kamera tamu tidak dibuka.
  demo?: DemoView;
}) {
  const { event, sessions, guest, wishes, media } = data;
  const { gifts, timezone } = event;
  const content = demo ? { ...event.content, theme: demo.theme, coverStyle: demo.coverStyle } : event.content;
  const [first, second] = coupleNames(content);
  const style = THEME_STYLES[content.theme];
  const { Divider, CoverDecor, PhotoDecor } = style;
  const [firstPhoto, secondPhoto] = content.couple.order === "bride-first" ? [media.bride, media.groom] : [media.groom, media.bride];
  const tz = TIMEZONE_LABELS[timezone as EventTimezone] ?? "";
  const mainSession = sessions[0];
  // Tombol kamera muncul pada tanggal sesi mana pun (zona waktu event), hanya untuk paket berkamera (PRD §5.3).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const eventDay = sessions.some((s) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(s.starts_at)) === today);
  const experience = event.package === "complete" || event.package === "luxury";
  const cameraOpen = experience && eventDay && !preview && !demo;
  const fullCover = content.coverStyle === "full" && media.cover;

  return (
    <div className={cn(style.rootClass, "min-h-dvh bg-(--inv-bg) text-(--inv-text)")}>
      {preview && (
        <p className="sticky top-0 z-10 bg-(--inv-band) px-4 py-2 text-center text-sm font-medium">Pratinjau. Undangan belum dipublikasikan.</p>
      )}
      {demo && <DemoBar slug={event.slug} view={demo} />}
      {guest && !preview && <MarkOpened slug={event.slug} personalSlug={guest.personalSlug} />}
      {media.music && <MusicPlayer url={media.music.url} />}

      <header
        style={fullCover ? FULL_COVER_TOKENS : undefined}
        className={cn(
          "relative isolate flex min-h-dvh flex-col items-center gap-6 overflow-hidden px-6 text-center text-(--inv-text)",
          fullCover ? "justify-end pt-16 pb-14 [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]" : "justify-center py-16",
        )}
      >
        {fullCover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
            <img
              src={fullCover.url}
              alt={`Foto ${first.nickname} dan ${second.nickname}`}
              width={fullCover.width}
              height={fullCover.height}
              fetchPriority="high"
              className="absolute inset-0 -z-20 size-full object-cover"
            />
            <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-linear-to-t from-black/85 via-black/55 to-transparent" />
          </>
        ) : (
          CoverDecor && (
            <div className="absolute inset-0 -z-10">
              <CoverDecor />
            </div>
          )
        )}
        {!fullCover && media.cover && (
          <div className={cn("relative isolate", PhotoDecor && "mb-6")}>
            {PhotoDecor && <PhotoDecor />}
            {/* Bingkai khas undangan cetak; foto dipotong ke rasio 4:5 agar sampul tetap muat satu layar HP. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
            <img
              src={media.cover.url}
              alt={`Foto ${first.nickname} dan ${second.nickname}`}
              width={media.cover.width}
              height={media.cover.height}
              fetchPriority="high"
              className={cn(
                "aspect-[4/5] w-auto object-cover",
                {
                  arch: "h-[40dvh] max-h-[24rem] rounded-t-full outline-1 outline-offset-6 outline-(--inv-ornament)",
                  circle: "h-[46dvh] max-h-[28rem] rounded-t-full border-4 border-(--inv-card) shadow-sm",
                  card: "h-[40dvh] max-h-[24rem] border-8 border-(--inv-card) shadow-lg outline-1 outline-offset-6 outline-(--inv-ornament)",
                }[style.photoFrame],
              )}
            />
          </div>
        )}
        <p className={style.coverLabel}>Undangan Pernikahan</p>
        <h1 className="font-script text-5xl leading-tight font-semibold [overflow-wrap:anywhere] sm:text-6xl">
          {first.nickname}
          <span className="mx-3 italic text-(--inv-accent)">&amp;</span>
          {second.nickname}
        </h1>
        <Divider />
        {mainSession && <p className="text-base">{formatDate(mainSession.starts_at, timezone)}</p>}
        {guest && (
          <div className="mt-6 flex flex-col gap-1">
            <p className="text-sm text-(--inv-muted)">Kepada Yth.</p>
            <p className="font-display text-3xl font-semibold [overflow-wrap:anywhere]">{guest.name}</p>
            <p className="mt-1 max-w-xs text-xs text-(--inv-muted)">Mohon maaf bila ada kesalahan penulisan nama atau gelar.</p>
          </div>
        )}
        <a
          href="#isi"
          data-music-start
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-(--inv-button) px-8 text-(--inv-button-text) text-sm font-semibold transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
        >
          Buka undangan
        </a>
      </header>

      <main id="isi" className="mx-auto flex max-w-lg flex-col gap-20 px-6 pb-16">
        <section className="flex flex-col items-center gap-6 pt-8 text-center">
          <p className="leading-relaxed whitespace-pre-line">{content.texts.opening}</p>
          {content.texts.quote && (
            <figure className="flex flex-col gap-2 border-y border-(--inv-line) py-6">
              <blockquote className="font-display text-2xl leading-snug italic whitespace-pre-line">{content.texts.quote}</blockquote>
              {content.texts.quoteSource && <figcaption className="text-sm text-(--inv-muted)">{content.texts.quoteSource}</figcaption>}
            </figure>
          )}
        </section>

        <section aria-labelledby="mempelai" className="flex flex-col items-center gap-8 text-center">
          <h2 id="mempelai" className="sr-only">
            Mempelai
          </h2>
          <Monogram first={first} second={second} />
          <Profile person={first} photo={firstPhoto} frame={style.photoFrame} role={content.couple.order === "bride-first" ? "Putri" : "Putra"} />
          <p className="font-display text-5xl text-(--inv-accent) italic" aria-hidden>
            &amp;
          </p>
          <Profile person={second} photo={secondPhoto} frame={style.photoFrame} role={content.couple.order === "bride-first" ? "Putra" : "Putri"} />
        </section>

        {mainSession && (
          <section aria-label="Hitung mundur" className="flex flex-col items-center gap-4 text-center">
            <Countdown startsAt={mainSession.starts_at} endsAt={sessions[sessions.length - 1].ends_at} />
          </section>
        )}

        {content.story.length > 0 && (
          <section aria-labelledby="kisah" className="flex flex-col gap-8">
            <SectionTitle id="kisah" Divider={Divider}>
              Kisah Kami
            </SectionTitle>
            <ol className="flex flex-col gap-10 border-l border-(--inv-ornament) pl-6">
              {content.story.map((chapter) => {
                const photo = media.story.find((m) => m.id === chapter.photo);
                return (
                  <li key={chapter.id} className="relative flex flex-col gap-2">
                    <span aria-hidden className="absolute top-2 -left-[30.5px] size-3 rounded-full border border-(--inv-ornament) bg-(--inv-bg)" />
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL R2
                      <img
                        src={photo.url}
                        alt={`Foto bab ${chapter.title}`}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        className="mb-2 aspect-[4/3] w-full rounded-lg border border-(--inv-line) object-cover"
                      />
                    )}
                    {chapter.when && <p className="text-sm tracking-wide text-(--inv-muted) uppercase">{chapter.when}</p>}
                    <h3 className="font-display text-2xl font-semibold">{chapter.title}</h3>
                    <p className="leading-relaxed whitespace-pre-line">{chapter.text}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {media.gallery.length > 0 && (
          <section aria-labelledby="galeri" className="flex flex-col gap-6">
            <SectionTitle id="galeri" Divider={Divider}>Galeri</SectionTitle>
            <Gallery items={media.gallery} alt={`Galeri ${first.nickname} dan ${second.nickname}`} />
          </section>
        )}

        {cameraOpen && (
          <section aria-labelledby="kamera" className="flex flex-col items-center gap-4 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-8 text-center">
            <h2 id="kamera" className="font-display text-3xl font-semibold">
              Kamera Tamu
            </h2>
            <p className="text-(--inv-muted)">Abadikan momen hari ini dari sudut pandangmu. Fotonya tampil di layar acara.</p>
            <a
              href={`/${event.slug}/kamera${guest ? `?tamu=${encodeURIComponent(guest.personalSlug)}` : ""}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-(--inv-button) px-8 text-(--inv-button-text) text-sm font-semibold transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
            >
              Buka kamera
            </a>
          </section>
        )}

        {experience && guest && !preview && (
          <section aria-labelledby="tiket" className="flex flex-col items-center gap-4 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-8 text-center">
            <h2 id="tiket" className="font-display text-3xl font-semibold">
              QR Check-in
            </h2>
            <p className="text-(--inv-muted)">Tunjukkan QR ini ke penerima tamu saat tiba, agar kehadiranmu tercatat tanpa antre menulis buku tamu.</p>
            <QrCode value={guest.qrToken} label={`QR check-in untuk ${guest.name}`} className="w-56 max-w-full rounded-lg" />
            {guest.tableNumber && <p className="font-semibold">Meja {guest.tableNumber}</p>}
          </section>
        )}

        <section aria-labelledby="acara" className="flex flex-col gap-6">
          <SectionTitle id="acara" Divider={Divider}>Rangkaian Acara</SectionTitle>
          {sessions.map((session) => (
            <article key={session.id} className="flex flex-col items-center gap-3 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-8 text-center">
              <h3 className="font-display text-3xl font-semibold">{session.name}</h3>
              <p>{formatDate(session.starts_at, timezone)}</p>
              <p className="text-(--inv-muted)">
                Pukul {formatTime(session.starts_at, timezone)} sampai {formatTime(session.ends_at, timezone)} {tz}
              </p>
              {(session.venue_name || session.venue_address) && (
                <div className="flex flex-col gap-1">
                  {session.venue_name && <p className="font-semibold">{session.venue_name}</p>}
                  {session.venue_address && <p className="text-sm text-(--inv-muted)">{session.venue_address}</p>}
                </div>
              )}
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {(session.venue_name || session.venue_address) && (
                  <>
                    <a href={mapsUrl(session)} target="_blank" rel="noopener noreferrer" className={pillLink}>
                      Google Maps
                    </a>
                    <a href={wazeUrl(session)} target="_blank" rel="noopener noreferrer" className={pillLink}>
                      Waze
                    </a>
                  </>
                )}
                <a href={googleCalendarUrl(session, event.title, invitationUrl)} target="_blank" rel="noopener noreferrer" className={pillLink}>
                  Google Calendar
                </a>
                <a href={`${icsBaseUrl}/${session.id}`} download className={pillLink}>
                  Kalender lain (.ics)
                </a>
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="rsvp" className="flex flex-col gap-6">
          <SectionTitle id="rsvp" Divider={Divider}>Konfirmasi Kehadiran</SectionTitle>
          <div className="rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-8">
            {data.rsvpOpen ? (
              <RsvpForm
                slug={event.slug}
                personalSlug={guest?.personalSlug ?? null}
                guest={guest}
                generalMaxPax={GENERAL_MAX_PAX}
                preview={preview || Boolean(demo)}
                previewMessage={demo ? "Ini undangan contoh, jadi konfirmasi tidak dikirim." : undefined}
              />
            ) : (
              <p className="text-center text-(--inv-muted)">Konfirmasi kehadiran sudah ditutup.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="ucapan" className="flex flex-col gap-6">
          <SectionTitle id="ucapan" Divider={Divider}>Ucapan &amp; Doa</SectionTitle>
          {wishes.length === 0 ? (
            <p className="text-center text-(--inv-muted)">Belum ada ucapan. Tulis doa kamu lewat form konfirmasi di atas.</p>
          ) : (
            <ul className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
              {wishes.map((wish) => (
                <li key={wish.id} className="rounded-xl border border-(--inv-line) bg-(--inv-card) px-4 py-3">
                  <p className="font-semibold [overflow-wrap:anywhere]">{wish.author_name}</p>
                  <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{wish.message}</p>
                  <p className="mt-2 text-xs text-(--inv-muted)">
                    {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(new Date(wish.created_at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(gifts.accounts.length > 0 || gifts.address || media.qris) && (
          <section aria-labelledby="amplop" className="flex flex-col gap-6 text-center">
            <SectionTitle id="amplop" Divider={Divider}>Amplop Digital</SectionTitle>
            <p className="text-(--inv-muted)">Doa restu kamu sudah lebih dari cukup. Jika ingin memberi tanda kasih, bisa melalui:</p>
            {gifts.accounts.map((account) => (
              <div key={`${account.bank}-${account.number}`} className="flex flex-col items-center gap-2 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-6">
                <p className="font-semibold">{account.bank}</p>
                <p className="font-display text-2xl font-semibold tracking-wide tabular-nums">{account.number}</p>
                <p className="text-sm text-(--inv-muted)">a.n. {account.holder}</p>
                <CopyText text={account.number} label="Salin nomor" />
              </div>
            ))}
            {media.qris && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-6">
                <p className="font-semibold">QRIS</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
                <img
                  src={media.qris.url}
                  alt="Kode QRIS untuk amplop digital"
                  width={media.qris.width}
                  height={media.qris.height}
                  loading="lazy"
                  className="w-64 max-w-full rounded-lg bg-white object-contain"
                />
                <p className="text-sm text-(--inv-muted)">Pindai dengan aplikasi bank atau e-wallet mana pun.</p>
              </div>
            )}
            {gifts.address && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-(--inv-line) bg-(--inv-card) px-5 py-6">
                <p className="font-semibold">Kirim kado</p>
                <p className="text-sm whitespace-pre-line">{gifts.address}</p>
                <CopyText text={gifts.address} label="Salin alamat" />
              </div>
            )}
          </section>
        )}

        <section className="flex flex-col items-center gap-6 text-center">
          <Divider />
          {content.texts.closing && <p className="leading-relaxed whitespace-pre-line">{content.texts.closing}</p>}
          <p className="font-script text-4xl font-semibold">
            {first.nickname} <span className="italic text-(--inv-accent)">&amp;</span> {second.nickname}
          </p>
        </section>
      </main>

      <footer className="border-t border-(--inv-line) px-6 py-6 text-center text-sm text-(--inv-muted)">
        Dibuat dengan{" "}
        <Link href="/?ref=undangan" className="font-medium text-(--inv-accent) underline underline-offset-4">
          MomenKita
        </Link>
        {" · "}
        <Link href="/legal/privasi" className="underline underline-offset-4">
          Privasi
        </Link>
      </footer>
    </div>
  );
}

// Inisial nama panggilan dengan garis tegak, pembuka bagian mempelai (referensi ke-5).
function Monogram({ first, second }: { first: Person; second: Person }) {
  const initial = (p: Person) => (p.nickname || p.fullName).trim().charAt(0).toUpperCase();
  const [a, b] = [initial(first), initial(second)];
  if (!a || !b) return null;
  return (
    <p aria-hidden className="flex items-center gap-5 font-display text-6xl leading-none text-(--inv-accent)">
      <span>{a}</span>
      <span className="h-16 w-px bg-(--inv-ornament)" />
      <span>{b}</span>
    </p>
  );
}

function SectionTitle({ id, Divider, children }: { id: string; Divider: () => React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <h2 id={id} className="font-display text-center text-4xl font-semibold">
        {children}
      </h2>
      <Divider />
    </div>
  );
}

function Profile({ person, role, photo, frame }: { person: Person; role: "Putra" | "Putri"; photo: MediaItem | null; frame: ThemeStyle["photoFrame"] }) {
  const parents = [person.father, person.mother].filter(Boolean).join(" & ");
  return (
    <div className="flex flex-col items-center gap-2">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL R2
        <img
          src={photo.thumbUrl}
          alt={`Foto ${person.nickname || person.fullName}`}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          className={
            {
              arch: "mb-4 aspect-[3/4] w-40 rounded-t-full object-cover outline-1 outline-offset-4 outline-(--inv-ornament)",
              circle: "mb-2 size-40 rounded-full border-4 border-(--inv-card) object-cover shadow-sm",
              card: "mb-4 aspect-[3/4] w-40 border-[6px] border-(--inv-card) object-cover shadow-md outline-1 outline-offset-4 outline-(--inv-ornament)",
            }[frame]
          }
        />
      )}
      <p className="font-display text-4xl font-semibold [overflow-wrap:anywhere]">{person.fullName || person.nickname}</p>
      {parents && (
        <p className="text-(--inv-muted)">
          {role} dari {parents}
        </p>
      )}
      {person.instagram && (
        <a
          href={`https://instagram.com/${encodeURIComponent(person.instagram)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-medium text-(--inv-accent) underline underline-offset-4"
        >
          @{person.instagram}
        </a>
      )}
    </div>
  );
}

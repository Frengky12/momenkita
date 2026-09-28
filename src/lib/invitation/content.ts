// Isi undangan tersimpan di events.theme_config dan events.gift_config (jsonb).
// Parser di sini selalu mengembalikan bentuk lengkap, sehingga halaman undangan tidak rusak karena field kosong atau data lama.

export const THEMES = { klasik: "Elegan klasik", botani: "Botani", adat: "Adat Jawa" } as const;
export const THEME_DESCRIPTIONS: Record<keyof typeof THEMES, string> = {
  klasik: "Krem dan emas, huruf serif klasik, foto mempelai bulat.",
  botani: "Kertas krem dengan ranting daun dan bunga, aksen tembaga, foto berbingkai lengkung.",
  adat: "Gading bermotif batik kawung, gunungan dan melati mengapit foto, aksen taupe.",
};
export type ThemeId = keyof typeof THEMES;

export type Person = { nickname: string; fullName: string; father: string; mother: string; instagram: string };

// Love Story (teks saja): bab berurutan, misalnya "Awal bertemu", "Lamaran".
export type StoryChapter = { title: string; when: string; text: string };
// Sampul "frame": foto dalam bingkai tema; "full": foto menutupi layar dengan teks di bagian bawah.
export type CoverStyle = "frame" | "full";

export type InvitationContent = {
  theme: ThemeId;
  coverStyle: CoverStyle;
  story: StoryChapter[];
  couple: { groom: Person; bride: Person; order: "groom-first" | "bride-first" };
  texts: { opening: string; quote: string; quoteSource: string; closing: string; whatsapp: string };
  rsvpDeadline: string | null;
};

export type GiftAccount = { bank: string; number: string; holder: string };
export type GiftContent = { accounts: GiftAccount[]; address: string };

export const LIMITS = { whatsapp: 1000, name: 60, fullName: 120, parent: 120, instagram: 30, text: 1000, quote: 500, bank: 40, number: 40, address: 500 };
export const MAX_GIFT_ACCOUNTS = 3;
export const MAX_STORY_CHAPTERS = 6;
export const STORY_LIMITS = { title: 60, when: 40, text: 1200 };

// Netral agama; host bebas menggantinya.
export const DEFAULT_TEXTS: InvitationContent["texts"] = {
  opening:
    "Dengan penuh rasa syukur, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada hari bahagia kami.",
  quote: "",
  quoteSource: "",
  closing:
    "Merupakan kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir. Atas kehadiran dan doa restunya, kami ucapkan terima kasih.",
  whatsapp: [
    "Kepada Yth. {nama}",
    "",
    "Tanpa mengurangi rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir di hari bahagia kami.",
    "",
    "Detail acara dan konfirmasi kehadiran:",
    "{link}",
    "",
    "Terima kasih.",
    "{mempelai}",
  ].join("\n"),
};

const TIMEZONE_OFFSETS = { "Asia/Jakarta": "+07:00", "Asia/Makassar": "+08:00", "Asia/Jayapura": "+09:00" } as const;
export type EventTimezone = keyof typeof TIMEZONE_OFFSETS;
export const TIMEZONE_LABELS: Record<EventTimezone, string> = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function person(value: unknown): Person {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    nickname: text(v.nickname, LIMITS.name),
    fullName: text(v.fullName, LIMITS.fullName),
    father: text(v.father, LIMITS.parent),
    mother: text(v.mother, LIMITS.parent),
    instagram: text(v.instagram, LIMITS.instagram).replace(/^@/, ""),
  };
}

export function parseContent(raw: unknown): InvitationContent {
  const v = (raw ?? {}) as Record<string, unknown>;
  const couple = (v.couple ?? {}) as Record<string, unknown>;
  const texts = (v.texts ?? {}) as Record<string, unknown>;
  return {
    theme: typeof v.theme === "string" && v.theme in THEMES ? (v.theme as ThemeId) : "klasik",
    coverStyle: v.coverStyle === "full" ? "full" : "frame",
    story: (Array.isArray(v.story) ? v.story : [])
      .map((c) => {
        const chapter = (c ?? {}) as Record<string, unknown>;
        return { title: text(chapter.title, STORY_LIMITS.title), when: text(chapter.when, STORY_LIMITS.when), text: text(chapter.text, STORY_LIMITS.text) };
      })
      .filter((c) => c.title && c.text)
      .slice(0, MAX_STORY_CHAPTERS),
    couple: {
      groom: person(couple.groom),
      bride: person(couple.bride),
      order: couple.order === "bride-first" ? "bride-first" : "groom-first",
    },
    texts: {
      opening: typeof texts.opening === "string" ? text(texts.opening, LIMITS.text) : DEFAULT_TEXTS.opening,
      quote: text(texts.quote, LIMITS.quote),
      quoteSource: text(texts.quoteSource, LIMITS.name),
      closing: typeof texts.closing === "string" ? text(texts.closing, LIMITS.text) : DEFAULT_TEXTS.closing,
      whatsapp: typeof texts.whatsapp === "string" && texts.whatsapp.trim() ? text(texts.whatsapp, LIMITS.whatsapp) : DEFAULT_TEXTS.whatsapp,
    },
    rsvpDeadline: typeof v.rsvpDeadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.rsvpDeadline) ? v.rsvpDeadline : null,
  };
}

export function parseGifts(raw: unknown): GiftContent {
  const v = (raw ?? {}) as Record<string, unknown>;
  const accounts = Array.isArray(v.accounts) ? v.accounts : [];
  return {
    accounts: accounts
      .map((a) => {
        const acc = (a ?? {}) as Record<string, unknown>;
        return { bank: text(acc.bank, LIMITS.bank), number: text(acc.number, LIMITS.number), holder: text(acc.holder, LIMITS.fullName) };
      })
      .filter((a) => a.bank && a.number)
      .slice(0, MAX_GIFT_ACCOUNTS),
    address: text(v.address, LIMITS.address),
  };
}

export function coupleNames(content: InvitationContent) {
  const { groom, bride, order } = content.couple;
  return order === "bride-first" ? [bride, groom] : [groom, bride];
}

// Indonesia tidak memakai DST, jadi offset tetap cukup untuk mengubah input datetime-local ke UTC.
export function toUtcIso(date: string, time: string, timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone as EventTimezone] ?? TIMEZONE_OFFSETS["Asia/Jakarta"];
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}

// Kebalikan toUtcIso: untuk mengisi ulang input tanggal dan jam di editor.
export function toLocalParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function formatDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

// id-ID menghasilkan "19.00", sesuai ejaan baku penulisan jam.
export function formatTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

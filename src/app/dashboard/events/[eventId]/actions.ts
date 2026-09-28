"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { SaveState } from "@/components/dashboard/section-form";
import {
  LIMITS,
  MAX_GIFT_ACCOUNTS,
  THEMES,
  parseContent,
  slugify,
  toUtcIso,
  type InvitationContent,
  type Person,
  type ThemeId,
} from "@/lib/invitation/content";
import { createClient } from "@/lib/supabase/server";

const MAX_SESSIONS = 5;
const RESERVED_SLUGS = ["api", "auth", "login", "dashboard", "staff", "admin", "legal"];

const saved = (): SaveState => ({ status: "saved", at: Date.now() });
const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });
const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

// Semua update lewat client host sehingga RLS memastikan hanya pengelola event yang bisa menyimpan.
async function updateContent(eventId: string, mutate: (content: InvitationContent) => InvitationContent) {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("theme_config").eq("id", eventId).maybeSingle();
  if (!event) return failed("Event tidak ditemukan.");
  const { error } = await supabase.from("events").update({ theme_config: mutate(parseContent(event.theme_config)) }).eq("id", eventId);
  if (error) return failed("Gagal menyimpan. Coba lagi.");
  refresh();
  return saved();
}

function readPerson(formData: FormData, prefix: string): Person {
  return {
    nickname: field(formData, `${prefix}.nickname`).slice(0, LIMITS.name),
    fullName: field(formData, `${prefix}.fullName`).slice(0, LIMITS.fullName),
    father: field(formData, `${prefix}.father`).slice(0, LIMITS.parent),
    mother: field(formData, `${prefix}.mother`).slice(0, LIMITS.parent),
    instagram: field(formData, `${prefix}.instagram`).replace(/^@/, "").slice(0, LIMITS.instagram),
  };
}

export async function saveCouple(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const groom = readPerson(formData, "groom");
  const bride = readPerson(formData, "bride");
  if (!groom.nickname || !bride.nickname) return failed("Nama panggilan kedua mempelai wajib diisi.");
  const order = formData.get("order") === "bride-first" ? "bride-first" : "groom-first";

  const result = await updateContent(eventId, (c) => ({ ...c, couple: { groom, bride, order } }));
  if (result.status === "saved") {
    // Judul event mengikuti urutan nama agar daftar event dan tab browser konsisten dengan undangan.
    const [first, second] = order === "bride-first" ? [bride, groom] : [groom, bride];
    const supabase = await createClient();
    await supabase.from("events").update({ title: `${first.nickname} & ${second.nickname}` }).eq("id", eventId);
  }
  return result;
}

export async function saveTexts(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const texts = {
    opening: field(formData, "opening").slice(0, LIMITS.text),
    quote: field(formData, "quote").slice(0, LIMITS.quote),
    quoteSource: field(formData, "quoteSource").slice(0, LIMITS.name),
    closing: field(formData, "closing").slice(0, LIMITS.text),
    whatsapp: field(formData, "whatsapp").slice(0, LIMITS.whatsapp),
  };
  if (!texts.opening) return failed("Teks pembuka wajib diisi.");
  if (texts.whatsapp && !texts.whatsapp.includes("{link}")) return failed("Pesan WhatsApp harus memuat {link} agar tamu menerima link undangannya.");
  return updateContent(eventId, (c) => ({ ...c, texts }));
}

export async function saveGifts(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const accounts = Array.from({ length: MAX_GIFT_ACCOUNTS }, (_, i) => ({
    bank: field(formData, `accounts.${i}.bank`).slice(0, LIMITS.bank),
    number: field(formData, `accounts.${i}.number`).slice(0, LIMITS.number),
    holder: field(formData, `accounts.${i}.holder`).slice(0, LIMITS.fullName),
  }));
  const partial = accounts.find((a) => (a.bank || a.number || a.holder) && !(a.bank && a.number && a.holder));
  if (partial) return failed("Lengkapi bank, nomor, dan nama pemilik untuk setiap rekening, atau kosongkan ketiganya.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({
      gift_config: { accounts: accounts.filter((a) => a.bank), address: field(formData, "address").slice(0, LIMITS.address) },
    })
    .eq("id", eventId);
  if (error) return failed("Gagal menyimpan. Coba lagi.");
  refresh();
  return saved();
}

export async function saveTheme(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const theme = field(formData, "theme");
  if (!(theme in THEMES)) return failed("Pilih salah satu tema.");
  return updateContent(eventId, (c) => ({ ...c, theme: theme as ThemeId }));
}

export async function saveSettings(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const rsvpDeadline = field(formData, "rsvpDeadline");
  if (rsvpDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(rsvpDeadline)) return failed("Format tanggal batas RSVP tidak valid.");

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("slug, published_at").eq("id", eventId).maybeSingle();
  if (!event) return failed("Event tidak ditemukan.");

  // Slug dikunci setelah publikasi karena link sudah tersebar ke tamu.
  const requestedSlug = slugify(field(formData, "slug"));
  if (!event.published_at && requestedSlug && requestedSlug !== event.slug) {
    if (requestedSlug.length < 3) return failed("Alamat undangan minimal 3 huruf atau angka.");
    if (RESERVED_SLUGS.includes(requestedSlug)) return failed(`Alamat "${requestedSlug}" dipakai sistem.`);
    const { error } = await supabase.from("events").update({ slug: requestedSlug }).eq("id", eventId);
    if (error) return failed(error.code === "23505" ? `Alamat "${requestedSlug}" sudah dipakai.` : "Gagal menyimpan alamat.");
  }

  return updateContent(eventId, (c) => ({ ...c, rsvpDeadline: rsvpDeadline || null }));
}

export async function saveSession(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const sessionId = field(formData, "sessionId");
  const name = field(formData, "name");
  const date = field(formData, "date");
  const start = field(formData, "start");
  const end = field(formData, "end");
  if (!name || name.length > 60) return failed("Nama sesi wajib diisi (maksimal 60 karakter).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return failed("Isi tanggal, jam mulai, dan jam selesai.");
  }

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("timezone").eq("id", eventId).maybeSingle();
  if (!event) return failed("Event tidak ditemukan.");
  const startsAt = toUtcIso(date, start, event.timezone);
  const endsAt = toUtcIso(date, end, event.timezone);
  if (endsAt <= startsAt) return failed("Jam selesai harus setelah jam mulai.");

  const row = {
    name,
    starts_at: startsAt,
    ends_at: endsAt,
    venue_name: field(formData, "venueName").slice(0, 120) || null,
    venue_address: field(formData, "venueAddress").slice(0, LIMITS.address) || null,
  };

  if (sessionId) {
    const { error } = await supabase.from("event_sessions").update(row).eq("id", sessionId).eq("event_id", eventId);
    if (error) return failed("Gagal menyimpan sesi.");
  } else {
    const { count } = await supabase.from("event_sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    if ((count ?? 0) >= MAX_SESSIONS) return failed(`Maksimal ${MAX_SESSIONS} sesi acara.`);
    const { error } = await supabase.from("event_sessions").insert({ ...row, event_id: eventId });
    if (error) return failed("Gagal menambah sesi.");
  }
  refresh();
  return saved();
}

export async function deleteSession(eventId: string, sessionId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { count } = await supabase.from("event_sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if ((count ?? 0) <= 1) return failed("Undangan butuh minimal satu sesi acara.");
  const { error } = await supabase.from("event_sessions").delete().eq("id", sessionId).eq("event_id", eventId);
  if (error) return failed("Gagal menghapus sesi.");
  refresh();
  return saved();
}

export async function deleteDraftEvent(eventId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").delete().eq("id", eventId).eq("status", "draft").select("id");
  if (error || !data?.length) return failed("Hanya event berstatus draf yang bisa dihapus.");
  redirect("/dashboard");
}

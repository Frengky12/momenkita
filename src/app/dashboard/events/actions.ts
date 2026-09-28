"use server";

import { redirect } from "next/navigation";
import { DEFAULT_TEXTS, LIMITS, TIMEZONE_LABELS, slugify, toUtcIso } from "@/lib/invitation/content";
import { createClient } from "@/lib/supabase/server";

export type CreateEventState =
  | { status: "idle" }
  | { status: "error"; message: string; values: Record<string, string> };

const RESERVED_SLUGS = ["api", "auth", "login", "dashboard", "staff", "admin", "legal"];

export async function createEvent(_prev: CreateEventState, formData: FormData): Promise<CreateEventState> {
  const values = Object.fromEntries(
    ["groom", "bride", "slug", "timezone", "date", "start", "end"].map((key) => [key, String(formData.get(key) ?? "").trim()]),
  );
  const fail = (message: string): CreateEventState => ({ status: "error", message, values });

  const slug = slugify(values.slug || `${values.groom}-${values.bride}`);
  const timezone = values.timezone in TIMEZONE_LABELS ? values.timezone : "Asia/Jakarta";

  if (!values.groom || !values.bride) return fail("Isi nama panggilan kedua mempelai.");
  if (values.groom.length > LIMITS.name || values.bride.length > LIMITS.name) return fail("Nama panggilan maksimal 60 karakter.");
  if (slug.length < 3) return fail("Alamat undangan minimal 3 huruf atau angka.");
  if (RESERVED_SLUGS.includes(slug)) return fail(`Alamat "${slug}" dipakai sistem. Pilih alamat lain.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !/^\d{2}:\d{2}$/.test(values.start) || !/^\d{2}:\d{2}$/.test(values.end)) {
    return fail("Isi tanggal, jam mulai, dan jam selesai resepsi.");
  }
  const startsAt = toUtcIso(values.date, values.start, timezone);
  const endsAt = toUtcIso(values.date, values.end, timezone);
  if (endsAt <= startsAt) return fail("Jam selesai harus setelah jam mulai.");

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      slug,
      title: `${values.groom} & ${values.bride}`,
      timezone,
      theme_config: {
        theme: "klasik",
        couple: { groom: { nickname: values.groom }, bride: { nickname: values.bride }, order: "groom-first" },
        texts: DEFAULT_TEXTS,
      },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return fail(`Alamat "${slug}" sudah dipakai. Coba variasi lain, misalnya ${slug}-2026.`);
    return fail("Event gagal dibuat. Coba lagi sebentar lagi.");
  }

  const { error: sessionError } = await supabase
    .from("event_sessions")
    .insert({ event_id: event.id, name: "Resepsi", starts_at: startsAt, ends_at: endsAt });
  if (sessionError) return fail("Event dibuat, tetapi sesi resepsi gagal disimpan. Tambahkan dari editor.");

  redirect(`/dashboard/events/${event.id}/undangan`);
}

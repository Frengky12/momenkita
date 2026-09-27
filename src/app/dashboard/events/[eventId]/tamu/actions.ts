"use server";

import { refresh } from "next/cache";
import type { SaveState } from "@/components/dashboard/section-form";
import { MAX_IMPORT_ROWS, validateGuest, type GuestFields } from "@/lib/guests";
import { createClient } from "@/lib/supabase/server";

const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });

async function eventSessions(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("event_sessions").select("id, name").eq("event_id", eventId);
  return { supabase, sessions: data ?? [] };
}

export async function saveGuest(eventId: string, guestId: string | null, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, sessions } = await eventSessions(eventId);
  const fields: GuestFields = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    category: String(formData.get("category") ?? ""),
    pax: String(formData.get("pax") ?? ""),
    table: String(formData.get("table") ?? ""),
    sessions: "",
  };
  const { guest, errors } = validateGuest(fields, sessions);
  if (!guest) return failed(errors.join(". "));

  // Semua sesi dicentang disimpan sebagai [] (= semua sesi, termasuk yang ditambah belakangan).
  const checked = formData.getAll("sessionIds").map(String).filter((id) => sessions.some((s) => s.id === id));
  if (checked.length === 0) return failed("Pilih minimal satu sesi.");
  guest.session_ids = checked.length === sessions.length ? [] : checked;

  const { error } = guestId
    ? await supabase.from("invitations").update(guest).eq("id", guestId).eq("event_id", eventId)
    : await supabase.from("invitations").insert({ ...guest, event_id: eventId, source: "manual" });
  if (error) return failed("Gagal menyimpan tamu. Coba lagi.");
  refresh();
  return { status: "saved", at: Date.now() };
}

export async function deleteGuest(eventId: string, guestId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", guestId).eq("event_id", eventId);
  if (error) return failed("Gagal menghapus tamu.");
  refresh();
  return { status: "saved", at: Date.now() };
}

export type ImportResult = { status: "done"; inserted: number } | { status: "error"; message: string };

// Divalidasi ulang di server; kalau ada satu baris salah, tidak ada yang disimpan agar impor ulang tidak menggandakan data.
export async function importGuests(eventId: string, rows: GuestFields[]): Promise<ImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) return { status: "error", message: "Tidak ada baris untuk diimpor." };
  if (rows.length > MAX_IMPORT_ROWS) return { status: "error", message: `Maksimal ${MAX_IMPORT_ROWS} tamu per impor.` };

  const { supabase, sessions } = await eventSessions(eventId);
  const guests = [];
  for (const [i, fields] of rows.entries()) {
    const { guest, errors } = validateGuest(fields, sessions);
    if (!guest) return { status: "error", message: `Baris data ke-${i + 1}: ${errors.join(", ")}` };
    guests.push({ ...guest, event_id: eventId, source: "import" });
  }

  const { error } = await supabase.from("invitations").insert(guests);
  if (error) return { status: "error", message: "Impor gagal disimpan. Tidak ada tamu yang ditambahkan." };
  refresh();
  return { status: "done", inserted: guests.length };
}

// Dipanggil saat host menekan Kirim WA. Pengiriman terjadi di aplikasi WhatsApp host, jadi ini hanya penanda.
export async function markSent(eventId: string, guestId: string) {
  const supabase = await createClient();
  await supabase.from("invitations").update({ sent_at: new Date().toISOString() }).eq("id", guestId).eq("event_id", eventId);
  refresh();
}

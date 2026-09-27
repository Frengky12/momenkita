"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { SaveState } from "@/components/dashboard/section-form";
import { createClient } from "@/lib/supabase/server";

const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });

export type CreatedInvite =
  | { status: "idle" }
  | { status: "error"; message: string; at: number }
  | { status: "created"; label: string; token: string; expiresAt: string; at: number };

// Token mentah hanya ada di respons ini; database menyimpan hash-nya saja (sama seperti link staf).
export async function createCohostInvite(eventId: string, _prev: CreatedInvite, formData: FormData): Promise<CreatedInvite> {
  const label = String(formData.get("label") ?? "").trim().slice(0, 40);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_cohost_invite", { p_event_id: eventId, p_label: label });
  if (error) {
    const message =
      error.code === "42501"
        ? "Hanya pemilik event yang bisa mengundang co-host."
        : error.message.includes("maksimal")
          ? "Sudah ada 5 undangan yang belum dipakai. Cabut yang tidak jadi dikirim dulu."
          : "Gagal membuat undangan. Coba lagi.";
    return { status: "error", message, at: Date.now() };
  }
  refresh();
  const created = data as { token: string; expires_at: string };
  return { status: "created", label, token: created.token, expiresAt: created.expires_at, at: Date.now() };
}

export async function revokeCohostInvite(inviteId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_cohost_invite", { p_invite_id: inviteId });
  if (error) return failed("Gagal mencabut undangan. Muat ulang halaman lalu coba lagi.");
  refresh();
  return { status: "saved", at: Date.now() };
}

// RLS hanya mengizinkan pemilik event menghapus co-host lain; baris yang tidak terhapus berarti ditolak.
export async function removeCohost(eventId: string, profileId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_cohosts").delete().eq("event_id", eventId).eq("profile_id", profileId).select("profile_id");
  if (error || !data?.length) return failed("Gagal mengeluarkan co-host. Hanya pemilik event yang bisa melakukannya.");
  refresh();
  return { status: "saved", at: Date.now() };
}

export async function leaveEvent(eventId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims.sub;
  if (!uid) return failed("Sesi berakhir. Masuk lagi.");
  const { data, error } = await supabase.from("event_cohosts").delete().eq("event_id", eventId).eq("profile_id", uid).select("profile_id");
  if (error || !data?.length) return failed("Gagal keluar dari event. Coba lagi.");
  redirect("/dashboard");
}

"use server";

import { refresh } from "next/cache";
import type { SaveState } from "@/components/dashboard/section-form";
import { CREATABLE_ROLES } from "@/lib/staff/roles";
import { createClient } from "@/lib/supabase/server";

const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });

export type CreatedLink =
  | { status: "idle" }
  | { status: "error"; message: string; at: number }
  | { status: "created"; role: string; label: string; token: string; pin: string; expiresAt: string; at: number };

// Token dan PIN mentah hanya ada di respons ini; database menyimpan hash-nya saja.
export async function createStaffLink(eventId: string, _prev: CreatedLink, formData: FormData): Promise<CreatedLink> {
  const role = String(formData.get("role") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 40);
  if (!(CREATABLE_ROLES as readonly string[]).includes(role)) return { status: "error", message: "Pilih peran staf.", at: Date.now() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_staff_link", { p_event_id: eventId, p_role: role, p_label: label });
  if (error) {
    const message = error.message.includes("sesi acara")
      ? "Tambahkan minimal satu sesi acara di tab Undangan dulu; masa berlaku link dihitung dari sesi terakhir."
      : "Gagal membuat link staf. Coba lagi.";
    return { status: "error", message, at: Date.now() };
  }
  refresh();
  const created = data as { token: string; pin: string; expires_at: string };
  return { status: "created", role, label, token: created.token, pin: created.pin, expiresAt: created.expires_at, at: Date.now() };
}

export async function revokeStaffLink(eventId: string, linkId: string): Promise<SaveState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("event_id", eventId)
    .is("revoked_at", null);
  if (error) return failed("Gagal mencabut link. Coba lagi.");
  refresh();
  return { status: "saved", at: Date.now() };
}

const MODES = ["curated", "delayed", "instant"] as const;

export async function setModerationMode(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const mode = String(formData.get("mode") ?? "");
  if (!(MODES as readonly string[]).includes(mode)) return failed("Pilih mode moderasi.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ moderation_mode: mode as (typeof MODES)[number] })
    .eq("id", eventId);
  if (error) return failed("Gagal menyimpan mode moderasi. Coba lagi.");
  refresh();
  return { status: "saved", at: Date.now() };
}

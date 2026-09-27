"use server";

import { refresh } from "next/cache";
import type { SaveState } from "@/components/dashboard/section-form";
import { createClient } from "@/lib/supabase/server";

const failed = (message: string): SaveState => ({ status: "error", message, at: Date.now() });

export async function saveGallerySettings(eventId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const open = formData.get("public") === "on";
  const passcode = String(formData.get("passcode") ?? "").trim();
  const removePasscode = formData.get("removePasscode") === "on";
  if (passcode && (passcode.length < 4 || passcode.length > 32)) return failed("Passcode harus 4 sampai 32 karakter.");

  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ gallery_public: open }).eq("id", eventId);
  if (error) return failed("Gagal menyimpan. Coba lagi.");
  // Passcode di-hash di database (set_gallery_passcode); kosong = passcode dihapus.
  if (passcode || removePasscode) {
    const { error: passError } = await supabase.rpc("set_gallery_passcode", { p_event_id: eventId, p_passcode: removePasscode ? "" : passcode });
    if (passError) return failed("Passcode gagal disimpan. Coba lagi.");
  }
  refresh();
  return { status: "saved", at: Date.now() };
}

// Menurunkan foto yang dilaporkan: foto ditolak (hilang dari panggung, galeri, dan ZIP), lalu laporannya ditutup.
export async function resolveReport(eventId: string, reportId: string, photoId: string | null): Promise<SaveState> {
  const supabase = await createClient();
  if (photoId) {
    const { error } = await supabase.rpc("staff_moderate_photo", { p_photo_id: photoId, p_action: "reject" });
    if (error) return failed("Foto gagal diturunkan. Coba lagi.");
  }
  const { error } = await supabase
    .from("photo_reports")
    .update({ resolved_at: new Date().toISOString() })
    .eq(photoId ? "photo_id" : "id", photoId ?? reportId)
    .eq("event_id", eventId)
    .is("resolved_at", null);
  if (error) return failed("Laporan gagal ditandai selesai. Coba lagi.");
  refresh();
  return { status: "saved", at: Date.now() };
}

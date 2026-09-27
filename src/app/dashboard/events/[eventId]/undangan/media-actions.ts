"use server";

import { refresh } from "next/cache";
import { GALLERY_MAX, isMediaKind, type MediaKind } from "@/lib/invitation/media-kinds";
import { mediaKeys } from "@/lib/invitation/media";
import { deleteObjects, headObject, presignPut } from "@/lib/r2";
import { reportError } from "@/lib/report-error";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_TYPES, UUID_PATTERN, isAllowedFile, type DisplayType } from "@/lib/uploads";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const isDisplayType = (value: unknown): value is DisplayType => (DISPLAY_TYPES as readonly unknown[]).includes(value);

// RLS events hanya mengembalikan event yang dikelola user ini (pemilik, co-host, anggota organisasi).
async function managedEvent(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  return data ? supabase : null;
}

// Langkah 1: browser sudah mengompres foto (display ≤ 400 KB, thumb ≤ 150 KB); server menandatangani PUT untuk ukuran persis itu.
export async function prepareMediaUpload(
  eventId: string,
  kind: MediaKind,
  format: DisplayType,
  sizes: { display: number; thumb: number },
): Promise<Result<{ mediaId: string; displayUrl: string; thumbUrl: string }>> {
  if (!isMediaKind(kind) || !isDisplayType(format)) return { ok: false, message: "Jenis foto tidak dikenal." };
  if (!isAllowedFile("display", format, sizes.display) || !isAllowedFile("thumb", format, sizes.thumb)) {
    return { ok: false, message: "Foto terlalu besar setelah dikompres. Coba foto lain." };
  }
  const supabase = await managedEvent(eventId);
  if (!supabase) return { ok: false, message: "Event tidak ditemukan atau kamu tidak punya akses." };
  if (kind === "gallery") {
    const { count } = await supabase.from("invitation_media").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("kind", "gallery");
    if ((count ?? 0) >= GALLERY_MAX) return { ok: false, message: `Galeri sudah berisi ${GALLERY_MAX} foto. Hapus salah satu dulu.` };
  }

  const mediaId = crypto.randomUUID();
  const keys = mediaKeys(eventId, mediaId, format);
  const [displayUrl, thumbUrl] = await Promise.all([presignPut(keys.display, format, sizes.display), presignPut(keys.thumb, format, sizes.thumb)]);
  return { ok: true, mediaId, displayUrl, thumbUrl };
}

// Langkah 2: setelah browser mengunggah ke R2, server memastikan kedua file benar-benar ada dan sesuai, lalu mencatatnya.
export async function confirmMediaUpload(
  eventId: string,
  mediaId: string,
  kind: MediaKind,
  format: DisplayType,
  dimensions: { width: number; height: number },
): Promise<Result> {
  if (!UUID_PATTERN.test(mediaId) || !isMediaKind(kind) || !isDisplayType(format)) return { ok: false, message: "Data unggahan tidak valid." };
  const width = Math.round(dimensions.width);
  const height = Math.round(dimensions.height);
  if (!(width > 0 && height > 0 && width <= 4000 && height <= 4000)) return { ok: false, message: "Ukuran foto tidak valid." };
  const supabase = await managedEvent(eventId);
  if (!supabase) return { ok: false, message: "Event tidak ditemukan atau kamu tidak punya akses." };

  const keys = mediaKeys(eventId, mediaId, format);
  const [display, thumb] = await Promise.all([headObject(keys.display), headObject(keys.thumb)]);
  if (!display || !thumb || display.contentType !== format || thumb.contentType !== format) {
    return { ok: false, message: "Unggahan belum lengkap. Coba unggah lagi." };
  }
  const row = { key_display: keys.display, key_thumb: keys.thumb, width, height, bytes_display: display.size };

  let replacedKeys: string[] = [];
  let error: { message: string } | null = null;
  if (kind === "gallery") {
    ({ error } = await supabase.from("invitation_media").insert({ event_id: eventId, kind, ...row }));
  } else {
    const { data: existing } = await supabase.from("invitation_media").select("id, key_display, key_thumb").eq("event_id", eventId).eq("kind", kind).maybeSingle();
    if (existing) {
      ({ error } = await supabase.from("invitation_media").update(row).eq("id", existing.id));
      replacedKeys = [existing.key_display, existing.key_thumb];
    } else {
      ({ error } = await supabase.from("invitation_media").insert({ event_id: eventId, kind, ...row }));
    }
  }

  if (error) {
    await deleteObjects([keys.display, keys.thumb]).catch(() => undefined);
    return { ok: false, message: error.message.includes("maksimal") ? "Galeri sudah penuh." : "Foto gagal disimpan. Coba lagi." };
  }
  if (replacedKeys.length) {
    await deleteObjects(replacedKeys).catch((e) => reportError("Foto undangan lama gagal dihapus dari R2", e, { eventId, kind }));
  }
  refresh();
  return { ok: true };
}

export async function deleteMedia(eventId: string, mediaId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invitation_media").delete().eq("id", mediaId).eq("event_id", eventId).select("key_display, key_thumb");
  if (error || !data?.length) return { ok: false, message: "Foto gagal dihapus. Muat ulang halaman lalu coba lagi." };
  await deleteObjects([data[0].key_display, data[0].key_thumb]).catch((e) => reportError("Foto undangan gagal dihapus dari R2", e, { eventId }));
  refresh();
  return { ok: true };
}

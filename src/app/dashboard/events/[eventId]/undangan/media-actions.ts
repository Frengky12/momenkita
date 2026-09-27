"use server";

import { refresh } from "next/cache";
import { GALLERY_MAX, MUSIC_MAX_BYTES, isMediaKind, isMusicType, type MediaKind, type MusicType } from "@/lib/invitation/media-kinds";
import { mediaKeys, musicKey } from "@/lib/invitation/media";
import { deleteObjects, headObject, presignPut } from "@/lib/r2";
import { reportError } from "@/lib/report-error";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_TYPES, UUID_PATTERN, isAllowedFile, type DisplayType } from "@/lib/uploads";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
type PhotoKind = Exclude<MediaKind, "music">;
type Client = Awaited<ReturnType<typeof createClient>>;
type Row = { key_display: string; key_thumb: string | null; width: number | null; height: number | null; bytes_display: number };

const isDisplayType = (value: unknown): value is DisplayType => (DISPLAY_TYPES as readonly unknown[]).includes(value);
const isPhotoKind = (value: unknown): value is PhotoKind => isMediaKind(value) && value !== "music";
const keysOf = (row: { key_display: string; key_thumb: string | null }) => [row.key_display, row.key_thumb].filter((k): k is string => Boolean(k));
const NO_ACCESS = { ok: false, message: "Event tidak ditemukan atau kamu tidak punya akses." } as const;

// RLS events hanya mengembalikan event yang dikelola user ini (pemilik, co-host, anggota organisasi).
async function managedEvent(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  return data ? supabase : null;
}

// Galeri menambah baris; jenis lain (satu per event) memperbarui baris yang ada lalu menghapus file lamanya dari R2.
async function saveRow(supabase: Client, eventId: string, kind: MediaKind, row: Row, uploadedKeys: string[]): Promise<Result> {
  let replacedKeys: string[] = [];
  let error: { message: string } | null = null;
  if (kind === "gallery") {
    ({ error } = await supabase.from("invitation_media").insert({ event_id: eventId, kind, ...row }));
  } else {
    const { data: existing } = await supabase.from("invitation_media").select("id, key_display, key_thumb").eq("event_id", eventId).eq("kind", kind).maybeSingle();
    if (existing) {
      ({ error } = await supabase.from("invitation_media").update(row).eq("id", existing.id));
      replacedKeys = keysOf(existing);
    } else {
      ({ error } = await supabase.from("invitation_media").insert({ event_id: eventId, kind, ...row }));
    }
  }

  if (error) {
    await deleteObjects(uploadedKeys).catch(() => undefined);
    return { ok: false, message: error.message.includes("maksimal") ? "Galeri sudah penuh." : "File gagal disimpan. Coba lagi." };
  }
  if (replacedKeys.length) {
    await deleteObjects(replacedKeys).catch((e) => reportError("File undangan lama gagal dihapus dari R2", e, { eventId, kind }));
  }
  refresh();
  return { ok: true };
}

// Foto langkah 1: browser sudah mengompres foto (display ≤ 400 KB, thumb ≤ 150 KB); server menandatangani PUT untuk ukuran persis itu.
export async function prepareMediaUpload(
  eventId: string,
  kind: PhotoKind,
  format: DisplayType,
  sizes: { display: number; thumb: number },
): Promise<Result<{ mediaId: string; displayUrl: string; thumbUrl: string }>> {
  if (!isPhotoKind(kind) || !isDisplayType(format)) return { ok: false, message: "Jenis foto tidak dikenal." };
  if (!isAllowedFile("display", format, sizes.display) || !isAllowedFile("thumb", format, sizes.thumb)) {
    return { ok: false, message: "Foto terlalu besar setelah dikompres. Coba foto lain." };
  }
  const supabase = await managedEvent(eventId);
  if (!supabase) return NO_ACCESS;
  if (kind === "gallery") {
    const { count } = await supabase.from("invitation_media").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("kind", "gallery");
    if ((count ?? 0) >= GALLERY_MAX) return { ok: false, message: `Galeri sudah berisi ${GALLERY_MAX} foto. Hapus salah satu dulu.` };
  }

  const mediaId = crypto.randomUUID();
  const keys = mediaKeys(eventId, mediaId, format);
  const [displayUrl, thumbUrl] = await Promise.all([presignPut(keys.display, format, sizes.display), presignPut(keys.thumb, format, sizes.thumb)]);
  return { ok: true, mediaId, displayUrl, thumbUrl };
}

// Foto langkah 2: setelah browser mengunggah ke R2, server memastikan kedua file benar-benar ada dan sesuai, lalu mencatatnya.
export async function confirmMediaUpload(
  eventId: string,
  mediaId: string,
  kind: PhotoKind,
  format: DisplayType,
  dimensions: { width: number; height: number },
): Promise<Result> {
  if (!UUID_PATTERN.test(mediaId) || !isPhotoKind(kind) || !isDisplayType(format)) return { ok: false, message: "Data unggahan tidak valid." };
  const width = Math.round(dimensions.width);
  const height = Math.round(dimensions.height);
  if (!(width > 0 && height > 0 && width <= 4000 && height <= 4000)) return { ok: false, message: "Ukuran foto tidak valid." };
  const supabase = await managedEvent(eventId);
  if (!supabase) return NO_ACCESS;

  const keys = mediaKeys(eventId, mediaId, format);
  const [display, thumb] = await Promise.all([headObject(keys.display), headObject(keys.thumb)]);
  if (!display || !thumb || display.contentType !== format || thumb.contentType !== format) {
    return { ok: false, message: "Unggahan belum lengkap. Coba unggah lagi." };
  }
  return saveRow(supabase, eventId, kind, { key_display: keys.display, key_thumb: keys.thumb, width, height, bytes_display: display.size }, [keys.display, keys.thumb]);
}

// Musik langkah 1. Host wajib menyatakan berhak memakai lagunya (PRD §5.1: hak cipta tanggung jawab host).
export async function prepareMusicUpload(
  eventId: string,
  type: MusicType,
  size: number,
  rightsConfirmed: boolean,
): Promise<Result<{ mediaId: string; url: string }>> {
  if (!rightsConfirmed) return { ok: false, message: "Centang pernyataan hak pakai lagu dulu." };
  if (!isMusicType(type)) return { ok: false, message: "Format lagu harus MP3, M4A, atau AAC." };
  if (!Number.isInteger(size) || size <= 0 || size > MUSIC_MAX_BYTES) return { ok: false, message: "Ukuran lagu maksimal 8 MB." };
  const supabase = await managedEvent(eventId);
  if (!supabase) return NO_ACCESS;
  const mediaId = crypto.randomUUID();
  // Unggahan audio lebih besar dari foto, jadi URL PUT diberi waktu 10 menit untuk koneksi lambat.
  const url = await presignPut(musicKey(eventId, mediaId, type), type, size, 600);
  return { ok: true, mediaId, url };
}

export async function confirmMusicUpload(eventId: string, mediaId: string, type: MusicType): Promise<Result> {
  if (!UUID_PATTERN.test(mediaId) || !isMusicType(type)) return { ok: false, message: "Data unggahan tidak valid." };
  const supabase = await managedEvent(eventId);
  if (!supabase) return NO_ACCESS;
  const key = musicKey(eventId, mediaId, type);
  const object = await headObject(key);
  if (!object || object.contentType !== type || object.size > MUSIC_MAX_BYTES) return { ok: false, message: "Unggahan belum lengkap. Coba unggah lagi." };
  return saveRow(supabase, eventId, "music", { key_display: key, key_thumb: null, width: null, height: null, bytes_display: object.size }, [key]);
}

export async function deleteMedia(eventId: string, mediaId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invitation_media").delete().eq("id", mediaId).eq("event_id", eventId).select("key_display, key_thumb");
  if (error || !data?.length) return { ok: false, message: "File gagal dihapus. Muat ulang halaman lalu coba lagi." };
  await deleteObjects(keysOf(data[0])).catch((e) => reportError("File undangan gagal dihapus dari R2", e, { eventId }));
  refresh();
  return { ok: true };
}

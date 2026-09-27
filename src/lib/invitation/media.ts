import "server-only";
import { presignGet } from "@/lib/r2";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import type { DisplayType } from "@/lib/uploads";
import { MUSIC_TYPES, type MediaKind, type MusicType } from "./media-kinds";

export type MediaItem = { id: string; url: string; thumbUrl: string; width: number; height: number };
export type MusicItem = { id: string; url: string };
export type InvitationMedia = {
  cover: MediaItem | null;
  groom: MediaItem | null;
  bride: MediaItem | null;
  qris: MediaItem | null;
  gallery: MediaItem[];
  music: MusicItem | null;
};

type Client = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

const EXT: Record<DisplayType, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

// Folder undangan dipisah dari foto tamu (events/<id>/<sesi>/...) dan dicek constraint invitation_media_key_prefix.
export function mediaKeys(eventId: string, mediaId: string, format: DisplayType) {
  const base = `events/${eventId}/invitation/${mediaId}`;
  return { display: `${base}/display.${EXT[format]}`, thumb: `${base}/thumb.${EXT[format]}` };
}

export function musicKey(eventId: string, mediaId: string, type: MusicType) {
  return `events/${eventId}/invitation/${mediaId}/music.${MUSIC_TYPES[type]}`;
}

export const EMPTY_MEDIA: InvitationMedia = { cover: null, groom: null, bride: null, qris: null, gallery: [], music: null };

// Signed URL foto berlaku minimal 1 jam dan tanda tangannya dibulatkan per jam (lib/r2.ts), jadi cache browser tetap terpakai.
// Musik 6 jam: tamu bisa membiarkan undangan terbuka lama sebelum menekan putar.
export async function loadMedia(client: Client, eventId: string): Promise<InvitationMedia> {
  const { data } = await client
    .from("invitation_media")
    .select("id, kind, key_display, key_thumb, width, height")
    .eq("event_id", eventId)
    .order("created_at");
  if (!data?.length) return EMPTY_MEDIA;

  const media: InvitationMedia = { ...EMPTY_MEDIA, gallery: [] };
  await Promise.all(
    data.map(async (row) => {
      const kind = row.kind as MediaKind;
      if (kind === "music") {
        media.music = { id: row.id, url: await presignGet(row.key_display, 6) };
        return;
      }
      if (!row.key_thumb || !row.width || !row.height) return;
      const item: MediaItem = { id: row.id, url: await presignGet(row.key_display), thumbUrl: await presignGet(row.key_thumb), width: row.width, height: row.height };
      if (kind === "gallery") media.gallery.push(item);
      else media[kind] = item;
    }),
  );
  // Promise.all bisa selesai tidak berurutan; urutan galeri mengikuti waktu unggah.
  const order = new Map(data.map((row, i) => [row.id, i]));
  media.gallery.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return media;
}

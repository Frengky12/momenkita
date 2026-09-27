import "server-only";
import { presignGet } from "@/lib/r2";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import type { DisplayType } from "@/lib/uploads";
import { MEDIA_KINDS, type MediaKind } from "./media-kinds";

export type MediaItem = { id: string; url: string; thumbUrl: string; width: number; height: number };
export type InvitationMedia = { cover: MediaItem | null; groom: MediaItem | null; bride: MediaItem | null; qris: MediaItem | null; gallery: MediaItem[] };

type Client = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

const EXT: Record<DisplayType, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

// Folder undangan dipisah dari foto tamu (events/<id>/<sesi>/...) dan dicek constraint invitation_media_key_prefix.
export function mediaKeys(eventId: string, mediaId: string, format: DisplayType) {
  const base = `events/${eventId}/invitation/${mediaId}`;
  return { display: `${base}/display.${EXT[format]}`, thumb: `${base}/thumb.${EXT[format]}` };
}

export const EMPTY_MEDIA: InvitationMedia = { cover: null, groom: null, bride: null, qris: null, gallery: [] };

// Signed URL berlaku minimal 1 jam dan tanda tangannya dibulatkan per jam (lib/r2.ts), jadi cache browser tetap terpakai.
export async function loadMedia(client: Client, eventId: string): Promise<InvitationMedia> {
  const { data } = await client
    .from("invitation_media")
    .select("id, kind, key_display, key_thumb, width, height")
    .eq("event_id", eventId)
    .order("created_at");
  if (!data?.length) return EMPTY_MEDIA;

  const items = await Promise.all(
    data.map(async (row) => ({
      kind: row.kind as MediaKind,
      item: { id: row.id, url: await presignGet(row.key_display), thumbUrl: await presignGet(row.key_thumb), width: row.width, height: row.height },
    })),
  );
  const media: InvitationMedia = { ...EMPTY_MEDIA, gallery: [] };
  for (const { kind, item } of items) {
    if (kind === "gallery") media.gallery.push(item);
    else if (kind in MEDIA_KINDS) media[kind] = item;
  }
  return media;
}

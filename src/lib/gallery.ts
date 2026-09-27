import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { presignGet } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Galeri bersama (PRD §5.5): tamu hanya bisa melihat bila host membukanya, dengan passcode opsional.
// Pengelola event (host, co-host, WO) selalu bisa melihat, termasuk sebelum galeri dibuka.

export type GalleryEvent = {
  id: string;
  slug: string;
  title: string;
  timezone: string;
  package: string | null;
  gallery_public: boolean;
  passcode_hash: string | null;
  storage_expires_at: string | null;
  theme_config: unknown;
};

export type GalleryAccess = "open" | "manager" | "closed" | "passcode" | "expired" | "unavailable";

export type GalleryPhoto = {
  id: string;
  uploader_name: string;
  caption: string | null;
  width: number;
  height: number;
  created_at: string;
  thumb_url: string;
  display_url: string;
};

export const PAGE_SIZE = 48;
const PASS_TTL_SECONDS = 30 * 24 * 60 * 60;

export const passCookieName = (eventId: string) => `mk_galeri_${eventId}`;

function sign(value: string) {
  const secret = process.env.GUEST_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("GUEST_SESSION_SECRET belum diisi (minimal 32 karakter).");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

// Hash passcode ikut ditandatangani, sehingga mengganti passcode membatalkan akses yang sudah diberikan.
export function passCookieValue(eventId: string, passcodeHash: string) {
  const exp = Math.floor(Date.now() / 1000) + PASS_TTL_SECONDS;
  return { value: `${exp}.${sign(`${eventId}.${exp}.${passcodeHash}`)}`, maxAge: PASS_TTL_SECONDS };
}

function validPassCookie(value: string | undefined, eventId: string, passcodeHash: string) {
  const [exp, signature] = value?.split(".") ?? [];
  if (!exp || !signature || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(`${eventId}.${exp}.${passcodeHash}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function loadGalleryEvent(slug: string): Promise<GalleryEvent | null> {
  const { data } = await createAdminClient()
    .from("events")
    .select("id, slug, title, timezone, package, gallery_public, passcode_hash, storage_expires_at, theme_config")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .in("status", ["active", "completed"])
    .maybeSingle();
  return data;
}

async function isManager(eventId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims || claims.claims.is_anonymous) return false;
  const { data } = await supabase.rpc("is_event_manager", { p_event_id: eventId });
  return data === true;
}

export async function galleryAccess(event: GalleryEvent): Promise<GalleryAccess> {
  if (event.package !== "complete" && event.package !== "luxury") return "unavailable";
  if (event.storage_expires_at && Date.parse(event.storage_expires_at) < Date.now()) return "expired";
  if (await isManager(event.id)) return "manager";
  if (!event.gallery_public) return "closed";
  if (event.passcode_hash && !validPassCookie((await cookies()).get(passCookieName(event.id))?.value, event.id, event.passcode_hash)) {
    return "passcode";
  }
  return "open";
}

// Foto yang tampil di galeri: approved, sudah lewat masa jeda, dan tidak terkunci kuota (PRD §3.4).
// before = halaman berikutnya (lebih lama); after = foto baru sejak pemuatan terakhir (polling).
export async function listGalleryPhotos(eventId: string, cursor: { before?: string; after?: string } = {}) {
  let query = createAdminClient()
    .from("photos")
    .select("id, uploader_name, caption, width, height, created_at, key_thumb, key_display")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .eq("over_quota", false)
    .lte("visible_after", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(cursor.after ? 200 : PAGE_SIZE + 1);
  if (cursor.before) query = query.lt("created_at", cursor.before);
  if (cursor.after) query = query.gt("created_at", cursor.after);

  const { data, error } = await query;
  if (error) throw error;
  const rows = cursor.after ? data : data.slice(0, PAGE_SIZE);
  const photos: GalleryPhoto[] = await Promise.all(
    rows.map(async ({ key_thumb, key_display, ...photo }) => ({
      ...photo,
      thumb_url: await presignGet(key_thumb),
      display_url: await presignGet(key_display),
    })),
  );
  return { photos, hasMore: !cursor.after && data.length > PAGE_SIZE };
}

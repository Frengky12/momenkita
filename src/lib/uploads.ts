import "server-only";
import { after, NextResponse } from "next/server";
import type { GuestToken } from "@/lib/guest-token";
import { reportError } from "@/lib/report-error";
import { createAdminClient } from "@/lib/supabase/admin";

export { CONSENT_VERSION } from "@/lib/camera/consent";

// PRD §5.3: maksimal 1 foto per 3 detik dan 300 foto per sesi.
export const UPLOAD_LIMITS = { minIntervalMs: 3000, perSession: 300 };

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/png": "png",
  "image/webp": "webp",
} as const;

// WebP diutamakan; JPEG untuk browser yang tidak bisa meng-encode WebP lewat canvas (Safari).
export const DISPLAY_TYPES = ["image/webp", "image/jpeg"] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];

export const VARIANTS = {
  display: { maxBytes: 409_600, contentTypes: DISPLAY_TYPES },
  thumb: { maxBytes: 153_600, contentTypes: DISPLAY_TYPES },
  original: { maxBytes: 10 * 1024 * 1024, contentTypes: Object.keys(EXTENSIONS) },
} as const;

export type Variant = keyof typeof VARIANTS;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isVariant(value: unknown): value is Variant {
  return typeof value === "string" && value in VARIANTS;
}

export function isAllowedFile(variant: Variant, contentType: string, size: number) {
  const rule = VARIANTS[variant];
  return (rule.contentTypes as readonly string[]).includes(contentType) && Number.isInteger(size) && size > 0 && size <= rule.maxBytes;
}

// Sesi tamu ada di path agar tamu lain tidak bisa mengklaim foto yang belum dikonfirmasi.
// Awalan events/<eventId>/ wajib: dicek constraint tabel photos dan dipakai server untuk memeriksa hak akses.
export function photoKey(eventId: string, sessionId: string, photoId: string, variant: Variant, contentType: string) {
  const base = `events/${eventId}/${sessionId}/${photoId}`;
  return `${base}/${variant}.${EXTENSIONS[contentType as keyof typeof EXTENSIONS]}`;
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Penolakan server dicatat untuk "error rate upload" di monitor Super Admin (PRD §5.7).
// Jeda 3 detik (too_fast) bukan kegagalan; penulisan berjalan setelah respons terkirim agar tamu tidak menunggu.
export async function recordUploadRejection(response: Response, eventId: string, stage: "presign" | "confirm") {
  if (response.status < 400) return;
  const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
  const code = body?.error ?? String(response.status);
  if (code === "too_fast") return;
  after(async () => {
    const { error } = await createAdminClient().from("upload_errors").insert({ event_id: eventId, stage, code });
    if (error) reportError(`upload_errors gagal dicatat: ${error.message}`, undefined, { eventId, stage });
  });
}

// Sesi harus milik event di token, tidak diblokir, dan event masih menerima foto (aktif, paket Complete/Luxury).
export async function loadGuestContext(admin: AdminClient, token: GuestToken) {
  // Dua query independen dijalankan bersamaan: jalur upload tamu sensitif terhadap latensi (PRD §8).
  const [{ data: session }, { data: event }] = await Promise.all([
    admin.from("guest_sessions").select("id, event_id, is_blocked").eq("id", token.sid).eq("event_id", token.eid).maybeSingle(),
    admin.from("events").select("id, status, package").eq("id", token.eid).maybeSingle(),
  ]);
  if (!session) return { ok: false, error: jsonError("session_not_found", 401) } as const;
  if (session.is_blocked) return { ok: false, error: jsonError("session_blocked", 403) } as const;

  if (!event || event.status !== "active" || (event.package !== "complete" && event.package !== "luxury")) {
    return { ok: false, error: jsonError("event_closed", 409) } as const;
  }
  return { ok: true, session, event } as const;
}

import { NextResponse } from "next/server";
import { guestTokenFromRequest, verifyGuestToken } from "@/lib/guest-token";
import { presignPut } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  UPLOAD_LIMITS,
  UUID_PATTERN,
  isAllowedFile,
  isVariant,
  jsonError,
  loadGuestContext,
  photoKey,
  type Variant,
} from "@/lib/uploads";

type FileRequest = { variant: Variant; contentType: string; size: number };

const EXPIRES_IN_SECONDS = 300;

// Tanpa photoId: foto baru (display + thumb wajib, original opsional untuk Luxury).
// Dengan photoId: minta ulang URL original untuk foto yang sudah dikonfirmasi, misalnya setelah URL lama kedaluwarsa saat offline.
export async function POST(request: Request) {
  const token = verifyGuestToken(guestTokenFromRequest(request));
  if (!token) return jsonError("unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { photoId?: unknown; files?: unknown } | null;
  const files = parseFiles(body?.files);
  if (!files) return jsonError("invalid_files", 400);

  const admin = createAdminClient();
  const context = await loadGuestContext(admin, token);
  if ("error" in context) return context.error;

  const variants = files.map((file) => file.variant);
  if (variants.includes("original") && context.event.package !== "luxury") return jsonError("original_not_allowed", 400);

  let photoId: string;
  if (body?.photoId !== undefined) {
    if (typeof body.photoId !== "string" || !UUID_PATTERN.test(body.photoId)) return jsonError("invalid_photo_id", 400);
    if (variants.length !== 1 || variants[0] !== "original") return jsonError("invalid_files", 400);

    const { data: photo } = await admin
      .from("photos")
      .select("guest_session_id, key_original")
      .eq("id", body.photoId)
      .maybeSingle();
    if (!photo || photo.guest_session_id !== token.sid) return jsonError("photo_not_found", 404);
    if (photo.key_original) return jsonError("original_exists", 409);
    photoId = body.photoId;
  } else {
    if (!variants.includes("display") || !variants.includes("thumb")) return jsonError("invalid_files", 400);

    const since = new Date(Date.now() - UPLOAD_LIMITS.minIntervalMs).toISOString();
    const [recent, total] = await Promise.all([
      admin.from("photos").select("id", { count: "exact", head: true }).eq("guest_session_id", token.sid).gte("created_at", since),
      admin.from("photos").select("id", { count: "exact", head: true }).eq("guest_session_id", token.sid).neq("status", "deleted"),
    ]);
    if ((recent.count ?? 0) > 0) return jsonError("too_fast", 429);
    if ((total.count ?? 0) >= UPLOAD_LIMITS.perSession) return jsonError("session_limit", 429);
    photoId = crypto.randomUUID();
  }

  const uploads = await Promise.all(
    files.map(async (file) => {
      const key = photoKey(token.eid, token.sid, photoId, file.variant, file.contentType);
      return {
        variant: file.variant,
        key,
        url: await presignPut(key, file.contentType, file.size, EXPIRES_IN_SECONDS),
        // Browser wajib mengirim header ini persis; Content-Length diisi otomatis dari body.
        headers: { "Content-Type": file.contentType },
      };
    }),
  );

  return NextResponse.json({ photoId, uploads, expiresIn: EXPIRES_IN_SECONDS });
}

function parseFiles(value: unknown): FileRequest[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) return null;
  const files: FileRequest[] = [];
  for (const item of value) {
    const { variant, contentType, size } = (item ?? {}) as Record<string, unknown>;
    if (!isVariant(variant) || typeof contentType !== "string" || typeof size !== "number") return null;
    if (!isAllowedFile(variant, contentType, size)) return null;
    if (files.some((file) => file.variant === variant)) return null;
    files.push({ variant, contentType, size });
  }
  return files;
}

import { NextResponse } from "next/server";
import { guestTokenFromRequest, verifyGuestToken } from "@/lib/guest-token";
import { deleteObjects, headObject } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { DISPLAY_TYPES, UUID_PATTERN, VARIANTS, isAllowedFile, jsonError, loadGuestContext, photoKey, type DisplayType, type Variant } from "@/lib/uploads";

type PhotoRow = { id: string; guest_session_id: string; status: string; visible_after: string | null; over_quota: boolean; key_original: string | null };

const PHOTO_COLUMNS = "id, guest_session_id, status, visible_after, over_quota, key_original";

// Dipanggil setelah PUT ke R2 selesai. Idempoten: antrean offline boleh mengirim ulang photoId yang sama.
// Panggilan kedua dengan originalContentType melampirkan file asli (Luxury) yang diunggah belakangan.
export async function POST(request: Request) {
  const token = verifyGuestToken(guestTokenFromRequest(request));
  if (!token) return jsonError("unauthorized", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const photoId = body?.photoId;
  const width = body?.width;
  const height = body?.height;
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const originalContentType = body?.originalContentType;
  // Format display dan thumbnail sama karena dibuat encoder yang sama di browser.
  const format = (body?.format ?? "image/webp") as DisplayType;

  if (typeof photoId !== "string" || !UUID_PATTERN.test(photoId)) return jsonError("invalid_photo_id", 400);
  if (!isDimension(width) || !isDimension(height)) return jsonError("invalid_dimensions", 400);
  if (caption.length > 140) return jsonError("caption_too_long", 400);
  if (!DISPLAY_TYPES.includes(format)) return jsonError("invalid_format", 400);
  if (
    originalContentType !== undefined &&
    (typeof originalContentType !== "string" || !(VARIANTS.original.contentTypes as readonly string[]).includes(originalContentType))
  ) {
    return jsonError("invalid_original_type", 400);
  }

  const admin = createAdminClient();
  const [context, { data: existing }] = await Promise.all([
    loadGuestContext(admin, token),
    admin.from("photos").select(PHOTO_COLUMNS).eq("id", photoId).maybeSingle(),
  ]);
  if ("error" in context) return context.error;
  if (originalContentType && context.event.package !== "luxury") return jsonError("original_not_allowed", 400);

  const key = (variant: Variant, contentType: string = format) => photoKey(token.eid, token.sid, photoId, variant, contentType);
  const originalKey = typeof originalContentType === "string" ? key("original", originalContentType) : null;

  if (existing) {
    if (existing.guest_session_id !== token.sid) return jsonError("photo_not_found", 404);
    if (originalKey && !existing.key_original) {
      if (!(await verifyOriginal(originalKey))) return jsonError("original_invalid", 422);
      const { data: updated, error } = await admin
        .from("photos")
        .update({ key_original: originalKey })
        .eq("id", photoId)
        .select(PHOTO_COLUMNS)
        .single();
      if (error) return jsonError("confirm_failed", 500);
      return NextResponse.json({ photo: summary(updated) });
    }
    return NextResponse.json({ photo: summary(existing) });
  }

  const [display, thumb] = await Promise.all([headObject(key("display")), headObject(key("thumb"))]);
  if (!display || !thumb) return jsonError("upload_missing", 422);
  if (!isAllowedFile("display", display.contentType, display.size) || !isAllowedFile("thumb", thumb.contentType, thumb.size)) {
    await deleteObjects([key("display"), key("thumb")]);
    return jsonError("upload_invalid", 422);
  }

  const { data: photo, error } = await admin
    .from("photos")
    .insert({
      id: photoId,
      event_id: token.eid,
      guest_session_id: token.sid,
      key_display: key("display"),
      key_thumb: key("thumb"),
      key_original: originalKey && (await verifyOriginal(originalKey)) ? originalKey : null,
      width,
      height,
      bytes_display: display.size,
      caption: caption || null,
    })
    .select(PHOTO_COLUMNS)
    .single();

  if (error) {
    // Dua konfirmasi yang balapan: yang kalah cukup mengembalikan foto yang sudah tersimpan.
    if (error.code === "23505") {
      const { data: raced } = await admin.from("photos").select(PHOTO_COLUMNS).eq("id", photoId).single();
      if (raced) return NextResponse.json({ photo: summary(raced) });
    }
    // P0001 berasal dari trigger prepare_photo: event berhenti menerima foto atau sesi diblokir.
    if (error.code === "P0001") return jsonError("event_closed", 409);
    return jsonError("confirm_failed", 500);
  }

  return NextResponse.json({ photo: summary(photo) }, { status: 201 });
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20_000;
}

// File asli yang tidak lolos aturan dihapus agar tidak menumpuk di bucket.
async function verifyOriginal(originalKey: string) {
  const head = await headObject(originalKey);
  if (!head) return false;
  if (!isAllowedFile("original", head.contentType, head.size)) {
    await deleteObjects([originalKey]);
    return false;
  }
  return true;
}

function summary(photo: PhotoRow) {
  return {
    id: photo.id,
    status: photo.status,
    visibleAfter: photo.visible_after,
    overQuota: photo.over_quota,
    hasOriginal: Boolean(photo.key_original),
  };
}

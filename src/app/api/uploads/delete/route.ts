import { NextResponse } from "next/server";
import { guestTokenFromRequest, verifyGuestToken } from "@/lib/guest-token";
import { deleteObjects } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, jsonError } from "@/lib/uploads";

// Tamu menghapus fotonya sendiri (PRD §5.3, hak subjek data §9.1). Status "deleted" memicu broadcast
// sehingga layar panggung ikut menurunkan foto; file di R2 dihapus permanen.
export async function POST(request: Request) {
  const token = verifyGuestToken(guestTokenFromRequest(request));
  if (!token) return jsonError("unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { photoId?: unknown } | null;
  const photoId = body?.photoId;
  if (typeof photoId !== "string" || !UUID_PATTERN.test(photoId)) return jsonError("invalid_photo_id", 400);

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("photos")
    .select("id, guest_session_id, status, key_display, key_thumb, key_original")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo || photo.guest_session_id !== token.sid) return jsonError("photo_not_found", 404);
  if (photo.status === "deleted") return NextResponse.json({ ok: true });

  const { error } = await admin.from("photos").update({ status: "deleted", is_pinned: false }).eq("id", photo.id);
  if (error) return jsonError("delete_failed", 500);

  await deleteObjects([photo.key_display, photo.key_thumb, photo.key_original].filter((k): k is string => Boolean(k)));
  return NextResponse.json({ ok: true });
}

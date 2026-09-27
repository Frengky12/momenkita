import { NextResponse, type NextRequest } from "next/server";
import { presignGet } from "@/lib/r2";
import { createBearerClient } from "@/lib/supabase/bearer";
import { jsonError, UUID_PATTERN } from "@/lib/uploads";

// Foto untuk konsol moderasi dan layar panggung, dengan signed URL R2.
// Hak akses (peran, status foto yang boleh dilihat) diputuskan RPC staff_photos, bukan di sini.
// ?ids=a,b  foto tertentu (setelah broadcast)   ?variants=thumb,display   ?limit=200
// ?status=approved  hanya foto tayang: layar panggung yang dibuka host tidak boleh ikut menampilkan foto pending.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/staff/events/[eventId]/photos">) {
  const { eventId } = await params;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return jsonError("unauthorized", 401);
  if (!UUID_PATTERN.test(eventId)) return jsonError("not_found", 404);

  const search = request.nextUrl.searchParams;
  const ids = search.get("ids")?.split(",").filter((id) => UUID_PATTERN.test(id)).slice(0, 100);
  const variants = new Set((search.get("variants") ?? "thumb,display").split(","));
  const limit = Math.min(Math.max(Number(search.get("limit")) || 500, 1), 1000);
  const onlyApproved = search.get("status") === "approved";

  const { data, error, status } = await createBearerClient(token).rpc("staff_photos", {
    p_event_id: eventId,
    p_limit: onlyApproved ? 1000 : limit,
    p_ids: ids,
  });
  if (error) {
    const known = status === 401 || status === 403;
    return jsonError(known ? (status === 401 ? "unauthorized" : "forbidden") : "failed", known ? status : 500);
  }

  const rows = onlyApproved ? data.filter((p) => p.status === "approved").slice(0, limit) : data;
  const photos = await Promise.all(
    rows.map(async ({ key_display, key_thumb, ...photo }) => ({
      ...photo,
      thumb_url: variants.has("thumb") ? await presignGet(key_thumb) : null,
      display_url: variants.has("display") ? await presignGet(key_display) : null,
    })),
  );
  // serverTime: klien menghitung selisih jam untuk mode jeda (visible_after memakai jam database).
  return NextResponse.json({ serverTime: Date.now(), photos }, { headers: { "Cache-Control": "no-store" } });
}

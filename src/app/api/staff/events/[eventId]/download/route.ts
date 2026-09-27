import { NextResponse, type NextRequest } from "next/server";
import { presignGet } from "@/lib/r2";
import { createBearerClient } from "@/lib/supabase/bearer";
import { jsonError, UUID_PATTERN } from "@/lib/uploads";

// Manifest unduhan ZIP untuk host dan fotografer. Hak akses dan aturan kuota/paket diputuskan RPC staff_download_manifest.
// ZIP-nya sendiri dibuat di browser (PRD §5.5), jadi server hanya menandatangani URL (6 jam, PRD §6.3).
export async function GET(request: NextRequest, { params }: RouteContext<"/api/staff/events/[eventId]/download">) {
  const { eventId } = await params;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return jsonError("unauthorized", 401);
  if (!UUID_PATTERN.test(eventId)) return jsonError("not_found", 404);

  const search = request.nextUrl.searchParams;
  const variant = search.get("variant") === "original" ? "original" : "display";
  const offset = Math.max(Number(search.get("offset")) || 0, 0);
  const limit = Math.min(Math.max(Number(search.get("limit")) || 200, 1), 500);

  const { data, error, status } = await createBearerClient(token).rpc("staff_download_manifest", {
    p_event_id: eventId,
    p_variant: variant,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) {
    if (status === 401 || status === 403) return jsonError(status === 401 ? "unauthorized" : "forbidden", status);
    return jsonError(error.message.includes("Luxury") ? "original_luxury_only" : "failed", error.message.includes("Luxury") ? 400 : 500);
  }

  const files = await Promise.all(
    data.map(async ({ key, ...photo }) => ({ ...photo, ext: key.split(".").pop() ?? "jpg", url: await presignGet(key, 6) })),
  );
  return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } });
}

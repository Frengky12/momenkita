import { NextResponse } from "next/server";
import { loadGalleryEvent, passCookieName, passCookieValue } from "@/lib/gallery";
import { allowAction, clientKey } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/uploads";

// Passcode galeri: dicek di database (bcrypt), lalu akses disimpan di cookie HttpOnly bertanda tangan.
export async function POST(request: Request, { params }: RouteContext<"/api/events/[slug]/gallery/unlock">) {
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode.trim() : "";
  if (!passcode || passcode.length > 32) return jsonError("invalid", 400);

  const event = await loadGalleryEvent(slug);
  if (!event || !event.gallery_public || !event.passcode_hash) return jsonError("not_found", 404);
  // 10 percobaan per 15 menit per perangkat, agar passcode pendek tidak bisa ditebak beruntun.
  if (!(await allowAction(`galeri:${event.id}:${await clientKey()}`, 10, 900))) return jsonError("too_many", 429);

  const { data: ok } = await createAdminClient().rpc("check_gallery_passcode", { p_event_id: event.id, p_passcode: passcode });
  if (!ok) return jsonError("wrong_passcode", 401);

  const cookie = passCookieValue(event.id, event.passcode_hash);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(passCookieName(event.id), cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cookie.maxAge,
  });
  return response;
}

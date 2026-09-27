import { NextResponse } from "next/server";
import { galleryAccess, loadGalleryEvent } from "@/lib/gallery";
import { allowAction, clientKey } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, UUID_PATTERN } from "@/lib/uploads";

const REASONS = ["inappropriate", "privacy", "other"] as const;

// Tombol "Laporkan" di galeri (PRD §9.4). Laporan muncul di tab Galeri dashboard host.
export async function POST(request: Request, { params }: RouteContext<"/api/events/[slug]/gallery/report">) {
  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as { photoId?: unknown; reason?: unknown } | null;
  const photoId = typeof body?.photoId === "string" && UUID_PATTERN.test(body.photoId) ? body.photoId : null;
  const reason = REASONS.find((r) => r === body?.reason);
  if (!photoId || !reason) return jsonError("invalid", 400);

  const event = await loadGalleryEvent(slug);
  if (!event) return jsonError("not_found", 404);
  const access = await galleryAccess(event);
  if (access !== "open" && access !== "manager") return jsonError(access, 403);

  const reporter = await clientKey();
  if (!(await allowAction(`lapor:${reporter}`, 20, 3600))) return jsonError("too_many", 429);

  const admin = createAdminClient();
  const { data: photo } = await admin.from("photos").select("id").eq("id", photoId).eq("event_id", event.id).eq("status", "approved").maybeSingle();
  if (!photo) return jsonError("not_found", 404);

  const { error } = await admin.from("photo_reports").insert({ event_id: event.id, photo_id: photo.id, reason, reporter_key: reporter });
  // Laporan ganda dari perangkat yang sama cukup dianggap sudah terkirim.
  if (error && error.code !== "23505") return jsonError("failed", 500);
  return NextResponse.json({ ok: true });
}

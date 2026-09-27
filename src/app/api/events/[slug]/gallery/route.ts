import { NextResponse, type NextRequest } from "next/server";
import { galleryAccess, listGalleryPhotos, loadGalleryEvent } from "@/lib/gallery";
import { jsonError } from "@/lib/uploads";

const isIso = (value: string | null): value is string => !!value && !Number.isNaN(Date.parse(value));

// Galeri tamu memakai polling, bukan Realtime (PRD §6.3): ?before= untuk halaman berikutnya, ?after= untuk foto baru.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/events/[slug]/gallery">) {
  const { slug } = await params;
  const event = await loadGalleryEvent(slug);
  if (!event) return jsonError("not_found", 404);

  const access = await galleryAccess(event);
  if (access !== "open" && access !== "manager") return jsonError(access, 403);

  const before = request.nextUrl.searchParams.get("before");
  const after = request.nextUrl.searchParams.get("after");
  const result = await listGalleryPhotos(event.id, { before: isIso(before) ? before : undefined, after: isIso(after) ? after : undefined });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { createGuestToken } from "@/lib/guest-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCEPTED_CONSENT_VERSIONS, jsonError } from "@/lib/uploads";

// Membuka sesi kamera tamu. Dari undangan personal, invitationSlug mengikat sesi ke data tamu (tanpa isi nama).
export async function POST(request: Request, ctx: RouteContext<"/api/events/[slug]/guest-sessions">) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    displayName?: unknown;
    invitationSlug?: unknown;
    consentVersion?: unknown;
  } | null;

  if (!body || typeof body.consentVersion !== "string" || !ACCEPTED_CONSENT_VERSIONS.includes(body.consentVersion)) {
    return jsonError("consent_required", 400);
  }
  const consentVersion = body.consentVersion;

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, title, package, status, moderation_mode, published_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!event || !event.published_at) return jsonError("event_not_found", 404);
  if (event.status !== "active" || (event.package !== "complete" && event.package !== "luxury")) {
    return jsonError("event_closed", 409);
  }

  let displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  let invitationId: string | null = null;

  if (typeof body.invitationSlug === "string" && body.invitationSlug) {
    const { data: invitation } = await admin
      .from("invitations")
      .select("id, guest_name")
      .eq("event_id", event.id)
      .eq("personal_slug", body.invitationSlug)
      .maybeSingle();
    if (!invitation) return jsonError("invitation_not_found", 404);
    invitationId = invitation.id;
    displayName ||= invitation.guest_name.slice(0, 60);
  }

  if (displayName.length < 1 || displayName.length > 60) return jsonError("display_name_invalid", 400);

  const { data: session, error } = await admin
    .from("guest_sessions")
    .insert({ event_id: event.id, invitation_id: invitationId, display_name: displayName, consent_version: consentVersion })
    .select("id")
    .single();
  if (error) return jsonError("session_create_failed", 500);

  return NextResponse.json(
    {
      token: createGuestToken(session.id, event.id),
      sessionId: session.id,
      displayName,
      event: { id: event.id, title: event.title, package: event.package, moderationMode: event.moderation_mode },
    },
    { status: 201 },
  );
}

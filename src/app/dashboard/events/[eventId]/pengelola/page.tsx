import { notFound } from "next/navigation";
import { requestOrigin } from "@/lib/invitation/origin";
import { createClient } from "@/lib/supabase/server";
import { CohostManager, type CohostRow, type InviteRow } from "./cohost-manager";

// Undangan yang belum dipakai, belum dicabut, dan belum kedaluwarsa; yang lain tidak perlu ditindaklanjuti host.
const isPending = (invite: { accepted_at: string | null; revoked_at: string | null; expires_at: string }) =>
  !invite.accepted_at && !invite.revoked_at && Date.parse(invite.expires_at) > Date.now();

export default async function ManagersPage({ params }: PageProps<"/dashboard/events/[eventId]/pengelola">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: claims }, { data: event }, { data: cohosts, error: cohostError }, { data: invites }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("events").select("id, title, timezone, owner_id, owner:profiles!events_owner_id_fkey(email, full_name)").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_cohosts")
      .select("profile_id, created_at, profile:profiles!event_cohosts_profile_id_fkey(email, full_name)")
      .eq("event_id", eventId)
      .order("created_at"),
    supabase
      .from("cohost_invites")
      .select("id, label, expires_at, accepted_at, revoked_at")
      .eq("event_id", eventId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (!event) notFound();

  const userId = claims?.claims.sub ?? "";
  const rows: CohostRow[] = (cohosts ?? []).map((c) => ({
    profileId: c.profile_id,
    email: c.profile?.email ?? "",
    name: c.profile?.full_name ?? null,
    since: c.created_at,
  }));
  const pending: InviteRow[] = (invites ?? []).filter(isPending).map((i) => ({ id: i.id, label: i.label, expiresAt: i.expires_at }));

  return (
    <CohostManager
      eventId={event.id}
      eventTitle={event.title}
      timezone={event.timezone}
      origin={await requestOrigin()}
      userId={userId}
      owner={{ isYou: event.owner_id === userId, email: event.owner?.email ?? "", name: event.owner?.full_name ?? null }}
      cohosts={rows}
      loadError={Boolean(cohostError)}
      invites={pending}
    />
  );
}

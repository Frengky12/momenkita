import "server-only";
import { parseContent, parseGifts, type GiftContent, type InvitationContent } from "@/lib/invitation/content";
import type { SessionLike } from "@/lib/invitation/links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InvitationGuest = {
  name: string;
  personalSlug: string;
  paxAllowed: number;
  rsvpStatus: string;
  rsvpPax: number | null;
  // Token QR tiket check-in; hanya ada di undangan personal (PRD §5.2).
  qrToken: string;
  tableNumber: string | null;
};

export type Wish = { id: string; author_name: string; message: string; created_at: string };

export type InvitationData = {
  event: { id: string; slug: string; title: string; timezone: string; package: string | null; content: InvitationContent; gifts: GiftContent };
  sessions: SessionLike[];
  guest: InvitationGuest | null;
  wishes: Wish[];
  rsvpOpen: boolean;
};

type Client = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

const EVENT_COLUMNS = "id, slug, title, timezone, package, theme_config, gift_config";
const SESSION_COLUMNS = "id, name, starts_at, ends_at, venue_name, venue_address";

// Batas RSVP berlaku sampai akhir hari itu di zona waktu event.
function isRsvpOpen(deadline: string | null, timezone: string) {
  if (!deadline) return true;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  return today <= deadline;
}

async function assemble(
  client: Client,
  event: { id: string; slug: string; title: string; timezone: string; package: string | null; theme_config: unknown; gift_config: unknown },
  personalSlug?: string,
) {
  const [{ data: sessions }, { data: wishes }, guestResult] = await Promise.all([
    client.from("event_sessions").select(SESSION_COLUMNS).eq("event_id", event.id).order("starts_at"),
    client.from("wishes").select("id, author_name, message, created_at").eq("event_id", event.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(30),
    personalSlug
      ? client
          .from("invitations")
          .select("guest_name, personal_slug, pax_allowed, rsvp_status, rsvp_pax, session_ids, qr_token, table_number")
          .eq("event_id", event.id)
          .eq("personal_slug", personalSlug)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const invitation = guestResult.data;
  if (personalSlug && !invitation) return null;

  const content = parseContent(event.theme_config);
  // Undangan personal hanya menampilkan sesi yang tamu itu diundang; session_ids kosong berarti semua sesi.
  const visibleSessions = (sessions ?? []).filter((s) => !invitation?.session_ids.length || invitation.session_ids.includes(s.id));

  return {
    event: { id: event.id, slug: event.slug, title: event.title, timezone: event.timezone, package: event.package, content, gifts: parseGifts(event.gift_config) },
    sessions: visibleSessions,
    guest: invitation
      ? {
          name: invitation.guest_name,
          personalSlug: invitation.personal_slug,
          paxAllowed: invitation.pax_allowed,
          rsvpStatus: invitation.rsvp_status,
          rsvpPax: invitation.rsvp_pax,
          qrToken: invitation.qr_token,
          tableNumber: invitation.table_number,
        }
      : null,
    wishes: wishes ?? [],
    rsvpOpen: isRsvpOpen(content.rsvpDeadline, event.timezone),
  } satisfies InvitationData;
}

// Tamu tidak punya akses tabel, jadi halaman publik memakai admin client dan hanya event yang sudah dipublikasikan.
export async function loadPublicInvitation(slug: string, personalSlug?: string): Promise<InvitationData | null> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .not("published_at", "is", null)
    .in("status", ["active", "completed"])
    .maybeSingle();
  if (!event) return null;
  return assemble(admin, event, personalSlug);
}

// Pratinjau host: lewat RLS, boleh draf.
export async function loadPreviewInvitation(eventId: string): Promise<InvitationData | null> {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (!event) return null;
  return assemble(supabase, event);
}

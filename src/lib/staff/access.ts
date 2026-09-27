import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createHostClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getStaffClient } from "@/lib/supabase/staff";
import type { StaffRole } from "./roles";

// Akses halaman staf dari browser: host yang login memakai sesi cookie-nya (tanpa PIN),
// perangkat staf memakai sesi anonim hasil Link Staf + PIN. Hak akses tetap diperiksa RPC di database.

export type ModerationMode = "curated" | "delayed" | "instant";

export type StaffEvent = {
  id: string;
  slug: string;
  title: string;
  timezone: string;
  package: string | null;
  moderation_mode: ModerationMode;
  stage_blackout: boolean;
  theme_config: Json;
  is_manager: boolean;
  staff_roles: StaffRole[];
  sessions: { id: string; name: string; starts_at: string; ends_at: string }[];
};

export type StaffClient = SupabaseClient<Database>;
export type StaffAccess = { client: StaffClient; event: StaffEvent };
export type AccessResult = { status: "ok"; access: StaffAccess } | { status: "denied" } | { status: "error" };

async function eventFor(client: StaffClient, eventId: string, role: StaffRole): Promise<StaffEvent | null | "error"> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return null;
  const { data, error, status } = await client.rpc("staff_event", { p_event_id: eventId });
  if (error) return status === 401 || status === 403 ? null : "error";
  const event = data as unknown as StaffEvent;
  return event.is_manager || event.staff_roles.includes(role) ? event : null;
}

export async function resolveStaffAccess(eventId: string, role: StaffRole): Promise<AccessResult> {
  try {
    const host = createHostClient();
    const hostEvent = await eventFor(host, eventId, role);
    if (hostEvent && hostEvent !== "error") return { status: "ok", access: { client: host, event: hostEvent } };

    const staff = getStaffClient();
    const staffEvent = await eventFor(staff, eventId, role);
    if (staffEvent && staffEvent !== "error") return { status: "ok", access: { client: staff, event: staffEvent } };

    return { status: hostEvent === "error" || staffEvent === "error" ? "error" : "denied" };
  } catch {
    return { status: "error" };
  }
}

export type StaffPhoto = {
  id: string;
  guest_session_id: string;
  uploader_name: string;
  caption: string | null;
  width: number;
  height: number;
  status: "pending" | "approved" | "rejected" | "deleted";
  visible_after: string | null;
  is_pinned: boolean;
  over_quota: boolean;
  created_at: string;
  thumb_url: string | null;
  display_url: string | null;
};

// Payload broadcast trigger broadcast_photo(); tanpa URL, jadi foto baru diambil lewat fetchStaffPhotos({ ids }).
export type PhotoBroadcast = Omit<StaffPhoto, "guest_session_id" | "thumb_url" | "display_url">;

export async function fetchStaffPhotos(
  client: StaffClient,
  eventId: string,
  options: { ids?: string[]; variants?: "thumb" | "display" | "thumb,display"; limit?: number; status?: "approved" } = {},
) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("no_session");
  const query = new URLSearchParams();
  if (options.ids) query.set("ids", options.ids.join(","));
  if (options.variants) query.set("variants", options.variants);
  if (options.limit) query.set("limit", String(options.limit));
  if (options.status) query.set("status", options.status);
  const res = await fetch(`/api/staff/events/${eventId}/photos?${query}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { serverTime: number; photos: StaffPhoto[] };
}

type Handlers = {
  photo?: (payload: PhotoBroadcast) => void;
  invitation?: (payload: Record<string, unknown>) => void;
  stage?: (payload: { stage_blackout: boolean; moderation_mode: ModerationMode }) => void;
};

// Channel privat event:<id>. onLive(true) dipanggil setiap kali tersambung, termasuk setelah putus;
// pemanggil memakainya untuk sinkron ulang data yang terlewat selama offline.
export function subscribeEvent(client: StaffClient, eventId: string, handlers: Handlers, onLive: (live: boolean) => void) {
  let channel: ReturnType<StaffClient["channel"]> | undefined;
  let stopped = false;

  (async () => {
    await client.realtime.setAuth();
    if (stopped) return;
    channel = client.channel(`event:${eventId}`, { config: { private: true } });
    if (handlers.photo) channel.on("broadcast", { event: "photo" }, ({ payload }) => handlers.photo!(payload as PhotoBroadcast));
    if (handlers.invitation) channel.on("broadcast", { event: "invitation" }, ({ payload }) => handlers.invitation!(payload));
    if (handlers.stage) channel.on("broadcast", { event: "stage" }, ({ payload }) => handlers.stage!(payload as Parameters<NonNullable<Handlers["stage"]>>[0]));
    channel.subscribe((status) => onLive(status === "SUBSCRIBED"));
  })();

  return () => {
    stopped = true;
    if (channel) client.removeChannel(channel);
  };
}

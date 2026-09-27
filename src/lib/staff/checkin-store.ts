import type { StaffClient } from "./access";

// Daftar tamu dan antrean check-in disimpan di perangkat penerima tamu (PRD §5.2, toleran offline):
// scan tetap cepat tanpa jaringan, dan check-in offline dikirim begitu sinyal kembali.

export type Guest = {
  id: string;
  guest_name: string;
  category: string;
  table_number: string | null;
  pax_allowed: number;
  session_ids: string[];
  rsvp_status: string;
  rsvp_pax: number | null;
  qr_token: string;
  checked_in_at: string | null;
  checked_in_pax: number | null;
  checked_in_by: string | null;
};

// id walk-in dibuat perangkat, jadi pengiriman ulang tidak membuat tamu ganda.
export type PendingAction =
  | { kind: "checkin"; id: string; name: string; pax: number; at: string }
  | { kind: "walkin"; id: string; name: string; pax: number; at: string };

export type CheckinCard = Pick<Guest, "id" | "guest_name" | "category" | "table_number" | "pax_allowed" | "rsvp_status" | "rsvp_pax" | "checked_in_at" | "checked_in_pax" | "checked_in_by">;

const guestsKey = (eventId: string) => `momenkita-guests:${eventId}`;
const queueKey = (eventId: string) => `momenkita-checkins:${eventId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan penuh atau diblokir: data tetap ada di memori selama halaman terbuka.
  }
}

export const loadGuests = (eventId: string) => read<Guest[]>(guestsKey(eventId), []);
export const saveGuests = (eventId: string, guests: Guest[]) => write(guestsKey(eventId), guests);
export const loadQueue = (eventId: string) => read<PendingAction[]>(queueKey(eventId), []);
export const saveQueue = (eventId: string, queue: PendingAction[]) => write(queueKey(eventId), queue);

// Check-in lokal yang belum terkirim tetap terlihat walau daftar baru saja dimuat ulang dari server.
export function applyQueue(guests: Guest[], queue: PendingAction[]): Guest[] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  for (const action of queue) {
    const guest = byId.get(action.id);
    if (action.kind === "checkin" && guest && !guest.checked_in_at) {
      byId.set(guest.id, { ...guest, checked_in_at: action.at, checked_in_pax: action.pax, checked_in_by: null });
    }
    if (action.kind === "walkin" && !guest) {
      byId.set(action.id, {
        id: action.id,
        guest_name: action.name,
        category: "regular",
        table_number: null,
        pax_allowed: action.pax,
        session_ids: [],
        rsvp_status: "pending",
        rsvp_pax: null,
        qr_token: "",
        checked_in_at: action.at,
        checked_in_pax: action.pax,
        checked_in_by: null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.guest_name.localeCompare(b.guest_name, "id"));
}

export function mergeGuest(guests: Guest[], card: Partial<Guest> & { id: string }): Guest[] {
  const index = guests.findIndex((g) => g.id === card.id);
  if (index < 0) {
    const added: Guest = {
      guest_name: "",
      category: "regular",
      table_number: null,
      pax_allowed: 1,
      session_ids: [],
      rsvp_status: "pending",
      rsvp_pax: null,
      qr_token: "",
      checked_in_at: null,
      checked_in_pax: null,
      checked_in_by: null,
      ...card,
    };
    return [...guests, added].sort((a, b) => a.guest_name.localeCompare(b.guest_name, "id"));
  }
  const next = [...guests];
  next[index] = { ...guests[index], ...card };
  return next;
}

export function normalizeName(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export type FlushOutcome =
  | { action: PendingAction; status: "done"; card: CheckinCard; already: boolean }
  | { action: PendingAction; status: "dropped"; reason: "not_found" | "invalid" };

// Mengirim antrean berurutan. Berhenti saat jaringan gagal atau akses ditolak (dicoba lagi nanti);
// item yang ditolak karena datanya tidak valid dibuang agar antrean tidak macet.
export async function flushQueue(client: StaffClient, eventId: string, queue: PendingAction[], onOutcome: (outcome: FlushOutcome) => void) {
  const remaining = [...queue];
  let blocked: "offline" | "forbidden" | null = null;
  while (remaining.length) {
    const action = remaining[0];
    let response;
    try {
      response =
        action.kind === "checkin"
          ? await client.rpc("staff_check_in", { p_event_id: eventId, p_invitation_id: action.id, p_pax: action.pax, p_checked_in_at: action.at })
          : await client.rpc("staff_add_walk_in", { p_event_id: eventId, p_guest_name: action.name, p_pax: action.pax, p_id: action.id });
    } catch {
      blocked = "offline";
      break;
    }
    const { data, error, status } = response;
    if (error) {
      if (status === 401 || status === 403) blocked = "forbidden";
      else if (status === 0 || status >= 500) blocked = "offline";
      if (blocked) break;
      remaining.shift();
      onOutcome({ action, status: "dropped", reason: "invalid" });
      continue;
    }
    remaining.shift();
    const result = data as { ok: boolean; already?: boolean; invitation?: CheckinCard };
    onOutcome(
      result.ok && result.invitation
        ? { action, status: "done", card: result.invitation, already: Boolean(result.already) }
        : { action, status: "dropped", reason: "not_found" },
    );
  }
  return { remaining, blocked };
}

"use server";

import { refresh } from "next/cache";
import { parseContent } from "@/lib/invitation/content";
import { allowAction, clientKey } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export type RsvpState =
  | { status: "idle" }
  | { status: "saved"; rsvpStatus: string; pax: number | null; at: number }
  | { status: "error"; message: string; at: number };

// Link umum bisa dibuka siapa saja, jadi jumlah orang per RSVP dibatasi lebih ketat daripada undangan personal.
const GENERAL_MAX_PAX = 5;
const STATUSES = ["attending", "declined", "maybe"] as const;

// Longgar karena operator seluler memakai CGNAT: banyak tamu bisa berbagi satu IP.
const LIMITS = {
  generalPerIp: { limit: 10, windowSeconds: 600 },
  generalPerEvent: { limit: 200, windowSeconds: 3600 },
  personalPerInvitation: { limit: 10, windowSeconds: 600 },
};
const TOO_MANY = "Terlalu banyak konfirmasi dalam waktu singkat. Coba lagi beberapa menit lagi.";

const failed = (message: string): RsvpState => ({ status: "error", message, at: Date.now() });

async function publishedEvent(slug: string) {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, timezone, theme_config")
    .eq("slug", slug)
    .eq("status", "active")
    .not("published_at", "is", null)
    .maybeSingle();
  return { admin, event };
}

export async function submitRsvp(slug: string, personalSlug: string | null, _prev: RsvpState, formData: FormData): Promise<RsvpState> {
  const status = String(formData.get("status") ?? "");
  const paxInput = Number(formData.get("pax"));
  const message = String(formData.get("message") ?? "").trim();

  // Honeypot: kolom tersembunyi yang hanya diisi bot. Balas seolah berhasil agar bot tidak mencoba ulang.
  if (String(formData.get("website") ?? "")) return { status: "saved", rsvpStatus: status, pax: null, at: Date.now() };

  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return failed("Pilih salah satu jawaban kehadiran.");
  if (message.length > 1000) return failed("Ucapan maksimal 1000 karakter.");

  const { admin, event } = await publishedEvent(slug);
  if (!event) return failed("Undangan ini tidak menerima konfirmasi kehadiran.");

  const deadline = parseContent(event.theme_config).rsvpDeadline;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone }).format(new Date());
  if (deadline && today > deadline) return failed("Konfirmasi kehadiran sudah ditutup.");

  const paxFor = (max: number) => {
    if (status === "declined") return 0;
    if (status === "maybe") return null;
    return Number.isInteger(paxInput) && paxInput >= 1 && paxInput <= max ? paxInput : undefined;
  };

  let authorName: string;
  let invitationId: string;
  let pax: number | null | undefined;
  const now = new Date().toISOString();

  if (personalSlug) {
    const { data: invitation } = await admin
      .from("invitations")
      .select("id, guest_name, pax_allowed")
      .eq("event_id", event.id)
      .eq("personal_slug", personalSlug)
      .maybeSingle();
    if (!invitation) return failed("Undangan tidak ditemukan.");
    const { limit, windowSeconds } = LIMITS.personalPerInvitation;
    if (!(await allowAction(`rsvp:inv:${invitation.id}`, limit, windowSeconds))) return failed(TOO_MANY);
    pax = paxFor(invitation.pax_allowed);
    if (pax === undefined) return failed(`Jumlah orang harus 1 sampai ${invitation.pax_allowed}.`);

    const { error } = await admin.from("invitations").update({ rsvp_status: status, rsvp_pax: pax, rsvp_at: now }).eq("id", invitation.id);
    if (error) return failed("Konfirmasi gagal disimpan. Coba lagi.");
    authorName = invitation.guest_name;
    invitationId = invitation.id;
  } else {
    const name = String(formData.get("name") ?? "").trim();
    if (!name || name.length > 120) return failed("Isi nama kamu (maksimal 120 karakter).");
    pax = paxFor(GENERAL_MAX_PAX);
    if (pax === undefined) return failed(`Jumlah orang harus 1 sampai ${GENERAL_MAX_PAX}.`);

    const perIp = LIMITS.generalPerIp;
    const perEvent = LIMITS.generalPerEvent;
    if (!(await allowAction(`rsvp:ip:${event.id}:${await clientKey()}`, perIp.limit, perIp.windowSeconds))) return failed(TOO_MANY);
    if (!(await allowAction(`rsvp:event:${event.id}`, perEvent.limit, perEvent.windowSeconds))) return failed(TOO_MANY);

    const { data: created, error } = await admin
      .from("invitations")
      .insert({
        event_id: event.id,
        guest_name: name,
        source: "public_rsvp",
        pax_allowed: Math.max(pax ?? 1, 1),
        rsvp_status: status,
        rsvp_pax: pax,
        rsvp_at: now,
      })
      .select("id")
      .single();
    if (error) return failed("Konfirmasi gagal disimpan. Coba lagi.");
    authorName = name;
    invitationId = created.id;
  }

  if (message) {
    await admin.from("wishes").insert({ event_id: event.id, invitation_id: invitationId, author_name: authorName.slice(0, 120), message });
  }

  refresh();
  return { status: "saved", rsvpStatus: status, pax, at: Date.now() };
}

// Dipanggil sekali dari undangan personal; opened_at tidak ditimpa agar mencatat kunjungan pertama.
export async function markOpened(slug: string, personalSlug: string) {
  const { admin, event } = await publishedEvent(slug);
  if (!event) return;
  await admin
    .from("invitations")
    .update({ opened_at: new Date().toISOString() })
    .eq("event_id", event.id)
    .eq("personal_slug", personalSlug)
    .is("opened_at", null);
}

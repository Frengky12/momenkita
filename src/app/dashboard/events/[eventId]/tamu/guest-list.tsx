"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { SectionForm } from "@/components/dashboard/section-form";
import { Input } from "@/components/ui/input";
import { CATEGORY_LABELS, RSVP_LABELS, type SessionRef } from "@/lib/guests";
import { whatsappMessage, whatsappUrl } from "@/lib/whatsapp";
import { deleteGuest, markSent } from "./actions";
import { GuestForm, type GuestRow } from "./guest-form";

export function GuestList({
  eventId,
  guests,
  sessions,
  inviteBaseUrl,
  whatsapp,
}: {
  eventId: string;
  guests: GuestRow[];
  sessions: SessionRef[];
  inviteBaseUrl: string;
  // null selama undangan belum dipublikasikan: link yang dikirim akan berakhir 404.
  whatsapp: { template: string; couple: string } | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => g.guest_name.toLowerCase().includes(q) || (g.table_number ?? "").toLowerCase().includes(q));
  }, [guests, query]);

  if (guests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-5 py-10 text-center">
        <p className="font-medium">Belum ada tamu</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tambahkan satu per satu, atau impor sekaligus dari file Excel memakai template di atas.
        </p>
      </div>
    );
  }

  const sessionName = (id: string) => sessions.find((s) => s.id === id)?.name;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="guest-search" className="sr-only">
        Cari tamu
      </label>
      <Input
        id="guest-search"
        type="search"
        placeholder="Cari nama atau meja"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11"
      />
      {!whatsapp && (
        <p className="text-sm text-muted-foreground">Tombol Kirim WA muncul setelah undangan dipublikasikan di tab Publikasi.</p>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length === guests.length ? `${guests.length} tamu` : `${filtered.length} dari ${guests.length} tamu`}
      </p>
      {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada tamu yang cocok dengan &quot;{query}&quot;.</p>}
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {filtered.map((guest) => {
          const meta = [
            CATEGORY_LABELS[guest.category as keyof typeof CATEGORY_LABELS] ?? guest.category,
            `${guest.pax_allowed} orang`,
            guest.table_number && `Meja ${guest.table_number}`,
            sessions.length > 1 && (guest.session_ids.length ? guest.session_ids.map(sessionName).filter(Boolean).join(", ") : "Semua sesi"),
          ].filter(Boolean);
          const rsvp =
            guest.rsvp_status === "attending" && guest.rsvp_pax
              ? `${RSVP_LABELS.attending} (${guest.rsvp_pax} orang)`
              : (RSVP_LABELS[guest.rsvp_status] ?? guest.rsvp_status);

          return (
            <li key={guest.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium [overflow-wrap:anywhere]">{guest.guest_name}</p>
                  <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>
                </div>
                <p className="shrink-0 text-sm">
                  <span className={guest.rsvp_status === "attending" ? "font-medium text-primary" : "text-muted-foreground"}>{rsvp}</span>
                  <span className="text-muted-foreground">
                    {guest.opened_at ? " · sudah dibuka" : guest.sent_at ? " · terkirim, belum dibuka" : " · belum dikirim"}
                  </span>
                  {guest.checked_in_at && <span className="font-medium text-emerald-700 dark:text-emerald-400"> · sudah check-in</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {whatsapp && guest.phone_number && (
                  <a
                    href={whatsappUrl(
                      guest.phone_number,
                      whatsappMessage(whatsapp.template, { nama: guest.guest_name, link: `${inviteBaseUrl}${guest.personal_slug}`, mempelai: whatsapp.couple }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(eventId, guest.id)}
                    className="inline-flex h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {guest.sent_at ? "Kirim ulang WA" : "Kirim WA"}
                  </a>
                )}
                <CopyButton text={`${inviteBaseUrl}${guest.personal_slug}`} />
                <details className="w-full [&[open]]:rounded-lg [&[open]]:border [&[open]]:p-3">
                  <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium">Edit atau hapus</summary>
                  <div className="mt-3 flex flex-col gap-4">
                    <GuestForm eventId={eventId} sessions={sessions} guest={guest} />
                    <SectionForm
                      action={deleteGuest.bind(null, eventId, guest.id)}
                      submitLabel="Hapus tamu"
                      pendingLabel="Menghapus..."
                      variant="destructive"
                      confirmMessage={`Hapus ${guest.guest_name} dari daftar tamu? Link personalnya akan berhenti berfungsi.`}
                    />
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

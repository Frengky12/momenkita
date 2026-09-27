"use client";

import { Field, selectClassName } from "@/components/dashboard/field";
import { SectionForm } from "@/components/dashboard/section-form";
import { Input } from "@/components/ui/input";
import { CATEGORY_LABELS, type SessionRef } from "@/lib/guests";
import { saveGuest } from "./actions";

export type GuestRow = {
  id: string;
  guest_name: string;
  personal_slug: string;
  phone_number: string | null;
  category: string;
  pax_allowed: number;
  table_number: string | null;
  session_ids: string[];
  rsvp_status: string;
  rsvp_pax: number | null;
  sent_at: string | null;
  opened_at: string | null;
  checked_in_at: string | null;
};

export function GuestForm({ eventId, sessions, guest }: { eventId: string; sessions: SessionRef[]; guest?: GuestRow }) {
  const id = (name: string) => `${guest?.id ?? "new"}-${name}`;
  const invited = (sessionId: string) => !guest || guest.session_ids.length === 0 || guest.session_ids.includes(sessionId);

  return (
    <SectionForm action={saveGuest.bind(null, eventId, guest?.id ?? null)} submitLabel={guest ? "Simpan perubahan" : "Tambah tamu"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama tamu" htmlFor={id("name")} hint="Tampil di sampul undangan personal, misalnya Bapak Rudi dan keluarga.">
          <Input id={id("name")} name="name" defaultValue={guest?.guest_name} maxLength={120} required className="h-11" />
        </Field>
        <Field label="No. WhatsApp (opsional)" htmlFor={id("phone")}>
          <Input id={id("phone")} name="phone" defaultValue={guest?.phone_number ?? ""} inputMode="tel" placeholder="08xx" className="h-11" />
        </Field>
        <Field label="Kategori" htmlFor={id("category")}>
          <select id={id("category")} name="category" defaultValue={guest?.category ?? "regular"} className={selectClassName}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Jumlah orang" htmlFor={id("pax")}>
            <Input id={id("pax")} name="pax" type="number" min={1} max={20} defaultValue={guest?.pax_allowed ?? 1} className="h-11" />
          </Field>
          <Field label="Meja" htmlFor={id("table")}>
            <Input id={id("table")} name="table" defaultValue={guest?.table_number ?? ""} maxLength={20} className="h-11" />
          </Field>
        </div>
      </div>
      {sessions.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Diundang ke sesi</legend>
          <div className="flex flex-wrap gap-x-5">
            {sessions.map((session) => (
              <label key={session.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="sessionIds" value={session.id} defaultChecked={invited(session.id)} className="size-4 accent-primary" />
                {session.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {sessions.length === 1 && <input type="hidden" name="sessionIds" value={sessions[0].id} />}
    </SectionForm>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Field, selectClassName } from "@/components/dashboard/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/invitation/content";
import { createEvent, type CreateEventState } from "../actions";

export function CreateEventForm({ origin }: { origin: string }) {
  const [state, formAction, pending] = useActionState<CreateEventState, FormData>(createEvent, { status: "idle" });
  const initial = state.status === "error" ? state.values : {};
  const [groom, setGroom] = useState(initial.groom ?? "");
  const [bride, setBride] = useState(initial.bride ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  // Slug mengikuti nama sampai host mengetik slug sendiri.
  const [slugEdited, setSlugEdited] = useState(Boolean(initial.slug));
  const shownSlug = slugEdited ? slug : slugify(`${groom}-${bride}`);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama panggilan mempelai pria" htmlFor="groom">
          <Input id="groom" name="groom" value={groom} onChange={(e) => setGroom(e.target.value)} maxLength={60} required className="h-11" />
        </Field>
        <Field label="Nama panggilan mempelai wanita" htmlFor="bride">
          <Input id="bride" name="bride" value={bride} onChange={(e) => setBride(e.target.value)} maxLength={60} required className="h-11" />
        </Field>
      </div>

      <Field
        label="Alamat link undangan"
        htmlFor="slug"
        hint={`Link yang dibagikan ke tamu: ${origin}/${shownSlug || "nama-kalian"}. Bukan alamat lokasi acara.`}
      >
        <Input
          id="slug"
          name="slug"
          value={shownSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(slugify(e.target.value));
          }}
          maxLength={60}
          required
          className="h-11"
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Resepsi</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Tanggal" htmlFor="date" className="sm:col-span-2">
            <Input id="date" name="date" type="date" defaultValue={initial.date} required className="h-11" />
          </Field>
          <Field label="Mulai" htmlFor="start">
            <Input id="start" name="start" type="time" defaultValue={initial.start} required className="h-11" />
          </Field>
          <Field label="Selesai" htmlFor="end">
            <Input id="end" name="end" type="time" defaultValue={initial.end} required className="h-11" />
          </Field>
        </div>
        <Field label="Zona waktu" htmlFor="timezone">
          <select
            id="timezone"
            name="timezone"
            defaultValue={initial.timezone ?? "Asia/Jakarta"}
            className={selectClassName}
          >
            <option value="Asia/Jakarta">WIB (Jawa, Sumatra, Kalimantan Barat/Tengah)</option>
            <option value="Asia/Makassar">WITA (Bali, NTB, NTT, Sulawesi, Kalimantan Timur/Selatan)</option>
            <option value="Asia/Jayapura">WIT (Maluku, Papua)</option>
          </select>
        </Field>
      </fieldset>

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-11 w-full sm:w-auto sm:self-start" disabled={pending}>
          {pending ? "Membuat undangan..." : "Buat undangan"}
        </Button>
        <p className="text-sm text-muted-foreground">Akad, profil mempelai, dan detail lain bisa diisi setelah ini.</p>
      </div>
    </form>
  );
}

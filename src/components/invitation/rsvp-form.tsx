"use client";

import { startTransition, useActionState, useState } from "react";
import { submitRsvp, type RsvpState } from "@/app/[slug]/actions";

type Guest = { name: string; paxAllowed: number; rsvpStatus: string; rsvpPax: number | null };

const OPTIONS = [
  { value: "attending", label: "Hadir" },
  { value: "declined", label: "Tidak hadir" },
  { value: "maybe", label: "Masih ragu" },
];

const fieldClass =
  "w-full rounded-lg border border-(--inv-field) bg-(--inv-card) px-3 text-base text-(--inv-text) placeholder:text-(--inv-muted) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--inv-text)";

export function RsvpForm({
  slug,
  personalSlug,
  guest,
  generalMaxPax,
  preview,
}: {
  slug: string;
  personalSlug: string | null;
  guest: Guest | null;
  generalMaxPax: number;
  preview: boolean;
}) {
  const [state, formAction, pending] = useActionState<RsvpState, FormData>(submitRsvp.bind(null, slug, personalSlug), { status: "idle" });
  const answered = guest && guest.rsvpStatus !== "pending" ? guest.rsvpStatus : null;
  const [choice, setChoice] = useState<string>(answered ?? "");
  // Form tampil lagi jika tombol ubah ditekan setelah penyimpanan terakhir.
  const [editAt, setEditAt] = useState<number | null>(null);
  const maxPax = guest?.paxAllowed ?? generalMaxPax;

  const savedAt = state.status === "saved" ? state.at : 0;
  const current =
    state.status === "saved" ? { status: state.rsvpStatus, pax: state.pax } : answered ? { status: answered, pax: guest?.rsvpPax ?? null } : null;

  if (current && (editAt === null || editAt < savedAt)) {
    const label = OPTIONS.find((o) => o.value === current.status)?.label ?? current.status;
    return (
      <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
        <p className="text-lg">
          Jawaban {personalSlug ? "kamu" : "tercatat"}: <strong>{label}</strong>
          {current.status === "attending" && current.pax ? `, ${current.pax} orang` : ""}
        </p>
        <p className="text-sm text-(--inv-muted)">Terima kasih atas konfirmasinya.</p>
        <button
          type="button"
          className="min-h-11 text-sm font-medium underline underline-offset-4"
          onClick={() => {
            setEditAt(Date.now());
            setChoice(personalSlug ? current.status : "");
          }}
        >
          {personalSlug ? "Ubah jawaban" : "Isi untuk tamu lain"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (preview) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {/* Honeypot: disembunyikan dari manusia dan pembaca layar, hanya bot yang mengisinya. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      {!personalSlug && (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Nama kamu
          <input name="name" required maxLength={120} autoComplete="name" className={`${fieldClass} h-11`} />
        </label>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Apakah kamu akan hadir?</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-(--inv-field) px-2 text-center text-sm has-checked:border-(--inv-text) has-checked:bg-(--inv-band) has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-(--inv-text)"
            >
              <input
                type="radio"
                name="status"
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                className="sr-only"
                required
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {choice === "attending" && (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Jumlah orang yang hadir
          <select name="pax" defaultValue={guest?.rsvpPax || 1} className={`${fieldClass} h-11`}>
            {Array.from({ length: maxPax }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} orang
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-2 text-sm font-medium">
        Ucapan dan doa (opsional)
        <textarea name="message" rows={3} maxLength={1000} className={`${fieldClass} py-2`} />
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-(--inv-error)">
          {state.message}
        </p>
      )}
      {preview && <p className="text-sm text-(--inv-muted)">Form ini aktif setelah undangan dipublikasikan.</p>}

      <button
        type="submit"
        disabled={pending || preview}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-(--inv-button) px-6 text-sm font-semibold transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text) disabled:opacity-60"
      >
        {pending ? "Mengirim..." : "Kirim konfirmasi"}
      </button>
    </form>
  );
}

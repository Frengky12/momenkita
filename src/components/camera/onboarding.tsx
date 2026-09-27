"use client";

import { useState } from "react";
import { CONSENT_VERSION } from "@/lib/camera/consent";
import { tokenExpiry, type CameraSession } from "@/lib/camera/session";

const ERRORS: Record<string, string> = {
  display_name_invalid: "Isi nama kamu (maksimal 60 karakter).",
  event_closed: "Kamera tamu untuk acara ini belum dibuka atau sudah ditutup.",
  event_not_found: "Acara tidak ditemukan.",
  invitation_not_found: "Link undangan tidak dikenali. Isi nama kamu untuk melanjutkan.",
};

export function Onboarding({
  slug,
  couple,
  invitationSlug,
  notice,
  onStarted,
}: {
  slug: string;
  couple: string;
  invitationSlug: string | null;
  notice: string | null;
  onStarted: (session: CameraSession) => void;
}) {
  const [name, setName] = useState("");
  const [useInvitation, setUseInvitation] = useState(Boolean(invitationSlug));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(slug)}/guest-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, invitationSlug: useInvitation ? invitationSlug : undefined, consentVersion: CONSENT_VERSION }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.error === "invitation_not_found") setUseInvitation(false);
        setError(ERRORS[body?.error] ?? "Gagal memulai kamera. Coba lagi.");
        return;
      }
      onStarted({ token: body.token, sessionId: body.sessionId, displayName: body.displayName, expiresAt: tokenExpiry(body.token) });
    } catch {
      setError("Tidak ada koneksi. Periksa sinyal lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="theme-klasik flex min-h-dvh flex-col items-center justify-center bg-(--inv-bg) px-6 py-12 text-center text-(--inv-text)">
      <p className="font-display text-xl text-(--inv-accent) italic">Kamera Tamu</p>
      <h1 className="font-display mt-2 text-4xl font-semibold [overflow-wrap:anywhere]">{couple}</h1>
      <p className="mt-6 max-w-sm leading-relaxed">
        Abadikan momen dari sudut pandangmu. Foto yang kamu kirim tampil di layar acara dan di galeri pernikahan ini.
      </p>

      <form onSubmit={start} className="mt-8 flex w-full max-w-sm flex-col gap-4 text-left">
        {useInvitation ? (
          <p className="rounded-lg border border-(--inv-line) bg-(--inv-card) px-4 py-3 text-sm">Nama dari undangan kamu dipakai otomatis.</p>
        ) : (
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nama panggilan kamu
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoComplete="nickname"
              className="h-11 rounded-lg border border-(--inv-field) bg-(--inv-card) px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--inv-text)"
            />
          </label>
        )}

        {/* Persetujuan privasi (UU PDP, PRD §9.1): dicatat bersama versi teksnya saat sesi dibuat. */}
        <p className="text-sm text-(--inv-muted)">
          Dengan menekan tombol di bawah, kamu setuju foto yang kamu kirim ditampilkan di layar acara dan galeri event ini. Kamu bisa
          menghapus fotomu sendiri kapan saja dari halaman ini.
        </p>

        {(error || notice) && (
          <p role="alert" className="text-sm text-(--inv-error)">
            {error ?? notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-(--inv-button) px-6 font-semibold transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text) disabled:opacity-60"
        >
          {pending ? "Memulai..." : "Setuju & mulai"}
        </button>
      </form>
    </main>
  );
}

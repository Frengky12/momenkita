"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<string, string> = {
  wrong_passcode: "Passcode salah. Tanyakan passcode galeri ke tuan rumah.",
  too_many: "Terlalu banyak percobaan. Coba lagi 15 menit lagi.",
};

export function PasscodeForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/gallery/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(MESSAGES[body?.error ?? ""] ?? "Galeri belum bisa dibuka. Coba lagi.");
    } catch {
      setError("Tidak bisa terhubung. Periksa koneksi internet lalu coba lagi.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-(--inv-line) bg-(--inv-card) p-6">
      <div className="flex flex-col gap-1 text-center">
        <h2 className="font-display text-2xl font-semibold">Galeri ini memakai passcode</h2>
        <p className="text-sm text-(--inv-muted)">Masukkan passcode yang dibagikan tuan rumah.</p>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Passcode
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          required
          maxLength={32}
          autoComplete="off"
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "passcode-error" : undefined}
          className="h-11 rounded-lg border border-(--inv-field) bg-white px-3 text-base text-(--inv-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
        />
      </label>
      {error && (
        <p id="passcode-error" role="alert" className="text-sm text-(--inv-error)">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !passcode.trim()}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-(--inv-button) px-8 text-sm font-semibold transition-colors hover:bg-(--inv-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text) disabled:opacity-60"
      >
        {pending ? "Memeriksa..." : "Buka galeri"}
      </button>
    </form>
  );
}

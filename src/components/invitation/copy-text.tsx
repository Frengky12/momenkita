"use client";

import { useState } from "react";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center rounded-full border border-(--inv-field) px-5 text-sm font-medium transition-colors hover:bg-(--inv-band) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--inv-text)"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setCopied(false);
        }
        setTimeout(() => setCopied(null), 2000);
      }}
    >
      <span aria-live="polite">{copied === true ? "Tersalin" : copied === false ? "Gagal menyalin" : label}</span>
    </button>
  );
}

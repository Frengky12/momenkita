"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label = "Salin link" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Tersalin" : state === "failed" ? "Gagal menyalin" : label}</span>
    </Button>
  );
}

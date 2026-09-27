"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SaveState = { status: "idle" } | { status: "saved"; at: number } | { status: "error"; message: string; at: number };

type Props = {
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  submitLabel?: string;
  pendingLabel?: string;
  confirmMessage?: string;
  variant?: "default" | "outline" | "destructive";
  className?: string;
  children?: React.ReactNode;
};

// Dikirim manual (bukan <form action>) agar React tidak mengosongkan isian saat validasi server gagal.
export function SectionForm({ action, submitLabel = "Simpan", pendingLabel = "Menyimpan...", confirmMessage, variant, className, children }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} className="h-11" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.status === "saved" && <span className="text-muted-foreground">Tersimpan</span>}
          {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}

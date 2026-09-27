"use client";

import { startTransition, useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminState } from "./actions";

// Form tindakan admin: isian tambahan (children) + alasan wajib yang masuk ke log audit.
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Memproses...",
  confirmMessage,
  destructive = false,
  reasonPlaceholder = "Contoh: acara pilot gratis sesuai kesepakatan 27 Sep",
  children,
}: {
  action: (prev: AdminState, formData: FormData) => Promise<AdminState>;
  submitLabel: string;
  pendingLabel?: string;
  confirmMessage?: string;
  destructive?: boolean;
  reasonPlaceholder?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  // Setelah berhasil, isian dikosongkan agar alasan lama tidak terbawa ke tindakan berikutnya. Saat gagal, isian dipertahankan.
  useEffect(() => {
    if (state.status === "done") formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {children}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-reason`}>Alasan (tercatat di log audit)</Label>
        <Textarea id={`${id}-reason`} name="reason" required minLength={5} maxLength={500} rows={2} placeholder={reasonPlaceholder} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={destructive ? "destructive" : "default"} className="h-11" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.status === "done" && <span className="text-muted-foreground">{state.message}</span>}
          {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}

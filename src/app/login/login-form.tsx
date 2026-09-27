"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signInWithGoogle, type MagicLinkState } from "./actions";

export function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(sendMagicLink, { status: "idle" });
  // Menyimpan state "sent" yang sudah ditutup; kirim ulang menghasilkan objek state baru sehingga tampil lagi.
  const [dismissed, setDismissed] = useState<MagicLinkState | null>(null);

  if (state.status === "sent" && state !== dismissed) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold">Cek email kamu</p>
          <p className="text-sm text-muted-foreground">
            Link masuk sudah dikirim ke <span className="font-medium text-foreground">{state.email}</span>. Buka link itu
            dari perangkat dan browser ini. Kalau tidak ada di kotak masuk, periksa folder Spam.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending}>
            {pending ? "Mengirim ulang..." : "Kirim ulang link"}
          </Button>
        </form>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setDismissed(state)}>
          Pakai email lain
        </Button>
      </div>
    );
  }

  const errorMessage = state.status === "error" ? state.message : null;
  const defaultEmail = state.status === "error" ? state.email : "";

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nama@email.com"
            defaultValue={defaultEmail}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? "email-error" : undefined}
            className="h-11"
            required
          />
        </div>
        {errorMessage && (
          <Alert variant="destructive" id="email-error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Mengirim link..." : "Kirim link masuk"}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            atau
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="h-11 w-full">
              Lanjut dengan Google
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

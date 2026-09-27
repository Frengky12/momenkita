"use client";

import { startTransition, useActionState, useState } from "react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Field, selectClassName } from "@/components/dashboard/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CREATABLE_ROLES, STAFF_ROLES, isStaffRole } from "@/lib/staff/roles";
import { createStaffLink, revokeStaffLink, type CreatedLink } from "./actions";

export type StaffLinkRow = { id: string; role: string; label: string; expiresAt: string; state: "active" | "revoked" | "expired" };

export function StaffLinks({ eventId, origin, timezone, links }: { eventId: string; origin: string; timezone: string; links: StaffLinkRow[] }) {
  const [state, formAction, pending] = useActionState(createStaffLink.bind(null, eventId), { status: "idle" } as CreatedLink);
  const [dismissedAt, setDismissedAt] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const formatDate = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const roleLabel = (role: string) => (isStaffRole(role) ? STAFF_ROLES[role].label : role);

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Peran" htmlFor="staff-role">
            <select id="staff-role" name="role" className={selectClassName} defaultValue="receptionist">
              {CREATABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {STAFF_ROLES[role].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nama perangkat atau orang" htmlFor="staff-label" hint="Muncul di peringatan scan ganda, misalnya “sudah check-in oleh Meja 2”.">
            <Input id="staff-label" name="label" maxLength={40} placeholder="Contoh: Meja 2" className="h-11" />
          </Field>
        </div>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {CREATABLE_ROLES.map((role) => (
            <li key={role}>
              <span className="font-medium text-foreground">{STAFF_ROLES[role].label}:</span> {STAFF_ROLES[role].description}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Membuat..." : "Buat link staf"}
          </Button>
          {state.status === "error" && (
            <p aria-live="polite" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </div>
      </form>

      {state.status === "created" && state.at !== dismissedAt && (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-primary p-4" aria-live="polite">
          <p className="font-semibold">
            Link {roleLabel(state.role).toLowerCase()}
            {state.label ? ` (${state.label})` : ""} siap dibagikan
          </p>
          <Field label="Link" htmlFor="new-staff-link">
            <Input id="new-staff-link" readOnly value={`${origin}/staff#${state.token}`} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">PIN</span>
              <span className="font-mono text-3xl font-bold tracking-[0.3em]">{state.pin}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={`${origin}/staff#${state.token}`} label="Salin link" />
            <CopyButton text={state.pin} label="Salin PIN" />
          </div>
          <Alert>
            <AlertDescription>
              PIN hanya ditampilkan sekali ini. Kirim link dan PIN lewat pesan terpisah, agar link yang tersebar tidak bisa dipakai tanpa PIN. Berlaku sampai{" "}
              {formatDate(state.expiresAt)}.
            </AlertDescription>
          </Alert>
          <Button type="button" variant="outline" className="h-11 w-fit" onClick={() => setDismissedAt(state.at)}>
            Sudah saya catat
          </Button>
        </div>
      )}

      {links.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Link yang sudah dibuat</h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {roleLabel(link.role)}
                    {link.label ? ` · ${link.label}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {link.state === "revoked" ? "Dicabut" : link.state === "expired" ? "Kedaluwarsa" : `Aktif sampai ${formatDate(link.expiresAt)}`}
                  </p>
                </div>
                {link.state === "active" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={revoking !== null}
                    onClick={async () => {
                      if (!window.confirm(`Cabut link ${roleLabel(link.role).toLowerCase()}${link.label ? ` (${link.label})` : ""}? Perangkat yang memakainya langsung kehilangan akses.`)) return;
                      setRevoking(link.id);
                      setRevokeError(null);
                      const result = await revokeStaffLink(eventId, link.id);
                      if (result.status === "error") setRevokeError(result.message);
                      setRevoking(null);
                    }}
                  >
                    {revoking === link.id ? "Mencabut..." : "Cabut"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {revokeError && (
            <p aria-live="polite" className="text-sm text-destructive">
              {revokeError}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada link staf. Buat satu untuk tiap orang atau perangkat yang bertugas di hari-H.</p>
      )}
    </div>
  );
}

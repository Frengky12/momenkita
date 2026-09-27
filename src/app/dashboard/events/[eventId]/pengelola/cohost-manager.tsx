"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Field } from "@/components/dashboard/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { createCohostInvite, leaveEvent, removeCohost, revokeCohostInvite, type CreatedInvite } from "./actions";

export type CohostRow = { profileId: string; email: string; name: string | null; since: string };
export type InviteRow = { id: string; label: string; expiresAt: string };

type Props = {
  eventId: string;
  eventTitle: string;
  timezone: string;
  origin: string;
  userId: string;
  owner: { isYou: boolean; email: string; name: string | null };
  cohosts: CohostRow[];
  loadError: boolean;
  invites: InviteRow[];
};

export function CohostManager({ eventId, eventTitle, timezone, origin, userId, owner, cohosts, loadError, invites }: Props) {
  const [state, formAction, pending] = useActionState(createCohostInvite.bind(null, eventId), { status: "idle" } as CreatedInvite);
  const [dismissedAt, setDismissedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  // Nama penerima dikosongkan setelah link dibuat agar undangan berikutnya tidak memakai nama yang sama.
  useEffect(() => {
    if (state.status === "created") formRef.current?.reset();
  }, [state]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const formatDate = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const inviteUrl = state.status === "created" ? `${origin}/dashboard/gabung/${state.token}` : "";

  // Satu handler untuk semua tombol baris (keluarkan, keluar, cabut): konfirmasi, kunci tombol lain, tampilkan galat.
  async function runRowAction(key: string, confirmMessage: string, action: () => Promise<{ status: string; message?: string }>) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(key);
    setRowError(null);
    const result = await action();
    if (result.status === "error") setRowError(result.message ?? "Gagal. Coba lagi.");
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="pengelola">
        <div className="flex flex-col gap-1">
          <h2 id="pengelola" className="font-semibold">
            Pengelola event
          </h2>
          <p className="text-sm text-muted-foreground">
            Co-host bisa mengubah undangan, mengelola tamu, menyiapkan hari-H, dan membuka galeri seperti pemilik. Hanya pemilik yang bisa mengundang atau
            mengeluarkan co-host.
          </p>
        </div>

        {loadError && <p className="text-sm text-destructive">Daftar pengelola gagal dimuat. Muat ulang halaman ini.</p>}

        <ul className="flex flex-col divide-y rounded-xl border">
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Person email={owner.email} name={owner.name} you={owner.isYou} />
            <span className="text-sm text-muted-foreground">Pemilik</span>
          </li>
          {cohosts.map((c) => {
            const isYou = c.profileId === userId;
            return (
              <li key={c.profileId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <Person email={c.email} name={c.name} you={isYou} />
                  <span className="text-sm text-muted-foreground">Co-host sejak {formatDate(c.since)}</span>
                </div>
                {owner.isYou && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={busy !== null}
                    onClick={() =>
                      runRowAction(c.profileId, `Keluarkan ${c.email} dari event ini? Aksesnya ke dashboard event langsung hilang.`, () =>
                        removeCohost(eventId, c.profileId),
                      )
                    }
                  >
                    {busy === c.profileId ? "Mengeluarkan..." : "Keluarkan"}
                  </Button>
                )}
                {isYou && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={busy !== null}
                    onClick={() =>
                      runRowAction("leave", `Keluar dari ${eventTitle}? Kamu perlu undangan baru dari pemilik untuk masuk lagi.`, () => leaveEvent(eventId))
                    }
                  >
                    {busy === "leave" ? "Keluar..." : "Keluar dari event"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!loadError && cohosts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Belum ada co-host. {owner.isYou ? "Undang pasangan atau keluarga agar bisa ikut mengelola." : ""}
          </p>
        )}
        {rowError && (
          <p aria-live="polite" className="text-sm text-destructive">
            {rowError}
          </p>
        )}
      </section>

      {owner.isYou ? (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="undang">
          <div className="flex flex-col gap-1">
            <h2 id="undang" className="font-semibold">
              Undang co-host
            </h2>
            <p className="text-sm text-muted-foreground">
              Buat link lalu kirim ke orangnya. Ia masuk dengan email miliknya sendiri, lalu menekan Terima. Satu link untuk satu orang, berlaku 7 hari.
            </p>
          </div>
          <form
            ref={formRef}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(() => formAction(formData));
            }}
          >
            <Field label="Untuk siapa (opsional)" htmlFor="invite-label" hint="Hanya untukmu, agar mudah mengenali undangan yang belum dipakai.">
              <Input id="invite-label" name="label" maxLength={40} placeholder="Contoh: Budi, mempelai pria" className="h-11" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="h-11" disabled={pending}>
                {pending ? "Membuat..." : "Buat link undangan"}
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
              <p className="font-semibold">Link undangan{state.label ? ` untuk ${state.label}` : ""} siap dikirim</p>
              <Field label="Link" htmlFor="new-invite-link">
                <Input id="new-invite-link" readOnly value={inviteUrl} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={inviteUrl} />
                <Button asChild variant="outline" className="h-11">
                  <a
                    href={whatsappShareUrl(
                      `Halo! Aku mengundangmu jadi co-host untuk mengelola undangan ${eventTitle} di MomenKita. Buka link ini, masuk dengan email kamu, lalu tekan Terima:\n${inviteUrl}\n\nLink berlaku 7 hari dan hanya bisa dipakai sekali.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Kirim lewat WhatsApp
                  </a>
                </Button>
              </div>
              <Alert>
                <AlertDescription>
                  Link hanya ditampilkan sekali ini dan berlaku sampai {formatDate(state.expiresAt)}. Siapa pun yang membukanya lebih dulu menjadi co-host, jadi
                  kirim langsung ke orangnya. Kalau terlanjur tersebar, cabut di daftar di bawah.
                </AlertDescription>
              </Alert>
              <Button type="button" variant="outline" className="h-11 w-fit" onClick={() => setDismissedAt(state.at)}>
                Sudah saya kirim
              </Button>
            </div>
          )}

          {invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Undangan yang belum dipakai</h3>
              <ul className="flex flex-col divide-y rounded-xl border">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{invite.label || "Tanpa nama"}</p>
                      <p className="text-sm text-muted-foreground">Berlaku sampai {formatDate(invite.expiresAt)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={busy !== null}
                      onClick={() =>
                        runRowAction(invite.id, `Cabut undangan ${invite.label || "ini"}? Link-nya langsung tidak bisa dipakai.`, () =>
                          revokeCohostInvite(invite.id),
                        )
                      }
                    >
                      {busy === invite.id ? "Mencabut..." : "Cabut"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Untuk menambah co-host, minta pemilik event ({owner.email}) membuat link undangan.</p>
      )}
    </div>
  );
}

function Person({ email, name, you }: { email: string; name: string | null; you: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block font-medium [overflow-wrap:anywhere]">
        {name || email}
        {you && <span className="font-normal text-muted-foreground"> (kamu)</span>}
      </span>
      {name && <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{email}</span>}
    </span>
  );
}

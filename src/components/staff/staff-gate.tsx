"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveStaffAccess, type AccessResult, type StaffAccess } from "@/lib/staff/access";
import { STAFF_ROLES, type StaffRole } from "@/lib/staff/roles";

// Pembungkus halaman staf: memeriksa akses dulu, lalu merender aplikasinya dengan client Supabase yang benar.
export function StaffGate({
  eventId,
  role,
  dark = false,
  children,
}: {
  eventId: string;
  role: StaffRole;
  dark?: boolean;
  children: (access: StaffAccess) => React.ReactNode;
}) {
  const [result, setResult] = useState<AccessResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    resolveStaffAccess(eventId, role).then((r) => active && setResult(r));
    return () => {
      active = false;
    };
  }, [eventId, role, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  if (result?.status === "ok") return children(result.access);

  const path = `/staff/${eventId}/${STAFF_ROLES[role].path}`;
  return (
    <main className={`flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center ${dark ? "bg-black text-white" : ""}`}>
      {result === null && <p aria-live="polite">Memeriksa akses staf...</p>}
      {result?.status === "error" && (
        <>
          <p className="max-w-sm">Akses staf gagal diperiksa. Periksa koneksi internet perangkat ini.</p>
          <Button type="button" className="h-11" onClick={retry}>
            Coba lagi
          </Button>
        </>
      )}
      {result?.status === "denied" && (
        <>
          <h1 className="text-xl font-semibold">Perangkat ini belum punya akses {STAFF_ROLES[role].label.toLowerCase()}</h1>
          <p className={`max-w-sm text-sm ${dark ? "text-white/75" : "text-muted-foreground"}`}>
            Buka link staf yang dikirim host, lalu masukkan PIN 6 digit. Link staf berlaku sampai sehari setelah acara.
          </p>
          <Link href={`/login?next=${encodeURIComponent(path)}`} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
            Saya host, masuk dengan email
          </Link>
        </>
      )}
    </main>
  );
}

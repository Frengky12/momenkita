"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAFF_ROLES, isStaffRole } from "@/lib/staff/roles";
import { getStaffClient } from "@/lib/supabase/staff";

const TOKEN_PATTERN = /^[a-z0-9]{32}$/;

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

type ClaimResult = { ok: true; event_id: string; role: string } | { ok: false; error: string; locked_until?: string };

function errorMessage(result: Exclude<ClaimResult, { ok: true }>) {
  if (result.error === "pin_invalid") return "PIN salah. Setelah 5 kali salah, link dikunci 15 menit.";
  if (result.error === "locked") {
    const until = result.locked_until ? new Date(result.locked_until).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null;
    return `Terlalu banyak PIN salah. Coba lagi${until ? ` pukul ${until}` : " 15 menit lagi"}.`;
  }
  return "Link staf tidak berlaku: sudah dicabut, kedaluwarsa, atau tidak lengkap. Minta link baru ke host.";
}

export function StaffLogin() {
  const router = useRouter();
  // Token ada di fragmen URL (#...) sehingga tidak ikut terkirim ke server maupun log akses.
  // null di server: isi fragmen baru diketahui di browser, jadi jangan tampilkan pesan "link tidak lengkap" lebih dulu.
  const hash = useSyncExternalStore<string | null>(subscribeHash, () => window.location.hash.slice(1), () => null);
  const token = hash && TOKEN_PATTERN.test(hash) ? hash : null;
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hash === null) return <p className="text-sm text-muted-foreground">Memuat...</p>;

  if (!token) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Masuk sebagai staf</h1>
        <p className="text-sm text-muted-foreground">
          Buka link staf lengkap yang dikirim host. Link itu berakhiran tanda # diikuti kode panjang; bila terpotong saat disalin, minta host mengirim ulang.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const client = getStaffClient();
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) {
        const { error: signInError } = await client.auth.signInAnonymously();
        if (signInError) throw signInError;
      }
      const claim = () => client.rpc("claim_staff_link", { p_token: token!, p_pin: pin });
      let { data, error: rpcError } = await claim();
      if (rpcError && session) {
        // Sesi anonim lama di perangkat ini bisa sudah dihapus (pembersihan perangkat staf); buat sesi baru lalu ulangi sekali.
        await client.auth.signOut({ scope: "local" });
        const { error: signInError } = await client.auth.signInAnonymously();
        if (signInError) throw signInError;
        ({ data, error: rpcError } = await claim());
      }
      if (rpcError) throw rpcError;
      const result = data as unknown as ClaimResult;
      if (!result.ok) {
        setError(errorMessage(result));
        setPending(false);
        return;
      }
      // Token dihapus dari address bar agar tidak terlihat orang lain atau terbawa saat layar dibagikan.
      window.history.replaceState(null, "", "/staff");
      const path = isStaffRole(result.role) ? STAFF_ROLES[result.role].path : "moderasi";
      router.replace(`/staff/${result.event_id}/${path}`);
    } catch {
      setError("Tidak bisa terhubung. Periksa koneksi internet lalu coba lagi.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Masuk sebagai staf</h1>
        <p className="text-sm text-muted-foreground">Masukkan PIN 6 digit dari host. Cukup sekali per perangkat.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          required
          autoFocus
          className="h-12 text-center text-2xl tracking-[0.5em]"
          aria-describedby={error ? "pin-error" : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && (
        <Alert variant="destructive" id="pin-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11" disabled={pending || pin.length !== 6}>
        {pending ? "Memeriksa..." : "Masuk"}
      </Button>
    </form>
  );
}

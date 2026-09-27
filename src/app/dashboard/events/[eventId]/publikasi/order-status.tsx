"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { OrderOutcome } from "@/lib/orders";
import { checkOrder } from "./actions";

const POLL_MS = 5000;
const MAX_POLLS = 24;

// Webhook Midtrans bisa terlambat (dan tidak bisa mencapai localhost), jadi halaman ini ikut mengecek status sendiri.
export function OrderStatus({ eventId, orderId, initial }: { eventId: string; orderId: string; initial: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderOutcome | string>(initial);
  const [checking, startChecking] = useTransition();

  const check = useCallback(
    () =>
      startChecking(async () => {
        const outcome = await checkOrder(eventId, orderId);
        setStatus(outcome);
        if (outcome === "paid") router.refresh();
      }),
    [eventId, orderId, router],
  );

  useEffect(() => {
    if (status !== "pending") return;
    let polls = 0;
    const first = setTimeout(check, 0);
    const id = setInterval(() => {
      polls += 1;
      if (polls >= MAX_POLLS) return clearInterval(id);
      check();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [status, check]);

  if (status === "paid") {
    return (
      <Alert>
        <AlertDescription>Pembayaran berhasil. Paket sudah aktif; undangan sekarang bisa dipublikasikan.</AlertDescription>
      </Alert>
    );
  }
  if (status === "expired" || status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertDescription>Pembayaran tidak berhasil atau sudah kedaluwarsa. Pilih paket lagi untuk membuat pembayaran baru.</AlertDescription>
      </Alert>
    );
  }
  if (status === "not_found" || status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>Status pembayaran belum bisa dipastikan. Coba cek lagi; hubungi kami bila dana sudah terpotong.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-3">
        <p aria-live="polite">Menunggu konfirmasi pembayaran dari Midtrans. Halaman ini mengecek otomatis setiap 5 detik.</p>
        <Button type="button" variant="outline" className="h-11 self-start" onClick={check} disabled={checking}>
          {checking ? "Mengecek..." : "Cek sekarang"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

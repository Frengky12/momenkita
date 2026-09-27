import { NextResponse } from "next/server";
import { isValidSignature } from "@/lib/midtrans";
import { reconcileOrder } from "@/lib/orders";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Payment Notification URL di dashboard Midtrans. Midtrans mengulang pengiriman bila responsnya bukan 2xx.
export async function POST(request: Request) {
  const notification = (await request.json().catch(() => null)) as Record<string, string> | null;
  if (!notification || !isValidSignature(notification)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Tombol "Test notification" di dashboard Midtrans memakai order_id acak; balas 200 agar tidak diulang.
  if (!UUID_PATTERN.test(notification.order_id)) return NextResponse.json({ ok: true, ignored: true });

  const outcome = await reconcileOrder(notification.order_id);
  // Order dari lingkungan lain yang memakai akun Midtrans yang sama: diabaikan, bukan diulang.
  if (outcome === "not_found") return NextResponse.json({ ok: true, ignored: true });
  if (outcome === "error") return NextResponse.json({ error: "reconcile_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, outcome });
}

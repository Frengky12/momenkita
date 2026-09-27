import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

function config() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi. Lihat .env.example.");
  const production = process.env.MIDTRANS_IS_PRODUCTION === "true";
  return {
    serverKey,
    snapUrl: production ? "https://app.midtrans.com/snap/v1/transactions" : "https://app.sandbox.midtrans.com/snap/v1/transactions",
    apiUrl: production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
  };
}

function authHeader(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

export type SnapRequest = {
  orderId: string;
  amount: number;
  item: { id: string; name: string };
  customer: { email: string; name: string };
  finishUrl: string;
};

export async function createSnapTransaction(req: SnapRequest) {
  const { serverKey, snapUrl } = config();
  const res = await fetch(snapUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader(serverKey) },
    body: JSON.stringify({
      transaction_details: { order_id: req.orderId, gross_amount: req.amount },
      // Midtrans membatasi nama item 50 karakter.
      item_details: [{ id: req.item.id, name: req.item.name.slice(0, 50), price: req.amount, quantity: 1 }],
      customer_details: { email: req.customer.email, first_name: req.customer.name.slice(0, 50) },
      callbacks: { finish: req.finishUrl },
      expiry: { unit: "hours", duration: 24 },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
  if (!res.ok || !body.redirect_url) {
    throw new Error(`Midtrans Snap ${res.status}: ${body.error_messages?.join("; ") ?? "tanpa pesan"}`);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

export type TransactionStatus = {
  status_code: string;
  transaction_status?: string;
  fraud_status?: string;
  gross_amount?: string;
  transaction_id?: string;
};

export async function getTransactionStatus(orderId: string): Promise<TransactionStatus> {
  const { serverKey, apiUrl } = config();
  const res = await fetch(`${apiUrl}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader(serverKey) },
    cache: "no-store",
  });
  return (await res.json()) as TransactionStatus;
}

// Hanya berhasil untuk transaksi pending yang metode bayarnya sudah dipilih; selain itu Midtrans membalas 404.
export async function cancelTransaction(orderId: string): Promise<TransactionStatus> {
  const { serverKey, apiUrl } = config();
  const res = await fetch(`${apiUrl}/v2/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: authHeader(serverKey) },
  });
  return (await res.json()) as TransactionStatus;
}

// signature_key = SHA512(order_id + status_code + gross_amount + server key), sesuai dokumentasi notifikasi Midtrans.
export function isValidSignature(n: { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string }) {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${config().serverKey}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(n.signature_key);
  return a.length === b.length && timingSafeEqual(a, b);
}

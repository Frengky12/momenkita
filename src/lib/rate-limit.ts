import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Gagal terbuka: bila pengecekan batas error, aksi tetap diizinkan karena RSVP yang gagal lebih merugikan daripada spam sesaat.
export async function allowAction(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`hit_rate_limit gagal untuk ${key}: ${error.message}`);
    return true;
  }
  return data === true;
}

// IP disimpan sebagai HMAC, bukan mentah (minimisasi data). Vercel menaruh IP klien di awal x-forwarded-for.
export async function clientKey() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHmac("sha256", process.env.GUEST_SESSION_SECRET ?? "momenkita").update(ip).digest("base64url").slice(0, 22);
}

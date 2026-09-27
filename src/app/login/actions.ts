"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function callbackUrl(next: string) {
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

// Supabase membatasi dua hal: satu permintaan per alamat tiap 60 detik ("...after 42 seconds"),
// dan kuota email seluruh project per jam (layanan email bawaan hanya 2 email/jam; SMTP sendiri jauh lebih longgar).
function magicLinkError(error: { status?: number; message: string }) {
  if (error.status !== 429) return "Link masuk gagal dikirim. Coba lagi sebentar lagi.";
  const seconds = Number(error.message.match(/after (\d+) seconds?/)?.[1]);
  if (seconds) return `Link masuk baru saja dikirim ke email ini. Tunggu ${seconds} detik sebelum meminta lagi.`;
  return "Batas pengiriman email login sedang tercapai. Coba lagi sekitar satu jam lagi, atau pakai link terakhir yang sudah masuk ke email Anda.";
}

export async function sendMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", email, message: "Format email belum benar. Contoh: nama@gmail.com" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl(next), shouldCreateUser: true },
  });

  if (error) {
    // Kode error dicatat (tanpa email) agar penyebab kegagalan terlihat di log server.
    console.warn(`signInWithOtp gagal: ${error.status} ${error.code ?? ""} ${error.message}`);
    return { status: "error", email, message: magicLinkError(error) };
  }

  return { status: "sent", email };
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });

  if (error || !data.url) {
    redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}

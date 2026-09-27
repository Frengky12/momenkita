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
    // Supabase membatasi pengiriman email per alamat dan per jam; pesan aslinya berbahasa Inggris.
    const message =
      error.status === 429
        ? "Terlalu banyak permintaan. Tunggu sekitar satu menit lalu coba lagi."
        : "Link masuk gagal dikirim. Coba lagi sebentar lagi.";
    return { status: "error", email, message };
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

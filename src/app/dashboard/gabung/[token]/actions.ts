"use server";

import { redirect } from "next/navigation";
import type { SaveState } from "@/components/dashboard/section-form";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(token: string): Promise<SaveState> {
  const supabase = await createClient();
  const { data: eventId, error } = await supabase.rpc("accept_cohost_invite", { p_token: token });
  if (error) {
    const message = error.message.includes("tidak berlaku")
      ? "Undangan ini sudah tidak berlaku. Minta link baru ke pemilik event."
      : "Gagal menerima undangan. Coba lagi.";
    return { status: "error", message, at: Date.now() };
  }
  redirect(`/dashboard/events/${eventId}/undangan`);
}

// Undangan terbuka di akun yang salah: keluar lalu kembali ke link yang sama setelah masuk dengan email lain.
export async function switchAccount(token: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/login?next=${encodeURIComponent(`/dashboard/gabung/${token}`)}`);
}

import "server-only";
import { publicEnv } from "@/lib/env";

// Tombol Google hanya tampil jika provider-nya benar-benar aktif di Supabase, supaya tidak ada tombol mati.
export async function getAuthProviders() {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { google: false };
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return { google: settings.external?.google === true };
  } catch {
    return { google: false };
  }
}

import "server-only";
import { publicEnv } from "@/lib/env";

export type PromoStatus = { active: boolean; package: "classic" | "complete" | "luxury"; per_account: number; ends_at: string | null };

const INACTIVE: PromoStatus = { active: false, package: "complete", per_account: 1, ends_at: null };

// Untuk halaman publik (halaman depan): dibaca lewat REST dengan cache 60 detik, sama seperti getAuthProviders.
// Tab Publikasi membaca langsung lewat RPC agar status selalu terbaru saat host akan mengklaim.
export async function getPromoStatus(): Promise<PromoStatus> {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/launch_promo_status`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate: 60 },
    });
    return res.ok ? ((await res.json()) as PromoStatus) : INACTIVE;
  } catch {
    return INACTIVE;
  }
}

export const promoEndLabel = (endsAt: string | null) =>
  endsAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(endsAt)) : null;

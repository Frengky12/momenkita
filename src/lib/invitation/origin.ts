import "server-only";
import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";

export async function requestOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// Alamat undangan yang dibagikan ke tamu. Event Luxury dengan custom domain aktif memakai domain itu
// (proxy mengarahkan domain ke /<slug>); event lain memakai host aplikasi + slug.
export async function invitationBase(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, slug: string) {
  const { data } = await supabase.from("custom_domains").select("domain").eq("event_id", eventId).eq("status", "active").limit(1).maybeSingle();
  return data ? `https://${data.domain}` : `${await requestOrigin()}/${slug}`;
}

import { publicEnv } from "@/lib/env";

// Custom domain Luxury (PRD §9.5): host selain domain utama dicari di custom_domains lalu diarahkan ke undangan event-nya.
// Hasil pencarian disimpan 60 detik per instance agar tidak ada query database di setiap request.

const CACHE_MS = 60_000;
const cache = new Map<string, { slug: string | null; until: number }>();

export function isPrimaryHost(host: string) {
  const name = host.split(":")[0].toLowerCase();
  const extra = (process.env.PRIMARY_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return name === "localhost" || name === "127.0.0.1" || name.endsWith(".vercel.app") || extra.includes(name);
}

export async function slugForHost(host: string): Promise<string | null> {
  const key = host.split(":")[0].toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.slug;

  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  let slug: string | null = null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_custom_domain`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_host: key }),
    });
    if (res.ok) slug = (await res.json()) as string | null;
  } catch {
    // Database tidak terjangkau: jangan simpan ke cache, coba lagi di request berikutnya.
    return null;
  }
  cache.set(key, { slug, until: Date.now() + CACHE_MS });
  return slug;
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Server Component, Route Handler, dan Server Action atas nama host yang login (RLS berlaku).
// Buat baru di setiap request; jangan dibagi antar-request.
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component tidak bisa menulis cookie; refresh sesi sudah ditangani src/proxy.ts.
        }
      },
    },
  });
}

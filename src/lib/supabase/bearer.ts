import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Route Handler yang dipanggil perangkat staf (sesi anonim di localStorage, tanpa cookie) atau host.
// RPC berjalan sebagai pemilik token sehingga hak akses tetap diperiksa database.
export function createBearerClient(accessToken: string) {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

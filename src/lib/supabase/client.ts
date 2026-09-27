import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Client Component di dashboard host/WO. Sesi disimpan di cookie agar bisa dibaca server.
export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let staffClient: SupabaseClient<Database> | undefined;

// Perangkat staf hari-H: anonymous sign-in, sesi di localStorage perangkat (tidak butuh cookie/SSR).
// storageKey terpisah agar tidak bentrok dengan sesi host di browser yang sama.
export function getStaffClient() {
  if (!staffClient) {
    const { supabaseUrl, supabasePublishableKey } = publicEnv();
    staffClient = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: { storageKey: "momenkita-staff", persistSession: true, autoRefreshToken: true },
    });
  }
  return staffClient;
}

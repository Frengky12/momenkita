import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Melewati RLS. Hanya untuk alur tamu, webhook Midtrans, dan super admin; validasi akses di pemanggil.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY belum diisi. Salin .env.example ke .env.local.");
  }

  return createClient<Database>(publicEnv().supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

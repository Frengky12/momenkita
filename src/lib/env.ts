// NEXT_PUBLIC_* harus dibaca dengan nama statis agar Next.js bisa meng-inline-nya ke bundle browser.
export function publicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum diisi. Salin .env.example ke .env.local.",
    );
  }

  return { supabaseUrl, supabasePublishableKey };
}

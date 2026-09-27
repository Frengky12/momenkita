import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Next.js merender layout dan page secara paralel: notFound() di layout tidak menghentikan render page,
// dan hasil render page ikut terkirim di respons 404. Karena itu layout dan setiap page admin memanggil guard ini
// (di-cache per request, jadi is_admin hanya dicek sekali).
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || data.claims.is_anonymous) redirect("/login?next=/admin");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();
  return supabase;
});

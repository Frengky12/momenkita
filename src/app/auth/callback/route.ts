import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Dua format link didukung:
// - ?code=...       PKCE (Google, dan magic link template bawaan): hanya berhasil di browser yang meminta link.
// - ?token_hash=... template email kustom: berhasil di perangkat mana pun.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  if (failed) {
    return NextResponse.redirect(new URL(`/login?error=link&next=${encodeURIComponent(next)}`, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}

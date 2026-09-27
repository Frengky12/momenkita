import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-next";

// Me-refresh sesi host di setiap navigasi dashboard, lalu menulis cookie baru ke request dan response.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() memverifikasi JWT dan memicu refresh token; jangan sisipkan kode di antara client dan panggilan ini.
  const { data } = await supabase.auth.getClaims();
  const isHost = Boolean(data?.claims) && data?.claims.is_anonymous !== true;
  const { pathname } = request.nextUrl;

  if (!isHost && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    return redirectWithCookies(request, response, `/login?next=${encodeURIComponent(pathname)}`);
  }
  if (isHost && pathname === "/login") {
    return redirectWithCookies(request, response, safeNextPath(request.nextUrl.searchParams.get("next")));
  }
  return response;
}

// Redirect tetap membawa cookie sesi yang baru di-refresh.
function redirectWithCookies(request: NextRequest, response: NextResponse, to: string) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

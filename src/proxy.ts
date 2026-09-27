import { NextResponse, type NextRequest } from "next/server";
import { isPrimaryHost, slugForHost } from "@/lib/custom-domain";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin") || pathname === "/login") {
    return updateSession(request);
  }

  // Custom domain: budi-ani.com/ → /<slug>, /to/x → /<slug>/to/x, /kamera → /<slug>/kamera.
  const host = request.headers.get("host") ?? "";
  if (!host || isPrimaryHost(host)) return NextResponse.next();
  const slug = await slugForHost(host);
  if (!slug || pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
  return NextResponse.rewrite(url);
}

// Semua halaman kecuali aset statis dan API; halaman tamu/staf di domain utama langsung diteruskan tanpa query apa pun.
export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|.*\.(?:png|jpg|jpeg|svg|ico|webp|xlsx|txt)$).*)"],
};

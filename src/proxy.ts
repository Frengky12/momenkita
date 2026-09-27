import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

// Hanya area host. Halaman tamu dan staf tidak memakai sesi cookie, jadi tidak perlu melewati proxy.
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};

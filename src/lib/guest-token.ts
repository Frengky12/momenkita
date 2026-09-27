import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Token sesi kamera tamu: payload base64url + HMAC-SHA256. Tamu tidak punya akun Supabase (PRD §6.3).
export type GuestToken = { sid: string; eid: string; exp: number };

const TTL_SECONDS = 24 * 60 * 60;

function secret() {
  const value = process.env.GUEST_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("GUEST_SESSION_SECRET belum diisi (minimal 32 karakter). Lihat .env.example.");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createGuestToken(sessionId: string, eventId: string) {
  const payload = Buffer.from(
    JSON.stringify({ sid: sessionId, eid: eventId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyGuestToken(token: string | null): GuestToken | null {
  const [payload, signature] = token?.split(".") ?? [];
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<GuestToken>;
    if (typeof data.sid !== "string" || typeof data.eid !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { sid: data.sid, eid: data.eid, exp: data.exp };
  } catch {
    return null;
  }
}

export function guestTokenFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

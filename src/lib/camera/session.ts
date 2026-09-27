// Sesi kamera tamu disimpan per event di localStorage agar membuka ulang halaman tidak meminta nama lagi.
// Dibaca lewat useSyncExternalStore: server dan hidrasi melihat "belum ada sesi", lalu browser beralih ke kamera.
export type CameraSession = { token: string; sessionId: string; displayName: string; expiresAt: number };

const storageKey = (slug: string) => `momenkita-camera:${slug}`;
const CHANGE_EVENT = "momenkita-camera-session";
// Cadangan bila localStorage diblokir (mode privat): sesi tetap berlaku selama halaman terbuka.
const memory = new Map<string, string>();

// Masa berlaku dibaca dari payload token (base64url JSON sebelum titik).
export function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export function subscribeSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

// Mengembalikan string mentah (bukan objek baru) agar snapshot useSyncExternalStore stabil.
export function readSessionRaw(slug: string): string | null {
  try {
    return localStorage.getItem(storageKey(slug)) ?? memory.get(slug) ?? null;
  } catch {
    return memory.get(slug) ?? null;
  }
}

export function parseSession(raw: string | null): CameraSession | null {
  try {
    return raw ? (JSON.parse(raw) as CameraSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(slug: string, session: CameraSession) {
  const raw = JSON.stringify(session);
  try {
    localStorage.setItem(storageKey(slug), raw);
  } catch {
    memory.set(slug, raw);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSession(slug: string) {
  memory.delete(slug);
  try {
    localStorage.removeItem(storageKey(slug));
  } catch {
    // tidak ada yang perlu dibersihkan
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

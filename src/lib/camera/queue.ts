import type { DisplayFormat } from "./process";

// Antrean upload di IndexedDB: foto tetap tersimpan di HP saat sinyal gedung buruk dan dikirim otomatis
// begitu online atau saat halaman dibuka lagi (PRD §5.3).

export type QueueEntry = {
  id: string;
  slug: string;
  createdAt: number;
  caption: string;
  width: number;
  height: number;
  format: DisplayFormat;
  display?: Blob;
  thumb: Blob;
  original?: Blob;
  originalType?: string;
  // Hasil presign disimpan agar percobaan ulang tidak mengunggah ulang file yang sudah sampai.
  photoId?: string;
  urls?: Partial<Record<"display" | "thumb" | "original", string>>;
  urlsExpireAt?: number;
  uploaded?: Partial<Record<"display" | "thumb", boolean>>;
  stage: "queued" | "confirmed" | "done" | "failed";
  photoStatus?: string;
  attempts: number;
  nextAttemptAt: number;
  error?: string;
};

const DB_NAME = "momenkita-camera";
const STORE = "uploads";
const memory = new Map<string, QueueEntry>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      }),
  );
}

export async function saveEntry(entry: QueueEntry) {
  memory.set(entry.id, entry);
  await run("readwrite", (s) => s.put(entry));
}

export async function removeEntry(id: string) {
  memory.delete(id);
  await run("readwrite", (s) => s.delete(id));
}

export async function listEntries(slug: string): Promise<QueueEntry[]> {
  const stored = (await run("readonly", (s) => s.getAll() as IDBRequest<QueueEntry[]>)) ?? [...memory.values()];
  return stored.filter((e) => e.slug === slug).sort((a, b) => a.createdAt - b.createdAt);
}

type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> | null };

async function api(path: string, payload: unknown, token: string): Promise<ApiResult> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

async function putBlob(url: string, blob: Blob, type: string) {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: blob });
  if (!res.ok) throw new Error(`upload ${res.status}`);
}

const FAILURE_MESSAGES: Record<string, string> = {
  event_closed: "Acara ini sudah tidak menerima foto.",
  session_blocked: "Sesi kamera ini diblokir panitia.",
  session_limit: "Batas 300 foto per sesi sudah tercapai.",
};

function backoff(entry: QueueEntry) {
  entry.attempts += 1;
  entry.nextAttemptAt = Date.now() + Math.min(60_000, 2_000 * 2 ** (entry.attempts - 1));
}

type StepResult = "ok" | "retry" | "session_expired";

async function step(entry: QueueEntry, token: string): Promise<StepResult> {
  if (entry.stage === "queued") {
    if (!entry.photoId || !entry.urls || (entry.urlsExpireAt ?? 0) < Date.now()) {
      const files: { variant: string; contentType: string; size: number }[] = [
        { variant: "display", contentType: entry.format, size: entry.display!.size },
        { variant: "thumb", contentType: entry.format, size: entry.thumb.size },
      ];
      if (entry.original && entry.originalType) files.push({ variant: "original", contentType: entry.originalType, size: entry.original.size });
      const pre = await api("/api/uploads/presign", { files }, token);
      if (pre.status === 401) return "session_expired";
      if (pre.status === 429 && pre.body?.error === "too_fast") {
        // Server membatasi 1 foto per 3 detik; ini bukan kegagalan, cukup ditunda.
        entry.nextAttemptAt = Date.now() + 3_500;
        return "retry";
      }
      if (!pre.ok) return fail(entry, String(pre.body?.error ?? pre.status));
      const uploads = pre.body!.uploads as { variant: "display" | "thumb" | "original"; url: string }[];
      entry.photoId = pre.body!.photoId as string;
      entry.urls = Object.fromEntries(uploads.map((u) => [u.variant, u.url]));
      entry.urlsExpireAt = Date.now() + (Number(pre.body!.expiresIn) - 30) * 1000;
      entry.uploaded = {};
      await saveEntry(entry);
    }
    for (const variant of ["display", "thumb"] as const) {
      if (entry.uploaded?.[variant]) continue;
      await putBlob(entry.urls![variant]!, variant === "display" ? entry.display! : entry.thumb, entry.format);
      entry.uploaded = { ...entry.uploaded, [variant]: true };
      await saveEntry(entry);
    }
    const confirm = await api(
      "/api/uploads/confirm",
      { photoId: entry.photoId, width: entry.width, height: entry.height, caption: entry.caption, format: entry.format },
      token,
    );
    if (confirm.status === 401) return "session_expired";
    if (!confirm.ok) {
      if (confirm.status === 422) {
        // File belum lengkap di R2: ulangi dari presign baru.
        entry.urls = undefined;
        backoff(entry);
        return "retry";
      }
      return fail(entry, String(confirm.body?.error ?? confirm.status));
    }
    entry.photoStatus = String((confirm.body?.photo as { status?: string })?.status ?? "");
    entry.stage = entry.original ? "confirmed" : "done";
    entry.display = undefined;
    entry.attempts = 0;
    await saveEntry(entry);
    return "ok";
  }

  // Tahap kedua (Luxury): file asli diunggah setelah foto tampil, dengan prioritas rendah.
  if (!entry.urls?.original || (entry.urlsExpireAt ?? 0) < Date.now()) {
    const pre = await api(
      "/api/uploads/presign",
      { photoId: entry.photoId, files: [{ variant: "original", contentType: entry.originalType, size: entry.original!.size }] },
      token,
    );
    if (pre.status === 401) return "session_expired";
    if (!pre.ok) return fail(entry, String(pre.body?.error ?? pre.status));
    entry.urls = { original: (pre.body!.uploads as { url: string }[])[0].url };
    entry.urlsExpireAt = Date.now() + (Number(pre.body!.expiresIn) - 30) * 1000;
  }
  await putBlob(entry.urls.original!, entry.original!, entry.originalType!);
  const confirm = await api(
    "/api/uploads/confirm",
    { photoId: entry.photoId, width: entry.width, height: entry.height, format: entry.format, originalContentType: entry.originalType },
    token,
  );
  if (confirm.status === 401) return "session_expired";
  if (!confirm.ok) return fail(entry, String(confirm.body?.error ?? confirm.status));
  entry.stage = "done";
  entry.original = undefined;
  await saveEntry(entry);
  return "ok";
}

async function fail(entry: QueueEntry, code: string): Promise<StepResult> {
  entry.stage = "failed";
  entry.error = FAILURE_MESSAGES[code] ?? "Foto gagal dikirim.";
  await saveEntry(entry);
  return "ok";
}

let draining = false;

// Mengirim antrean satu per satu. Error jaringan (fetch melempar) dijadwalkan ulang dengan jeda makin panjang.
export async function drainQueue(slug: string, getToken: () => string | null): Promise<"idle" | "offline" | "session_expired" | "busy"> {
  if (draining) return "busy";
  draining = true;
  try {
    for (;;) {
      if (!navigator.onLine) return "offline";
      const next = (await listEntries(slug)).find((e) => (e.stage === "queued" || e.stage === "confirmed") && e.nextAttemptAt <= Date.now());
      if (!next) return "idle";
      const token = getToken();
      if (!token) return "session_expired";
      try {
        const result = await step(next, token);
        if (result === "session_expired") return "session_expired";
        if (result === "retry") await saveEntry(next);
      } catch {
        backoff(next);
        await saveEntry(next);
      }
    }
  } finally {
    draining = false;
  }
}

export async function retryEntry(entry: QueueEntry) {
  entry.stage = entry.photoId && !entry.display ? "confirmed" : "queued";
  entry.error = undefined;
  entry.attempts = 0;
  entry.nextAttemptAt = 0;
  await saveEntry(entry);
}

export async function deletePhoto(entry: QueueEntry, token: string) {
  if (entry.photoId && entry.stage !== "queued") {
    const res = await api("/api/uploads/delete", { photoId: entry.photoId }, token);
    if (!res.ok && res.status !== 404) throw new Error("Gagal menghapus foto");
  }
  await removeEntry(entry.id);
}

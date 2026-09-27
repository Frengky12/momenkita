"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StaffGate } from "@/components/staff/staff-gate";
import { Button } from "@/components/ui/button";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { fetchStaffPhotos, subscribeEvent, type ModerationMode, type PhotoBroadcast, type StaffAccess, type StaffPhoto } from "@/lib/staff/access";
import { useOnline, useSecondClock } from "@/lib/staff/hooks";

const MODE_LABEL: Record<ModerationMode, string> = {
  curated: "Mode kurasi: foto tayang setelah disetujui.",
  delayed: "Mode jeda: foto tayang otomatis 15 detik setelah masuk, kecuali ditolak.",
  instant: "Mode instan: foto langsung tayang.",
};
const ACTIVE_UPLOADER_MS = 30 * 60_000;
// visible_after memakai jam database; selisih kecil dengan jam perangkat tidak boleh membuat foto yang baru
// disetujui terlihat "masih dijadwalkan".
const CLOCK_TOLERANCE_MS = 1500;

const scheduledAt = (p: StaffPhoto) =>
  p.status === "approved" && p.visible_after ? Date.parse(p.visible_after) - CLOCK_TOLERANCE_MS : -Infinity;

// Dipanggil saat render hanya untuk memutuskan apakah jam per detik perlu berjalan.
function hasScheduled(photos: StaffPhoto[], offset: number) {
  const serverNow = Date.now() + offset;
  return photos.some((p) => scheduledAt(p) > serverNow);
}

type Tab = "pending" | "live" | "rejected";
type Action = "approve" | "reject" | "pin" | "unpin";

export function ModerationConsole({ access }: { access: StaffAccess }) {
  const { client, event } = access;
  const [first, second] = coupleNames(parseContent(event.theme_config));
  const title = first.nickname && second.nickname ? `${first.nickname} & ${second.nickname}` : event.title;

  // Ref ikut diperbarui agar handler realtime tahu foto mana yang sudah ada tanpa menunggu render.
  const photosRef = useRef<StaffPhoto[]>([]);
  const [photos, setPhotosState] = useState<StaffPhoto[]>([]);
  const setPhotos = useCallback((update: (list: StaffPhoto[]) => StaffPhoto[]) => {
    photosRef.current = update(photosRef.current);
    setPhotosState(photosRef.current);
  }, []);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState(event.moderation_mode);
  const [blackout, setBlackout] = useState(event.stage_blackout);
  const [blackoutPending, setBlackoutPending] = useState(false);
  const [live, setLive] = useState(false);
  const online = useOnline();
  const [tab, setTab] = useState<Tab>("pending");
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [viewing, setViewing] = useState<StaffPhoto | null>(null);

  const notify = useCallback((text: string) => setToast({ text, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const result = await fetchStaffPhotos(client, event.id, { variants: "thumb", limit: 500 });
      setOffset(result.serverTime - Date.now());
      setPhotos(() => result.photos);
      setLoadState("ready");
    } catch {
      setLoadState((s) => (s === "ready" ? s : "error"));
    }
  }, [client, event.id, setPhotos]);

  const upsertFromServer = useCallback(
    async (id: string) => {
      try {
        const { photos: [photo] } = await fetchStaffPhotos(client, event.id, { ids: [id], variants: "thumb" });
        setPhotos((list) => {
          const rest = list.filter((p) => p.id !== id);
          return photo ? [photo, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at)) : rest;
        });
      } catch {
        // Sinkron ulang berikutnya (saat tersambung kembali) akan melengkapinya.
      }
    },
    [client, event.id, setPhotos],
  );

  useEffect(() => {
    // Muat pertama di sini; setiap kali realtime tersambung lagi, muat ulang untuk menangkap perubahan saat putus.
    const initial = setTimeout(load, 0);
    let everLive = false;
    const unsubscribe = subscribeEvent(
      client,
      event.id,
      {
        photo: (p: PhotoBroadcast) => {
          if (p.status === "deleted") {
            setPhotos((list) => list.filter((x) => x.id !== p.id));
          } else if (photosRef.current.some((x) => x.id === p.id)) {
            setPhotos((list) =>
              list.map((x) => (x.id === p.id ? { ...x, status: p.status, is_pinned: p.is_pinned, visible_after: p.visible_after, over_quota: p.over_quota } : x)),
            );
          } else {
            upsertFromServer(p.id);
          }
        },
        stage: (s) => {
          setBlackout(s.stage_blackout);
          setMode(s.moderation_mode);
        },
      },
      (isLive) => {
        setLive(isLive);
        if (isLive && everLive) load();
        if (isLive) everLive = true;
      },
    );
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initial);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, event.id, load, setPhotos, upsertFromServer]);

  // Jam per detik hanya berjalan selama ada hitung mundur (mode jeda), agar daftar tidak dirender ulang terus.
  const clock = useSecondClock(mode === "delayed" || hasScheduled(photos, offset));
  const serverNow = clock + offset;
  const isScheduled = (p: StaffPhoto) => scheduledAt(p) > serverNow;

  const pending = photos.filter((p) => p.status === "pending" || isScheduled(p)).reverse();
  const onStage = photos.filter((p) => p.status === "approved" && !isScheduled(p)).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));
  const rejected = photos.filter((p) => p.status === "rejected");
  const approvable = pending.filter((p) => p.status === "pending");
  const activeUploaders = new Set(photos.filter((p) => Date.parse(p.created_at) > serverNow - ACTIVE_UPLOADER_MS).map((p) => p.guest_session_id)).size;

  async function moderate(photo: StaffPhoto, action: Action) {
    setBusy((s) => new Set(s).add(photo.id));
    const before = photo;
    const optimistic: StaffPhoto =
      action === "approve"
        ? { ...photo, status: "approved", visible_after: new Date(serverNow).toISOString() }
        : action === "reject"
          ? { ...photo, status: "rejected", is_pinned: false }
          : { ...photo, is_pinned: action === "pin" };
    setPhotos((list) => list.map((p) => (p.id === photo.id ? optimistic : p)));
    if (action === "approve" || action === "reject") setViewing(null);

    const { data, error } = await client.rpc("staff_moderate_photo", { p_photo_id: photo.id, p_action: action });
    if (error) {
      setPhotos((list) => list.map((p) => (p.id === photo.id ? before : p)));
      notify("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
    } else if (!(data as { ok: boolean }).ok) {
      // Aksi pertama yang tercatat yang berlaku (PRD §5.4); ambil keadaan terbarunya.
      await upsertFromServer(photo.id);
      notify("Foto ini sudah ditangani moderator lain.");
    }
    setBusy((s) => {
      const next = new Set(s);
      next.delete(photo.id);
      return next;
    });
  }

  async function approveAll() {
    const ids = approvable.map((p) => p.id);
    if (!window.confirm(`Setujui ${ids.length} foto sekaligus? Semuanya langsung tayang di layar panggung.`)) return;
    setBusy(new Set(ids));
    const { data, error } = await client.rpc("staff_approve_photos", { p_event_id: event.id, p_photo_ids: ids });
    if (error) {
      notify("Gagal menyetujui. Periksa koneksi lalu coba lagi.");
    } else {
      const visibleAfter = new Date(serverNow).toISOString();
      setPhotos((list) => list.map((p) => (ids.includes(p.id) && p.status === "pending" ? { ...p, status: "approved", visible_after: visibleAfter } : p)));
      notify(`${(data as { approved: number }).approved} foto disetujui.`);
    }
    setBusy(new Set());
  }

  async function toggleBlackout() {
    setBlackoutPending(true);
    const { data, error } = await client.rpc("staff_set_blackout", { p_event_id: event.id, p_on: !blackout });
    if (error) notify("Blackout gagal dikirim. Periksa koneksi lalu coba lagi.");
    else setBlackout((data as { stage_blackout: boolean }).stage_blackout);
    setBlackoutPending(false);
  }

  const closeViewer = useCallback(() => setViewing(null), []);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: event.timezone });
  const disabled = !online;
  const list = tab === "pending" ? pending : tab === "live" ? onStage : rejected;

  const scheduledIn = (p: StaffPhoto) => (isScheduled(p) ? Math.max(1, Math.ceil((Date.parse(p.visible_after!) - serverNow) / 1000)) : null);
  const actionsFor = (photo: StaffPhoto) =>
    photo.status === "rejected" ? null : (
      <PhotoActions photo={photo} busy={busy.has(photo.id) || disabled} scheduledIn={scheduledIn(photo)} onModerate={moderate} />
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">Konsol moderasi</p>
          </div>
          <p className="flex shrink-0 items-center gap-2 text-xs" aria-live="polite">
            <span aria-hidden className={`size-2.5 rounded-full ${online && live ? "bg-emerald-500" : online ? "bg-amber-500" : "bg-red-500"}`} />
            {online && live ? "Tersambung" : online ? "Menyambung..." : "Offline"}
          </p>
        </div>
        {blackout ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-red-700 px-3 py-2 text-white">
            <p className="text-sm font-medium">Layar panggung sedang blackout.</p>
            <Button type="button" variant="outline" className="h-11 shrink-0 text-foreground" disabled={blackoutPending || disabled} onClick={toggleBlackout}>
              {blackoutPending ? "Mengirim..." : "Tayangkan lagi"}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="destructive" className="h-11 w-full" disabled={blackoutPending || disabled} onClick={toggleBlackout}>
            {blackoutPending ? "Mengirim..." : "Blackout layar panggung"}
          </Button>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {!online && <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">Offline. Aksi moderasi dinonaktifkan sampai sinyal kembali.</p>}

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total foto" value={photos.filter((p) => p.status === "pending" || p.status === "approved").length} />
          <Stat label="Menunggu" value={pending.length} />
          <Stat label="Pengunggah aktif" value={activeUploaders} hint="30 menit terakhir" />
        </dl>
        <p className="text-sm text-muted-foreground">{MODE_LABEL[mode]}</p>

        <div role="tablist" aria-label="Status foto" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["pending", `Menunggu (${pending.length})`],
              ["live", `Tayang (${onStage.length})`],
              ["rejected", `Ditolak (${rejected.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-md px-2 text-sm font-medium ${tab === key ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "pending" && approvable.length > 1 && (
          <Button type="button" className="h-11" disabled={disabled || busy.size > 0} onClick={approveAll}>
            Setujui semua ({approvable.length})
          </Button>
        )}

        {loadState === "loading" && <p className="py-10 text-center text-sm text-muted-foreground">Memuat foto...</p>}
        {loadState === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm">Foto gagal dimuat.</p>
            <Button type="button" variant="outline" className="h-11" onClick={load}>
              Coba lagi
            </Button>
          </div>
        )}
        {loadState === "ready" && list.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {tab === "pending"
              ? mode === "instant"
                ? "Mode instan: foto tamu langsung tayang tanpa antrean. Turunkan foto dari tab Tayang bila perlu."
                : "Belum ada foto yang menunggu. Foto baru dari tamu muncul di sini otomatis."
              : tab === "live"
                ? "Belum ada foto yang tayang."
                : "Belum ada foto yang ditolak."}
          </p>
        )}

        {loadState === "ready" && list.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((photo) => {
              const actions = actionsFor(photo);
              return (
                <li key={photo.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setViewing(photo)}
                    className="relative block aspect-square w-full bg-muted"
                    aria-label={`Perbesar foto dari ${photo.uploader_name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2, bukan aset Next */}
                    {photo.thumb_url && <img src={photo.thumb_url} alt="" loading="lazy" className="size-full object-cover" />}
                    {photo.is_pinned && <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">Disematkan</span>}
                  </button>
                  <div className="flex flex-1 flex-col gap-0.5 p-2">
                    <p className="truncate text-sm font-medium">{photo.uploader_name}</p>
                    {photo.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{photo.caption}</p>}
                    <p className="text-xs text-muted-foreground">
                      {time(photo.created_at)}
                      {photo.over_quota && " · melebihi kuota"}
                    </p>
                  </div>
                  {actions && <div className="grid grid-cols-2 gap-1 p-2 pt-0">{actions}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {viewing && (
        <PhotoViewer
          photo={photos.find((p) => p.id === viewing.id) ?? viewing}
          access={access}
          time={time}
          actions={actionsFor(photos.find((p) => p.id === viewing.id) ?? viewing)}
          onClose={closeViewer}
        />
      )}

      <p aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4">
        {toast && <span className="rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{toast.text}</span>}
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-lg border bg-card px-2 py-3" title={hint}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

// Foto ukuran display untuk memeriksa detail sebelum menyetujui; URL diminta saat dibuka saja.
function PhotoViewer({
  photo,
  access,
  time,
  actions,
  onClose,
}: {
  photo: StaffPhoto;
  access: StaffAccess;
  time: (iso: string) => string;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStaffPhotos(access.client, access.event.id, { ids: [photo.id], variants: "display" })
      .then(({ photos }) => active && setUrl(photos[0]?.display_url ?? null))
      .catch(() => active && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [access, photo.id, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="viewer-title" className="fixed inset-0 z-20 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <h2 id="viewer-title" className="min-w-0 truncate font-semibold">
          {photo.uploader_name} · {time(photo.created_at)}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 px-3 font-medium" autoFocus>
          Tutup
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
        {url ? <img src={url} alt={photo.caption ?? `Foto dari ${photo.uploader_name}`} className="max-h-full max-w-full object-contain" /> : null}
        {!url && <p className="text-sm text-white/75">{failed ? "Foto gagal dimuat." : "Memuat foto..."}</p>}
      </div>
      {photo.caption && <p className="px-4 pt-2 text-sm text-white/85">{photo.caption}</p>}
      {actions && <div className="grid grid-cols-2 gap-2 p-4 text-foreground">{actions}</div>}
    </div>
  );
}

export function ModerationPage({ eventId }: { eventId: string }) {
  return <StaffGate eventId={eventId} role="moderator">{(access) => <ModerationConsole access={access} />}</StaffGate>;
}

function PhotoActions({
  photo,
  busy,
  scheduledIn,
  onModerate,
}: {
  photo: StaffPhoto;
  busy: boolean;
  scheduledIn: number | null;
  onModerate: (photo: StaffPhoto, action: Action) => void;
}) {
  if (photo.status === "pending") {
    return (
      <>
        <Button type="button" className="h-11" disabled={busy} onClick={() => onModerate(photo, "approve")}>
          Setujui
        </Button>
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => onModerate(photo, "reject")}>
          Tolak
        </Button>
      </>
    );
  }
  return (
    <>
      {scheduledIn !== null ? (
        <span className="flex h-11 items-center justify-center text-xs text-muted-foreground">Tayang {scheduledIn} dtk lagi</span>
      ) : (
        <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => onModerate(photo, photo.is_pinned ? "unpin" : "pin")}>
          {photo.is_pinned ? "Lepas sematan" : "Sematkan"}
        </Button>
      )}
      <Button type="button" variant="destructive" className="h-11" disabled={busy} onClick={() => onModerate(photo, "reject")}>
        {scheduledIn !== null ? "Tolak" : "Turunkan"}
      </Button>
    </>
  );
}

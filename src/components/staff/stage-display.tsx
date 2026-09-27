"use client";

import { Cormorant_Garamond } from "next/font/google";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QrCode } from "@/components/qr-code";
import { StaffGate } from "@/components/staff/staff-gate";
import { Wordmark } from "@/components/wordmark";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { fetchStaffPhotos, subscribeEvent, type StaffAccess } from "@/lib/staff/access";
import { useOnline } from "@/lib/staff/hooks";
import { POOL_LIMIT, StagePool, type PoolPhoto } from "@/lib/staff/stage-pool";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-cormorant" });

type Layout = "single" | "mosaic";
type Settings = { layout: Layout; seconds: number; showWishes: boolean };
type Wish = { id: string; author_name: string; message: string };
type Slide = { key: string; kind: "photo"; photo: PoolPhoto; fresh: boolean } | { key: string; kind: "wish"; wish: Wish };

const DEFAULT_SETTINGS: Settings = { layout: "single", seconds: 7, showWishes: true };
const SECONDS = [5, 6, 7, 8, 9, 10];
const MOSAIC_TILES = 6;
// Slide lama minimal tampil selama ini sebelum diganti foto baru, agar layar tidak berkedip.
const MIN_DWELL_MS = 1000;
// Saat foto baru berdatangan, tiap foto baru tetap tampil minimal 3 detik sebelum digeser foto baru berikutnya.
const FRESH_MIN_DWELL_MS = 3000;
const RESYNC_MS = 60_000;
const HEARTBEAT_MS = 60_000;
const PANEL_IDLE_MS = 3000;

function readSettings(eventId: string): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(`momenkita-stage:${eventId}`) ?? "{}") as Partial<Settings>;
    return {
      layout: saved.layout === "mosaic" ? "mosaic" : "single",
      seconds: SECONDS.includes(Number(saved.seconds)) ? Number(saved.seconds) : DEFAULT_SETTINGS.seconds,
      showWishes: saved.showWishes ?? DEFAULT_SETTINGS.showWishes,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const emptySlots = () => Array.from({ length: MOSAIC_TILES }, (): { slide: Slide | null; since: number } => ({ slide: null, since: 0 }));

// Decode lebih dulu agar transisi tidak berkedip; dibatasi 2 detik karena browser bisa menahan decode di tab yang tidak tampil.
function decodeImage(url: string) {
  const img = new Image();
  img.src = url;
  return Promise.race([img.decode().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 2000))]);
}

function subscribeFullscreen(callback: () => void) {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
}

export function StagePage({ eventId }: { eventId: string }) {
  return (
    <StaffGate eventId={eventId} role="stage" dark>
      {(access) => <StageDisplay access={access} />}
    </StaffGate>
  );
}

function StageDisplay({ access }: { access: StaffAccess }) {
  const { client, event } = access;
  const [first, second] = coupleNames(parseContent(event.theme_config));
  const couple = first.nickname && second.nickname ? `${first.nickname} & ${second.nickname}` : event.title;
  const cameraUrl = `${window.location.origin}/${event.slug}/kamera`;

  const [settings, setSettings] = useState(() => readSettings(event.id));
  const settingsRef = useRef(settings);
  const engineRef = useRef<{ changeLayout: (layout: Layout) => void } | null>(null);

  const [slides, setSlides] = useState<{ current: Slide | null; previous: Slide | null }>({ current: null, previous: null });
  const [tiles, setTiles] = useState<(Slide | null)[]>(() => Array(MOSAIC_TILES).fill(null));
  const [remoteBlackout, setRemoteBlackout] = useState(event.stage_blackout);
  const [localBlackout, setLocalBlackout] = useState(false);
  const [live, setLive] = useState(false);
  const online = useOnline();
  const [cached, setCached] = useState(0);
  const [panelVisible, setPanelVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem(`momenkita-stage:${event.id}`, JSON.stringify(settings));
    } catch {
      // Pengaturan hanya berlaku sampai halaman ditutup.
    }
  }, [settings, event.id]);

  // Mesin slideshow: berjalan di luar siklus render React; hasilnya dikirim ke layar lewat setSlides/setTiles.
  useEffect(() => {
    const pool = new StagePool();
    let offset = 0;
    let wishes: Wish[] = [];
    let wishIndex = 0;
    let current: Slide | null = null;
    let slots = emptySlots();
    let started = 0;
    let slideNumber = 0;
    let run = 0;
    let loading = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueAt = Infinity;
    let decoding = 0;
    let everLive = false;
    let realtimeLive = false;

    // Detak ke server untuk monitor Super Admin (PRD §5.7: status koneksi panggung). Gagal saat offline itu wajar.
    function heartbeat() {
      client
        .rpc("staff_stage_heartbeat", { p_event_id: event.id, p_realtime_live: realtimeLive, p_cached_photos: pool.cachedCount() })
        .then(
          () => {},
          () => {},
        );
    }

    function schedule(ms: number) {
      clearTimeout(timer);
      dueAt = Date.now() + ms;
      timer = setTimeout(advance, ms);
    }

    async function decode(url: string, thisRun: number) {
      decoding++;
      await decodeImage(url);
      decoding--;
      return thisRun === run;
    }

    async function advance() {
      clearTimeout(timer);
      dueAt = Infinity;
      const thisRun = ++run;
      const { layout, seconds, showWishes } = settingsRef.current;
      const n = ++slideNumber;

      if (layout === "mosaic") {
        const empty = slots.findIndex((t) => !t.slide);
        const slot = empty >= 0 ? empty : slots.reduce((oldest, t, i) => (t.since < slots[oldest].since ? i : oldest), 0);
        const exclude = new Set(slots.flatMap((t) => (t.slide?.kind === "photo" ? [t.slide.photo.id] : [])));
        const photo = pool.pick(n, exclude);
        if (photo) {
          if (!(await decode(photo.blobUrl!, thisRun))) return;
          const fresh = pool.isFresh(photo.id);
          pool.markShown(photo.id);
          const slide: Slide = { key: `p-${photo.id}-${n}`, kind: "photo", photo, fresh };
          slots = slots.map((t, i) => (i === slot ? { slide, since: Date.now() } : t));
          setTiles(slots.map((t) => t.slide));
        }
        started = Date.now();
        // Mosaik mengganti satu kotak per langkah; kotak kosong diisi cepat saat layar baru dibuka.
        const fillingUp = slots.some((t) => !t.slide) && pool.ready().length > exclude.size + 1;
        return schedule(fillingUp ? 400 : photo ? Math.max(2500, (seconds * 1000) / 2) : 2000);
      }

      let next: Slide | null = null;
      // Kartu ucapan hanya diselipkan di antara foto; tanpa foto, layar sambutan (QR besar) tetap tampil.
      if (showWishes && wishes.length && n % 5 === 0 && pool.ready().length > 0 && !pool.hasFreshReady()) {
        const wish = wishes[wishIndex++ % wishes.length];
        next = { key: `w-${wish.id}-${n}`, kind: "wish", wish };
      } else {
        const photo = pool.pick(n, new Set(current?.kind === "photo" ? [current.photo.id] : []));
        if (photo) {
          if (!(await decode(photo.blobUrl!, thisRun))) return;
          const fresh = pool.isFresh(photo.id);
          pool.markShown(photo.id);
          next = { key: `p-${photo.id}-${n}`, kind: "photo", photo, fresh };
        }
      }
      if (next) {
        const shown = next;
        current = shown;
        started = Date.now();
        setSlides((s) => ({ previous: s.current, current: shown }));
      }
      schedule(next || current ? seconds * 1000 : 2000);
    }

    // Foto baru yang siap tayang menggeser slide yang sedang tampil setelah jeda singkat (PRD §5.4: p95 <= 2 detik).
    // Layar yang masih kosong langsung diisi begitu ada foto yang selesai diunduh.
    function maybeInterrupt() {
      // Langkah yang sedang men-decode gambar jangan dimulai ulang, agar tidak saling membatalkan.
      if (decoding > 0) return;
      const single = settingsRef.current.layout === "single";
      const onScreen = new Set(slots.flatMap((t) => (t.slide?.kind === "photo" ? [t.slide.photo.id] : [])));
      const hasEmptySpot = single ? !current : onScreen.size < MOSAIC_TILES;
      const freshReady = pool.hasFreshReady();
      if (!freshReady && !(hasEmptySpot && pool.ready().some((p) => !onScreen.has(p.id)))) return;
      const dwell = single && current?.kind === "photo" && current.fresh ? FRESH_MIN_DWELL_MS : MIN_DWELL_MS;
      const wait = Math.max(0, dwell - (Date.now() - started));
      // Pemeriksaan berkala tidak boleh menunda slide yang memang sudah dijadwalkan lebih cepat.
      if (Date.now() + wait < dueAt) schedule(wait);
    }

    // File diunduh ke memori dua per dua, foto baru lebih dulu.
    function pump() {
      while (loading < 2 && navigator.onLine) {
        const target = pool.nextToLoad();
        if (!target) return;
        target.loading = true;
        loading++;
        const id = target.id;
        fetch(target.url!)
          .then((res) => {
            if (!res.ok) throw new Error(String(res.status));
            return res.blob();
          })
          .then((blob) => {
            const photo = pool.photos.get(id);
            if (!photo) return;
            photo.blobUrl = URL.createObjectURL(blob);
            setCached(pool.cachedCount());
            maybeInterrupt();
          })
          .catch(() => {
            const photo = pool.photos.get(id);
            if (photo) photo.failedAt = Date.now();
          })
          .finally(() => {
            const photo = pool.photos.get(id);
            if (photo) photo.loading = false;
            loading--;
            pump();
          });
      }
    }

    // Foto yang ditolak atau dihapus langsung turun dari layar (takedown), tanpa menunggu slide berikutnya.
    function removePhoto(id: string) {
      if (!pool.photos.has(id)) return;
      pool.remove(id);
      setCached(pool.cachedCount());
      const onSlide = (s: Slide | null) => s?.kind === "photo" && s.photo.id === id;
      if (settingsRef.current.layout === "mosaic") {
        if (slots.some((t) => onSlide(t.slide))) {
          slots = slots.map((t) => (onSlide(t.slide) ? { slide: null, since: 0 } : t));
          setTiles(slots.map((t) => t.slide));
          advance();
        }
      } else if (onSlide(current)) {
        current = null;
        setSlides({ current: null, previous: null });
        advance();
      } else {
        setSlides((s) => (onSlide(s.previous) ? { ...s, previous: null } : s));
      }
    }

    async function sync(initial: boolean) {
      try {
        const [result, wishRows] = await Promise.all([
          fetchStaffPhotos(client, event.id, { variants: "display", limit: POOL_LIMIT, status: "approved" }),
          client.rpc("staff_wishes", { p_event_id: event.id, p_limit: 100 }),
        ]);
        offset = result.serverTime - Date.now();
        const ids = new Set(result.photos.map((p) => p.id));
        for (const id of [...pool.photos.keys()]) if (!ids.has(id)) removePhoto(id);
        for (const photo of result.photos) pool.upsert(photo, offset, !initial);
        if (wishRows.data) wishes = wishRows.data;
        pump();
      } catch {
        // Offline: slideshow tetap berputar dari cache; dicoba lagi saat tersambung.
      }
    }

    engineRef.current = {
      changeLayout(layout) {
        settingsRef.current = { ...settingsRef.current, layout };
        current = null;
        slots = emptySlots();
        setSlides({ current: null, previous: null });
        setTiles(slots.map((t) => t.slide));
        advance();
      },
    };

    const boot = setTimeout(async () => {
      await sync(true);
      heartbeat();
      advance();
    }, 0);
    const unsubscribe = subscribeEvent(
      client,
      event.id,
      {
        photo: (p) => {
          if (p.status !== "approved") return removePhoto(p.id);
          const existing = pool.photos.get(p.id);
          if (existing) {
            pool.upsert({ ...p, display_url: existing.url }, offset, true);
            // Foto yang disematkan saat sedang tampil tidak perlu diganti lalu ditayangkan ulang.
            const showing = (s: Slide | null) => s?.kind === "photo" && s.photo.id === p.id;
            if (showing(current) || slots.some((t) => showing(t.slide))) pool.markShown(p.id);
            return maybeInterrupt();
          }
          fetchStaffPhotos(client, event.id, { ids: [p.id], variants: "display", status: "approved" })
            .then((result) => {
              offset = result.serverTime - Date.now();
              for (const photo of result.photos) pool.upsert(photo, offset, true);
              pump();
            })
            .catch(() => {
              // Terambil pada sinkron ulang berikutnya.
            });
        },
        stage: (s) => setRemoteBlackout(s.stage_blackout),
      },
      (isLive) => {
        setLive(isLive);
        if (isLive !== realtimeLive) {
          realtimeLive = isLive;
          heartbeat();
        }
        if (isLive && everLive) sync(false);
        if (isLive) everLive = true;
      },
    );
    const resync = setInterval(() => sync(false), RESYNC_MS);
    const beat = setInterval(heartbeat, HEARTBEAT_MS);
    // Mode jeda: foto baru boleh tayang setelah visible_after, jadi diperiksa berkala.
    const watcher = setInterval(maybeInterrupt, 500);
    const onOnline = () => sync(false);
    window.addEventListener("online", onOnline);

    return () => {
      run++;
      clearTimeout(boot);
      clearTimeout(timer);
      clearInterval(resync);
      clearInterval(beat);
      clearInterval(watcher);
      window.removeEventListener("online", onOnline);
      unsubscribe();
      engineRef.current = null;
      pool.clear();
    };
  }, [client, event.id]);

  // Laptop panggung tidak boleh tidur selama acara.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
      }
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => {});
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // B = blackout lokal (tanpa jaringan), F = layar penuh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea")) return;
      if (e.key === "b" || e.key === "B") setLocalBlackout((v) => !v);
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  // Panel operator muncul saat mouse bergerak atau saat difokus dengan Tab, lalu hilang sendiri agar tidak ikut tayang.
  // Selama fokus keyboard masih di dalam panel, panel tetap terlihat.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hideLater = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (panelRef.current?.contains(document.activeElement)) hideLater();
        else setPanelVisible(false);
      }, PANEL_IDLE_MS);
    };
    const show = () => {
      setPanelVisible(true);
      hideLater();
    };
    window.addEventListener("pointermove", show);
    window.addEventListener("pointerdown", show);
    window.addEventListener("focusin", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", show);
      window.removeEventListener("pointerdown", show);
      window.removeEventListener("focusin", show);
    };
  }, []);

  function changeLayout(layout: Layout) {
    if (layout === settings.layout) return;
    setSettings((s) => ({ ...s, layout }));
    engineRef.current?.changeLayout(layout);
  }

  const blackout = remoteBlackout || localBlackout;
  const empty = settings.layout === "single" ? !slides.current : tiles.every((t) => !t);

  return (
    <div className={`${display.variable} fixed inset-0 overflow-hidden bg-black text-white select-none ${panelVisible ? "" : "cursor-none"}`}>
      {settings.layout === "single" ? (
        <>
          {/* Keterangan slide lama disembunyikan agar tidak bertumpuk dengan keterangan baru selama crossfade. */}
          {slides.previous && <SlideView key={slides.previous.key} slide={slides.previous} caption={false} />}
          {slides.current && <SlideView key={slides.current.key} slide={slides.current} />}
        </>
      ) : (
        <div className="grid size-full grid-cols-3 grid-rows-2 gap-[0.4vw] bg-black p-[0.4vw]">
          {tiles.map((tile, i) => (
            <div key={i} className="relative overflow-hidden rounded-[0.4vw] bg-white/5">
              {tile?.kind === "photo" && <MosaicTile key={tile.key} photo={tile.photo} />}
            </div>
          ))}
        </div>
      )}

      {empty && <Welcome couple={couple} cameraUrl={cameraUrl} />}

      {!empty && (
        <div className="absolute right-[1.5vw] bottom-[1.5vw] flex w-[10vw] min-w-24 flex-col items-center gap-[0.4vw] rounded-[0.8vw] bg-white p-[0.6vw] text-center text-black shadow-2xl">
          <QrCode value={cameraUrl} label="QR kamera tamu" className="w-full" />
          <p className="text-[max(0.75vw,10px)] leading-tight font-semibold">Scan untuk ikut berbagi foto</p>
        </div>
      )}
      {/* Chip putih: wordmark dirancang untuk latar putih, dan tetap terbaca di atas foto gelap maupun kartu berlatar krem. */}
      <Wordmark className="absolute top-[1.2vw] right-[1.5vw] rounded-full bg-white/90 px-[0.8vw] py-[0.3vw] text-[max(1vw,12px)] text-stone-900" />

      {blackout && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[1vw] bg-black">
          <p className="font-display text-[5vw] font-semibold text-white/85">{couple}</p>
        </div>
      )}

      <div
        ref={panelRef}
        className={`absolute top-4 left-4 z-20 flex max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl bg-neutral-900/95 p-4 text-sm text-white shadow-2xl transition-opacity ${panelVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <p className="flex items-center gap-2">
          <span aria-hidden className={`size-2.5 rounded-full ${online && live ? "bg-emerald-500" : online ? "bg-amber-500" : "bg-red-500"}`} />
          {online && live ? "Tersambung" : online ? "Menyambung ulang..." : "Offline, memutar dari cache"} · {cached} foto tersimpan
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/75">Tata letak</span>
          {(["single", "mosaic"] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              onClick={() => changeLayout(layout)}
              aria-pressed={settings.layout === layout}
              className={`min-h-11 rounded-lg px-3 ${settings.layout === layout ? "bg-white text-black" : "bg-white/10"}`}
            >
              {layout === "single" ? "Tunggal" : "Mosaik"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-white/75">Durasi per foto</span>
          <select
            value={settings.seconds}
            onChange={(e) => setSettings((s) => ({ ...s, seconds: Number(e.target.value) }))}
            className="min-h-11 rounded-lg bg-white/10 px-2"
          >
            {SECONDS.map((s) => (
              <option key={s} value={s} className="text-black">
                {s} detik
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={settings.showWishes}
            onChange={(e) => setSettings((s) => ({ ...s, showWishes: e.target.checked }))}
            className="size-5"
          />
          Selipkan kartu ucapan tamu (mode tunggal)
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={toggleFullscreen} className="min-h-11 rounded-lg bg-white/10 px-3">
            {fullscreen ? "Keluar layar penuh (F)" : "Layar penuh (F)"}
          </button>
          <button
            type="button"
            onClick={() => setLocalBlackout((v) => !v)}
            className={`min-h-11 rounded-lg px-3 ${localBlackout ? "bg-red-600" : "bg-white/10"}`}
          >
            {localBlackout ? "Matikan blackout (B)" : "Blackout (B)"}
          </button>
        </div>
        {remoteBlackout && <p className="text-amber-300">Blackout aktif dari konsol moderasi.</p>}
      </div>
    </div>
  );
}

function SlideView({ slide, caption = true }: { slide: Slide; caption?: boolean }) {
  if (slide.kind === "wish") {
    return (
      <div className="theme-klasik absolute inset-0 flex animate-in items-center justify-center bg-(--inv-bg) p-[6vw] text-(--inv-text) duration-1000 fade-in">
        <figure className="flex max-w-[70vw] flex-col items-center gap-[2vw] text-center">
          <p className="font-display text-[2vw] text-(--inv-accent) italic">Ucapan dan doa</p>
          <blockquote className="line-clamp-6 font-display text-[3.2vw] leading-snug italic">&ldquo;{slide.wish.message}&rdquo;</blockquote>
          <figcaption className="text-[1.8vw] font-semibold">{slide.wish.author_name}</figcaption>
        </figure>
      </div>
    );
  }
  const { photo } = slide;
  return (
    <div className="absolute inset-0 animate-in duration-1000 fade-in">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob lokal */}
      <img src={photo.blobUrl} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-2xl brightness-50" />
      {/* eslint-disable-next-line @next/next/no-img-element -- blob lokal */}
      <img src={photo.blobUrl} alt={photo.caption ?? `Foto dari ${photo.uploaderName}`} className="absolute inset-0 size-full object-contain" />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-[2vw] pt-[6vw] pb-[1.5vw]">
          <div className="max-w-[70vw]">
            <p className="text-[1.8vw] font-semibold">{photo.uploaderName}</p>
            {photo.caption && <p className="line-clamp-2 text-[1.4vw] text-white/90">{photo.caption}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function MosaicTile({ photo }: { photo: PoolPhoto }) {
  return (
    <div className="absolute inset-0 animate-in duration-1000 fade-in">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob lokal */}
      <img src={photo.blobUrl} alt={photo.caption ?? `Foto dari ${photo.uploaderName}`} className="size-full object-cover" />
      <p className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-[0.8vw] pt-[2vw] pb-[0.6vw] text-[1vw] font-semibold">
        {photo.uploaderName}
      </p>
    </div>
  );
}

function Welcome({ couple, cameraUrl }: { couple: string; cameraUrl: string }) {
  return (
    <div className="theme-klasik absolute inset-0 flex flex-col items-center justify-center gap-[2vw] bg-(--inv-bg) p-[4vw] text-center text-(--inv-text)">
      <p className="font-display text-[2vw] text-(--inv-accent) italic">Kamera tamu</p>
      <h1 className="font-display text-[5.5vw] leading-none font-semibold">{couple}</h1>
      <div className="w-[16vw] min-w-40 rounded-[1vw] bg-white p-[1vw] shadow-lg">
        <QrCode value={cameraUrl} label="QR kamera tamu" className="w-full" />
      </div>
      <p className="max-w-[50vw] text-[1.6vw]">Scan dengan kamera HP untuk berbagi foto ke layar ini. Tanpa aplikasi, tanpa daftar.</p>
    </div>
  );
}

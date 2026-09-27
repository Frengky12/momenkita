import type { StaffPhoto } from "./access";

// Kumpulan foto layar panggung beserta file-nya di memori browser (blob), agar slideshow tetap berputar
// saat jaringan putus (PRD §5.4). Maksimal 200 foto terbaru; foto tertua yang tidak disematkan dilepas lebih dulu.

export const POOL_LIMIT = 200;
const RETRY_FAILED_MS = 30_000;

export type PoolPhoto = {
  id: string;
  uploaderName: string;
  caption: string | null;
  isPinned: boolean;
  createdAt: number;
  // Waktu lokal kapan foto boleh tayang (visible_after dikoreksi selisih jam server).
  visibleAt: number;
  url: string | null;
  blobUrl?: string;
  loading?: boolean;
  failedAt?: number;
};

export class StagePool {
  photos = new Map<string, PoolPhoto>();
  private shownAt = new Map<string, number>();

  upsert(photo: Pick<StaffPhoto, "id" | "uploader_name" | "caption" | "is_pinned" | "created_at" | "visible_after" | "display_url">, offset: number, isNew: boolean) {
    const existing = this.photos.get(photo.id);
    const next: PoolPhoto = {
      id: photo.id,
      uploaderName: photo.uploader_name,
      caption: photo.caption,
      isPinned: photo.is_pinned,
      createdAt: Date.parse(photo.created_at),
      visibleAt: photo.visible_after ? Date.parse(photo.visible_after) - offset : 0,
      url: photo.display_url ?? existing?.url ?? null,
      blobUrl: existing?.blobUrl,
      loading: existing?.loading,
      // URL baru (hasil sinkron ulang) boleh langsung dicoba lagi.
      failedAt: photo.display_url && photo.display_url !== existing?.url ? undefined : existing?.failedAt,
    };
    this.photos.set(photo.id, next);
    // Foto yang sudah ada saat layar dibuka masuk rotasi; foto yang datang sesudahnya didahulukan.
    if (!existing && !isNew) this.shownAt.set(photo.id, 0);
    // Baru disematkan: tayangkan lagi secepatnya.
    if (existing && !existing.isPinned && next.isPinned) this.shownAt.delete(photo.id);
    this.trim();
    return next;
  }

  remove(id: string) {
    const blobUrl = this.photos.get(id)?.blobUrl;
    // Dilepas sedikit belakangan: foto itu mungkin masih ada di layar sampai slide berganti.
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    this.photos.delete(id);
    this.shownAt.delete(id);
  }

  private trim() {
    if (this.photos.size <= POOL_LIMIT) return;
    const removable = [...this.photos.values()].filter((p) => !p.isPinned).sort((a, b) => a.createdAt - b.createdAt);
    for (const p of removable.slice(0, this.photos.size - POOL_LIMIT)) this.remove(p.id);
  }

  isFresh(id: string) {
    return this.photos.has(id) && !this.shownAt.has(id);
  }

  markShown(id: string) {
    this.shownAt.set(id, Date.now());
  }

  ready(now = Date.now()) {
    return [...this.photos.values()].filter((p) => p.blobUrl && p.visibleAt <= now);
  }

  hasFreshReady() {
    return this.ready().some((p) => !this.shownAt.has(p.id));
  }

  // Urutan tayang (PRD §5.4): foto baru lebih dulu (yang disematkan, lalu yang paling lama menunggu),
  // foto sematan diselipkan setiap 4 slide, sisanya rotasi foto yang paling lama tidak tampil.
  pick(slideNumber: number, excludeIds: ReadonlySet<string>) {
    const ready = this.ready().filter((p) => !excludeIds.has(p.id));
    if (!ready.length) return null;
    const fresh = ready.filter((p) => !this.shownAt.has(p.id)).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.createdAt - b.createdAt);
    if (fresh.length) return fresh[0];
    const lastShown = (p: PoolPhoto) => this.shownAt.get(p.id) ?? 0;
    const pinned = ready.filter((p) => p.isPinned);
    if (pinned.length && slideNumber % 4 === 0) return pinned.sort((a, b) => lastShown(a) - lastShown(b))[0];
    return ready.sort((a, b) => lastShown(a) - lastShown(b))[0];
  }

  // File yang belum ada di memori: foto baru dulu, lalu yang terbaru.
  nextToLoad() {
    const now = Date.now();
    return [...this.photos.values()]
      .filter((p) => !p.blobUrl && !p.loading && p.url && !(p.failedAt && now - p.failedAt < RETRY_FAILED_MS))
      .sort((a, b) => Number(this.shownAt.has(a.id)) - Number(this.shownAt.has(b.id)) || b.createdAt - a.createdAt)[0];
  }

  cachedCount() {
    let n = 0;
    for (const p of this.photos.values()) if (p.blobUrl) n++;
    return n;
  }

  clear() {
    for (const id of [...this.photos.keys()]) this.remove(id);
  }
}

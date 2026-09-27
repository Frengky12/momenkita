// Dipakai server dan dashboard; batas galeri sama dengan trigger limit_invitation_gallery.
export const GALLERY_MAX = 12;

export const MEDIA_KINDS = {
  cover: { label: "Foto sampul", hint: "Tampil penuh di halaman pertama. Foto mendatar atau tegak sama-sama bisa." },
  groom: { label: "Foto mempelai pria", hint: "Potret setengah badan atau wajah." },
  bride: { label: "Foto mempelai wanita", hint: "Potret setengah badan atau wajah." },
  gallery: { label: "Galeri prewedding", hint: `Maksimal ${GALLERY_MAX} foto.` },
  qris: { label: "Gambar QRIS amplop digital", hint: "Tangkapan layar atau foto kode QRIS. Tampil di bagian amplop digital." },
  music: { label: "Musik latar", hint: "Satu lagu MP3, M4A, atau AAC, maksimal 8 MB. Mulai diputar saat tamu menekan Buka undangan." },
} as const;

// Audio tidak dikompres di browser; file diunggah apa adanya dalam batas ini.
export const MUSIC_MAX_BYTES = 8 * 1024 * 1024;
export const MUSIC_TYPES = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac" } as const;
export type MusicType = keyof typeof MUSIC_TYPES;

export function isMusicType(value: unknown): value is MusicType {
  return typeof value === "string" && value in MUSIC_TYPES;
}

// Browser melaporkan tipe M4A berbeda-beda (audio/x-m4a di Chrome Windows), jadi ekstensi file ikut dipakai.
export function musicTypeOf(file: { name: string; type: string }): MusicType | null {
  if (isMusicType(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || file.type === "audio/x-m4a") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  return null;
}

export type MediaKind = keyof typeof MEDIA_KINDS;

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && value in MEDIA_KINDS;
}

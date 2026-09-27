// Dipakai server dan dashboard; batas galeri sama dengan trigger limit_invitation_gallery.
export const GALLERY_MAX = 12;

export const MEDIA_KINDS = {
  cover: { label: "Foto sampul", hint: "Tampil penuh di halaman pertama. Foto mendatar atau tegak sama-sama bisa." },
  groom: { label: "Foto mempelai pria", hint: "Potret setengah badan atau wajah." },
  bride: { label: "Foto mempelai wanita", hint: "Potret setengah badan atau wajah." },
  gallery: { label: "Galeri prewedding", hint: `Maksimal ${GALLERY_MAX} foto.` },
  qris: { label: "Gambar QRIS amplop digital", hint: "Tangkapan layar atau foto kode QRIS. Tampil di bagian amplop digital." },
} as const;

export type MediaKind = keyof typeof MEDIA_KINDS;

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && value in MEDIA_KINDS;
}

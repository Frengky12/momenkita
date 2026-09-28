import { processPhoto } from "@/lib/camera/processor";
import type { MediaKind } from "@/lib/invitation/media-kinds";
import type { DisplayType } from "@/lib/uploads";
import { prepareMediaUpload } from "./media-actions";

type Result = { ok: true } | { ok: false; message: string };
type Confirm = (mediaId: string, format: DisplayType, dimensions: { width: number; height: number }) => Promise<Result>;

// Foto dikompres di browser dengan pipeline yang sama dengan kamera tamu (putar EXIF, WebP/JPEG, ≤ 400 KB),
// lalu diunggah langsung ke R2 lewat URL bertanda tangan. Server tidak pernah menerima file mentah.
// confirm mencatat foto setelah kedua file ada di R2 (galeri/sampul lewat confirmMediaUpload, bab lewat confirmStoryPhoto).
export async function uploadPhoto(
  eventId: string,
  kind: Exclude<MediaKind, "music">,
  file: File,
  onStep: (step: "process" | "upload") => void,
  confirm: Confirm,
): Promise<Result> {
  try {
    onStep("process");
    const out = await processPhoto({ source: file, filter: "asli", wantOriginal: false });
    onStep("upload");
    const prepared = await prepareMediaUpload(eventId, kind, out.format, { display: out.display.size, thumb: out.thumb.size });
    if (!prepared.ok) return prepared;
    const puts = await Promise.all([
      fetch(prepared.displayUrl, { method: "PUT", headers: { "Content-Type": out.format }, body: out.display }),
      fetch(prepared.thumbUrl, { method: "PUT", headers: { "Content-Type": out.format }, body: out.thumb }),
    ]);
    if (puts.some((r) => !r.ok)) return { ok: false, message: "Unggahan gagal. Periksa koneksi lalu coba lagi." };
    return await confirm(prepared.mediaId, out.format, { width: out.width, height: out.height });
  } catch {
    return { ok: false, message: "Foto tidak bisa dibaca. Pilih file gambar JPG, PNG, WebP, atau HEIC." };
  }
}

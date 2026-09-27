import { applyMatrix, filterMatrix, type FilterId } from "./filters";

// Batas mengikuti validasi server (src/lib/uploads.ts) dan PRD §5.3.
const DISPLAY_MAX_SIDE = 1920;
const THUMB_MAX_SIDE = 480;
const DISPLAY_MAX_BYTES = 409_600;
const THUMB_MAX_BYTES = 153_600;
const ORIGINAL_MAX_BYTES = 10 * 1024 * 1024;
const ORIGINAL_TYPES = ["image/jpeg", "image/heic", "image/heif", "image/png", "image/webp"];

export type DisplayFormat = "image/webp" | "image/jpeg";

export type ProcessInput = { source: Blob | ImageBitmap; filter: FilterId; wantOriginal: boolean };

export type ProcessOutput = {
  display: Blob;
  thumb: Blob;
  format: DisplayFormat;
  width: number;
  height: number;
  original?: Blob;
  originalType?: string;
};

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: Canvas) {
  return canvas.getContext("2d") as Context;
}

function encode(canvas: Canvas, type: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode gagal"))), type, quality),
  );
}

// Safari mengembalikan PNG saat diminta WebP; hasil encode dicek, bukan diasumsikan.
let webpSupported: boolean | undefined;
async function displayFormat(): Promise<DisplayFormat> {
  if (webpSupported === undefined) {
    const probe = makeCanvas(2, 2);
    context(probe).fillRect(0, 0, 2, 2);
    webpSupported = (await encode(probe, "image/webp", 0.8)).type === "image/webp";
  }
  return webpSupported ? "image/webp" : "image/jpeg";
}

function draw(source: CanvasImageSource & { width: number; height: number }, maxSide: number, matrix: number[][] | null) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = makeCanvas(Math.round(source.width * scale), Math.round(source.height * scale));
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (matrix) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyMatrix(image.data, matrix);
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

// Kualitas diturunkan bertahap; bila tetap terlalu besar, dimensi diperkecil 20% lalu diulang.
async function encodeUnder(canvas: Canvas, type: string, maxBytes: number, qualities: number[]): Promise<{ blob: Blob; canvas: Canvas }> {
  for (const quality of qualities) {
    const blob = await encode(canvas, type, quality);
    if (blob.size <= maxBytes) return { blob, canvas };
  }
  if (canvas.width < 200) throw new Error("Gambar tidak bisa diperkecil di bawah batas ukuran");
  const smaller = makeCanvas(Math.round(canvas.width * 0.8), Math.round(canvas.height * 0.8));
  context(smaller).drawImage(canvas, 0, 0, smaller.width, smaller.height);
  return encodeUnder(smaller, type, maxBytes, qualities);
}

export async function processImage({ source, filter, wantOriginal }: ProcessInput): Promise<ProcessOutput> {
  // createImageBitmap memutar gambar sesuai EXIF, jadi foto HP tidak tampil miring.
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  try {
    const format = await displayFormat();
    const display = await encodeUnder(draw(bitmap, DISPLAY_MAX_SIDE, filterMatrix(filter)), format, DISPLAY_MAX_BYTES, [0.85, 0.75, 0.65, 0.55]);
    const thumb = await encodeUnder(draw(display.canvas as CanvasImageSource & Canvas, THUMB_MAX_SIDE, null), format, THUMB_MAX_BYTES, [0.75, 0.6]);

    const out: ProcessOutput = { display: display.blob, thumb: thumb.blob, format, width: display.canvas.width, height: display.canvas.height };

    // File asli (Luxury) tanpa filter. File dari kamera HP dipakai apa adanya bila sudah memenuhi batas.
    if (wantOriginal) {
      if (source instanceof Blob && ORIGINAL_TYPES.includes(source.type) && source.size <= ORIGINAL_MAX_BYTES) {
        out.original = source;
        out.originalType = source.type;
      } else {
        const full = await encodeUnder(draw(bitmap, Number.MAX_SAFE_INTEGER, null), "image/jpeg", ORIGINAL_MAX_BYTES, [0.92, 0.85, 0.75]);
        out.original = full.blob;
        out.originalType = "image/jpeg";
      }
    }
    return out;
  } finally {
    bitmap.close();
  }
}

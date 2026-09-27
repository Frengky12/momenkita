import type { ProcessInput, ProcessOutput } from "./process";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (o: ProcessOutput) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./process.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; output?: ProcessOutput; error?: string }>) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.output) job?.resolve(e.data.output);
      else job?.reject(new Error(e.data.error ?? "Gagal memproses foto"));
    };
  }
  return worker;
}

// Worker (dimuat saat foto pertama) menjaga viewfinder tetap mulus; browser tanpa OffscreenCanvas memproses di thread utama.
export async function processPhoto(input: ProcessInput): Promise<ProcessOutput> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    const { processImage } = await import("./process");
    return processImage(input);
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const transfer = typeof ImageBitmap !== "undefined" && input.source instanceof ImageBitmap ? [input.source] : [];
    getWorker().postMessage({ id, input }, transfer);
  });
}

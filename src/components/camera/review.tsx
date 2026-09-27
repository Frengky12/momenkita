"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProcessOutput } from "@/lib/camera/process";

export function Review({
  output,
  curated,
  onSend,
  onRetake,
}: {
  output: ProcessOutput;
  curated: boolean;
  onSend: (caption: string) => void;
  onRetake: () => void;
}) {
  const [caption, setCaption] = useState("");
  const url = useMemo(() => URL.createObjectURL(output.display), [output.display]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL lokal, bukan aset yang bisa dioptimasi next/image */}
      <img src={url} alt="Pratinjau foto yang akan dikirim" className="min-h-0 flex-1 object-contain" />
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(caption.trim());
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          Tulis pesan singkat (opsional)
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            className="h-11 rounded-lg border border-white/40 bg-white/10 px-3 text-base text-white placeholder:text-white/60 focus-visible:outline-2 focus-visible:outline-white"
            placeholder="Selamat menempuh hidup baru!"
          />
        </label>
        {curated && <p className="text-xs text-white/75">Foto tampil di layar setelah disetujui panitia.</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onRetake} className="min-h-11 rounded-full border border-white/60 font-medium">
            Ulangi
          </button>
          <button type="submit" className="min-h-11 rounded-full bg-[#c9a86a] font-semibold text-[#3b2a1e]">
            Kirim
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

const UNITS = [
  { label: "Hari", ms: 86_400_000 },
  { label: "Jam", ms: 3_600_000 },
  { label: "Menit", ms: 60_000 },
  { label: "Detik", ms: 1_000 },
];

export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  // null sampai terpasang di browser, agar angka server dan klien tidak berbeda saat hidrasi.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (now === null) return <div className="h-20" aria-hidden />;

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= end) return null;
  if (now >= start) return <p className="font-display text-2xl text-(--inv-accent)">Acara sedang berlangsung</p>;

  const diff = start - now;
  // Setiap satuan = sisa dari satuan di atasnya; hari tidak dibatasi.
  const parts = UNITS.map((unit, i) => ({
    ...unit,
    value: Math.floor((i === 0 ? diff : diff % UNITS[i - 1].ms) / unit.ms),
  }));

  return (
    <div className="grid w-full max-w-sm grid-cols-4 gap-2" role="timer" aria-label="Hitung mundur menuju acara">
      {parts.map((part) => (
        <div key={part.label} className="flex flex-col items-center rounded-lg border border-(--inv-line) bg-(--inv-card) py-3">
          <span className="font-display text-3xl font-semibold tabular-nums">{part.value}</span>
          <span className="text-xs text-(--inv-muted)">{part.label}</span>
        </div>
      ))}
    </div>
  );
}

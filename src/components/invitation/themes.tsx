import { Cormorant_Garamond, DM_Sans, Italiana } from "next/font/google";
import type { ThemeId } from "@/lib/invitation/content";

// Satu kerangka undangan, banyak tema (PRD §5.1, docs/DESIGN_UNDANGAN.md): tema hanya menentukan huruf, token warna
// (.theme-* di globals.css), bentuk bingkai foto, dan ornamen. Urutan dan isi bagian sama untuk semua tema.

// Klasik adalah tema bawaan sehingga hurufnya di-preload; huruf tema lain dimuat saat dipakai (swap) agar undangan
// bertema Klasik tidak ikut mengunduh huruf yang tidak dipakainya.
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const italiana = Italiana({ subsets: ["latin"], weight: "400", variable: "--font-italiana", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", preload: false });

export type ThemeStyle = {
  rootClass: string;
  // Label kecil di atas nama pada sampul ("Undangan Pernikahan").
  coverLabel: string;
  photoFrame: "circle" | "arch";
  CoverDecor: (() => React.ReactNode) | null;
  Divider: () => React.ReactNode;
};

export const THEME_STYLES: Record<ThemeId, ThemeStyle> = {
  klasik: {
    rootClass: `theme-klasik ${cormorant.variable}`,
    coverLabel: "font-display text-xl italic text-(--inv-accent)",
    photoFrame: "circle",
    CoverDecor: null,
    Divider: KlasikDivider,
  },
  botani: {
    rootClass: `theme-botani ${cormorant.variable} ${italiana.variable} ${dmSans.variable}`,
    // Huruf kapital berjarak muncul di 3 dari 4 referensi sebagai penanda undangan cetak.
    coverLabel: "text-sm font-medium tracking-[0.3em] text-(--inv-muted) uppercase",
    photoFrame: "arch",
    CoverDecor: BotaniCoverDecor,
    Divider: BotaniDivider,
  },
};

function KlasikDivider() {
  return (
    <div className="flex items-center gap-3 text-(--inv-ornament)" aria-hidden>
      <span className="h-px w-16 bg-current" />
      <span>✦</span>
      <span className="h-px w-16 bg-current" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Ornamen Botani: line-art dengan isian pucat. Daun ditempatkan di sepanjang kurva Bézier tangkai, bergantian kiri
// dan kanan, dengan sudut mengikuti arah tangkai, sehingga ranting terlihat tumbuh alami tanpa aset gambar.

type Point = { x: number; y: number };
type Curve = [Point, Point, Point, Point];

function bezier([p0, p1, p2, p3]: Curve, t: number): Point & { angle: number } {
  const u = 1 - t;
  const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
  const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
  const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const LEAF = "M0 0 C9 -10 27 -10 36 0 C27 10 9 10 0 0 Z";

function Leaf({ x, y, angle, scale = 1 }: { x: number; y: number; angle: number; scale?: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${scale})`}>
      <path d={LEAF} fill="var(--inv-leaf-fill)" stroke="var(--inv-leaf)" strokeWidth={1.1} />
      <path d="M3 0 C12 -1 24 -1 33 0" fill="none" stroke="var(--inv-leaf)" strokeWidth={0.8} />
    </g>
  );
}

function Bloom({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d="M0 -3 C-7 -8 -7 -17 0 -20 C7 -17 7 -8 0 -3 Z"
          fill="var(--inv-bloom-fill)"
          stroke="var(--inv-bloom)"
          strokeWidth={1}
        />
      ))}
      <circle r={2.6} fill="var(--inv-bloom)" />
    </g>
  );
}

// Ranting dari sudut kiri atas menjulur ke kanan bawah; diputar untuk sudut lain.
function Sprig() {
  const stem: Curve = [
    { x: 0, y: 0 },
    { x: 55, y: 30 },
    { x: 95, y: 85 },
    { x: 190, y: 150 },
  ];
  // Cabang samping dari tengah tangkai agar ranting terlihat rimbun seperti referensi.
  const branch: Curve = [bezier(stem, 0.45), { x: 120, y: 60 }, { x: 150, y: 40 }, { x: 200, y: 30 }];
  const along = (curve: Curve, ts: number[], base: number, shrink: number) =>
    ts.map((t, i) => {
      const p = bezier(curve, t);
      const side = i % 2 === 0 ? -1 : 1;
      return <Leaf key={`${curve[3].x}-${t}`} x={p.x} y={p.y} angle={p.angle + side * 40} scale={base - t * shrink} />;
    });
  const path = (c: Curve) => `M${c[0].x} ${c[0].y} C${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`;
  return (
    <svg viewBox="-20 -20 240 210" className="h-full w-full overflow-visible" aria-hidden>
      <path d={path(stem)} fill="none" stroke="var(--inv-leaf)" strokeWidth={1.5} strokeLinecap="round" />
      <path d={path(branch)} fill="none" stroke="var(--inv-leaf)" strokeWidth={1.2} strokeLinecap="round" />
      {along(stem, [0.08, 0.16, 0.24, 0.33, 0.42, 0.52, 0.61, 0.7, 0.79, 0.88, 0.95], 1.55, 0.7)}
      {along(branch, [0.3, 0.55, 0.8, 0.97], 1.1, 0.4)}
      <Bloom x={60} y={48} size={1.45} />
      <Bloom x={112} y={100} size={1.2} />
      <Bloom x={24} y={10} size={1} />
      <Bloom x={186} y={146} size={1.05} />
      <Bloom x={176} y={38} size={0.8} />
    </svg>
  );
}

function BloomCluster() {
  return (
    <svg viewBox="-10 -10 170 150" className="h-full w-full overflow-visible" aria-hidden>
      <Leaf x={20} y={70} angle={-150} scale={1.1} />
      <Leaf x={60} y={110} angle={120} scale={1} />
      <Leaf x={110} y={40} angle={-40} scale={0.9} />
      <Bloom x={60} y={60} size={1.4} />
      <Bloom x={105} y={85} size={1.1} />
      <Bloom x={95} y={30} size={0.8} />
      <Bloom x={30} y={105} size={0.75} />
    </svg>
  );
}

// Garis geometris tembaga tipis seperti bingkai di referensi 1.
function CornerLines() {
  return (
    <svg viewBox="0 0 220 220" className="h-full w-full" aria-hidden>
      <g fill="none" stroke="var(--inv-ornament)" strokeWidth={1.4}>
        <path d="M0 60 L150 220" />
        <path d="M0 150 L220 205" />
      </g>
    </svg>
  );
}

function BotaniCoverDecor() {
  const box = "pointer-events-none absolute";
  return (
    <>
      <div className={`${box} -top-6 -left-8 size-[clamp(180px,58vw,300px)]`}>
        <Sprig />
      </div>
      <div className={`${box} -top-4 -right-6 size-[clamp(130px,40vw,220px)] opacity-80`}>
        <BloomCluster />
      </div>
      <div className={`${box} -right-14 -bottom-20 size-[clamp(160px,50vw,280px)] rotate-180`}>
        <Sprig />
      </div>
      <div className={`${box} bottom-0 left-0 size-[clamp(120px,36vw,220px)]`}>
        <CornerLines />
      </div>
      <div className={`${box} top-0 right-0 size-[clamp(120px,36vw,220px)] rotate-180`}>
        <CornerLines />
      </div>
    </>
  );
}

function BotaniDivider() {
  return (
    <svg viewBox="0 0 120 24" className="h-6 w-28" aria-hidden>
      <path d="M8 12 H48 M72 12 H112" stroke="var(--inv-ornament)" strokeWidth={1} />
      <Leaf x={60} y={12} angle={-150} scale={0.45} />
      <Leaf x={60} y={12} angle={-30} scale={0.45} />
      <circle cx={60} cy={12} r={2.2} fill="var(--inv-bloom)" />
    </svg>
  );
}

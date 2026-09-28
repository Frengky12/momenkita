import { Cormorant_Garamond, DM_Sans, Italiana, Playfair_Display } from "next/font/google";
import type { ThemeId } from "@/lib/invitation/content";

// Satu kerangka undangan, banyak tema (PRD §5.1, docs/DESIGN_UNDANGAN.md): tema hanya menentukan huruf, token warna
// (.theme-* di globals.css), bentuk bingkai foto, dan ornamen. Urutan dan isi bagian sama untuk semua tema.

// Klasik adalah tema bawaan sehingga hurufnya di-preload; huruf tema lain dimuat saat dipakai (swap) agar undangan
// bertema Klasik tidak ikut mengunduh huruf yang tidak dipakainya.
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const italiana = Italiana({ subsets: ["latin"], weight: "400", variable: "--font-italiana", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", preload: false });

export type ThemeStyle = {
  rootClass: string;
  // Label kecil di atas nama pada sampul ("Undangan Pernikahan").
  coverLabel: string;
  photoFrame: "circle" | "arch";
  CoverDecor: (() => React.ReactNode) | null;
  // Ornamen yang menempel pada foto sampul berbingkai (bukan pada layar), misalnya gunungan di kiri-kanan foto.
  PhotoDecor: (() => React.ReactNode) | null;
  Divider: () => React.ReactNode;
};

export const THEME_STYLES: Record<ThemeId, ThemeStyle> = {
  klasik: {
    rootClass: `theme-klasik ${cormorant.variable}`,
    coverLabel: "font-display text-xl italic text-(--inv-accent)",
    photoFrame: "circle",
    CoverDecor: null,
    PhotoDecor: null,
    Divider: KlasikDivider,
  },
  botani: {
    rootClass: `theme-botani ${cormorant.variable} ${italiana.variable} ${dmSans.variable}`,
    // Huruf kapital berjarak muncul di 3 dari 4 referensi sebagai penanda undangan cetak.
    coverLabel: "text-sm font-medium tracking-[0.3em] text-(--inv-muted) uppercase",
    photoFrame: "arch",
    CoverDecor: BotaniCoverDecor,
    PhotoDecor: null,
    Divider: BotaniDivider,
  },
  adat: {
    rootClass: `theme-adat ${cormorant.variable} ${playfair.variable} ${dmSans.variable}`,
    coverLabel: "text-sm font-medium tracking-[0.3em] text-(--inv-muted) uppercase",
    photoFrame: "arch",
    CoverDecor: AdatCoverDecor,
    PhotoDecor: AdatPhotoDecor,
    Divider: AdatDivider,
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

// ---------------------------------------------------------------------------------------------------------------
// Ornamen Adat Jawa (referensi ke-5): pita batik kawung, gunungan wayang, dan melati. Semua line-art buatan sendiri.

// Satu bunga kawung: empat kelopak lonjong menghadap titik tengah.
function Kawung({ x, y, r = 10 }: { x: number; y: number; r?: number }) {
  const d = r * 0.7;
  const petals: [number, number, number][] = [
    [-d, -d, 45],
    [d, -d, -45],
    [-d, d, -45],
    [d, d, 45],
  ];
  return (
    <g fill="var(--inv-leaf-fill)" stroke="var(--inv-ornament)" strokeWidth={0.9}>
      {petals.map(([dx, dy, a]) => (
        <ellipse key={`${dx}-${dy}`} cx={x + dx} cy={y + dy} rx={r} ry={r * 0.52} transform={`rotate(${a} ${x + dx} ${y + dy})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.18} fill="var(--inv-ornament)" stroke="none" />
    </g>
  );
}

// Pita batik di tepi sampul: deretan kawung di antara dua garis.
function BatikStrip({ id }: { id: string }) {
  return (
    <svg className="h-9 w-full" aria-hidden>
      <defs>
        <pattern id={id} width="30" height="36" patternUnits="userSpaceOnUse">
          <Kawung x={15} y={18} r={7} />
        </pattern>
      </defs>
      <rect width="100%" height="36" fill={`url(#${id})`} />
      <line x1="0" x2="100%" y1="2" y2="2" stroke="var(--inv-ornament)" strokeWidth={1} />
      <line x1="0" x2="100%" y1="34" y2="34" stroke="var(--inv-ornament)" strokeWidth={1} />
    </svg>
  );
}

function AdatCoverDecor() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <BatikStrip id="kawung-atas" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <BatikStrip id="kawung-bawah" />
      </div>
    </>
  );
}

// Gunungan: bentuk daun meruncing ke atas dengan pohon hayat di dalamnya dan gapura di dasarnya.
function Gunungan() {
  const outline = "M60 4 C78 40 104 72 112 122 C116 152 104 176 60 186 C16 176 4 152 8 122 C16 72 42 40 60 4 Z";
  return (
    <svg viewBox="0 0 120 190" className="h-full w-full overflow-visible" aria-hidden>
      <path d={outline} fill="var(--inv-leaf-fill)" stroke="var(--inv-leaf)" strokeWidth={1.4} />
      <path d={outline} transform="translate(60 100) scale(0.86) translate(-60 -100)" fill="none" stroke="var(--inv-leaf)" strokeWidth={0.8} />
      <path d="M60 168 V26" stroke="var(--inv-leaf)" strokeWidth={1.2} />
      {[58, 82, 106, 130].map((y) => (
        <g key={y} fill="none" stroke="var(--inv-leaf)" strokeWidth={1} strokeLinecap="round">
          <path d={`M60 ${y} C70 ${y - 8} 84 ${y - 6} 88 ${y + 4} C90 ${y + 10} 84 ${y + 13} 80 ${y + 9}`} />
          <path d={`M60 ${y} C50 ${y - 8} 36 ${y - 6} 32 ${y + 4} C30 ${y + 10} 36 ${y + 13} 40 ${y + 9}`} />
        </g>
      ))}
      <path d="M46 186 V166 C46 158 74 158 74 166 V186" fill="var(--inv-bg)" stroke="var(--inv-leaf)" strokeWidth={1.2} />
      <path d="M53 186 V170 C53 165 67 165 67 170 V186" fill="none" stroke="var(--inv-leaf)" strokeWidth={0.8} />
    </svg>
  );
}

// Melati: lima kelopak runcing, putih dengan garis emas pucat.
function Melati({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d="M0 -2 C-4.5 -8 -3.5 -15 0 -19 C3.5 -15 4.5 -8 0 -2 Z"
          fill="var(--inv-bloom-fill)"
          stroke="var(--inv-bloom)"
          strokeWidth={0.9}
        />
      ))}
      <circle r={2.2} fill="var(--inv-bloom)" />
    </g>
  );
}

function MelatiGarland() {
  const blooms: [number, number, number][] = [
    [20, 30, 0.8],
    [58, 22, 1.05],
    [100, 30, 0.85],
    [140, 18, 1.2],
    [180, 30, 0.85],
    [222, 22, 1.05],
    [260, 30, 0.8],
  ];
  return (
    <svg viewBox="0 0 280 52" className="w-full overflow-visible" aria-hidden>
      <path d="M4 34 C70 18 210 18 276 34" fill="none" stroke="var(--inv-leaf)" strokeWidth={1.1} />
      {[40, 80, 120, 160, 200, 240].map((x, i) => (
        <ellipse
          key={x}
          cx={x}
          cy={27}
          rx={9}
          ry={3.6}
          transform={`rotate(${i % 2 ? 25 : -25} ${x} 27)`}
          fill="var(--inv-leaf-fill)"
          stroke="var(--inv-leaf)"
          strokeWidth={0.8}
        />
      ))}
      {blooms.map(([x, y, s]) => (
        <Melati key={x} x={x} y={y} size={s} />
      ))}
    </svg>
  );
}

// Gunungan mengapit bagian bawah foto sampul, melati menutupi batas bawahnya.
function AdatPhotoDecor() {
  const side = "pointer-events-none absolute bottom-3 -z-10 aspect-[120/190] h-[68%]";
  return (
    <>
      <div className={`${side} -left-12 -rotate-8`}>
        <Gunungan />
      </div>
      <div className={`${side} -right-12 rotate-8`}>
        <Gunungan />
      </div>
      <div className="pointer-events-none absolute -bottom-7 left-1/2 w-[125%] -translate-x-1/2">
        <MelatiGarland />
      </div>
    </>
  );
}

function AdatDivider() {
  return (
    <svg viewBox="0 0 120 24" className="h-6 w-28" aria-hidden>
      <path d="M6 12 H46 M74 12 H114" stroke="var(--inv-ornament)" strokeWidth={1} />
      <Kawung x={60} y={12} r={6} />
    </svg>
  );
}

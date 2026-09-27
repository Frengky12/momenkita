// Filter didefinisikan sekali sebagai daftar operasi CSS filter. Pratinjau live memakai string CSS-nya,
// hasil akhir memakai matriks warna yang setara (spesifikasi Filter Effects), agar foto terkirim sama dengan yang terlihat
// dan tidak bergantung pada ctx.filter yang dukungannya di Safari tidak merata.

type Op = { fn: "brightness" | "contrast" | "saturate" | "sepia"; amount: number };

export const FILTERS = {
  asli: { label: "Asli", ops: [] as Op[] },
  vintage: {
    label: "Vintage",
    ops: [
      { fn: "sepia", amount: 0.35 },
      { fn: "saturate", amount: 0.85 },
      { fn: "contrast", amount: 0.92 },
      { fn: "brightness", amount: 1.05 },
    ] as Op[],
  },
  glow: {
    label: "Clean Glow",
    ops: [
      { fn: "brightness", amount: 1.08 },
      { fn: "contrast", amount: 0.92 },
      { fn: "saturate", amount: 1.12 },
    ] as Op[],
  },
  film: {
    label: "Film",
    ops: [
      { fn: "contrast", amount: 1.18 },
      { fn: "saturate", amount: 0.78 },
      { fn: "sepia", amount: 0.12 },
    ] as Op[],
  },
} as const;

export type FilterId = keyof typeof FILTERS;

export function cssFilter(id: FilterId) {
  const ops = FILTERS[id].ops;
  return ops.length ? ops.map((op) => `${op.fn}(${op.amount})`).join(" ") : "none";
}

// Matriks afine 3x4 [r g b offset] per kanal, nilai 0..1.
type Matrix = number[][];

const IDENTITY: Matrix = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
];

function opMatrix({ fn, amount: a }: Op): Matrix {
  switch (fn) {
    case "brightness":
      return [
        [a, 0, 0, 0],
        [0, a, 0, 0],
        [0, 0, a, 0],
      ];
    case "contrast": {
      const o = 0.5 * (1 - a);
      return [
        [a, 0, 0, o],
        [0, a, 0, o],
        [0, 0, a, o],
      ];
    }
    case "saturate":
      return [
        [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0],
        [0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0],
        [0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0],
      ];
    case "sepia": {
      const b = 1 - a;
      return [
        [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b, 0],
        [0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b, 0],
        [0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b, 0],
      ];
    }
  }
}

// CSS menerapkan filter berurutan kiri ke kanan, jadi matriks berikutnya dikalikan di depan.
function multiply(next: Matrix, prev: Matrix): Matrix {
  return next.map((row) => [
    row[0] * prev[0][0] + row[1] * prev[1][0] + row[2] * prev[2][0],
    row[0] * prev[0][1] + row[1] * prev[1][1] + row[2] * prev[2][1],
    row[0] * prev[0][2] + row[1] * prev[1][2] + row[2] * prev[2][2],
    row[0] * prev[0][3] + row[1] * prev[1][3] + row[2] * prev[2][3] + row[3],
  ]);
}

export function filterMatrix(id: FilterId): Matrix | null {
  const ops = FILTERS[id].ops;
  if (!ops.length) return null;
  return ops.reduce<Matrix>((m, op) => multiply(opMatrix(op), m), IDENTITY);
}

export function applyMatrix(data: Uint8ClampedArray, m: Matrix) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    data[i] = (m[0][0] * r + m[0][1] * g + m[0][2] * b + m[0][3]) * 255;
    data[i + 1] = (m[1][0] * r + m[1][1] * g + m[1][2] * b + m[1][3]) * 255;
    data[i + 2] = (m[2][0] * r + m[2][1] * g + m[2][2] * b + m[2][3]) * 255;
  }
}

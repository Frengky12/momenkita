// Validasi tamu yang sama dipakai browser (pratinjau impor) dan server (validasi final sebelum insert).

export const CATEGORY_LABELS = { vip: "VIP", family: "Keluarga", regular: "Reguler" } as const;
export type GuestCategory = keyof typeof CATEGORY_LABELS;

export const RSVP_LABELS: Record<string, string> = { pending: "Belum jawab", attending: "Hadir", declined: "Tidak hadir", maybe: "Ragu" };

export const MAX_IMPORT_ROWS = 2000;

export type GuestFields = { name: string; phone: string; category: string; pax: string; table: string; sessions: string };

// session_ids kosong berarti diundang ke semua sesi, jadi sesi yang ditambahkan belakangan otomatis ikut.
export type GuestInput = {
  guest_name: string;
  phone_number: string | null;
  category: GuestCategory;
  pax_allowed: number;
  table_number: string | null;
  session_ids: string[];
};

export type SessionRef = { id: string; name: string };

// Excel sering membuang angka 0 di depan, jadi "812..." juga diterima sebagai nomor Indonesia.
export function normalizePhone(raw: string): string | null | "invalid" {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("62") ? digits : digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("8") ? `62${digits}` : "";
  return /^628\d{7,12}$/.test(normalized) ? normalized : "invalid";
}

function parseCategory(raw: string): GuestCategory | null {
  const value = raw.trim().toLowerCase();
  if (!value || value === "reguler" || value === "regular" || value === "umum") return "regular";
  if (value === "vip") return "vip";
  if (value === "keluarga" || value === "family") return "family";
  return null;
}

export function validateGuest(fields: GuestFields, sessions: SessionRef[]): { guest?: GuestInput; errors: string[] } {
  const errors: string[] = [];
  const name = fields.name.trim();
  if (!name) errors.push("Nama wajib diisi");
  else if (name.length > 120) errors.push("Nama maksimal 120 karakter");

  const phone = normalizePhone(fields.phone);
  if (phone === "invalid") errors.push("No. WhatsApp tidak valid");

  const category = parseCategory(fields.category);
  if (!category) errors.push(`Kategori "${fields.category}" tidak dikenal (pakai VIP, Keluarga, atau Reguler)`);

  const paxText = fields.pax.trim();
  const pax = paxText ? Number(paxText) : 1;
  if (!Number.isInteger(pax) || pax < 1 || pax > 20) errors.push("Jumlah orang harus angka 1 sampai 20");

  const table = fields.table.trim();
  if (table.length > 20) errors.push("Meja maksimal 20 karakter");

  const sessionIds: string[] = [];
  for (const sessionName of fields.sessions.split(",").map((s) => s.trim()).filter(Boolean)) {
    const match = sessions.find((s) => s.name.toLowerCase() === sessionName.toLowerCase());
    if (match) sessionIds.push(match.id);
    else errors.push(`Sesi "${sessionName}" tidak ada di event ini`);
  }

  if (errors.length) return { errors };
  return {
    errors,
    guest: {
      guest_name: name,
      phone_number: phone as string | null,
      category: category as GuestCategory,
      pax_allowed: pax,
      table_number: table || null,
      session_ids: [...new Set(sessionIds)],
    },
  };
}

const HEADER_ALIASES: Record<keyof GuestFields, string[]> = {
  name: ["nama", "name", "nama tamu"],
  phone: ["no. whatsapp", "no whatsapp", "whatsapp", "no. wa", "no wa", "nomor wa", "nomor whatsapp", "telepon", "hp", "no. hp"],
  category: ["kategori", "category"],
  pax: ["jumlah orang", "pax", "jumlah"],
  table: ["meja", "table", "no. meja"],
  sessions: ["sesi", "session", "sesi acara"],
};

export type ImportRow = { row: number; fields: GuestFields; errors: string[] };

// Baris pertama adalah judul kolom; urutan kolom bebas selama judulnya dikenali. Baris kosong dilewati.
export function mapImportRows(table: string[][], sessions: SessionRef[]): { rows: ImportRow[]; error?: string } {
  const [header, ...body] = table;
  const titles = (header ?? []).map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, titles.findIndex((t) => aliases.includes(t))]),
  ) as Record<keyof GuestFields, number>;
  if (index.name < 0) return { rows: [], error: 'Kolom "Nama" tidak ditemukan di baris pertama. Pakai template dari MomenKita.' };

  const rows: ImportRow[] = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => !c?.trim())) return;
    const pick = (key: keyof GuestFields) => (index[key] >= 0 ? (cells[index[key]] ?? "").trim() : "");
    const fields = { name: pick("name"), phone: pick("phone"), category: pick("category"), pax: pick("pax"), table: pick("table"), sessions: pick("sessions") };
    rows.push({ row: i + 2, fields, errors: validateGuest(fields, sessions).errors });
  });
  if (rows.length > MAX_IMPORT_ROWS) return { rows: [], error: `Maksimal ${MAX_IMPORT_ROWS} tamu per impor. File ini berisi ${rows.length}.` };
  return { rows };
}

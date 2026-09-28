// Identitas pengelola untuk Syarat & Ketentuan dan Kebijakan Privasi. Nilai null tampil sebagai penanda "[isi ...]"
// dan membuat halaman berlabel draf, agar tidak ada identitas karangan yang terbit (badan usaha belum diputuskan, PRD §10).
export const LEGAL = {
  operator: null as string | null, // Nama badan usaha, mis. "PT Contoh Digital Indonesia"
  address: null as string | null, // Alamat kantor terdaftar
  contactEmail: null as string | null, // Email untuk dukungan dan permintaan data pribadi
  disputeCity: null as string | null, // Kota pengadilan negeri untuk sengketa, mis. "Jakarta Selatan"
  effectiveDate: null as string | null, // Tanggal berlaku, format "1 Januari 2027"
};

export const LEGAL_PLACEHOLDERS: Record<keyof typeof LEGAL, string> = {
  operator: "nama badan usaha",
  address: "alamat kantor",
  contactEmail: "email kontak",
  disputeCity: "kota pengadilan",
  effectiveDate: "tanggal berlaku",
};

export const legalIsDraft = Object.values(LEGAL).some((value) => value === null);

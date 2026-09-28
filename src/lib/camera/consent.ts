// Dipakai layar kamera dan server (guest-sessions). Naikkan versinya setiap kali teks persetujuan berubah (PRD §9.1).
// v2 (28 Sep 2026): menambah tautan Kebijakan Privasi.
export const CONSENT_VERSION = "v2";
// Versi lama tetap diterima agar tamu yang halaman kameranya terbuka sebelum deploy tidak gagal masuk.
// Yang dicatat adalah versi yang benar-benar ditampilkan kepada tamu itu.
export const ACCEPTED_CONSENT_VERSIONS: readonly string[] = ["v1", CONSENT_VERSION];

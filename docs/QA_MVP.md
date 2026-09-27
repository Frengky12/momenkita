# QA MVP MomenKita

Status Kriteria Penerimaan (KP) dan persyaratan non-fungsional PRD v1.4.0 di akhir Minggu 6 (27 Sep 2026).
Semua uji dijalankan di mesin pengembangan terhadap project Supabase dev, bucket R2, dan Midtrans Sandbox.

**Keterangan:** ✅ lolos dengan bukti · ⚠️ lolos sebagian/simulasi, perlu uji ulang · ⏳ belum bisa diuji di lingkungan ini

## Uji otomatis

| Perintah | Isi | Hasil |
| :--- | :--- | :--- |
| `npm run test:db` | Migrasi di PGlite, RLS, grant, trigger, RPC | 146/146 |
| `npm run test:upload` | Sesi tamu, presign, PUT R2, konfirmasi, hapus | 33/33 |
| `npm run test:staff` | Link staf + PIN, API foto staf, Realtime, moderasi, check-in, pencabutan | 30/30 |
| `npm run test:gallery` | Akses galeri, passcode, laporan, manifest ZIP per peran, integritas ZIP | 28/28 |
| `npm run test:load` | Load test skala kecil (lihat bagian Kapasitas) | 0 error |

## Kriteria Penerimaan per modul

### §5.0 Akun & Checkout

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Event aktif ≤ 10 detik setelah webhook | ⚠️ | Jalur notifikasi → verifikasi → rekonsiliasi berjalan 77–166 ms. Pembayaran sandbox Minggu 3 mengaktifkan event lewat pengecekan status di tab Publikasi. Webhook dari server Midtrans baru bisa diuji setelah aplikasi punya URL publik. |
| `signature_key` diverifikasi dan status dicek ulang ke API | ✅ | Notifikasi dengan signature palsu → 401. `reconcileOrder` selalu memanggil status API Midtrans. |
| Webhook idempoten | ✅ | Uji DB `fulfill_order` idempoten; notifikasi ulang untuk order lunas tidak mengubah `paid_at` maupun kuota. |
| Order gagal/kedaluwarsa tidak mengaktifkan event, host bisa mencoba ulang | ✅ | Notifikasi order gagal → `failed`, event tidak berubah. Minggu 3: QRIS gagal lalu bayar ulang dengan VA BCA berhasil. |

### §5.1 Undangan & RSVP

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Impor 500 tamu dari XLSX ≤ 10 detik, baris salah dilaporkan per nomor | ✅ | 500 tamu dalam 2,29 detik (baca 0,12 dtk + simpan 2,17 dtk). File dengan 3 baris salah: "Baris 38, 121, 334" dilaporkan, tidak ada tamu yang tersimpan. |
| Lighthouse Performance ≥ 90 (mobile) | ✅ | Undangan personal 94 (median build produksi, termasuk QR tiket). |
| Link personal salah/ditebak → 404 tanpa bocor data | ✅ | Sufiks salah, tanpa sufiks, slug event salah: semua 404 tanpa nama tamu di respons. |
| RSVP tercatat, dashboard ter-update tanpa reload | ✅ | Broadcast `invitation` + `RealtimeRefresh` (diuji Minggu 2). |

### §5.2 Buku Tamu & QR Check-in

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Scan sampai data tamu tampil ≤ 1 detik | ✅ | Kartu tamu tampil < 0,5 detik dari cache lokal (simulasi scanner USB). Pemindaian kamera HP ⏳ perangkat nyata. |
| Check-in saat mode pesawat tersinkron tanpa duplikasi | ✅ | Simulasi offline: check-in dan walk-in masuk antrean, terkirim saat online dengan waktu asli; walk-in memakai id perangkat (idempoten). |
| Dua perangkat men-scan QR yang sama → satu check-in | ✅ | `test:staff`: dua RPC bersamaan menghasilkan tepat satu check-in. |

### §5.3 Kamera POV

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Kamera siap ≤ 3 detik (Android menengah, 4G) | ⏳ | Butuh HP nyata dan URL HTTPS. |
| In-app browser WhatsApp tetap bisa kirim foto (fallback) | ⏳ | Jalur fallback `<input capture>` diuji di browser desktop; perlu HP nyata. |
| Foto offline terkirim otomatis saat online | ✅ | Antrean IndexedDB diuji Minggu 4. |
| File salah ukuran/tipe ditolak dan dihapus dari R2 | ✅ | `test:upload`. |

### §5.4 Layar Panggung & Moderasi

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Approve/upload instan → tampil di panggung p95 ≤ 2 detik | ✅ | Browser: 0,8–1,4 detik (termasuk unduh foto). Load test: konfirmasi → subscriber p95 1,60 detik. |
| Blackout konsol ≤ 1 detik; tombol `B` instan tanpa jaringan | ✅ | 155 ms dari konsol; `B` langsung tanpa jaringan. |
| Cabut kabel 5 menit, slideshow tetap jalan dan sinkron lagi | ⚠️ | Disimulasikan sekitar 40 detik (request diputus): slideshow terus berputar dari cache, foto yang terlewat muncul 1,85 detik setelah online. Uji fisik 5 menit di laptop panggung belum. |

### §5.5 Galeri & Ekspor

| KP | Status | Bukti |
| :--- | :---: | :--- |
| Unduh 1.000 foto (± 400 MB) di Chrome desktop tanpa error memori | ⚠️ | ZIP streaming 391 MB: puncak memori naik 80 MB (tidak menumpuk). Jalur tulis-ke-disk dan jalur cadangan per 300 foto diuji di browser dengan foto nyata. Uji 1.000 foto di Chrome dengan dialog simpan sungguhan belum. |
| Galeri ber-passcode tidak bisa diakses; URL foto butuh signed URL | ✅ | `test:gallery`: tanpa passcode → 403, cookie lama batal saat passcode diganti, objek R2 tanpa tanda tangan ditolak. |

## Persyaratan non-fungsional (§8)

| # | Target | Status | Catatan |
| :--- | :--- | :---: | :--- |
| 1 | Latensi panggung p95 ≤ 2 detik | ✅ | Lihat §5.4. |
| 2 | JS awal kamera ≤ 150 KB; LCP ≤ 2,5 detik; kamera siap ≤ 3 detik | ⚠️ | JS 139 KB ✅. LCP sekitar 2,5 detik di server lokal (batas); ukur ulang di Vercel. Kamera siap ⏳. |
| 3 | Keandalan upload ≥ 99% | ⚠️ | Load test 299/299 (100%). Angka nyata diukur saat pilot. |
| 4 | Ketersediaan 99,9% akhir pekan | ⏳ | Butuh deploy dan uptime monitor. |
| 5 | Kapasitas: 50 event, 30 upload/detik, 250 koneksi realtime | ⚠️ | Skala kecil lolos (5 event, 4,6 upload/detik, 50 koneksi, 0 error, 2.990/2.990 broadcast). Skala penuh di staging/Supabase Pro sebelum pilot. |
| 6 | Kompatibilitas perangkat | ⏳ | Matriks uji: Android Chrome, iOS Safari 16+, in-app WhatsApp/Instagram, Chrome desktop panggung. |
| 7 | Keamanan | ⚠️ | Token 128-bit, RLS semua tabel, signed URL ber-TTL, rate limit presign/RSVP/passcode/laporan, link staf kedaluwarsa H+1 ✅. Security review menyeluruh ⏳. |
| 8 | Backup harian | ⏳ | Bawaan Supabase Pro; project dev masih paket gratis. |
| 9 | Observability | ⏳ | Error tracking dan dashboard "Acara Hari Ini" belum dipasang. |
| 10 | Bahasa Indonesia | ✅ | |

### Load test skala kecil

`EVENTS=5 GUESTS=10 RATE=5 DURATION=60 SUBSCRIBERS=10`, build produksi di mesin lokal:

| Tahap | p50 | p95 | p99 |
| :--- | ---: | ---: | ---: |
| Presign | 303 ms | 1.262 ms | 1.667 ms |
| PUT ke R2 | 379 ms | 764 ms | 1.234 ms |
| Konfirmasi | 553 ms | 1.603 ms | 2.100 ms |
| Konfirmasi → layar panggung | 547 ms | 1.601 ms | 2.092 ms |

Latensi didominasi perjalanan jaringan dari mesin lokal ke Supabase dan R2. Di Vercel (region yang sama dengan Supabase) angkanya diperkirakan lebih kecil; ukur ulang di staging.

## Supabase advisors

| Temuan | Tindakan |
| :--- | :--- |
| 12 foreign key tanpa indeks | Diperbaiki (migrasi `20260927000500`). |
| Policy permissive ganda (3 tabel) | Digabung per aksi; `is_admin()` dihitung sekali per query. |
| Fungsi `security definer` bisa dipanggil user login (21) | Disengaja: jalur RPC staf/host; tiap fungsi memeriksa hak akses sendiri. |
| Login anonim diizinkan | Disengaja: perangkat staf hari-H. Policy hanya memberi akses lewat peran staf aktif. |
| RLS tanpa policy (`rate_limit_hits`, `staff_sessions`) | Disengaja: hanya diakses server atau fungsi. |
| Proteksi password bocor | Tidak relevan: login host memakai magic link. |
| Indeks belum terpakai (16) | Wajar di project dev; tinjau ulang setelah pilot. |

## Harus beres sebelum pilot

1. Super Admin minimal (Minggu 7): cari event/order, aktivasi manual, refund, takedown.
2. Deploy ke Vercel dengan domain: URL webhook Midtrans, aturan CORS R2 untuk domain produksi (GET dan PUT), ukur ulang LCP.
3. Email invoice dan SMTP (menunggu keputusan domain).
4. Job retensi album (hapus file setelah masa simpan) beserta email pengingat H-30/H-7; bergantung pada email.
5. Error tracking dan pemantauan hari-H.
6. Uji perangkat nyata (matriks §8 baris 6), termasuk scanner kamera, kamera tamu di WhatsApp, cabut kabel 5 menit, dan ZIP 1.000 foto di Chrome.
7. Load test skala penuh di staging.

## Keterbatasan yang diketahui

- Walk-in yang dicatat saat offline memakai waktu saat terkirim, bukan waktu kedatangan.
- Layar panggung tidak bisa dimuat ulang tanpa internet (tanpa service worker); slideshow yang sudah berjalan tetap berputar.
- Klik sebelum halaman selesai dimuat (hydration) pada form yang dikirim lewat JavaScript tidak melakukan apa-apa; di build produksi jendelanya sangat singkat.

# MomenKita

Platform undangan digital + buku tamu QR + kamera POV tamu + live slideshow untuk acara.
Spesifikasi lengkap: [`docs/PRD_MomenKita.md`](docs/PRD_MomenKita.md).

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime) · Cloudflare R2 · Midtrans

## Menjalankan secara lokal

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` ke `.env.local` lalu isi kunci Supabase.
3. Terapkan skema ke project Supabase:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
4. Di Supabase Dashboard → Authentication → Sign In / Providers, aktifkan **Anonymous Sign-ins** (dipakai perangkat staf hari-H).
5. Jalankan:
   ```bash
   npm run dev
   ```

## Skrip

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm run test:db` | Menjalankan semua migrasi di PGlite lalu menguji RLS, grant, trigger, dan RPC. Tidak butuh Docker atau project Supabase. |
| `npm run db:types` | Membuat ulang `src/lib/supabase/database.types.ts` dari project yang di-link. Jalankan setiap selesai `db push`. |
| `npm run test:upload` | Uji end-to-end upload tamu ke R2 (sesi, presign, PUT, konfirmasi). Butuh `npm run dev` berjalan dan `.env.local` lengkap; data uji dihapus otomatis. |
| `npm run test:gallery` | Uji end-to-end galeri dan unduhan: akses tertutup/terbuka/passcode, laporan foto, manifest ZIP per peran, URL R2 tanpa tanda tangan, integritas ZIP. Syarat sama dengan `test:upload` (butuh `unzip`). |
| `npm run test:load` | Load test alur tamu + Realtime. Skala lewat env: `EVENTS`, `GUESTS`, `RATE`, `DURATION`, `SUBSCRIBERS`, `BASE` (default skala kecil ke build produksi di port 3100). Hasil dan target di `docs/QA_MVP.md`. |
| `npm run test:staff` | Uji end-to-end hari-H: link staf + PIN, API foto staf (signed URL R2), broadcast Realtime ke panggung, moderasi, check-in, pencabutan link. Syarat sama dengan `test:upload`. |
| `npm run test:admin` | Uji end-to-end Super Admin: gerbang `/admin` per peran (host dapat 404 tanpa isi halaman), monitor hari ini (upload ditolak, detak panggung, laporan), custom domain lewat proxy. Syarat sama dengan `test:upload`. `KEEP=1` menyisakan data uji untuk QA manual; data itu dibersihkan di awal run berikutnya. |

## Struktur

```
docs/                     PRD, arsipnya, dan hasil QA (QA_MVP.md)
supabase/
  migrations/             Skema database (sumber kebenaran)
  tests/                  Uji database (npm run test:db)
src/
  proxy.ts                Refresh sesi host, proteksi /dashboard dan /admin, custom domain Luxury → /<slug>
  lib/supabase/
    client.ts             Browser, host/WO (sesi di cookie)
    server.ts             Server Component / Route Handler atas nama host (RLS berlaku)
    admin.ts              Secret key, melewati RLS: alur tamu, webhook Midtrans, super admin
    staff.ts              Perangkat staf (anonymous sign-in, sesi di localStorage)
    bearer.ts             Route Handler atas nama pemilik token Bearer (host atau perangkat staf)
  lib/staff/              Akses halaman staf, antrean check-in offline, cache foto layar panggung
  lib/gallery.ts          Akses galeri tamu (dibuka host, passcode opsional) dan daftar foto
  lib/custom-domain.ts    Host → slug event untuk custom domain (cache 60 detik per instance)
  app/admin/guard.ts      Guard Super Admin; wajib dipanggil layout dan setiap page admin
  app/                    Route (lihat tabel di bawah)
```

## Peta route

| Route | Pengguna | PRD |
| :--- | :--- | :--- |
| `/login`, `/dashboard`, `/dashboard/events/[eventId]` | Host / WO | §5.0 |
| `/[slug]` | Tamu (link umum) | §5.1 |
| `/[slug]/to/[guestSlug]` | Tamu (link personal + QR check-in) | §5.1 |
| `/[slug]/kamera` | Tamu (kamera POV; route harus tetap ramping) | §5.3 |
| `/[slug]/galeri` | Tamu (bila dibuka host, passcode opsional), pengelola event selalu | §5.5 |
| `/dashboard/events/[eventId]/galeri` | Host: buka galeri, passcode, unduh ZIP, tinjau laporan foto | §5.5, §9.4 |
| `/dashboard/events/[eventId]/tamu/laporan` | Host: unduh laporan buku tamu XLSX | §5.5 |
| `/dashboard/events/[eventId]/pengelola` | Pemilik: undang dan keluarkan co-host (link sekali pakai, 7 hari). Co-host: lihat pengelola, keluar dari event | §2.2 |
| `/dashboard/gabung/[token]` | Penerima undangan co-host: terima setelah login (tamu yang belum login diarahkan ke `/login?next=...`) | §2.2 |
| `/dashboard/events/[eventId]/hari-h` (+ `/qr-meja`) | Host: link staf + PIN, mode moderasi, buka konsol, cetak QR meja | §2.2, §5.4 |
| `/staff#<token>` | Staf: masuk dengan link + PIN | §2.2 |
| `/staff/[eventId]/panggung` · `moderasi` · `scanner` | Layar panggung · moderator · penerima tamu (host yang login bisa membukanya tanpa PIN) | §5.2, §5.4 |
| `/staff/[eventId]/foto` | Fotografer: pratinjau dan unduh ZIP | §5.5 |
| `/api/events/[slug]/gallery` (+ `/unlock`, `/report`) | Galeri tamu (polling), passcode, laporan foto | §5.5 |
| `/api/staff/events/[eventId]/download` | Manifest unduhan ZIP (signed URL 6 jam) untuk host dan fotografer | §5.5 |
| `/api/staff/events/[eventId]/photos` | Foto + signed URL untuk panggung/moderasi; hak akses diputuskan RPC `staff_photos` | §5.4 |
| `/admin` | Super Admin: monitor acara hari ini (upload ditolak, koneksi panggung, laporan), dimuat ulang tiap 30 detik | §5.7 |
| `/admin/cari`, `/admin/events/[eventId]`, `/admin/pengguna/[userId]` | Super Admin: cari event/pengguna/order, aktivasi manual, cek ulang Midtrans, catat refund, penyesuaian kredit | §5.7 |
| `/admin/laporan` · `/domain` · `/log` | Super Admin: antrean laporan + takedown · custom domain Luxury · log audit | §5.7, §9.4, §9.5 |

Slug event yang bentrok dengan route aplikasi (`api`, `auth`, `login`, `dashboard`, `staff`, `admin`) ditolak oleh constraint `events_slug_not_reserved`. Perbarui constraint itu setiap kali menambah route tingkat atas.

## Model akses data

Ringkasan dari PRD §7.4:

- **Host/WO:** RLS langsung ke tabel lewat `lib/supabase/client.ts` / `server.ts`.
- **Co-host:** punya akses pengelola yang sama dengan pemilik (`is_event_manager`). Co-host hanya bertambah lewat RPC `accept_cohost_invite`; insert langsung ke `event_cohosts` ditolak. Mengundang, mencabut undangan, dan mengeluarkan co-host hanya bisa dilakukan pemilik event. Co-host boleh menghapus barisnya sendiri (keluar).
- **Staf hari-H:** hanya lewat RPC `staff_*` dengan `lib/supabase/staff.ts`. Host yang membuka halaman staf memakai sesi cookie-nya sendiri (`lib/staff/access.ts`).
- **Tamu:** hanya lewat Route Handler yang memakai `lib/supabase/admin.ts`.
- **Super Admin:** baca lewat RLS (`is_admin()`), tulis hanya lewat RPC `admin_*` yang memeriksa `is_admin()`, mewajibkan alasan, dan mencatat ke `admin_actions`. Halaman `/admin` memanggil `requireAdmin()` di layout dan di setiap page, karena Next.js merender keduanya paralel dan `notFound()` di layout saja tidak mencegah isi page ikut terkirim.
- **Tabel baru:** setiap migrasi yang menambah tabel harus mengulang pola `revoke` + `grant` di `supabase/migrations/20260926000300_rls.sql`, karena default Supabase memberi `anon`/`authenticated` akses penuh ke tabel baru.

## Deploy (Vercel)

Repo `Frengky12/momenkita` terhubung ke Vercel; setiap push ke `main` otomatis ter-deploy ke `https://momenkita-hazel.vercel.app`.

- **Region:** `vercel.json` menetapkan `sin1` (Singapura), satu region dengan Supabase (ap-southeast-1).
- **Environment variables:** semua isi `.env.local` (10 variabel, lihat `.env.example`) di-set di Vercel → Settings → Environment Variables. `NEXT_PUBLIC_*` dibaca saat build, jadi deploy ulang setelah mengubahnya.
- **Supabase → Authentication → URL Configuration:** Site URL = domain produksi; Redirect URLs berisi `https://<domain>/**` dan `http://localhost:3000/**`.
- **Cloudflare R2 → CORS:** `AllowedOrigins` berisi domain produksi dan `http://localhost:3000`, `AllowedMethods` GET, PUT, HEAD, `AllowedHeaders` content-type.
- **Midtrans → Payment Notification URL:** `https://<domain>/api/midtrans/notification`.
- **Uji terhadap produksi:** `BASE=https://momenkita-hazel.vercel.app npm run test:upload` (juga `test:staff`, `test:gallery`, `test:admin`, `test:load`). Bagian custom domain di `test:admin` hanya berjalan ke `localhost`.
- **Email login:** SMTP sendiri dipasang di Authentication → Emails → SMTP Settings (layanan bawaan Supabase hanya 2 email/jam untuk seluruh project). Batas kirim diatur di Authentication → Rate Limits.
- **Template email:** sumbernya di `supabase/templates/`; salin isinya ke Authentication → Emails → Templates. Email pertama untuk alamat baru memakai template Confirm signup, login berikutnya memakai Magic Link, jadi keduanya harus diganti.

  | Template | Subject | File |
  | :--- | :--- | :--- |
  | Confirm signup | Konfirmasi email untuk MomenKita | `confirm-signup.html` |
  | Magic Link | Link masuk ke MomenKita | `magic-link.html` |

  Tautan di template memakai `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` agar link bisa dibuka di perangkat mana pun (`/auth/callback` memverifikasi `token_hash`). Syaratnya URL `/auth/callback` ada di Redirect URLs; kalau tidak, Supabase memakai Site URL dan link menjadi rusak.
- **Custom domain Luxury:** tambahkan domain di Vercel → Settings → Domains, atur DNS sesuai petunjuk Vercel, lalu catat dan aktifkan di `/admin/domain`. Setelah aplikasi punya domain utama sendiri, isi `PRIMARY_HOSTS` (lihat `.env.example`) agar domain utama tidak dianggap custom domain. `localhost` dan `*.vercel.app` selalu dianggap domain utama.

## Catatan operasional

- **Partisi Realtime.** Partisi harian `realtime.messages` dibuat layanan Realtime Supabase saat ada klien tersambung. Tanpa partisi, broadcast dari trigger hilang tanpa error (`realtime.send` hanya memberi WARNING). Karena itu layar panggung dan konsol moderasi wajib memuat ulang data lewat RPC (`staff_photos`, `staff_guest_list`) setiap kali tersambung, jangan hanya mengandalkan broadcast.
- **CORS R2.** Layar panggung mengunduh foto dengan `fetch` (untuk cache offline), jadi aturan CORS bucket harus mengizinkan `GET` selain `PUT` dari origin aplikasi. Saat ini baru `http://localhost:3000`; tambahkan domain produksi sebelum launch.
- **Layar panggung.** Cache foto (maks. 200) ada di memori tab. Slideshow tetap berputar saat jaringan putus, tetapi halaman tidak bisa dimuat ulang tanpa internet: jangan menutup atau me-refresh tab panggung selama acara.
- **Scanner check-in.** Daftar tamu dan antrean check-in disimpan di `localStorage` per perangkat (`momenkita-guests:<eventId>`, `momenkita-checkins:<eventId>`). Check-in offline dikirim dengan waktu aslinya. Walk-in offline tercatat dengan waktu saat terkirim.
- **User anonim staf.** Setiap perangkat staf membuat satu user anonim di Supabase Auth. Job pg_cron `cleanup-staff-devices` (02.15 WIB) menghapus yang berumur lebih dari 7 hari tanpa link aktif. Perangkat yang sesinya sudah terhapus otomatis membuat sesi baru saat memasukkan PIN.
- **Foto undangan.** Sampul, foto mempelai, galeri prewedding (maks. 12), dan QRIS disimpan di R2 `events/<eventId>/invitation/<id>/` dan dicatat di tabel `invitation_media`. Browser mengompres foto dengan pipeline kamera tamu (`processPhoto`) lalu mengunggah langsung ke R2; server hanya menandatangani PUT dan memeriksa hasilnya (`undangan/media-actions.ts`). Mengganti atau menghapus foto ikut menghapus file lamanya.
- **Passcode galeri.** Disimpan sebagai hash bcrypt. Akses tamu disimpan di cookie HttpOnly bertanda tangan yang ikut batal saat passcode diganti.
- **Unduhan ZIP.** ZIP dibuat di browser; server hanya menandatangani URL. Chrome/Edge desktop menulis langsung ke disk, browser lain menerima ZIP per 300 foto.
- **Akun Super Admin.** Tidak ada UI untuk mengangkat admin. Jalankan `npx supabase db query --linked "update public.profiles set role = 'admin' where email = '<email>'"` untuk akun yang sudah pernah login, lalu buka `/admin` (tautan Super Admin juga muncul di header dashboard).
- **Data operasional.** `upload_errors` (penolakan upload, dasar angka di monitor) dan `stage_heartbeats` (detak layar panggung tiap 60 detik) dibersihkan job pg_cron `cleanup-ops-data` (02.30 WIB). Log `admin_actions` tidak pernah dihapus.
- **Error tracking (Sentry).** Aktif bila `NEXT_PUBLIC_SENTRY_DSN` diisi; tanpa DSN semuanya diam. Server: `src/instrumentation.ts` menangkap error Server Component, Route Handler, dan server action. Error yang sudah ditangani tetapi perlu diketahui tim (misalnya "PERLU REFUND MANUAL") dilaporkan lewat `reportError()` di `lib/report-error.ts`. Browser: SDK tidak ada di JS awal (anggaran kamera 150 KB); `lib/client-errors.ts` baru mengunduh SDK ringkas (±29 KB gzip) saat error pertama terjadi. Cookie, header, body, query, dan info user tidak dikirim; nama tamu di `/to/...` dan token di `/gabung/...` disamarkan (`lib/sentry-privacy.ts`).
- **Migrasi yang sudah di-push tidak boleh diedit.** Perubahan skema selalu dibuat sebagai file migrasi baru.
- **Webhook Midtrans.** Di dashboard Midtrans (Settings → Configuration), isi Payment Notification URL dengan `https://<domain>/api/midtrans/notification`. Midtrans tidak bisa memanggil `localhost`, jadi saat pengembangan status pembayaran dicek oleh halaman tab Publikasi setelah kembali dari Midtrans.

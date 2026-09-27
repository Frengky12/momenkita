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

## Struktur

```
docs/                     PRD, arsipnya, dan hasil QA (QA_MVP.md)
supabase/
  migrations/             Skema database (sumber kebenaran)
  tests/                  Uji database (npm run test:db)
src/
  proxy.ts                Refresh sesi host + proteksi /dashboard
  lib/supabase/
    client.ts             Browser, host/WO (sesi di cookie)
    server.ts             Server Component / Route Handler atas nama host (RLS berlaku)
    admin.ts              Secret key, melewati RLS: alur tamu, webhook Midtrans, super admin
    staff.ts              Perangkat staf (anonymous sign-in, sesi di localStorage)
    bearer.ts             Route Handler atas nama pemilik token Bearer (host atau perangkat staf)
  lib/staff/              Akses halaman staf, antrean check-in offline, cache foto layar panggung
  lib/gallery.ts          Akses galeri tamu (dibuka host, passcode opsional) dan daftar foto
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
| `/dashboard/events/[eventId]/hari-h` (+ `/qr-meja`) | Host: link staf + PIN, mode moderasi, buka konsol, cetak QR meja | §2.2, §5.4 |
| `/staff#<token>` | Staf: masuk dengan link + PIN | §2.2 |
| `/staff/[eventId]/panggung` · `moderasi` · `scanner` | Layar panggung · moderator · penerima tamu (host yang login bisa membukanya tanpa PIN) | §5.2, §5.4 |
| `/staff/[eventId]/foto` | Fotografer: pratinjau dan unduh ZIP | §5.5 |
| `/api/events/[slug]/gallery` (+ `/unlock`, `/report`) | Galeri tamu (polling), passcode, laporan foto | §5.5 |
| `/api/staff/events/[eventId]/download` | Manifest unduhan ZIP (signed URL 6 jam) untuk host dan fotografer | §5.5 |
| `/api/staff/events/[eventId]/photos` | Foto + signed URL untuk panggung/moderasi; hak akses diputuskan RPC `staff_photos` | §5.4 |

Slug event yang bentrok dengan route aplikasi (`api`, `auth`, `login`, `dashboard`, `staff`, `admin`) ditolak oleh constraint `events_slug_not_reserved`. Perbarui constraint itu setiap kali menambah route tingkat atas.

## Model akses data

Ringkasan dari PRD §7.4:

- **Host/WO:** RLS langsung ke tabel lewat `lib/supabase/client.ts` / `server.ts`.
- **Staf hari-H:** hanya lewat RPC `staff_*` dengan `lib/supabase/staff.ts`. Host yang membuka halaman staf memakai sesi cookie-nya sendiri (`lib/staff/access.ts`).
- **Tamu:** hanya lewat Route Handler yang memakai `lib/supabase/admin.ts`.
- **Tabel baru:** setiap migrasi yang menambah tabel harus mengulang pola `revoke` + `grant` di `supabase/migrations/20260926000300_rls.sql`, karena default Supabase memberi `anon`/`authenticated` akses penuh ke tabel baru.

## Deploy (Vercel)

Repo `Frengky12/momenkita` terhubung ke Vercel; setiap push ke `main` otomatis ter-deploy ke `https://momenkita-hazel.vercel.app`.

- **Region:** `vercel.json` menetapkan `sin1` (Singapura), satu region dengan Supabase (ap-southeast-1).
- **Environment variables:** semua isi `.env.local` (10 variabel, lihat `.env.example`) di-set di Vercel → Settings → Environment Variables. `NEXT_PUBLIC_*` dibaca saat build, jadi deploy ulang setelah mengubahnya.
- **Supabase → Authentication → URL Configuration:** Site URL = domain produksi; Redirect URLs berisi `https://<domain>/**` dan `http://localhost:3000/**`.
- **Cloudflare R2 → CORS:** `AllowedOrigins` berisi domain produksi dan `http://localhost:3000`, `AllowedMethods` GET, PUT, HEAD, `AllowedHeaders` content-type.
- **Midtrans → Payment Notification URL:** `https://<domain>/api/midtrans/notification`.
- **Uji terhadap produksi:** `BASE=https://momenkita-hazel.vercel.app npm run test:upload` (juga `test:staff`, `test:gallery`, `test:load`).
- **Email login:** layanan email bawaan Supabase hanya 2 email/jam untuk seluruh project. Pasang SMTP sendiri (Authentication → Emails → SMTP Settings) sebelum dipakai host sungguhan.

## Catatan operasional

- **Partisi Realtime.** Partisi harian `realtime.messages` dibuat layanan Realtime Supabase saat ada klien tersambung. Tanpa partisi, broadcast dari trigger hilang tanpa error (`realtime.send` hanya memberi WARNING). Karena itu layar panggung dan konsol moderasi wajib memuat ulang data lewat RPC (`staff_photos`, `staff_guest_list`) setiap kali tersambung, jangan hanya mengandalkan broadcast.
- **CORS R2.** Layar panggung mengunduh foto dengan `fetch` (untuk cache offline), jadi aturan CORS bucket harus mengizinkan `GET` selain `PUT` dari origin aplikasi. Saat ini baru `http://localhost:3000`; tambahkan domain produksi sebelum launch.
- **Layar panggung.** Cache foto (maks. 200) ada di memori tab. Slideshow tetap berputar saat jaringan putus, tetapi halaman tidak bisa dimuat ulang tanpa internet: jangan menutup atau me-refresh tab panggung selama acara.
- **Scanner check-in.** Daftar tamu dan antrean check-in disimpan di `localStorage` per perangkat (`momenkita-guests:<eventId>`, `momenkita-checkins:<eventId>`). Check-in offline dikirim dengan waktu aslinya. Walk-in offline tercatat dengan waktu saat terkirim.
- **User anonim staf.** Setiap perangkat staf membuat satu user anonim di Supabase Auth. Job pg_cron `cleanup-staff-devices` (02.15 WIB) menghapus yang berumur lebih dari 7 hari tanpa link aktif. Perangkat yang sesinya sudah terhapus otomatis membuat sesi baru saat memasukkan PIN.
- **Passcode galeri.** Disimpan sebagai hash bcrypt. Akses tamu disimpan di cookie HttpOnly bertanda tangan yang ikut batal saat passcode diganti.
- **Unduhan ZIP.** ZIP dibuat di browser; server hanya menandatangani URL. Chrome/Edge desktop menulis langsung ke disk, browser lain menerima ZIP per 300 foto.
- **Migrasi yang sudah di-push tidak boleh diedit.** Perubahan skema selalu dibuat sebagai file migrasi baru.
- **Webhook Midtrans.** Di dashboard Midtrans (Settings → Configuration), isi Payment Notification URL dengan `https://<domain>/api/midtrans/notification`. Midtrans tidak bisa memanggil `localhost`, jadi saat pengembangan status pembayaran dicek oleh halaman tab Publikasi setelah kembali dari Midtrans.

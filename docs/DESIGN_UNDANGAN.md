# Arah desain tema undangan

Disusun dari 4 referensi yang dikirim Product Owner (27 Sep 2026). Dokumen ini pegangan untuk semua tema; kode tema ada di
`src/components/invitation/themes.tsx`, token warna di `src/app/globals.css` (`.theme-*`).

## Pola bersama dari referensi

- **Sampul satu layar:** label kecil berjarak (huruf kapital, spasi lebar), nama besar dengan huruf dekoratif, tanggal,
  "Kepada Yth." + nama tamu, tombol pil "Buka undangan". Huruf kapital berjarak dipakai karena muncul di tiga dari
  empat referensi sebagai penanda undangan cetak, bukan gaya bawaan.
- **Ornamen di sudut** membingkai sampul; bagian isi memakai pembatas kecil bermotif sama.
- **Satu kerangka, banyak tema** (PRD §5.1): tema mengganti warna, huruf, bentuk bingkai foto, dan ornamen. Urutan dan
  isi bagian sama untuk semua tema.
- **Ornamen:** line-art SVG buatan sendiri (keputusan PO), tanpa aset ilustrasi berlisensi.
- **Musik:** tombol bulat mengambang, sudah ada.

## Tema

| Tema | Referensi | Status |
| :--- | :--- | :--- |
| Elegan klasik | (tema awal MVP) | Ada |
| Botani | Ref 1 (bunga dan daun di sudut, garis tembaga) dan ref 4 (krem, serif, nuansa alami) | Dikerjakan |
| Noir emas | Ref 3 (hitam, garis emas, kaligrafi) | Berikutnya |
| Marun anggun | Ref 2 (marun gelap, kartu foto berbingkai, hitung mundur di kartu kertas) | Berikutnya |

## Botani

- **Dial:** ENERGY 2 (tenang, hangat), RHYTHM 2 (sampul berornamen, isi lapang), MOTION 1 (tanpa animasi).
- **Warna** (kontras dicek WCAG AA): kertas `#f6f0e8`, kartu `#fffbf5`, teks `#3d3a34` (10.0:1), sage `#5c6961`
  untuk label (5.1:1), tembaga `#95502c` untuk nama dan aksen (5.4:1), tombol putih di atas `#9a532e` (5.8:1).
  Hijau daun `#7d9a8a` dan garis tembaga muda hanya dekorasi.
- **Huruf:** Italiana untuk nama dan judul (serif tipis kontras tinggi seperti ref 1), DM Sans untuk teks isi.
- **Foto:** sampul dan mempelai dalam bingkai lengkung dengan garis tembaga tipis di luarnya.
- **Ornamen:** ranting daun dan bunga lima kelopak (line-art, isi pucat) di sudut kiri atas dan kanan bawah sampul,
  garis geometris tembaga tipis di dua sudut lain, pembatas bagian berupa sepasang daun.
- **Tekstur:** bintik kertas sangat halus sebagai identitas "kertas undangan" dari ref 1.

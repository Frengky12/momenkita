import type { Metadata } from "next";
import Link from "next/link";
import { Fill } from "../fill";

export const metadata: Metadata = { title: "Kebijakan Privasi · MomenKita" };

// Isi mengikuti PRD §9.1 (UU PDP No. 27/2022) dan perilaku aplikasi yang sebenarnya: masa simpan diambil dari
// job pembersihan di migrasi (rate limit 1 hari, log operasional 30 hari, perangkat staf 7 hari) dan kebijakan paket.
// Draf: wajib ditinjau ahli hukum sebelum launch publik.
export default function PrivacyPage() {
  return (
    <>
      <h1>Kebijakan Privasi</h1>
      <p className="text-sm text-muted-foreground">
        Berlaku sejak <Fill field="effectiveDate" />.
      </p>

      <p>
        Kebijakan ini menjelaskan data pribadi apa yang diproses MomenKita, untuk apa, siapa yang bisa melihatnya, dan hak kamu atas data tersebut,
        sesuai Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi. MomenKita dikelola oleh <Fill field="operator" />.
      </p>

      <h2>1. Peran kami</h2>
      <ul>
        <li>
          Untuk data akun host dan pembayaran, kami adalah <strong>pengendali data</strong>.
        </li>
        <li>
          Untuk daftar tamu yang dimasukkan host (nama, nomor WhatsApp, meja, dan sebagainya), host adalah <strong>pengendali data</strong> dan kami
          memprosesnya atas nama host sebagai <strong>prosesor data</strong>.
        </li>
        <li>
          Untuk foto yang dikirim tamu lewat kamera tamu, kami meminta persetujuan langsung dari tamu sebelum kamera bisa dipakai.
        </li>
      </ul>

      <h2>2. Data yang kami proses</h2>
      <table>
        <thead>
          <tr>
            <th>Dari siapa</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Host</td>
            <td>Email, nama, nomor telepon bila diisi, riwayat pesanan (paket, nominal, status, nomor transaksi Midtrans).</td>
          </tr>
          <tr>
            <td>Isi undangan (diisi host)</td>
            <td>
              Nama mempelai dan orang tua, akun Instagram, jadwal dan lokasi acara, teks undangan, nomor rekening dan gambar QRIS, foto undangan, musik
              latar.
            </td>
          </tr>
          <tr>
            <td>Daftar tamu (diisi host)</td>
            <td>Nama tamu, nomor WhatsApp (opsional), kategori, jumlah orang, nomor meja, dan sesi yang diundang.</td>
          </tr>
          <tr>
            <td>Tamu undangan</td>
            <td>Konfirmasi kehadiran dan jumlah orang, ucapan, waktu undangan dibuka, waktu check-in di acara.</td>
          </tr>
          <tr>
            <td>Tamu yang memakai kamera</td>
            <td>Nama panggilan, foto, keterangan foto (opsional), waktu unggah, dan versi persetujuan yang disetujui.</td>
          </tr>
          <tr>
            <td>Data teknis</td>
            <td>
              Alamat IP dalam bentuk tersamar (hash) untuk mencegah penyalahgunaan, catatan unggahan yang ditolak, status koneksi layar panggung, dan
              laporan error aplikasi (pesan error, jenis browser, halaman yang dibuka).
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Kami tidak menyimpan data kartu atau rekening pembayaran; pembayaran diproses oleh Midtrans. Nomor WhatsApp tamu tidak pernah ditampilkan kepada
        tamu lain.
      </p>

      <h2>3. Untuk apa data dipakai</h2>
      <ul>
        <li>Menjalankan layanan: menampilkan undangan, mencatat RSVP dan check-in, menampilkan foto di layar acara dan galeri, dan mengirim link masuk.</li>
        <li>Memproses pembayaran dan membuat catatan transaksi.</li>
        <li>Menjaga keamanan: mencegah spam dan penyalahgunaan, menangani laporan konten, dan memperbaiki error.</li>
        <li>Memenuhi kewajiban hukum, misalnya pencatatan transaksi.</li>
      </ul>
      <p>
        Dasar pemrosesan adalah pelaksanaan perjanjian dengan host, persetujuan tamu untuk foto dari kamera tamu, kewajiban hukum, dan kepentingan yang
        sah untuk menjaga keamanan layanan. Kami tidak menjual data pribadi dan tidak memakainya untuk iklan.
      </p>

      <h2>4. Siapa yang bisa melihat data</h2>
      <ul>
        <li>Host dan co-host yang diundang host: seluruh data event mereka.</li>
        <li>Staf hari-H yang diberi link dan PIN oleh host: data yang dibutuhkan tugasnya (daftar tamu untuk penerima tamu, foto untuk moderator).</li>
        <li>Tamu: undangan dan ucapan; galeri foto hanya bila dibuka oleh host, dan bisa dilindungi kata sandi.</li>
        <li>Tim MomenKita: hanya untuk dukungan, moderasi laporan, dan menangani masalah teknis.</li>
      </ul>

      <h2>5. Penyedia layanan dan lokasi data</h2>
      <p>Kami memakai penyedia berikut untuk menjalankan MomenKita. Sebagian data disimpan atau diproses di luar Indonesia.</p>
      <table>
        <thead>
          <tr>
            <th>Penyedia</th>
            <th>Fungsi</th>
            <th>Lokasi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database dan login</td>
            <td>Singapura</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Menjalankan aplikasi</td>
            <td>Singapura, dengan jaringan pengiriman global</td>
          </tr>
          <tr>
            <td>Cloudflare R2</td>
            <td>Penyimpanan foto dan musik</td>
            <td>Jaringan global Cloudflare</td>
          </tr>
          <tr>
            <td>Midtrans</td>
            <td>Pembayaran</td>
            <td>Indonesia</td>
          </tr>
          <tr>
            <td>Sentry</td>
            <td>Pelacakan error aplikasi</td>
            <td>Amerika Serikat</td>
          </tr>
          <tr>
            <td>Penyedia email</td>
            <td>Mengirim link masuk</td>
            <td>Sesuai penyedia</td>
          </tr>
        </tbody>
      </table>
      <p>
        Laporan error dikirim tanpa cookie, header, isi formulir, alamat IP, maupun data akun, dan alamat undangan pribadi tamu disamarkan sebelum
        dikirim.
      </p>

      <h2>6. Berapa lama data disimpan</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Masa simpan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Album foto paket Complete</td>
            <td>6 bulan setelah tanggal acara, bisa diperpanjang dengan add-on. Setelah itu file dihapus permanen.</td>
          </tr>
          <tr>
            <td>Album foto paket Unlimited Luxury</td>
            <td>Selama layanan beroperasi. Jika layanan dihentikan, kami memberi tahu paling lambat 90 hari sebelumnya.</td>
          </tr>
          <tr>
            <td>Undangan, daftar tamu, RSVP, ucapan</td>
            <td>Selama event ada di akun host. Ikut terhapus bila host menghapus event atau akun.</td>
          </tr>
          <tr>
            <td>Akun host</td>
            <td>Sampai akun dihapus. Catatan transaksi disimpan tanpa identitas untuk keperluan pembukuan.</td>
          </tr>
          <tr>
            <td>Alamat IP tersamar</td>
            <td>1 hari</td>
          </tr>
          <tr>
            <td>Catatan unggahan ditolak dan koneksi layar panggung</td>
            <td>30 hari</td>
          </tr>
          <tr>
            <td>Sesi perangkat staf hari-H</td>
            <td>Dihapus 7 hari setelah link staf tidak aktif</td>
          </tr>
          <tr>
            <td>Laporan error</td>
            <td>Sesuai masa simpan layanan Sentry, lalu dihapus otomatis</td>
          </tr>
        </tbody>
      </table>

      <h2>7. Hak kamu</h2>
      <p>
        Kamu berhak meminta akses, perbaikan, atau penghapusan data pribadimu, menarik persetujuan, dan mengajukan keberatan atas pemrosesan. Host bisa
        mengunduh daftar tamu (XLSX) dan album foto (ZIP) sendiri dari dashboard.
      </p>
      <ul>
        <li>Tamu bisa menghapus foto yang dikirimnya sendiri dari perangkat yang sama.</li>
        <li>
          Permintaan lain terkait data tamu bisa diajukan ke host acara, atau langsung ke kami di <Fill field="contactEmail" />. Kami menanggapi dalam
          3×24 jam.
        </li>
        <li>Siapa pun bisa melaporkan foto di galeri lewat tombol Laporkan.</li>
      </ul>

      <h2>8. Cookie dan penyimpanan di perangkat</h2>
      <p>Kami hanya memakai penyimpanan yang dibutuhkan agar layanan berjalan, tanpa cookie iklan atau pelacak pihak ketiga:</p>
      <ul>
        <li>Cookie sesi login untuk host.</li>
        <li>Cookie akses galeri yang dilindungi kata sandi.</li>
        <li>Sesi kamera tamu dan antrean foto yang belum terkirim (agar foto tetap terkirim setelah sinyal kembali), disimpan di perangkat tamu.</li>
        <li>Daftar tamu dan antrean check-in di perangkat penerima tamu, agar scanner tetap bekerja saat jaringan terputus.</li>
      </ul>

      <h2>9. Keamanan</h2>
      <p>
        Data dikirim melalui koneksi terenkripsi. Akses dibatasi per peran di tingkat database. Foto hanya bisa dibuka lewat link bertanda tangan yang
        kedaluwarsa, link pribadi tamu dan link staf memakai kode acak yang sulit ditebak, dan kata sandi galeri disimpan dalam bentuk hash. Jika terjadi
        kegagalan pelindungan data pribadi, kami memberi tahu pihak yang terdampak paling lambat 3×24 jam sesuai UU PDP.
      </p>

      <h2>10. Foto anak</h2>
      <p>
        Acara keluarga sering melibatkan anak-anak. Pengunggah bertanggung jawab atas foto yang dikirimnya. Orang tua atau wali bisa meminta foto anaknya
        dihapus kapan saja melalui host atau kepada kami.
      </p>

      <h2>11. Perubahan kebijakan</h2>
      <p>
        Kami bisa memperbarui kebijakan ini. Perubahan penting diberitahukan lewat email atau aplikasi sebelum berlaku. Lihat juga{" "}
        <Link href="/legal/syarat" className="underline underline-offset-4">
          Syarat &amp; Ketentuan
        </Link>
        .
      </p>

      <h2>12. Kontak</h2>
      <p>
        <Fill field="operator" />, <Fill field="address" />. Email untuk pertanyaan dan permintaan data pribadi: <Fill field="contactEmail" />.
      </p>
    </>
  );
}

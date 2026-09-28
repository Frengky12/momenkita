import type { Metadata } from "next";
import Link from "next/link";
import { Fill } from "../fill";

export const metadata: Metadata = { title: "Syarat & Ketentuan · MomenKita" };

// Isi mengikuti PRD §3 (paket, refund, masa simpan) dan §9 (privasi, amplop digital, moderasi, custom domain).
// Draf: wajib ditinjau ahli hukum sebelum launch publik.
export default function TermsPage() {
  return (
    <>
      <h1>Syarat &amp; Ketentuan</h1>
      <p className="text-sm text-muted-foreground">
        Berlaku sejak <Fill field="effectiveDate" />.
      </p>

      <p>
        MomenKita adalah layanan undangan digital, buku tamu, kamera tamu, layar panggung, dan galeri acara yang dikelola oleh{" "}
        <Fill field="operator" /> (&quot;kami&quot;). Dengan membuat akun atau memakai MomenKita, kamu menyetujui syarat ini dan{" "}
        <Link href="/legal/privasi" className="underline underline-offset-4">
          Kebijakan Privasi
        </Link>
        .
      </p>

      <h2>1. Siapa saja pengguna MomenKita</h2>
      <ul>
        <li>
          <strong>Host</strong>: pemilik akun yang membuat event (misalnya pasangan pengantin atau keluarganya). Host bisa mengundang co-host untuk ikut
          mengelola event.
        </li>
        <li>
          <strong>Tamu</strong>: orang yang membuka undangan, mengisi RSVP dan ucapan, atau mengirim foto lewat kamera tamu. Tamu tidak perlu membuat akun.
        </li>
        <li>
          <strong>Staf hari-H</strong>: orang yang diberi link dan PIN oleh host untuk bertugas sebagai penerima tamu, moderator, operator layar panggung,
          atau fotografer.
        </li>
      </ul>

      <h2>2. Akun</h2>
      <ul>
        <li>Kamu masuk dengan link yang kami kirim ke email kamu. Jaga akses ke email tersebut karena siapa pun yang membukanya bisa masuk ke akunmu.</li>
        <li>Kamu wajib cakap hukum untuk membuat akun dan membeli paket.</li>
        <li>Kamu bertanggung jawab atas aktivitas di akunmu, termasuk tindakan co-host dan staf yang kamu beri akses.</li>
      </ul>

      <h2>3. Paket dan pembayaran</h2>
      <ul>
        <li>Undangan bisa dirakit dan dipratinjau gratis. Undangan baru bisa dipublikasikan setelah event memiliki paket.</li>
        <li>
          Harga dan isi paket (Classic, Complete Experience, Unlimited Luxury), upgrade, dan add-on tercantum di aplikasi saat pembelian. Pembayaran
          diproses oleh Midtrans; kami tidak menyimpan data kartu atau rekening pembayaranmu.
        </li>
        <li>Paket berlaku untuk satu event dan tidak bisa dipindahkan ke event lain.</li>
      </ul>

      <h3>Promo masa peluncuran</h3>
      <ul>
        <li>
          Selama promo berjalan, paket tertentu bisa diaktifkan tanpa bayar dengan batas jumlah event per akun. Jenis paket, batas, dan tanggal berakhir
          tercantum di aplikasi.
        </li>
        <li>Kami boleh mengubah atau menghentikan promo kapan saja. Event yang sudah mengaktifkan promo tetap aktif sampai masa paketnya selesai.</li>
        <li>
          Kami boleh mencabut promo yang diperoleh dengan cara tidak wajar, misalnya membuat banyak akun untuk mengulang promo. Event yang promonya
          dicabut kembali menjadi draf.
        </li>
      </ul>

      <h2>4. Refund dan jaminan hari-H</h2>
      <ul>
        <li>Refund penuh bisa diminta sebelum undangan dipublikasikan.</li>
        <li>
          Setelah undangan dipublikasikan, tidak ada refund, kecuali terjadi gangguan layanan di hari acara: layar panggung atau unggah foto tidak berfungsi
          lebih dari 15 menit karena kesalahan kami. Dalam kasus itu, biaya komponen Complete Experience dikembalikan 100%.
        </li>
        <li>
          Refund diajukan ke <Fill field="contactEmail" /> dan diproses manual. Paket yang diaktifkan lewat promo gratis tidak memiliki nilai refund.
        </li>
      </ul>

      <h2>5. Kuota foto dan masa simpan</h2>
      <ul>
        <li>
          Kuota foto bersifat batas lunak: di hari acara, kamera tamu tetap berfungsi walau kuota terlewati. Foto di atas kuota tersimpan tetapi terkunci
          di galeri dan unduhan sampai host membeli tambahan kuota.
        </li>
        <li>
          Paket Complete: album (foto dan galeri) disimpan 6 bulan setelah tanggal acara, dan bisa diperpanjang dengan add-on. Kami mengirim pengingat
          ke email host sebelum album dihapus. Setelah masa simpan berakhir, file foto dihapus permanen.
        </li>
        <li>
          Paket Unlimited Luxury: album disimpan selama layanan MomenKita beroperasi. Jika layanan dihentikan, kami memberi tahu paling lambat 90 hari
          sebelumnya agar album bisa diunduh.
        </li>
        <li>Unduh album (ZIP) selama masa simpan adalah tanggung jawab host.</li>
      </ul>

      <h2>6. Konten yang kamu unggah</h2>
      <ul>
        <li>
          Kamu tetap memiliki konten yang kamu unggah (teks, foto, musik). Kamu memberi kami izin terbatas untuk menyimpan, memproses, dan menampilkannya
          hanya untuk menjalankan event tersebut. Kami tidak memakai foto atau konten event untuk promosi tanpa izin tertulis darimu.
        </li>
        <li>
          Kamu menjamin berhak memakai konten yang kamu unggah, termasuk lagu untuk musik latar. Tanggung jawab hak cipta ada pada pengunggah.
        </li>
        <li>
          Dilarang mengunggah konten yang melanggar hukum, pornografi, kekerasan, ujaran kebencian, atau data pribadi orang lain tanpa hak.
        </li>
        <li>
          Siapa pun bisa melaporkan foto lewat tombol Laporkan di galeri. Foto yang melanggar diturunkan dan dihapus permanen, dengan target paling lama
          24 jam sejak laporan.
        </li>
      </ul>

      <h2>7. Foto dari tamu</h2>
      <ul>
        <li>
          Sebelum memakai kamera tamu, setiap tamu diminta menyetujui bahwa fotonya tampil di layar acara dan di galeri event. Host dianjurkan memberi
          tahu tamu bahwa acara memakai kamera tamu dan layar panggung.
        </li>
        <li>Tamu bisa menghapus foto yang dikirimnya sendiri dari perangkat yang sama. Permintaan penghapusan lain diajukan lewat host atau kepada kami.</li>
        <li>Host bisa memilih mode moderasi, menyetujui atau menolak foto, dan menggelapkan layar panggung kapan saja.</li>
      </ul>

      <h2>8. Amplop digital</h2>
      <p>
        Fitur amplop digital hanya menampilkan nomor rekening dan gambar QRIS milik host. MomenKita tidak menerima, menampung, atau meneruskan dana apa
        pun. Transfer terjadi langsung antara tamu dan host, dan kami tidak bertanggung jawab atas kesalahan transfer atau keabsahan rekening.
      </p>

      <h2>9. Custom domain (Unlimited Luxury)</h2>
      <p>
        Domain yang disertakan dalam paket didaftarkan dan dibayar oleh kami untuk tahun pertama. Setelah itu perpanjangan ditawarkan kepada host. Jika
        tidak diperpanjang, undangan tetap bisa dibuka di alamat bawaan MomenKita.
      </p>

      <h2>10. Ketersediaan layanan dan batas tanggung jawab</h2>
      <ul>
        <li>
          Kami berupaya menjaga layanan tetap berjalan, terutama di hari acara, tetapi layanan disediakan sebagaimana adanya. Gangguan dari pihak lain
          (misalnya jaringan internet di lokasi acara atau perangkat tamu) di luar kendali kami.
        </li>
        <li>
          Sejauh diizinkan hukum, tanggung jawab kami atas satu event dibatasi sebesar biaya yang kamu bayarkan untuk event tersebut.
        </li>
      </ul>

      <h2>11. Penghentian</h2>
      <p>
        Kamu bisa berhenti memakai MomenKita dan meminta penghapusan akun kapan saja. Kami boleh menangguhkan atau menutup akun yang melanggar syarat
        ini, dengan pemberitahuan bila memungkinkan.
      </p>

      <h2>12. Perubahan syarat</h2>
      <p>
        Kami bisa memperbarui syarat ini. Perubahan penting diberitahukan lewat email atau aplikasi sebelum berlaku. Tanggal berlaku di bagian atas
        halaman selalu menunjukkan versi terbaru.
      </p>

      <h2>13. Hukum yang berlaku</h2>
      <p>
        Syarat ini tunduk pada hukum Republik Indonesia. Sengketa diselesaikan lebih dulu secara musyawarah. Jika tidak tercapai kesepakatan, sengketa
        diselesaikan melalui Pengadilan Negeri <Fill field="disputeCity" />.
      </p>

      <h2>14. Kontak</h2>
      <p>
        <Fill field="operator" />, <Fill field="address" />. Email: <Fill field="contactEmail" />.
      </p>
    </>
  );
}

# REQUIREMENTS — Sistem Absensi KPU Kabupaten Aceh Selatan

> Status dokumen: **DRAFT — menunggu persetujuan pengguna (PHASE 0).**
> Dokumen ini hanya memuat persyaratan yang dinyatakan secara eksplisit dalam
> spesifikasi yang diberikan. Item yang belum ditetapkan dicatat pada
> `docs/AMBIGUITIES.md` dan ditandai **BELUM DITETAPKAN** di sini.

## 1. Tujuan Proyek
Membangun aplikasi absensi pegawai berbasis Progressive Web App (PWA) untuk
KPU Kabupaten Aceh Selatan dengan arsitektur yang dapat dipelihara, aman sejak
awal, dan dapat diuji.

## 2. Stack Teknologi (ditetapkan)
- Frontend: HTML, CSS, JavaScript.
- Hosting frontend: GitHub Pages.
- Backend: Google Apps Script Web App.
- Database: Google Sheets.
- Penyimpanan foto: Google Drive privat.
- Bentuk aplikasi: PWA.
- Zona waktu bisnis: `Asia/Jakarta`.

Arsitektur: `Browser/PWA → HTTPS → Google Apps Script → Google Sheets & Google Drive`.

## 3. Autentikasi & Akun
- Pegawai masuk menggunakan PIN pribadi.
- Sistem membedakan peran `pegawai` dan `admin`.
- PIN tidak boleh disimpan sebagai teks biasa (wajib hash).
- Pembatasan percobaan login dan penundaan/penguncian sementara untuk percobaan berulang.
- Reset PIN hanya melalui mekanisme admin yang terotorisasi.
- Peran admin tidak boleh dipercaya dari sisi klien; verifikasi di backend.
- **SUDAH DITETAPKAN** (lihat `docs/DECISIONS.md`): penerbitan PIN awal & reset
  oleh admin, format PIN 6 digit angka (DEC-P22); hash PBKDF2-HMAC-SHA256 (DEC-P10);
  lockout 5x gagal/15 menit per-akun (DEC-P11); bootstrap admin via `seedAdmin()`
  (DEC-P12); sesi token di memori klien, atau di `localStorage` bila "Ingat saya"
  dicentang — masa berlaku tetap TTL server 8 jam, tanpa cookie (DEC-P09 diperbarui
  DEC-P30).

## 4. Mode Kerja
- Pegawai memilih mode saat absensi: **WFO** atau **WFH/WFA**.
- Admin tidak menetapkan mode kerja harian dalam alur absensi.
- Mode yang dipilih direkam bersama data absensi.
- Pemilihan mandiri bukan bukti kepatuhan kebijakan kantor.

## 5. Jam Absensi (zona `Asia/Jakarta`, acuan waktu server)
- **Absen masuk reguler:** sebelum `07:00:00` ditolak; `07:00:00`–`08:30:00` diterima dengan status `TEPAT_WAKTU`; setelah `08:30:00` sampai akhir hari diterima dengan status `TERLAMBAT` (DEC-P31).
- **Absen pulang reguler:** mulai `16:00:00`, batas akhir `23:59:59`; setelah pergantian tanggal, absen pulang untuk tanggal sebelumnya ditolak sebagai reguler.
- Keputusan memakai waktu server, bukan jam perangkat pengguna.
- Dilarang memakai perbandingan string waktu yang tidak tervalidasi.
- **BELUM DITETAPKAN:** perlakuan hari libur & akhir pekan → `AMB-10`.

## 6. Foto & GPS
- **Masuk WFO:** foto via kamera perangkat (wajib), GPS wajib, jarak maks 50 m dari titik kantor.
- **Pulang WFO:** foto via kamera perangkat, GPS tidak diwajibkan.
- **Masuk & pulang WFH/WFA:** foto via kamera perangkat, GPS tidak diwajibkan.
- Galeri tidak boleh untuk alur reguler ini.
- Tanpa watermark; simpan foto asli sesuai kemampuan perangkat.
- Metadata absensi disimpan terpisah.
- Foto/bukti tidak boleh punya tautan publik.
- Jika izin kamera/GPS wajib tidak tersedia → absensi reguler tidak dicatat berhasil.
- Browser tidak menjamin foto benar-benar dari kamera fisik; jangan klaim anti-curang mutlak.
- Tolak koordinat tidak valid; tangani kegagalan lokasi eksplisit; gunakan perhitungan jarak geografis yang tepat; uji batas radius.
- **BELUM DITETAPKAN:** titik koordinat kantor → `AMB-07`. Fitur validasi lokasi tidak diaktifkan sebelum titik ditetapkan.

## 7. Aturan Transaksi Absensi
- Satu absen masuk reguler per pegawai per tanggal.
- Satu absen pulang reguler per pegawai per tanggal.
- Absen pulang tidak mensyaratkan catatan masuk. Jika catatan masuk tanggal itu tidak tersedia, catatan pulang disimpan dengan status `TANPA_ABSEN_MASUK`; status ini hanya menandai ketiadaan data masuk dan bukan kesimpulan ketidakhadiran (DEC-P31).
- Absen pulang wajib memuat Uraian Pekerjaan dan Output Pekerjaan; validasi wajib dilakukan di backend sebelum foto atau baris disimpan.
- Laporan detail menampilkan kondisi masuk/pulang per pegawai-hari, waktu masuk/pulang yang benar-benar tersimpan, serta uraian/output pada catatan pulang. Waktu yang tidak memiliki catatan tetap kosong; ekspor CSV memuat pasangan waktu dan kondisi yang sama (DEC-P31).
- Permintaan ganda ditangani aman (hindari duplikasi klik berulang / race condition).
- Validasi di backend.
- Jika backend gagal menyimpan data/bukti → jangan tampilkan status berhasil.
- Status UI: proses, berhasil, gagal, perlu ditindaklanjuti.

## 8. Absensi di Luar Jam Reguler (Susulan)
- Pegawai mengajukan absensi susulan dengan bukti dan alasan.
- Admin memutuskan menerima/menolak.
- Sistem harus membedakan: tanggal absensi diajukan, jenis absensi, mode kerja yang diklaim, waktu aktual yang diklaim pegawai, waktu pengajuan diterima server, waktu keputusan admin, identitas admin pemutus, catatan/alasan keputusan, waktu & identitas perubahan data.
- Persetujuan susulan tidak boleh mengubah waktu pengajuan seolah direkam server pada waktu aktual yang diklaim.
- **SUDAH DITETAPKAN** (DEC-P23/P24): batas maksimum **3 hari** sebelum hari server
  (WIB), tanpa tanggal mendatang; bukti wajib **alasan teks + foto JPEG**.

## 9. Pengelolaan Pegawai
- Panel admin untuk mengelola data pegawai.
- Field yang **diusulkan** (perlu verifikasi): ID pegawai internal, Nama, NIP/NIPPPK atau identitas resmi, Jabatan, Unit kerja, Status aktif/nonaktif, metadata pembuatan/perubahan.
- Admin dapat menambah & mengubah data pegawai serta menonaktifkan akun tanpa menghapus riwayat absensi.
- Input manual & impor CSV/Excel bersifat **usulan** — bukan kewajiban final sampai disetujui → `AMB-14`.
- Dilarang mengisi data pegawai produksi dengan data fiktif. Data uji harus sintetis, berlabel `TEST`, terpisah dari produksi.

## 10. Struktur Data (kandidat sheet)
`Pegawai`, `Akun`, `Absensi`, `BuktiAbsensi`, `Pengaturan`, `HariLibur`, `LogAktivitas`, `PengajuanSusulan`.
- Kolom final didokumentasikan di `docs/DATA_DICTIONARY.md`.
- Dilarang menambah/menghapus field bisnis tanpa catatan alasan & persetujuan bila mengubah persyaratan.
- Gunakan ID internal stabil; dilarang memakai nomor baris sebagai identitas permanen.
- Operasi tulis harus mengurangi duplikasi, tabrakan bersamaan, dan ketidakkonsistenan foto ↔ metadata.
- Google Sheets bukan database transaksional penuh; batasan & mitigasi wajib didokumentasikan.

## 11. Drive & Privasi
- Foto disimpan di folder Drive privat, terorganisir tahun/bulan/tanggal/pegawai.
- Struktur final (DEC-P29):
  `ABSENSI_KPU/YYYY/MM_NamaBulan/DD/NamaPegawai_IDPegawai/Absen_Masuk.jpg` &
  `Absen_Pulang.jpg`. Nama folder bulan `MM_NamaBulan` (Indonesia) dan bagian
  pegawai memakai ID internal sebagai kunci (nama saja tidak cukup).
- Foto susulan tersimpan terpisah di `.../MM/Foto_Susulan/` (bukan catatan
  absensi reguler, DEC-P24).
- Dilarang membuat file publik / mengaktifkan "siapa pun dengan tautan".
- Simpan referensi file untuk pencarian & audit.
- Dilarang mengirim isi foto/data pribadi ke log yang tidak perlu.
- Tangani kegagalan simpan Drive & Sheets secara eksplisit.
- Dilarang menghapus bukti absensi hanya karena akun dinonaktifkan.
- **SUDAH DITETAPKAN** (DEC-P26): simpan permanen — tanpa penghapusan otomatis.

## 12. PWA & UI
- Antarmuka profesional, bersih, responsif, desktop & seluler.
- Manifest PWA valid.
- Service worker hanya meng-cache aset statis aman; dilarang cache PIN, sesi, foto privat, data absensi privat.
- Tampilkan status koneksi; jika offline, tampilkan absensi tidak dapat dikirim.
- Dilarang mengantre absensi offline diam-diam / mengklaim berhasil sebelum konfirmasi backend.
- Indikator izin kamera & GPS.
- Pesan error jelas tanpa membocorkan detail internal.
- Aksesibilitas dasar: label input, fokus keyboard, kontras, navigasi konsisten.
- Dilarang mengarang logo/warna/aset instansi; gunakan placeholder jelas.
- Hindari efek visual berlebihan/animasi mengganggu.

## 13. Keamanan (ringkas; detail di `docs/SECURITY.md`)
Threat modeling minimal terhadap: percobaan PIN berulang; pemalsuan permintaan frontend; manipulasi waktu perangkat; manipulasi parameter ID pegawai; akses lintas pegawai; akses foto via tautan publik; penyalahgunaan endpoint admin; permintaan ganda/race condition; penyalahgunaan token/sesi; kebocoran konfigurasi/log; perubahan/penghapusan tanpa jejak audit; kegagalan parsial bukti ↔ metadata.
- Dilarang menaruh rahasia di JavaScript yang dikirim ke browser.
- Dilarang mengklaim aplikasi sepenuhnya aman; catat keterbatasan & pengujian yang belum dilakukan.

## 14. Dokumen Wajib
`README.md`, `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/AMBIGUITIES.md`, `docs/ARCHITECTURE.md`, `docs/DATA_DICTIONARY.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`.

## 15. Ruang Lingkup Tidak Termasuk (default)
Fitur di luar absensi pegawai, pengelolaan pegawai, panel admin, laporan, audit,
dan PWA tidak termasuk kecuali disetujui. Rekap/ekspor detail: format ekspor
**CSV saja** & laporan = admin (DEC-P07, AMB-19 ANSWERED); aturan indikator
kebijakan (terlambat/persen kehadiran) tetap belum ditetapkan.

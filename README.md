# Sistem Absensi KPU Kabupaten Aceh Selatan (PWA)

Aplikasi absensi pegawai berbasis Progressive Web App (PWA).

- **Frontend:** HTML, CSS, JavaScript — GitHub Pages.
- **Backend:** Google Apps Script Web App.
- **Database:** Google Sheets.
- **Penyimpanan foto:** Google Drive privat.
- **Zona waktu:** `Asia/Jakarta`.
- **Versi frontend live:** `0.10.9` (`assets/js/config.js`).
- **URL aplikasi:** `https://kipasel.github.io/Absensi/`.

## Status Proyek

**BELUM SIAP RILIS.** Implementasi dan pengujian otomatis lokal selesai, tetapi
verifikasi runtime dengan akun, kamera, GPS, PWA/service worker, dan data
produksi belum dijalankan.

Status per 2026-10-28:

- Frontend `0.10.9` sudah terbit di GitHub Pages; build dan aset live
  terverifikasi.
- Backend Web App merespons `ok:true`, `backendConfigured:true`, dan
  `officeLocationConfigured:true`.
- Backend live **belum memuat rekap absensi bulanan**: probe
  `report.rekap.monthly` menghasilkan `UNKNOWN_ACTION`. Rekap bulanan dan
  perubahan backend terbaru belum dapat dipakai sampai Apps Script dideploy.
- Perbaikan status pulang sudah ada di repo dan frontend, tetapi rekonsiliasi
  status pada spreadsheet produksi belum dijalankan.
- Uji login, absensi, laporan, dan rekonsiliasi dengan data nyata belum
  dilakukan, sehingga perbaikan **belum boleh diklaim aktif**.
- Benchmark iterasi PBKDF2 di runtime Apps Script nyata belum dilakukan.

## Fitur Utama

### Pegawai

- Login dengan NIP/NIPK dan PIN 6 digit; token sesi disimpan di memori atau
  `localStorage` bila “Ingat saya” dipilih.
- Absensi masuk/pulang dengan foto kamera; masuk mode WFO memerlukan GPS dalam
  radius kantor 50 m.
- Aturan waktu WIB: masuk `07:00:00–08:30:00` = tepat waktu, setelah
  `08:30:00` = terlambat; pulang `16:00:00–23:59:59`.
- Penolakan absensi duplikat dengan pesan yang jelas; pengiriman ulang dengan
  `id_absensi` yang sama tetap idempoten.
- Riwayat absensi pribadi dan status absen hari ini.
- Pengajuan susulan nonaktif pada UI dan router aktif (DEC-P31).

### Admin

- Kelola pegawai, akun, PIN, status aktif, dan log audit.
- Lihat daftar/detail absensi dan foto bukti melalui endpoint ber-token.
- Laporan periode dengan filter pegawai, jenis, mode, sumber, dan status.
- Data table: pencarian, urut kolom, 10/20/30/50 baris per halaman, navigasi
  halaman, tombol gulir horizontal, serta gulir vertikal dengan header sticky.
- Rekap absensi bulanan per pegawai: masuk tepat waktu/terlambat dan pulang
  valid, dipisah WFO dan WFH/WFA, dengan tombol cetak.
- Ekspor CSV dan Excel `.xlsx` (maks. 5000 baris, filter sama, tanpa
  PIN/token/referensi foto).

### Status Absensi

- Status masuk: `TEPAT_WAKTU`, `TERLAMBAT`, atau `TANPA_ABSEN_MASUK`.
- Pulang valid: `SUDAH_ABSEN_PULANG`.
- Ada masuk valid tanpa pulang valid: `BELUM_ABSEN_PULANG` (status turunan
  laporan; bukan baris fiktif di Google Sheets).
- Nol pada rekap berarti tidak ada catatan valid, bukan kesimpulan tidak hadir.

## Struktur Proyek

```text
index.html                  Halaman aplikasi (app shell)
manifest.webmanifest        Manifest PWA
service-worker.js           Cache aset statis
assets/
  css/styles.css            Desain responsif dan aturan cetak
  js/config.js              Konfigurasi publik (versi, URL API)
  js/api.js                 Klien POST dan penanganan sesi
  js/app.js                 Status jaringan/backend
  js/auth.js                Login/logout
  js/camera.js              Kamera dan kompresi JPEG
  js/attendance.js          Alur absensi masuk/pulang
  js/my-attendance.js       Riwayat absensi pegawai
  js/admin.js               Panel admin
  js/report.js              Laporan, rekap bulanan, CSV, Excel, cetak
  js/datetime.js            Format tanggal/waktu Asia/Jakarta
  js/nav.js                 Navigasi aplikasi
gas/
  Code.gs                   Titik masuk dan router aksi
  Config.gs                 Konfigurasi Script Properties
  Auth.gs                   Primitif PIN/token/PBKDF2
  AuthService.gs            Login, sesi, otorisasi
  AdminService.gs           Endpoint panel admin
  ReportService.gs          Laporan, rekap, ekspor
  MyAttendanceService.gs    Riwayat absensi pribadi
  TimeRule.gs               Aturan waktu absensi
  Geo.gs                    Validasi GPS/Haversine
  Drive.gs                  Penyimpanan foto privat
  Attendance.gs             Mesin absensi
  Repo.gs                   Akses Sheets dan rekonsiliasi status
  Susulan.gs                Endpoint susulan (nonaktif)
  Bootstrap.gs              initializeSheets() dan seedAdmin()
tests/
  check-foundation.mjs      Struktur, sintaks, versi, tanpa rahasia
  auth.test.mjs             Autentikasi dan kripto
  attendance.test.mjs       Absensi, waktu, GPS, foto, duplikat
  admin.test.mjs            Otorisasi dan endpoint admin
  report.test.mjs           Laporan, status, pencarian/urut, ekspor
  susulan.test.mjs          Susulan nonaktif
  datetime.test.mjs         Format tanggal/waktu
docs/                       Dokumentasi proyek
```

## Menjalankan Secara Lokal

Jalankan server statis dari root repositori:

```bash
py -m http.server 8765
```

Lalu buka `http://127.0.0.1:8765/`.

## Pengujian

```bash
node tests/check-foundation.mjs   # 84 cek
node tests/auth.test.mjs          # 57 cek
node tests/attendance.test.mjs    # 221 cek
node tests/admin.test.mjs         # 170 cek
node tests/report.test.mjs        # 282 cek
node tests/susulan.test.mjs      # 67 cek
node tests/datetime.test.mjs      # 14 cek
```

Hasil terakhir: **seluruh 895 cek lulus, 0 gagal**. Pengujian memakai stub
runtime Apps Script di Node dan **bukan** pengganti uji integrasi browser,
kamera, GPS, PWA, atau Apps Script nyata.

## Deployment

Ringkasan:

1. Deploy seluruh berkas `gas/` sebagai versi Web App baru.
2. Set Script Properties tanpa menyimpan nilai rahasia di repo.
3. Jalankan `initializeSheets()` dan `seedAdmin()` bila lingkungan baru.
4. Setelah backend terbaru dideploy, jalankan
   `reconcileAbsensiStatusesPreview()`, periksa hasil, lalu
   `reconcileAbsensiStatusesApply()`.
5. Pastikan `API_BASE_URL` di `assets/js/config.js` menunjuk ke deployment
   terbaru, lalu terbitkan frontend dengan `VERSION` dan `CACHE_VERSION` yang
   sama.
6. Verifikasi login, absensi, laporan, rekap bulanan, ekspor, dan cetak di
   browser nyata sebelum menyatakan rilis siap.

Prosedur lengkap ada di `docs/DEPLOYMENT.md` dan `gas/README.md`.

## Dokumentasi

| Dokumen | Isi |
|---------|-----|
| `docs/FUNGSI_FITUR.md` | Ringkasan fungsi dan fitur |
| `docs/REQUIREMENTS.md` | Persyaratan yang disetujui |
| `docs/AMBIGUITIES.md` | Hal yang belum ditetapkan |
| `docs/DECISIONS.md` | Catatan keputusan |
| `docs/ARCHITECTURE.md` | Arsitektur sistem |
| `docs/DATA_DICTIONARY.md` | Kamus data |
| `docs/SECURITY.md` | Model ancaman dan mitigasi |
| `docs/TEST_PLAN.md` | Rencana dan hasil pengujian |
| `docs/DEPLOYMENT.md` | Prosedur konfigurasi dan deploy |
| `docs/PROGRESS.md` | Progres per phase |

## Aturan Kontribusi

Baca `AGENTS.md` sebelum mengubah apa pun. Dilarang mengarang kebutuhan, data,
kredensial, koordinat kantor, atau kebijakan yang belum diberikan. Jangan
menaruh PIN, token, ID resource, atau rahasia lain di frontend/repositori.

## Catatan Aset

Ikon di `assets/icons/` adalah placeholder netral, **bukan** logo resmi KPU.
Ganti setelah aset resmi diberikan oleh pihak berwenang.

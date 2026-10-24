# Sistem Absensi KPU Kabupaten Aceh Selatan (PWA)

Aplikasi absensi pegawai berbasis Progressive Web App (PWA).

- **Frontend:** HTML, CSS, JavaScript — dihosting di GitHub Pages.
- **Backend:** Google Apps Script Web App.
- **Database:** Google Sheets.
- **Penyimpanan foto:** Google Drive privat.
- **Zona waktu:** `Asia/Jakarta`.
- **Versi kode lokal:** `0.6.7` (belum dideploy; sumber: `assets/js/config.js`).

## Status Proyek
**PHASE 6 — QA rilis: selesai (lokal); BELUM SIAP RILIS.** Audit kode & keamanan
dilakukan; 3 bug frontend diperbaiki (retry absensi, reset tombol kirim, penanganan
sesi kedaluwarsa); suite uji lokal saat ini lulus (74/56/200/166/178/67). Verifikasi
nyata: backend Apps Script ter-deploy & health check `ok:true` dengan
`backendConfigured:true` (`SPREADSHEET_ID`/`DRIVE_FOLDER_ID` terisi — DEC-P08/DEC-P20)
dan **`officeLocationConfigured:true`** (koordinat kantor tersimpan — AMB-07/DEC-P20);
**GitHub Pages sudah aktif** — frontend live di `https://kipasel.github.io/Absensi/`
(HTTP 200, versi live 0.6.5). Perubahan lokal DEC-P31 belum dipublikasikan.
Rilis tetap terblokir **uji integrasi/browser nyata**
(kamera/GPS/PWA/SW, login & absensi akun nyata). Lihat `docs/PROGRESS.md`
& `docs/DEPLOYMENT.md`.

**UI 0.6.x (mobile app):** antarmuka berbentuk app shell — app bar lengket
+ **bilah navigasi bawah** (Beranda/Absensi/Admin/Profil), kartu, dan tombol besar
ala aplikasi mobile. Warna **ciri khas KPU** (merah `#D82731`, marun `#771414`,
emas `#F8A73E` — mengikuti `www.kpu.go.id`) dengan netral lembut agar nyaman di
mata, latar bergaya teknologi (gradien radial + kisi halus), mode gelap.
`assets/js/nav.js` mengatur perpindahan tampilan (item Admin hanya untuk peran
admin). Logika bisnis & seluruh ID/kelas yang dipakai modul lain tidak berubah.

Rincian phase sebelumnya:
**PHASE 5 — Laporan & Ekspor: selesai (lokal).** Halaman laporan admin (filter
periode/pegawai/jenis/mode/sumber/status), rekapitulasi fakta terhitung, tabel
rincian berpaginasi, dan ekspor **CSV** (DEC-P07) telah diimplementasikan &
diuji lokal di Node (178 cek; seluruh endpoint `report.*` terotorisasi `admin`
di server). Integrasi runtime Apps Script (butuh `SPREADSHEET_ID`) dan
pengujian browser fitur DEC-P31 **belum** dijalankan. Pengajuan susulan tetap
nonaktif pada UI/router aktif. Laporan menampilkan kondisi dan pasangan waktu
masuk/pulang, status catatan, uraian/output, dan pulang tanpa catatan masuk;
tidak menghitung persentase kehadiran. Lihat
`docs/PROGRESS.md`.

## Struktur Proyek
```
index.html                  Halaman awal (status aplikasi/jaringan/backend/versi)
manifest.webmanifest        Manifest PWA
service-worker.js           Cache aset statis (tanpa data privat)
assets/
  css/styles.css            Sistem desain mobile-first (app bar, kartu, nav bawah), mode gelap
  js/config.js              Konfigurasi PUBLIK (nama, versi, URL API)
  js/api.js                 Klien POST (token sesi memori/opsi localStorage)
  js/app.js                 Logika antarmuka (status jaringan/backend)
  js/auth.js                UI login/logout (NIP/NIPK + PIN)
  js/camera.js              Kamera → canvas JPEG (kompresi klien)
  js/attendance.js          Alur absensi (jenis/mode/GPS/foto/kirim)
  js/admin.js               Panel admin (pegawai/absensi/log audit; susulan nonaktif)
  js/report.js              Tab laporan admin (filter, rekap, rincian, ekspor CSV)
  js/nav.js                 Controller navigasi (bottom nav + perpindahan tampilan)
  icons/icon-192.png        Ikon placeholder (bukan logo resmi)
  icons/icon-512.png
gas/
  Code.gs                   Titik masuk doGet/doPost + router aksi + respons JSON
  Config.gs                 Konfigurasi server (Script Properties) + kebijakan
  Auth.gs                   Primitif PBKDF2/PIN/token/lockout
  Repo.gs                   Akses Sheets, LockService, log aktivitas
  AuthService.gs            Alur login/sesi/otorisasi/manajemen akun
  AdminService.gs           Endpoint panel admin (otorisasi admin, PHASE 4)
  ReportService.gs          Endpoint laporan, rekap & ekspor CSV (PHASE 5)
  TimeRule.gs               Aturan jendela waktu absensi (WIB)
  Geo.gs                    Haversine + evaluasi GPS masuk WFO
  Drive.gs                  Simpan foto JPEG ke folder Drive privat
  Attendance.gs             Mesin absensi reguler (validasi & penyimpanan)
  Bootstrap.gs              initializeSheets() & seedAdmin() (manual)
  appsscript.json           Manifest Apps Script (timezone + webapp D8)
  README.md                 Dokumentasi backend & deploy
tools/generate-icons.mjs    Generator ikon placeholder
tests/check-foundation.mjs  Pemeriksaan fondasi otomatis (74 cek)
tests/harness.mjs           Stub runtime Apps Script untuk pengujian Node
tests/auth.test.mjs         Pengujian autentikasi otomatis (56 cek)
tests/attendance.test.mjs   Pengujian mesin absensi otomatis (200 cek)
tests/admin.test.mjs         Pengujian panel admin otomatis (166 cek)
tests/report.test.mjs        Pengujian laporan & ekspor CSV otomatis (178 cek)
tests/susulan.test.mjs       Pengujian endpoint susulan (route aktif dinonaktifkan)
docs/                       Dokumentasi proyek
```

## Menjalankan Secara Lokal
Jalankan server statis dari root repositori, misalnya:
```
py -m http.server 8765
```
Lalu buka `http://127.0.0.1:8765/`.

## Pengujian
```
node tests/check-foundation.mjs   # struktur, sintaks, JSON, ikon, tanpa rahasia (74 cek)
node tests/auth.test.mjs          # autentikasi & kripto (56 cek, termasuk RFC 7914 §11)
node tests/attendance.test.mjs    # mesin absensi: waktu/GPS/foto/duplikat (200 cek)
node tests/admin.test.mjs         # panel admin: otorisasi/pegawai/absensi/log (166 cek)
node tests/report.test.mjs        # laporan/rekap/ekspor CSV: otorisasi/filter/keamanan (178 cek)
node tests/susulan.test.mjs       # pengajuan susulan tetap nonaktif (67 cek)
```
Pengujian berjalan di Node dengan stub runtime Apps Script; ini **bukan**
pengganti pengujian di runtime Apps Script nyata (lihat `docs/TEST_PLAN.md`).
Catatan: `API_BASE_URL` sudah terisi dengan URL deployment Apps Script yang
dikonfirmasi pengguna (DEC-P19); health live merespons tetapi
`backendConfigured:true` dan `officeLocationConfigured:true` pada pemeriksaan
health terdokumentasi 2026-10-19. Perubahan lokal DEC-P31 belum diunggah ke
Apps Script atau GitHub Pages.

## Dokumentasi
| Dokumen | Isi |
|---------|-----|
| `docs/FUNGSI_FITUR.md` | **Catatan fungsi aplikasi & daftar fitur** |
| `docs/REQUIREMENTS.md` | Persyaratan yang disetujui |
| `docs/AMBIGUITIES.md` | Hal-hal yang belum ditetapkan |
| `docs/DECISIONS.md` | Catatan keputusan |
| `docs/ARCHITECTURE.md` | Arsitektur sistem |
| `docs/DATA_DICTIONARY.md` | Kamus data (draft) |
| `docs/SECURITY.md` | Model ancaman & mitigasi |
| `docs/TEST_PLAN.md` | Rencana pengujian |
| `docs/DEPLOYMENT.md` | Prosedur konfigurasi & deploy |
| `docs/PROGRESS.md` | Progres per phase |

## Aturan Kontribusi
Baca `AGENTS.md` sebelum mengubah apa pun. Dilarang mengarang kebutuhan, data,
kredensial, koordinat kantor, atau kebijakan yang belum diberikan.

## Catatan Aset
Ikon di `assets/icons/` adalah placeholder netral, **bukan** logo resmi KPU.
Warna dan tipografi bersifat netral. Ganti setelah aset resmi diberikan berwenang.

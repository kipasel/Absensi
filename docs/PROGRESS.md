# PROGRESS

## Perbaikan — Gagal simpan foto absensi (2026-10-26)

- Gejala: saat kirim absensi muncul "Foto gagal disimpan. Absensi TIDAK dicatat"
  (`ATTENDANCE_NOT_STORED`). Tidak ada baris `Absensi`/`BuktiAbsensi` yang ditulis.
- Dugaan penyebab: manifest hanya meminta scope `auth/drive.file`, sedangkan
  `DRIVE_FOLDER_ID` adalah folder root yang dibuat manual oleh operator.
  `drive.file` hanya menjangkau berkas yang dibuat/dibuka aplikasi, sehingga
  `DriveApp.getFolderById`/`createFile` dapat ditolak.
- Perubahan: `gas/appsscript.json` memakai `https://www.googleapis.com/auth/drive`;
  kegagalan Drive kini mencatat detail `name`/`message` ke log server
  (`attendance_drive_failed`) tanpa membocorkannya ke klien; pemeriksaan scope
  ditambahkan di `tests/check-foundation.mjs`.
- Status: perubahan lokal. **Belum terverifikasi** sampai backend dideploy ulang
  sebagai versi baru, otorisasi Drive diberikan ulang, dan absensi nyata berhasil.
- 2026-10-26: URL Web App di `assets/js/config.js` diperbarui ke deployment
  `AKfycbwHo5KfGazslBwNvsrrw7ZkV0J-O_VbidkfmqzvK0LE1utW3aZbmTjokZ7fyrhtW1gWng`;
  health via GET merespons `ok:true`, `backendConfigured:true`,
  `officeLocationConfigured:true`. Versi frontend/cache dinaikkan ke `0.9.3`.
  Uji absensi nyata dengan foto **belum dijalankan**.
- Laporan pengguna 2026-10-26: setelah perubahan scope, unggah foto masih gagal
  (`ATTENDANCE_NOT_STORED`). Ditambahkan `diagnoseDrive()` (jalankan manual dari
  editor Apps Script) dan stack trace pada log `attendance_drive_failed` untuk
  memisahkan penyebab: scope belum disetujui, folder root tidak dapat diakses,
  izin folder, atau kuota Drive. Status penyebab **belum terverifikasi**.
- 2026-10-26 (lanjutan): URL Web App diperbarui lagi ke deployment
  `AKfycbwXgc3ibSrnbS9U6Ysycg778fzEjW5e7lMGPxd9WU8ysY4DmsoEGhnca-HOuF8cdy8kPg`;
  health via GET merespons `ok:true`, `backendConfigured:true`,
  `officeLocationConfigured:true`. Versi frontend/cache dinaikkan ke `0.9.4`.
- 2026-10-26 (lanjutan 2): URL Web App diperbarui ke deployment
  `AKfycbyL2R_JcPT_XhKF__DOi6zsFpgMgHankbiwCiC4DRZp36kGolHtkEkeXw4B2Yo7fo8wrg`;
  health via GET merespons `ok:true`, `backendConfigured:true`,
  `officeLocationConfigured:true`. Versi frontend/cache dinaikkan ke `0.9.5`.

## PHASE 7 — Riwayat pribadi pegawai (2026-10-24)

- `attendance.mine` ditambahkan untuk pegawai terautentikasi; identitas berasal
  dari sesi backend, bukan parameter browser. Mengembalikan catatan bulanan
  berupa tanggal, waktu server, jenis, mode, dan status serta status absen hari
  ini menurut tanggal Asia/Jakarta.
- Ditambahkan status hari ini di Beranda dan tab Riwayat untuk pegawai dengan
  pemilih bulan, jumlah catatan masuk/pulang, serta daftar catatan. Data dirender
  sebagai teks; respons API tidak di-cache service worker.
- Status: frontend v0.9.1 sudah dipush ke `main`/`master` dan terlayani GitHub
  Pages (HTTP 200). GitHub Pages tidak menerbitkan `gas/*.gs`; backend dirilis
  terpisah melalui deployment Apps Script.
- Pengujian lokal: foundation **78/0**, auth **57/0**, attendance **200/0**,
  admin **168/0**, report **178/0**, susulan **67/0**; `git diff --check` bersih.
- Pada 2026-10-24 pengguna memberikan URL Web App baru. Health merespons
  `ok:true`, backend dan lokasi kantor terkonfigurasi; probe `attendance.mine`
  tanpa token merespons `UNAUTHORIZED` (route aktif dan validasi sesi berjalan).
  Integrasi data dengan sesi pegawai nyata belum diuji.
- `assets/js/config.js` memakai URL Web App baru dan versi/cache dinaikkan ke
  `0.9.1` agar klien menarik konfigurasi terbaru.
- Pada 2026-10-25 URL Web App diganti lagi menjadi deployment
  `AKfycbzaFXrEGs-Y9cybJdFXgNYvlmoPiSQ1EakfFvKlfdbjb2Vn33Iya7h0DV2ykjFqAMI_OQ`.
  Health merespons `ok:true`, `backendConfigured:true`, dan
  `officeLocationConfigured:true`. Versi frontend/cache dinaikkan ke `0.9.2`.
  Integrasi login/absensi dengan sesi pegawai nyata belum diuji.

## Ringkasan Phase
| Phase | Nama | Status |
|-------|------|--------|
| 0 | Audit kebutuhan | Selesai (dokumen draft; menunggu jawaban keputusan) |
| 1 | Fondasi proyek | Selesai sebagian (kerangka & dokumentasi; pengujian browser tertunda) |
| 2 | Autentikasi & akun | Selesai sebagian — implementasi + uji lokal lulus; integrasi runtime Apps Script & pengujian browser belum |
| 3 | Mesin absensi | Selesai — implementasi, validasi & uji lokal (112 cek) |
| 4 | Panel admin | Selesai (lokal) — endpoint admin, panel UI, uji lokal (156 cek); integrasi runtime & browser belum |
| 5 | Laporan | Selesai (lokal) — endpoint laporan/rekap/ekspor CSV, UI tab Laporan, uji lokal (162 cek); integrasi runtime & browser belum |
| 6 | Pengujian & rilis | Selesai (lokal) — audit kode & keamanan, 3 perbaikan frontend, verifikasi runtime; rilis terblokir konfigurasi |

## PHASE 0 — Audit Kebutuhan (2026-10-15)
- Pemeriksaan workspace → kosong (proyek baru, bukan repo git).
- `docs/REQUIREMENTS.md`, `docs/AMBIGUITIES.md` (30 item), `docs/DECISIONS.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/ARCHITECTURE.md`,
  `docs/DATA_DICTIONARY.md`, `docs/DEPLOYMENT.md`, `README.md`, `AGENTS.md`.

## PHASE 1 — Fondasi Proyek (2026-10-15)
Dibuat:
- `index.html` — halaman awal: status aplikasi, jaringan, backend, versi.
- `manifest.webmanifest`, `service-worker.js` (cache aset statis; tanpa data privat).
- `assets/css/styles.css`, `assets/js/config.js`, `assets/js/app.js`.
- `assets/icons/icon-192.png`, `assets/icons/icon-512.png` (placeholder netral).
- `tools/generate-icons.mjs` — generator ikon placeholder.
- `tests/check-foundation.mjs` — pemeriksaan fondasi otomatis (30 cek).
- `gas/Code.gs`, `gas/Config.gs`, `gas/appsscript.json`, `gas/README.md` (kerangka backend).
- `.gitignore`.
Diubah (dokumentasi):
- `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/PROGRESS.md`.

Pengujian dijalankan (hasil apa adanya):
- `node tests/check-foundation.mjs` → **30 lulus, 0 gagal** (struktur, sintaks JS/GS,
  JSON, ikon PNG, path, tanpa rahasia/dummy).
- Server statis lokal (`py -m http.server 8765`) → seluruh berkas & aset merespons HTTP 200.
Belum dijalankan:
- Pengujian service worker online/offline di browser nyata.
- Uji responsivitas visual, integrasi backend, dan instalabilitas PWA.
- Deploy nyata ke GitHub Pages & Apps Script (menunggu AMB-21 & AMB-23).

Catatan:
- Tidak ada kredensial, ID resource, atau data pegawai. `API_BASE_URL` sengaja kosong.
- Blok `webapp` pada `appsscript.json` sengaja dikosongkan (AMB-21).
- Skema sheet belum dikarang; menunggu persetujuan `DATA_DICTIONARY.md` (AMB-15).

## Blocker yang Masih Aktif
Lihat `docs/AMBIGUITIES.md`. Kritis: AMB-07 (koordinat), AMB-21 (akses Web App/CORS),
AMB-03/04/05 (PIN/lockout/sesi), AMB-15/16/17 (skema data & format waktu).

## PHASE 2 — Autentikasi & Akun (2026-10-15) — TERBLOKIR
Dilakukan:
- Baca ulang seluruh dokumen & implementasi PHASE 1.
- Verifikasi keterbatasan teknis: Apps Script tanpa cookie (TC-02/03) & tanpa KDF
  bawaan (TC-01); token hanya via body POST; tidak ada IP klien andal (TC-04).
- Audit keputusan autentikasi → `docs/PHASE2_AUDIT.md` (keputusan D1–D8).
- Perbarui `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DATA_DICTIONARY.md`
  (usulan sheet `Sesi`), `docs/TEST_PLAN.md`, `docs/DECISIONS.md`.

Tidak dikerjakan (sengaja):
- Tidak ada kode login/PIN/sesi/manajemen akun. Menebak keputusan keamanan
  dilarang oleh `AGENTS.md` & PHASE 2 §7/§14.
- Tidak ada PIN default, admin default, atau data pegawai.

Status saat audit: **TERBLOKIR** menunggu jawaban D1–D8 (lihat laporan PHASE 2).
Pengujian: tidak ada yang dijalankan (tidak ada kode); dinyatakan apa adanya.

## PHASE 2 — Implementasi Autentikasi & Akun (2026-10-15)
Keputusan pengguna diterima (D0–D8, lihat `docs/DECISIONS.md` DEC-P09..P13 & pasal
PHASE 2). Implementasi dilakukan:

Dibuat:
- `gas/Auth.gs` — PBKDF2-HMAC-SHA256 (RFC 2898), PIN make/verify, token, lockout,
  validitas sesi. Primitif byte murni agar dapat diuji.
- `gas/Repo.gs` — akses Sheets (header `Pegawai`/`Akun`/`Sesi`/`LogAktivitas`),
  `LockService`, ID internal, log append-only tanpa data rahasia.
- `gas/AuthService.gs` — login/logout/session.check, otorisasi peran, manajemen akun
  admin; reset PIN ditolak (NOT_AVAILABLE, keputusan D5).
- `gas/Bootstrap.gs` — `initializeSheets()`, `seedAdmin()` (dari Script Properties;
  tanpa PIN default di kode).
- `assets/js/api.js` — klien POST `text/plain`; token HANYA di memori (D1).
- `assets/js/auth.js` — UI login/keluar (NIP/NIPK + PIN).
- `tests/harness.mjs`, `tests/auth.test.mjs` — 42 cek otomatis.

Diubah:
- `gas/Code.gs` — router aksi auth + `AppError_` (pesan aman vs. disamarkan).
- `gas/Config.gs` — kunci properti PHASE 2 & kebijakan (iterasi, TTL sesi, lockout).
- `gas/appsscript.json` — blok `webapp` (executeAs USER_DEPLOYING, access
  ANYONE_ANONYMOUS — keputusan D8) + `oauthScopes`.
- `index.html`, `assets/css/styles.css` — panel masuk/sesi; `assets/js/config.js`
  (versi 0.2.0); `service-worker.js` (cache `app-v0.2.0`, + `api.js`/`auth.js`).
- `tests/check-foundation.mjs` — mencakup berkas baru (44 cek).
- `gas/README.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/TEST_PLAN.md`, `docs/DATA_DICTIONARY.md`, `docs/PHASE2_AUDIT.md`.

Pengujian dijalankan (hasil apa adanya):
- `node tests/check-foundation.mjs` → **44 lulus, 0 gagal**.
- `node tests/auth.test.mjs` → **42 lulus, 0 gagal** (termasuk vektor
  PBKDF2-HMAC-SHA256 RFC 7914 §11 c=1 & c=80000, lockout 5×, isolasi peran,
  pesan login seragam, dan ketiadaan PIN/token di log).
Belum dijalankan / belum terverifikasi:
- **Jumlah iterasi PBKDF2 belum di-benchmark di runtime Apps Script nyata** (D2);
  nilai 10000 masih sementara.
- Integrasi runtime Apps Script: butuh `SPREADSHEET_ID` (DEC-P08) — belum ada.
- Uji browser: form masuk, sesi hanya di memori, offline (FD-12/13/14/15).
- Konkurensi nyata di bawah `LockService` (AU-13) & kegagalan penyimpanan (AU-14).

Catatan:
- Tidak ada PIN/token/ID resource di repositori frontend.
- `API_BASE_URL` tetap kosong; tidak ada klaim backend terhubung.
- Pengujian kriptografi di Node memakai stub; ini **bukan** jaminan perilaku
  identik di runtime Apps Script.

Status: implementasi & uji lokal **selesai sebagian**. Jangan mulai PHASE 3 tanpa
instruksi. Blocker integrasi: `SPREADSHEET_ID` (DEC-P08). Blocker benchmark: runtime
Apps Script.


## PHASE 3 — Mesin Absensi (2026-10-19)

Dibuat:
- `gas/TimeRule.gs` — validasi jendela masuk (07:00–08:30) & pulang (16:00–23:59) WIB per hari (DEC-003, DEC-P18), ekstraksi civil dari waktu server Asia/Jakarta, primitif waktu.
- `gas/Geo.gs` — Haversine, batas lintang/bujur, ambil lokasi kantor (`getOfficeLocation_`), evaluasi masuk WFO (radius inklusif ≤50 m, `GPS_BOUNDARY_EPSILON_M=0.01`, GP-01/02/03, OFFICE_NOT_CONFIGURED).
- `gas/Drive.gs` — decode base64 + magic JPEG FF D8 FF, resize/opsional tidak dikerjakan (konversi canvas di klien), simpan ke `ABSENSI_KPU/YYYY/MM/Foto_Masuk|Foto_Pulang/` dengan nama unik, setSharing defensif, penanganan gagal & tryDelete.
- `gas/Attendance.gs` — `handleAttendanceSubmit_` dengan lock, cek duplikat bisnis, cek prasyarat pulang, kompensasi parsial (hapus baris Bukti, file Drive TIDAK dihapus, log orphan `attendance_storage_partial`), `attendanceSuccessResponse_`.

Diubah:
- `gas/Repo.gs` — header `Absensi`/BuktiAbsensi lengkap, indeks pembantu, `ALL_SHEET_NAMES`, `findAbsensiById_`, `findAbsensiByUniq_`.
- `gas/Config.gs` — `PHASE3_PHOTO_MAX_BYTES` (default 1.000.000 byte), fungsi `photoMaxBytes_` (DEC-P17).
- `gas/Code.gs` — route `attendance.submit`, health phase `attendance`, `officeLocationConfigured`.
- `gas/Bootstrap.gs` — log `ALL_SHEET_NAMES`.
- Frontend: `assets/js/camera.js` (getUserMedia, canvas JPEG q0.85, maks 1280px, batas 1.000.000 byte, mapping error), `assets/js/attendance.js` (alur lengkap, state, idempoten retry, event auth), `index.html` (section absensi), `assets/css/styles.css`, `assets/js/config.js` (0.3.0), `service-worker.js` (app-v0.3.0 + aset baru), `assets/js/auth.js` (dispatch event).
- Tes: `tests/harness.mjs` (Drive stub, Utilities.newBlob/formatDate/base64Decode, deleteRow), `tests/check-foundation.mjs` (daftar file baru, perbaikan FD-09), `tests/auth.test.mjs` (phase attendance).

Pengujian (lokal Node):
- `node tests/attendance.test.mjs` → **112 lulus, 0 gagal** (waktu, mode WFO/WFH_WFA, GPS inklusif 50m, duplikat/idempotensi, prasyarat, otorisasi/input, foto, kompensasi parsial, Drive/private, lintas hari Minggu tetap diterima).
- `node tests/auth.test.mjs` → 42/0, `node tests/check-foundation.mjs` → 50/0.

Catatan penting:
- AMB-07 koordinat kantor masih kosong (OFFICE_LATITUDE/LONGITUDE) → `officeLocationConfigured=false` dan WFO masuk akan `OFFICE_NOT_CONFIGURED` di produksi; pengujian GPS menggunakan koordinat sintetis terisolasi.
- `backendConfigured` belum true sampai `SPREADSHEET_ID` & `DRIVE_FOLDER_ID` terisi (DEC-P08).
- `admin.account.resetPin` tetap `NOT_AVAILABLE` (D5).
- Waktu diambil 100% dari server; timestamp klien diabaikan. Transfer JSON POST `text/plain` dengan base64 foto.
- Tes phase auth telah disesuaikan ke `phase:'attendance'`.

Status: **SELESAI (lokal)** — siap Phase 4 (panel admin).

## PHASE 4 — Panel Admin (2026-10-19)

Audit awal:
- Membaca ulang `AGENTS.md`, `README.md`, seluruh `docs/` (10 berkas), kode
  Phase 1–3, dan menjalankan baseline tes (hasil: attendance 112/0, auth 42/0,
  foundation 49/1 — lihat "Temuan" di bawah).
- AMB terkait Phase 4 yang masih OPEN → sengaja TIDAK diimplementasikan:
  AMB-11 (batas susulan), AMB-12 (bukti susulan), AMB-14 (impor CSV),
  AMB-18 (retensi), AMB-20 (akses foto admin), AMB-25 (notifikasi).

Dibuat:
- `gas/AdminService.gs` — 11 endpoint admin (semua POST + `requireAdmin_`):
  `admin.pegawai.list/detail/create/update/setActive`,
  `admin.absensi.list/detail`, `admin.susulan.list/detail/decide`,
  `admin.log.list`. Tulis di bawah `LockService`; log audit tiap aksi.
- `assets/js/admin.js` — panel UI (tab Pegawai/Absensi/Susulan/Log audit),
  render via `textContent` (anti-XSS), tampil hanya untuk peran admin.
- `tests/admin.test.mjs` — 156 cek otomatis.

Diubah:
- `gas/Repo.gs` — sheet `PengajuanSusulan` (kolom DATA_DICTIONARY §8, disetujui
  DEC-P15) + `findPengajuanById_`.
- `gas/Code.gs` — router 11 aksi admin; `health.phase` → `'admin'`.
- `index.html` — section `admin-view` + skrip `admin.js`; teks notice/subtitle.
- `assets/css/styles.css` — gaya panel admin (tabel, tab, form, detail).
- `assets/js/config.js` — versi 0.4.0; `service-worker.js` — cache
  `app-v0.4.0` + `admin.js`.
- `tests/harness.mjs` — memuat `gas/AdminService.gs`.
- `tests/check-foundation.mjs` — mencakup berkas baru (54 cek).
- `tests/auth.test.mjs`, `tests/attendance.test.mjs` — asersi `phase:'admin'`.
- Dokumentasi: `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/DATA_DICTIONARY.md`,
  `gas/README.md`.

Perilaku keputusan (interpretasi ruang lingkup, bukan aturan baru):
- Keputusan susulan HANYA mengubah status pengajuan (`diterima`/`ditolak`) +
  `id_admin` (id_akun pemutus) + `waktu_keputusan` (server) +
  `catatan_keputusan` + log. **TIDAK** menulis baris Absensi — konversi ke
  absensi memerlukan keputusan aturan (duplikat/prasyarat/sumber) → laporan.
- Respons absensi/susulan TIDAK memuat `drive_file_id`/URL foto; hanya
  metadata bukti (ada, mime, ukuran, path folder) — akses foto menunggu AMB-20.
- Nonaktifkan pegawai: ubah `Pegawai.status_aktif` + cabut sesi akun terkait;
  riwayat absensi tidak dihapus (REQUIREMENTS §9). Kolom mengikuti
  DATA_DICTIONARY §1.

Pengujian dijalankan (hasil apa adanya):
- `node tests/admin.test.mjs` → **156 lulus, 0 gagal** (otorisasi 11 endpoint:
  UNAUTHORIZED/FORBIDDEN/METHOD_NOT_ALLOWED; pegawai CRUD + status; absensi
  list/detail tanpa bocor referensi foto; susulan putuskan + CONFLICT; log
  tanpa token/PIN; router/doPost; header `PengajuanSusulan`).
- `node tests/auth.test.mjs` → **42 lulus, 0 gagal**.
- `node tests/attendance.test.mjs` → **112 lulus, 0 gagal**.
- `node tests/check-foundation.mjs` → **54 lulus, 1 GAGAL** (FD-09, lihat Temuan).
- Server statis lokal → `index.html`, `admin.js`, `styles.css`, `config.js`,
  `service-worker.js` merespons HTTP 200.

Temuan:
- **FD-09 (RESOLVED 2026-10-19):** `API_BASE_URL` di `assets/js/config.js`
  terisi URL deployment Apps Script; awalnya tes mensyaratkan kosong (baseline
  phase ini 49/1). Pengguna mengonfirmasi URL tersebut disengaja (DEC-P19);
  FD-09 kini mensyaratkan format URL Web App Apps Script yang valid → LULUS.
  Catatan: `PROGRESS.md` Phase 3 mencatat 50/0 — waktu itu URL masih kosong.

Belum dijalankan / belum terverifikasi:
- Integrasi runtime Apps Script (butuh `SPREADSHEET_ID` — DEC-P08) & pengujian
  browser panel admin (form, tab, otorisasi UI).
- Konkurensi LockService nyata; kuota Apps Script.
- Pengujian penetrasi / review independen.

Status: **SELESAI (lokal)** — jangan mulai PHASE 5 tanpa instruksi.

## PHASE 5 — Laporan & Ekspor (2026-10-19)

Keputusan pengguna diterima: format ekspor = **CSV saja** (question tool,
2026-10-19) → dicatat sebagai DEC-P07 (AMB-19 → ANSWERED). Bagian AMB-19
"isi rekap" yang berupa aturan kebijakan (terlambat/tidak hadir/persen
kehadiran) TIDAK diimplementasikan karena masih `BELUM DITETAPKAN`.

Dibuat:
- `gas/ReportService.gs` — 3 endpoint laporan (semua POST + `requirePost_` +
  `requireAdmin_`): `report.absensi.list` (filter tanggal wajib ≤92 hari,
  pegawai/jenis/mode/sumber/status, join nama, paginasi),
  `report.rekap` (fakta terhitung per filter: catatan, pegawai unik, pecahan
  mode/sumber/status susulan, rekap per tanggal — tanpa indikator kebijakan),
  `report.absensi.exportCsv` (BOM UTF-8, header RFC 4180, guard formula
  injection, maks 5000 baris → `EXPORT_TOO_LARGE`, log `report_exported`).
- `assets/js/report.js` — tab Laporan pada `admin-view`: filter tanggal/pegawai/
  jenis/mode/sumber/status, kartu rekapitulasi + tabel harian, tabel rincian
  berpaginasi, tombol Ekspor CSV (Blob, nama berkas divalidasi regex),
  state loading/empty/error; render `textContent`; tampil hanya untuk peran
  admin; panel disembunyikan saat tab lain aktif.
- `tests/report.test.mjs` — 162 cek otomatis.

Diubah:
- `gas/Code.gs` — router 3 aksi `report.*`; `health.phase` → `'report'`.
- `index.html` — tombol tab Laporan + `#report-panel` (filter, kartu rekap,
  tabel harian, tabel rincian, paginasi), teks subtitle/notice.
- `assets/css/styles.css` — gaya `report-*` (grid kartu, paginasi, tabel harian).
- `assets/js/config.js` — versi 0.5.0; `service-worker.js` — cache
  `app-v0.5.0` + `report.js`.
- `tests/harness.mjs` — memuat `gas/ReportService.gs`.
- `tests/check-foundation.mjs` — mencakup berkas baru (59 cek).
- `tests/auth.test.mjs`, `tests/attendance.test.mjs`, `tests/admin.test.mjs` —
  asersi `phase:'report'`.
- Dokumentasi: `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/SECURITY.md`, `docs/TEST_PLAN.md`, `docs/DATA_DICTIONARY.md`,
  `docs/DECISIONS.md` (DEC-P07), `docs/AMBIGUITIES.md` (AMB-19 ANSWERED),
  `gas/README.md`.

Perilaku & batasan (interpretasi/limitasi teknis, bukan aturan kebijakan baru):
- Zona waktu pemilihan tanggal memakai kolom `tanggal` (Asia/Jakarta), bukan
  timestamp UTC — diuji lintas batas hari.
- Susulan dihitung dari `tanggal_absensi` per status (menunggu/diterima/ditolak);
  filter `sumber` TIDAK berlaku pada susulan. Keputusan susulan tetap TIDAK
  menulis baris Absensi (PHASE 4; konversi butuh keputusan aturan).
- Ekspor CSV TIDAK memuat `drive_file_id`, URL/tautan foto, PIN, token, atau
  kolom rahasia; guard formula-injection hanya di berkas ekspor (data sumber
  tidak diubah).
- Asumsi teknis sementara (lihat DEC-P07): rentang ≤92 hari, ekspor ≤5000
  baris, paginasi default 50/maks 200 — dapat diubah bila ada masukan.

Pengujian dijalankan (hasil apa adanya):
- `node tests/report.test.mjs` → **162 lulus, 0 gagal** (otorisasi 3 endpoint;
  validasi rentang/tanggal/filter; join & paginasi; rekap termasuk susulan per
  status; CSV BOM/quote/round-trip UTF-8, formula-injection, jumlah kolom tetap,
  EXPORT_TOO_LARGE, log tanpa rahasia; kegagalan sistem NOT_CONFIGURED;
  router/doPost).
- `node tests/auth.test.mjs` → 42/0, `node tests/attendance.test.mjs` → 112/0,
  `node tests/admin.test.mjs` → 156/0.
- `node tests/check-foundation.mjs` → **60 lulus, 0 GAGAL** (FD-09 resmi
  berubah setelah pengguna mengonfirmasi URL deployment — DEC-P19; lihat
  "Tambahan pasca-phase" di bawah).
- Server statis lokal (`py -m http.server 8765`) → `index.html`, `report.js`,
  `styles.css`, `service-worker.js`, `config.js` merespons HTTP 200.

Tambahan pasca-phase (2026-10-19, setelah konfirmasi FD-09/DEC-P19):
- Verifikasi langsung endpoint: `GET <API_BASE_URL>?action=health` →
  `{"ok":true,"phase":"report","backendConfigured":false,
  "officeLocationConfigured":false,...}` — backend ter-deploy dan menjalankan
  kode PHASE 5; `backendConfigured:false` = `SPREADSHEET_ID` belum diisi
  (DEC-P08 menunggu). `DRIVE_FOLDER_ID` & koordinat kantor (AMB-07) juga belum.
- `check-foundation.mjs` FD-09 disesuaikan (format URL Web App valid) → 60/0.
- Pengguna memberikan **API baru** (redeploy/pembaruan URL, 2026-10-19);
  `config.js` diperbarui mengikuti DEC-P19. URL baru diverifikasi: health
  merespons `phase:report`, `backendConfigured:false` (sama seperti sebelumnya).

Belum dijalankan / belum terverifikasi:
- Pengujian browser tab Laporan (filter, paginasi, unduhan Blob CSV).
- Integrasi runtime Apps Script penuh (butuh `SPREADSHEET_ID` — DEC-P08);
  endpoint health sudah diverifikasi merespons (lihat Tambahan pasca-phase).
- Performa laporan pada volume data besar (query penuh per rentang).

Status: **SELESAI (lokal)** — jangan mulai PHASE 6 tanpa instruksi.

## PHASE 6 — Pengujian & QA Rilis (2026-10-19)

Ruang lingkup: audit fungsional & keamanan, perbaikan bug reproducible, verifikasi
deployment nyata, dokumentasi rilis. Tanpa fitur baru; tanpa perubahan stack.

Baseline (commit `6fc4292`, sebelum perubahan): `check-foundation` 60/0, `auth` 42/0,
`attendance` 112/0, `admin` 156/0, `report` 162/0.

Audit dilakukan (hasil):
- Review seluruh backend (`Code/Config/Auth/Repo/AuthService/Bootstrap/TimeRule/
  Geo/Drive/Attendance/AdminService/ReportService.gs`) & frontend
  (`config/api/app/auth/camera/attendance/admin/report.js`, `index.html`,
  `manifest.webmanifest`, `service-worker.js`, `tools/generate-icons.mjs`).
- Secret scan repo (regex rahasia + NIP 18 digit) → bersih; tanpa `innerHTML`,
  `eval`, `localStorage`/`sessionStorage` di frontend.
- Audit `Logger.log` → tidak mencetak PIN/token/kredensial.
- Verifikasi runtime non-destruktif (lihat di bawah).

**3 bug frontend reproducible ditemukan & diperbaiki** (assets/js/attendance.js,
assets/js/auth.js; versi 0.5.0 → 0.5.1 + `service-worker.js`):
1. `submitAttendance` — urutan pemulihan terbalik: `disabled` dicek saat stage masih
   `'sending'` sehingga tombol Kirim tidak pernah diaktifkan kembali setelah gagal
   (retry jadi mustahil tanpa reload). Kini stage dipulihkan dulu, baru tombol
   diaktifkan.
2. `showStage('summary')` — `att-submit` tidak di-reset saat kembali ke ringkasan
   (state `disabled` lama bisa tertinggal & memblokir pengiriman baru). Kini di-reset.
3. `auth.js` — tidak menangani `auth:session-lost`: token & panel sesi tetap terbuka
   walau server menolak sesi. Kini `clearToken()` + `renderLoggedOut()` dipanggil.

Regression check ditambahkan ke `check-foundation.mjs` (4 cek: urutan pemulihan,
reset att-submit, listener session-lost, kesesuaian versi config vs SW cache).

Verifikasi runtime non-destruktif (2026-10-19):
- `GET <API_BASE_URL>?action=health` (URL awal) → `200 {"ok":true,"phase":"report",
  "timezone":"Asia/Jakarta","backendConfigured":false,"officeLocationConfigured":false,
  "serverTime":"2026-10-19T05:41:23.688Z"}`.
- `POST action=login` (NIP/PIN sintetis non-destruktif) pada URL awal →
  `NOT_CONFIGURED` ("Spreadsheet belum dikonfigurasi") — konsisten; tanpa kebocoran.
- GitHub Pages: **diaktifkan** (branch `master`, root `/`); build `built`;
  `GET https://kipasel.github.io/Absensi/` → **200** dan aset
  (`config.js`/`service-worker.js`/`manifest.webmanifest`) → 200.
- Pembaruan API (2026-10-19): pengguna memberikan URL Web App baru; `config.js`
  `API_BASE_URL` diperbarui (DEC-P19) dan versi dinaikkan `0.5.1` → `0.5.2`
  (bersama `CACHE_VERSION`) agar service worker menarik `config.js` terbaru.
- Verifikasi URL baru: `GET ?action=health` → `backendConfigured:true`
  (`SPREADSHEET_ID`/`DRIVE_FOLDER_ID` kini terisi — DEC-P08/DEC-P20),
  `officeLocationConfigured:false` (koordinat AMB-07 belum disimpan). Probe
  `POST action=login` (NIP sintetis) → `AUTH_FAILED` (bukan `NOT_CONFIGURED`)
  → sheet `Akun` sudah ada (initializeSheets pernah dijalankan). Pengujian
  fondasi tetap 64/0 (FD-09 format URL valid + versi selaras).
- Koordinat kantor (AMB-07): pengguna menetapkan titik & radius 50 m
  (DEC-P20); nilai disimpan di Script Properties, **tidak** di repo.

Pengujian dijalankan (hasil apa adanya; suite backend tak tersentuh perbaikan):
- `node tests/check-foundation.mjs` → **64 lulus, 0 gagal** (sebelumnya 60).
- `node tests/auth.test.mjs` → 42/0; `node tests/attendance.test.mjs` → 112/0;
  `node tests/admin.test.mjs` → 156/0; `node tests/report.test.mjs` → 162/0.

Belum diverifikasi (terblokir lingkungan/konfigurasi):
- Uji browser nyata (kamera/GPS/PWA/SW/unduh CSV) — perlu perangkat.
- Integrasi runtime penuh dengan akun nyata (login admin/pegawai, absensi, laporan):
  backend & sheet sudah terkonfigurasi; menyisakan koordinat kantor disimpan di
  Script Properties (AMB-07/DEC-P20), `seedAdmin()`, uji WFO, dan `initializeSheets`.
- Benchmark PBKDF2 di runtime Apps Script (D2); reset PIN (D5); kuota & konkurensi
  LockService nyata.

Status rilis: **BELUM SIAP RILIS** (lihat laporan akhir PHASE 6) — frontend & backend
sudah ter-deploy/terkonfigurasi (`backendConfigured:true`); menyisakan penyimpanan
koordinat kantor (AMB-07) + uji integrasi/browser nyata.

## Pasca-PHASE 6 — Rombak UI mobile (0.6.0) (2026-10-19)

Permintaan pengguna: ubah antarmuka menjadi aplikasi profesional dengan
tombol-tombol ala aplikasi mobile. Keputusan pengguna: **app shell + bottom nav**,
tema **netral modern + aksen indigo**. Ini murni lapisan tampilan — **tidak ada
perubahan logika bisnis, endpoint, atau aturan**.

Dibuat:
- `assets/js/nav.js` — controller navigasi: perpindahan tampilan
  (Beranda/Absensi/Admin/Profil), visibilitas bilah bawah, item **Admin** hanya
  untuk peran `admin`. Tidak menyentuh otorisasi (tetap di backend). Menangani
  event `auth:login`/`auth:logout` dan memilih tab default Beranda.

Diubah:
- `index.html` — struktur app shell: app bar lengket (chip pengguna + tombol
  keluar), `home-view` baru (hero + info + kartu status), semua tampilan sebagai
  `.view`, bilah navigasi bawah (SVG ikon), `session-view` menjadi tab Profil.
  **Seluruh ID & kelas yang dipakai JS dipertahankan**; ditambah `report-status`
  (sebelumnya `report.js` menulis status ke elemen tak ada — pesan hilang).
- `assets/css/styles.css` — ditulis ulang: token desain, app bar, kartu, tombol
  besar, bilah bawah; `[hidden]{display:none!important}` (memperbaiki langkah
  absensi yang bisa saling tampil karena `.att-step{display:flex}` mengalahkan
  atribut `hidden`).
- `assets/js/config.js` — VERSION `0.5.2` → `0.6.0`.
- `service-worker.js` — `CACHE_VERSION` `app-v0.6.0` + `nav.js` di daftar aset.
- `tests/check-foundation.mjs` — sertakan `nav.js` (struktur/sintaks/scan rahasia).
- Dokumentasi: `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`.

Pengujian dijalankan (hasil apa adanya):
- `node tests/check-foundation.mjs` → **67 lulus, 0 gagal** (naik dari 64).
- `node tests/auth.test.mjs` 42/0; `attendance.test.mjs` 112/0; `admin.test.mjs`
  156/0; `report.test.mjs` 162/0.
- Verifikasi statis: seluruh ID yang dirujuk `app/auth/attendance/admin/report/nav`
  ada di `index.html` (kecuali `susulan-catatan` yang dibuat dinamis oleh admin.js).

Belum diverifikasi: tampilan nyata di browser/perangkat mobile (butuh perangkat);
fungsi kamera/GPS/service worker tetap belum diuji runtime.

Status: implementasi **selesai (lokal)**; uji browser nyata menyusul. Rilis tetap
**BELUM SIAP RILIS** karena alasan konfigurasi/uji (lihat PHASE 6).

## Pasca-PHASE 6 — Pembaruan API & lokasi kantor (0.6.1) (2026-10-19)

Permintaan pengguna: "update API <URL /exec baru>" (DEC-P21).

Perubahan:
- `assets/js/config.js` — `API_BASE_URL` diganti ke Web App terbaru
  (DEC-P21) dan `VERSION` `0.6.0` → `0.6.1`.
- `service-worker.js` — `CACHE_VERSION` `app-v0.6.1`.
- Dokumentasi: `README.md`, `AGENTS.md`, `docs/DECISIONS.md` (DEC-P21;
  DEC-P19 ditandai digantikan), `docs/DEPLOYMENT.md` (E/F).

Verifikasi langsung (2026-10-19, URL terbaru):
- POST `{"action":"health"}` → `{"status":"ok","ok":true,"phase":"report",
  "timezone":"Asia/Jakarta","backendConfigured":true,
  "officeLocationConfigured":true,"serverTime":"2026-10-19T07:57:04.018Z"}`.
  → **AMB-07/DEC-P20 kini diverifikasi: koordinat kantor tersimpan.**
- POST `action=login` (NIP sintetis) → `AUTH_FAILED` → sheet `Akun` ada.
- `GET ?action=health` tanpa body tidak merespons — verifikasi wajib via POST
  (dicatat di `docs/DEPLOYMENT.md` E).

Pengujian: `node tests/check-foundation.mjs` → **67 lulus, 0 gagal** (termasuk
keselarasan `VERSION == CACHE_VERSION` dan format `API_BASE_URL`).

Sisa blocker rilis: **uji integrasi/browser nyata** (login & absensi akun nyata,
GPS WFO, kamera, PWA/SW, ekspor CSV di perangkat) + benchmark PBKDF2 runtime (D2).

## Pasca-PHASE 6 — Penyempurnaan visual UI (0.6.2) (2026-10-19)

Permintaan pengguna: perbaiki UI dengan warna lebih ramah mata, latar lebih
"kekinian" bernuansa teknologi, dan **warna ciri khas KPU beserta aksennya**.

Sumber warna (tidak dikarang): `www.kpu.go.id` (CSS halaman resmi) →
merah `#D82731`/`#CA0027`, marun `#771414`, emas/oranye `#F8A73E`, latar `#F6F9FA`.
Brandfetch untuk `kpu.go.id` mencatat `#FC1010`/`#26323D`/`#C4C5D6` (dari logo) —
dipakai sebagai rujukan pendukung, tidak dipilih utama.

Perubahan (hanya CSS + warna sistem; **tanpa perubahan JS/ID/logika**):
- `assets/css/styles.css` — token warna baru (`--brand`, `--brand-ink`,
  `--brand-text`, `--accent`, dst.); latar `--bg` non-putih + **gradien radial
  merah/marun/emas + kisi halus** (nuansa teknologi, murni CSS, mode gelap ikut);
  app bar & hero bergradien marun→merah dengan pendar emas; aksen emas pada
  eyebrow hero, tepi notice, dan garis atas bilah bawah; fokus `:focus-visible`
  merah; kartu dengan gradien halus + bayangan lebih halus; status dot ber-cincin;
  tombol primer gradien merah; item nav aktif bergaris merah/marun.
  Kontras putih-di-merah `#D82731` ≈ **4.9:1** (lolos WCAG AA teks normal).
- `index.html` — `theme-color` `#4f46e5` → `#771414`.
- `manifest.webmanifest` — `background_color` `#f4f6f8`, `theme_color` `#771414`.
- `assets/js/config.js` VERSION `0.6.1` → `0.6.2`; `service-worker.js`
  `CACHE_VERSION` `app-v0.6.2`.
- Dokumentasi: `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`.

Validasi: seluruh kelas yang di-set JS (19 pola) tetap ada di CSS; ID tetap
utuh; `node tests/check-foundation.mjs` **67 lulus, 0 gagal** (sintaks + versi
selaras + scan rahasia). Uji visual di browser/perangkat **belum dilakukan**.

## Pasca-PHASE 6 — Keputusan tertunda & fitur susulan (2026-10-21)

Instruksi pengguna: jawab keputusan tertunda, jalankan uji integrasi (sebisanya),
siapkan rilis. Keputusan baru **DEC-P22..P28** dicatat (lihat `docs/DECISIONS.md`).

Perubahan:
- **PIN admin (DEC-P22):** buat akun & reset PIN lewat panel — PIN **tepat 6
  digit angka**, diketik admin saat create/reset. Reset PIN aktif (menggantikan
  `NOT_AVAILABLE`), sekaligus membuka `gagal_login=0`/`terkunci_sampai=''`.
  `gas/Auth.gs` (`PIN_DIGITS`/`PIN_PATTERN`/`isValidPin_`), `gas/AuthService.gs`
  (`handleAccountCreate_`, `handleResetPin_`), UI `buildPinForm` di
  `assets/js/admin.js`.
- **Foto admin (AMB-20/DEC-P25):** endpoint blob ber-token
  `admin.absensi.photo` & `admin.susulan.photo` → base64+mime inline, **tanpa**
  `drive_file_id`/URL. `gas/Drive.gs` (`readAttendancePhoto_`),
  `gas/AdminService.gs` (2 handler), route `gas/Code.gs`, penampil
  `appendPhotoViewer` + CSS `.admin-photo` di frontend.
- **Pengajuan susulan pegawai (§8; DEC-P23/P24):** endpoint `susulan.submit`
  baru — file `gas/Susulan.gs` (rentang tanggal ≤3 hari lampau & bukan
  mendatang; alasan wajib ≤500 karakter; foto JPEG wajib; simpan
  `PengajuanSusulan` + foto ke folder `Foto_Susulan`; duplikat menunggu/diterima
  → `DUPLICATE`; kompensasi hapus file bila tulis baris gagal). Route
  `gas/Code.gs`; `saveSusulanPhoto_` di `gas/Drive.gs`. Frontend: form di
  `index.html` + `assets/js/susulan.js` (konversi foto ke JPEG via kanvas,
  batas tanggal di klien sinkron backend). Keputusan admin tetap **tidak**
  menulis baris Absensi (DEC-P24).
- **Retensi (DEC-P26):** simpan permanen. Impor CSV (AMB-14) & notifikasi
  (AMB-25) **dikesampingkan** untuk rilis ini (DEC-P27). Laporan tetap fakta
  tanpa indikator kebijakan (DEC-P28).
- Versi: `assets/js/config.js` `VERSION` `0.6.2` → `0.6.3`; `service-worker.js`
  `CACHE_VERSION` `app-v0.6.3`; `susulan.js` masuk precache & daftar aset.
- Perbaikan harness: `getId()` stub Drive kini stabil (sebelumnya menghasilkan
  ID baru tiap panggilan sehingga pembacaan foto gagal).

Validasi otomatis (Node + stub, BUKAN runtime/browser nyata):
- `node tests/check-foundation.mjs` → **71 lulus, 0 gagal**
- `node tests/auth.test.mjs` → **56 lulus, 0 gagal**
- `node tests/attendance.test.mjs` → **112 lulus, 0 gagal**
- `node tests/admin.test.mjs` → **171 lulus, 0 gagal**
- `node tests/report.test.mjs` → **162 lulus, 0 gagal**
- `node tests/susulan.test.mjs` (baru) → **67 lulus, 0 gagal**

Belum diverifikasi: integrasi runtime/browser nyata (login/absensi/susulan/
laporan, GPS WFO, PWA/SW, foto admin, unggah foto), benchmark PBKDF2 (D2).
Status rilis: **BELUM SIAP RILIS** — menunggu uji integrasi & browser nyata.
## Pasca-PHASE 6 — Struktur penyimpanan foto hierarkis (2026-10-21)

Instruksi pengguna: ubah penyimpanan foto absensi menjadi hierarkis
Tahun → Bulan → Tanggal → Nama Pegawai → Absen Masuk/Pulang. Keputusan
**DEC-P29** dicatat (menggantikan struktur DEC-007).

Perubahan (tanpa mengubah autentikasi/waktu/GPS/fitur lain):
- `gas/Drive.gs` — struktur baru
  `ABSENSI_KPU/{YYYY}/{MM_NamaBulan}/{DD}/{NamaPegawai_IDPegawai}/Absen_Masuk.jpg|Absen_Pulang.jpg`;
  fungsi murni baru `sanitizePathSegment_`, `monthFolderName_` (bulan Indonesia),
  `pegawaiFolderName_`; nama file tetap (`ATTENDANCE_FILE_NAMES`); `path`
  metadata mengikuti struktur baru. Foto susulan tetap terpisah
  (`.../{MM_NamaBulan}/Foto_Susulan/`).
- `gas/Attendance.gs` — meneruskan `ctx.pegawai.nama` ke penyimpanan.
- `tests/harness.mjs` — stub Drive kini melacak path folder & mendaftar folder
  (untuk verifikasi hierarki, reuse, dan injeksi kegagalan).
- `tests/attendance.test.mjs` — bagian baru "Struktur folder foto absensi
  (DEC-P29)": penamaan bulan/pegawai, check-in/check-out, tanggal berbeda,
  reuse folder, klik ganda/retry idempoten, kegagalan Drive, kegagalan Sheets,
  privasi + byte utuh, aturan lama tetap berlaku.
- `tests/admin.test.mjs` — path metadata & uji foto mengikuti struktur baru;
  uji tambahan: detail absensi memakai path DEC-P29 & foto diambil via
  `id_bukti` (terikat catatan absensi).
- Dokumentasi: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/DATA_DICTIONARY.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`,
  `docs/TEST_PLAN.md`, `gas/README.md`, `AGENTS.md`.

Pencegahan duplikasi: nama file tetap + prasyarat satu masuk/satu pulang per
pegawai per tanggal + idempotensi `id_absensi` + `withLock_`. Kegagalan Drive →
tanpa tulisan (tidak ada file kosong); kegagalan Sheets setelah file dibuat →
bukti dikompensasi, file orphan dicatat (`orphan_drive_file=`), respons
`ATTENDANCE_STORAGE_PARTIAL` (Sheets & Drive BUKAN transaksi atomik).

Validasi otomatis (Node + stub, BUKAN runtime Drive nyata):
- `check-foundation` 71/0 · `auth` 56/0 · `attendance` **157/0** (sebelumnya 112)
  · `admin` **175/0** (sebelumnya 171) · `report` 162/0 · `susulan` 67/0.

Belum diverifikasi: struktur folder pada Drive Apps Script nyata (DF-13);
migrasi foto lama **tidak dilakukan** (foto lama dibiarkan, DEC-P26/DEC-P29).
Status rilis: **BELUM SIAP RILIS**.

## Pasca-PHASE 6 — Pembaruan URL Web App (0.6.4) (2026-10-21)

Pengguna memberikan URL Web App terbaru (DEC-P21 diperbarui):
`https://script.google.com/macros/s/AKfycbwuxePGOdVzWJeVKYcONaBzq5spIWa_cXfMlaKxMNZ3J-YkQZdCS2YsALc3zjL59ZU/exec`.
- `assets/js/config.js` — `API_BASE_URL` diperbarui.
- Versi dinaikkan `0.6.3` → `0.6.4` (`VERSION` & `CACHE_VERSION`) agar service
  worker menarik `config.js` terbaru (menghindari URL lama dari cache).
- Verifikasi `GET ?action=health` URL baru → `ok:true`, `backendConfigured:true`,
  `officeLocationConfigured:true`, `phase:report`, `timezone:Asia/Jakarta`.
- `node tests/check-foundation.mjs` → **71 lulus, 0 gagal** (FD-09 format URL valid,
  versi config == CACHE_VERSION).

## Pasca-PHASE 6 — Absensi pulang tanpa catatan masuk (2026-10-24, DEC-P31)

Instruksi pengguna mengubah aturan: pulang boleh dicatat walau tidak ada catatan
masuk pada tanggal yang sama; Uraian Pekerjaan dan Output Pekerjaan wajib;
status keterlambatan masuk disimpan terpisah; laporan menandai pulang tanpa
catatan masuk. Pengajuan susulan tetap nonaktif pada aplikasi.

Perubahan:
- `gas/Attendance.gs` — menghapus prasyarat masuk untuk pulang; menjaga sesi,
  jendela waktu, foto, GPS khusus masuk WFO, pemeriksaan duplikat dan lock.
  Validasi uraian/output terjadi sebelum penyimpanan Drive. Baris pulang tanpa
  masuk mendapat status `TANPA_ABSEN_MASUK`, tanpa membuat data masuk sintetis.
- `gas/Repo.gs` — migrasi header aditif pada sheet lama (kolom baru ditambahkan
  ke kanan, baris lama dipertahankan); conditional formatting status
  `TERLAMBAT` memakai latar dan teks merah.
- `gas/ReportService.gs`, `assets/js/report.js`, `index.html` — daftar detail
  memuat kondisi dan pasangan waktu masuk/pulang per pegawai-hari, status,
  uraian/output; rekap harian memisahkan jumlah pulang tanpa catatan masuk.
  Ekspor CSV memuat pasangan waktu dan kondisi; waktu yang tidak ada dibiarkan
  kosong. Respons sukses dan UI memberi keterangan saat marker berlaku.
- Tes: `tests/attendance.test.mjs`, `tests/report.test.mjs`, `tests/admin.test.mjs`,
  `tests/harness.mjs`, `tests/susulan.test.mjs`; pembaruan skenario fitur
  susulan nonaktif dan kolom ekspor.
- Dokumentasi: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/DATA_DICTIONARY.md`, `docs/TEST_PLAN.md`, `docs/DEPLOYMENT.md`,
  `docs/DECISIONS.md`, `AGENTS.md`.
- Versi frontend dinaikkan ke `0.6.6`; cache service worker selaras.

Pengujian lokal (Node + stub):
- `check-foundation` **74/0**; `auth` **56/0**; `attendance` **200/0**;
  `admin` **166/0**; `report` **178/0**; `susulan` **67/0**.
- Uji runtime Apps Script, konkurensi nyata, browser/kamera, penerapan Apps
  Script dan GitHub Pages **belum dijalankan**.
- Deployment: jalankan `initializeSheets()` untuk menambahkan header baru pada
  spreadsheet aktif, deploy versi Apps Script baru, lalu terbitkan frontend.
  Belum ada perubahan yang dideploy.

## Pasca-PHASE 6 — Pembaruan URL Web App (2026-10-24)

Pembaruan terbaru setelah URL Web App baru diberikan:
`https://script.google.com/macros/s/AKfycbykCQVMRUNLR8SQAdHDX-J0HCPyKeb-WOkZa9fiLWDoxMtKh7szvQRb8o-dEwFHF4ez/exec`.
- `assets/js/config.js` diarahkan ke URL tersebut; versi frontend dan cache
  service worker dinaikkan menjadi `0.6.9`.
- Probe `POST action=health` → `ok:true`, `backendConfigured:true`,
  `officeLocationConfigured:true`.
- Probe `POST action=login` dengan input kosong → `UNKNOWN_ACTION`; deployment
  baru tampaknya belum menyediakan aksi frontend ini atau kontraknya berbeda.
- `node tests/check-foundation.mjs` → 74 lulus, 0 gagal; `git diff --check`
  bersih (hanya peringatan normal konversi LF/CRLF dari Git untuk Windows).
- Semua suite Node lulus pada tree gabungan: foundation 74, auth 57,
  attendance 200, admin 168, report 178, susulan 67; 0 gagal.
- Commit `82dd095` didorong ke GitHub; perubahan digabung dengan `master`
  (sumber Pages) pada `9f47efc`. Build/deployment Pages run `40096085564`
  berhasil pada 2026-10-24.
- Verifikasi file live di `https://kipasel.github.io/Absensi/` menunjukkan
  versi `0.6.9`, cache `app-v0.6.9`, dan URL API terbaru.
- Login runtime tetap belum terverifikasi; probe login kosong menghasilkan
  `UNKNOWN_ACTION`.

## PHASE 7 — Penyegaran desain antarmuka (2026-10-24)

Diminta pengguna: desain profesional untuk aplikasi absensi perusahaan, dengan
gaya visual yang sederhana dan tidak memakai dekorasi generik berlebihan.

- `assets/css/styles.css` — latar kisi/pendar dan gradien dekoratif dihapus;
  palet KPU dipertahankan sebagai warna aksen. Header marun solid, permukaan
  netral, sudut dan bayangan lebih sederhana, serta konten desktop lebih lega.
  Dashboard memakai empat kolom status pada layar lebar dan tetap responsif.
- `index.html` — teks ringkasan diperpendek dan keterangan koneksi disesuaikan
  agar tidak menyebut URL belum diisi ketika API sudah terkonfigurasi. ID,
  kelas, dan hook logika yang dipakai JavaScript tetap dipertahankan.
- Versi lokal dinaikkan ke `0.7.0`; cache service worker diselaraskan.
- Belum diterbitkan. Validasi lokal dilakukan sebelum rilis; tidak ada perubahan
  aturan bisnis atau endpoint.

Iterasi desain berdasarkan referensi visual pengguna:
- Dashboard dipusatkan pada dua aksi utama Masuk/Pulang; tombol membuka tab
  absensi yang ada dan memilih jenisnya, lalu pengguna tetap melalui kamera,
  GPS, dan pemeriksaan backend yang sudah diterapkan.
- Arah warna biru-putih diambil dari referensi; hijau dan jingga hanya menjadi
  pembeda ikon masuk/pulang. ID alur absensi tidak berubah.
- Tidak ada daftar riwayat pegawai karena endpoint riwayat mandiri belum tersedia;
  daftar absensi saat ini hanya untuk panel admin.
- Teks status menegaskan bahwa pengajuan susulan pegawai dinonaktifkan.
- Versi frontend dan cache service worker dinaikkan ke `0.8.0`.

Motion login atas permintaan pengguna:
- `assets/css/styles.css` menambahkan ring bergerak pelan dan aksen titik cahaya
  pada hero login saja; dekorasi tidak menerima pointer dan tidak menutupi form.
- Animasi mengikuti aturan aksesibilitas global `prefers-reduced-motion`.
- Commit `69f63df` dipush ke `master` dan `main`; Pages run `40097305219`
  berhasil. Pemeriksaan aset live mengonfirmasi versi/cache `0.8.0` serta animasi
  login sudah tersedia.

Pengguna memberikan URL Web App baru (DEC-P21 diperbarui):
`https://script.google.com/macros/s/AKfycbzPrzom2yQUH2G0STiVb1o0P5axU03yadiUnwmmyUIy-tjR3TAr4Q_0irNRcvbr271c/exec`.
- `assets/js/config.js` — `API_BASE_URL` diperbarui.
- Versi frontend/cache dinaikkan menjadi `0.6.7` agar service worker mengambil konfigurasi baru.
- URL berikutnya yang diberikan pengguna menggantikan URL di atas:
  `https://script.google.com/macros/s/AKfycbwSt9-bh1pwbVK7lOupLWfQi4Np3RQT0LqRLUPvXN7icLuN27PbnKH21A2LCSt3Lj9M/exec`.
- `assets/js/config.js` dan cache service worker diperbarui ke versi `0.6.8`.
- Health endpoint baru merespons `ok:true`, `backendConfigured:true`, dan
  `officeLocationConfigured:true`; tangkapan layar pengguna mengonfirmasi frontend
  live menampilkan versi `0.6.8`.
- Probe POST login kosong ke API baru mengembalikan `INTERNAL_ERROR`, berbeda dari
  hasil yang seharusnya diberikan kode lokal (`AUTH_FAILED`). Akar penyebab runtime
  belum diketahui.
- Eksekusi `seedAdmin` pada Apps Script ditolak karena admin aktif sudah ada;
  ini mencegah duplikasi dan bukan bukti kegagalan login.

## Audit & perbaikan backend lokal (2026-10-24)

- `gas/Repo.gs` — sheet lama yang benar-benar kosong kini mendapat header mulai
  kolom pertama; sheet tanpa header tetapi berisi baris data ditolak dengan
  `SCHEMA_INVALID` agar data tidak tertimpa atau salah dipetakan.
- `gas/Drive.gs` — menghapus pemanggilan `setSharing(ANYONE_WITH_LINK, NONE)` yang
  tidak valid menurut referensi Apps Script dan tidak dapat menjamin privasi.
  Foto mengikuti ACL folder induk yang wajib privat; konfigurasi folder produksi
  tetap harus diperiksa di Drive.
- `gas/AdminService.gs` dan `gas/Attendance.gs` — komentar diselaraskan dengan
  fitur aktif dan aturan waktu DEC-P31.
- Regresi ditambahkan untuk migrasi sheet kosong, proteksi sheet berisi data,
  ACL foto yang tidak dimutasi, dan respons `doPost` login kosong.
- Pengujian lokal sesudah perbaikan (Node + stub): foundation **74/0**, auth
  **57/0**, attendance **200/0**, admin **168/0**, report **178/0**, susulan **67/0**.
- Belum dideploy ke Apps Script. Error login runtime tetap memerlukan detail
  eksekusi Web App; perbaikan lokal tidak mengonfirmasi deployment.

## Perbaikan zona waktu laporan (WIB) — 2026-10-28

Masalah: laporan menampilkan timestamp `...Z` (UTC/Zulu). Audit menemukan
bahwa `waktu_server` memang disimpan sebagai ISO-8601 UTC (DEC-P15) tetapi
`assets/js/report.js` dan `assets/js/admin.js` merender string tersebut apa
adanya; ekspor CSV juga menulis ISO UTC. `assets/js/attendance.js` sudah
mengonversi ke WIB, tetapi dengan menambah 7 jam manual dan format `HH.mm.ss`.
Ini masalah **tampilan/format**, bukan data historis yang salah.

Perubahan:
- `assets/js/datetime.js` (baru) — formatter tunggal memakai
  `Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hourCycle: 'h23' })`.
  Tanggal `dd/MM/yyyy`, jam `HH:mm:ss WIB`, tanggal+waktu
  `dd/MM/yyyy HH:mm:ss WIB`; tanggal bisnis `YYYY-MM-DD` dibaca tanpa
  pergeseran.
- `assets/js/report.js` — tanggal, waktu catatan, waktu masuk/pulang memakai
  formatter WIB (tabel harian & rincian).
- `assets/js/admin.js` — tabel absensi, detail absensi, susulan, lockout akun,
  dan log audit memakai formatter WIB.
- `assets/js/my-attendance.js` — riwayat pegawai memakai formatter yang sama
  (tanggal ringkas `dd/MM/yyyy`, jam `HH:mm:ss WIB`).
- `assets/js/attendance.js` — menghapus konversi `+7 jam` manual; memakai
  formatter WIB (termasuk pergantian tanggal).
- `gas/ReportService.gs` — hanya keluaran CSV dikonversi sekali ke WIB dengan
  `Utilities.formatDate(..., BIZ_TIMEZONE, ...)`; API tetap mengirim ISO UTC
  agar pengurutan/perhitungan tidak berubah, dan data sumber tidak diubah.
- `gas/Repo.gs` — `initializeSheets()` menyelaraskan zona waktu spreadsheet ke
  `Asia/Jakarta` (konfigurasi tampilan; nilai sel tidak diubah).
- `index.html`, `service-worker.js`, `assets/js/config.js` — muat/cache
  `datetime.js`, versi `0.9.5` → `0.9.6`.
- `tests/datetime.test.mjs` (baru), `tests/harness.mjs` (pola format WIB),
  `tests/report.test.mjs` (CSV WIB + batas tengah malam), dan pemeriksaan
  fondasi (tanpa offset manual).

Konfigurasi: `gas/appsscript.json` sudah `"timeZone": "Asia/Jakarta"`. Zona
waktu spreadsheet diselaraskan saat `initializeSheets()` dijalankan. Data
historis TIDAK digeser/dimigrasi.

Pengujian lokal (Node + stub, bukan runtime/browser nyata):
- `check-foundation` **84/0** · `auth` **57/0** · `attendance` **200/0**
  · `admin` **170/0** · `report` **192/0** · `susulan` **67/0**
  · `datetime` **14/0**.
- Belum dijalankan: tampilan/ekspor di browser nyata, deployment Apps Script,
  verifikasi isi spreadsheet produksi.

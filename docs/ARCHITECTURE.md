# ARCHITECTURE — Arsitektur Sistem

> Status: **PHASE 4 — panel admin diimplementasikan & diuji lokal (Node).**
> Fondasi PHASE 1–3 (autentikasi, mesin absensi) tersedia. Integrasi runtime
> Apps Script & pengujian browser belum (butuh `SPREADSHEET_ID`, DEC-P08).

## Alur Tingkat Tinggi
```
Browser / PWA (GitHub Pages, HTML/CSS/JS)
        |  HTTPS  POST text/plain { action, token, data } (token di body; D1/D8)
        v
Google Apps Script Web App  (doGet/doPost; satu-satunya lapisan tepercaya)
        |
        +--> Google Sheets   (data absensi, pegawai, akun, pengajuan, log, pengaturan)
        +--> Google Drive    (foto privat)
```

## Struktur Frontend (aktual PHASE 6 — UI 0.6.0)
- `index.html` — **app shell mobile**: app bar lengket (navigasi atas + chip
  pengguna) + **bilah navigasi bawah** (Beranda/Absensi/Admin/Profil) + tampilan
  `home-view` (status aplikasi/jaringan/backend/versi), `login-view`,
  `attendance-view`, `admin-view` (tab Pegawai/Absensi/Laporan/Log audit),
  `session-view`. Tidak ada data fiktif.
- `manifest.webmanifest` — manifest PWA (`start_url`/`scope` relatif `./` agar
  kompatibel dengan sub-path GitHub Pages).
- `service-worker.js` — cache aset statis only (termasuk `api.js`/`auth.js`/
  `camera.js`/`attendance.js`/`admin.js`/`report.js`/`nav.js`); permintaan
  lintas-origin diteruskan tanpa di-cache; navigasi fallback app shell.
- `assets/css/styles.css` — sistem desain mobile-first; **palet warna ciri khas
  KPU** (merah `#D82731`, marun `#771414`, emas `#F8A73E` dari `www.kpu.go.id`)
  di atas netral lembut; latar bergaya teknologi (gradien radial + kisi halus,
  tanpa aset gambar); app bar, kartu, tombol besar, bilah navigasi bawah; mode
  gelap sistem.
- `assets/js/config.js` — konfigurasi publik (nama, versi, `API_BASE_URL`). Tanpa rahasia.
- `assets/js/api.js` — klien POST `text/plain`; token di memori, atau `localStorage`
  bila opsi "Ingat saya" aktif (DEC-P30).
- `assets/js/app.js` — status jaringan, status backend (health check), registrasi SW.
- `assets/js/auth.js` — UI login/logout (NIP/NIPK + PIN); dispatch event
  `auth:login`/`auth:logout`.
- `assets/js/camera.js` — kamera → canvas JPEG (DEC-P17).
- `assets/js/attendance.js` — alur absensi (jendela waktu/GPS/foto/idempoten).
- `assets/js/admin.js` — panel admin (PHASE 4); tampil hanya bila peran `admin`
  (event `auth:login`); render data via `textContent` (anti-XSS); tanpa URL foto.
- `assets/js/report.js` — tab Laporan (PHASE 5): filter periode/pegawai/jenis/
  mode/sumber/status, kartu rekapitulasi + tabel harian, tabel rincian
  berpaginasi, ekspor CSV via Blob (nama berkas divalidasi); tampil hanya bila
  peran `admin`; panel disembunyikan saat tab admin lain aktif.
- `assets/js/nav.js` — controller navigasi UI (UI 0.6.0): perpindahan antar
  tampilan + visibilitas bilah bawah (item Admin hanya untuk peran `admin`);
  TIDAK menyentuh otorisasi (tetap di backend).
- `assets/icons/` — ikon placeholder netral, dibuat `tools/generate-icons.mjs`.

## Struktur Backend (aktual PHASE 5)
- `gas/Code.gs` — `doGet`/`doPost`, router aksi, respons JSON konsisten.
  Aksi: `health`, `login`, `logout`, `session.check`,
  `admin.account.create`, `admin.account.setActive`, `admin.account.resetPin`,
  `attendance.submit`, aksi admin PHASE 4
  (`admin.pegawai.list|detail|create|update|setActive`,
  `admin.absensi.list|detail`,
  `admin.log.list`), dan 3 aksi PHASE 5:
  `report.absensi.list`, `report.rekap`, `report.absensi.exportCsv`.
  Route pengajuan dan panel susulan tetap nonaktif sesuai DEC-P31.
- `gas/Config.gs` — konfigurasi Script Properties + kebijakan (iterasi PBKDF2,
  TTL sesi, lockout) + `AppError_`.
- `gas/Auth.gs` — primitif PBKDF2-HMAC-SHA256, PIN, token, lockout, validitas sesi.
- `gas/Repo.gs` — akses Sheets, `LockService`, ID internal, log aktivitas;
  header `Pegawai`/`Akun`/`Sesi`/`Absensi`/`BuktiAbsensi`/`PengajuanSusulan`/`LogAktivitas`.
- `gas/AuthService.gs` — alur autentikasi, otorisasi peran, manajemen akun admin.
- `gas/AdminService.gs` — **endpoint panel admin (PHASE 4)**; semua aksi:
  POST + `requireAdmin_` (peran diverifikasi dari sesi server) + `withLock_`
  untuk operasi tulis + `logActivity_`.
- `gas/ReportService.gs` — **endpoint laporan & ekspor (PHASE 5)**; semua aksi:
  POST + `requirePost_` + `requireAdmin_`; pembacaan saja (tanpa lock);
  filter wajib rentang tanggal ≤92 hari; ekspor CSV (BOM UTF-8, guard
  formula-injection, ≤5000 baris) + `logActivity_('report_exported')`.
- `gas/TimeRule.gs`, `gas/Geo.gs`, `gas/Drive.gs`, `gas/Attendance.gs` — mesin absensi (PHASE 3).
- `attendance.submit`: validasi sesi, jenis, waktu server, GPS khusus masuk WFO,
  foto JPEG, dan data pekerjaan untuk pulang dilakukan backend. Pulang tetap
  boleh dicatat tanpa masuk pada tanggal tersebut. Seluruh pemeriksaan duplikat
  dan penulisan berjalan di dalam `LockService`; status `TANPA_ABSEN_MASUK`
  dicatat hanya pada baris pulang. `Repo.gs` menambahkan header baru ke kanan
  tanpa mengubah kolom atau baris historis. Status `TERLAMBAT` diberi
  conditional formatting merah di sheet `Absensi`.
- `gas/Bootstrap.gs` — `initializeSheets()` & `seedAdmin()` (manual, tanpa PIN default).
- `gas/appsscript.json` — timezone `Asia/Jakarta`, runtime V8, blok `webapp` (D8).

## Lapisan Data
- Sheet (dibuat `initializeSheets()`; kolom DATA_DICTIONARY.md): `Pegawai`,
  `Akun`, `Sesi`, `Absensi`, `BuktiAbsensi`, `PengajuanSusulan`, `LogAktivitas`.
- `Pengaturan`, `HariLibur` — belum dibuat (belum ada kebutuhan di phase ini).
- Spreadsheet belum dibuat secara nyata (menunggu `SPREADSHEET_ID`, DEC-P08).

## Akses Foto Admin (PHASE 4)
- Panel admin hanya menerima **metadata bukti**: keberadaan, `mime`, `ukuran`,
  `path` folder. `drive_file_id`/URL TIDAK dikirim ke klien (AMB-20 belum
  ditetapkan); tidak ada endpoint pengambilan foto.

## Google Drive
- Struktur privat (DEC-P29):
  `ABSENSI_KPU/YYYY/MM_NamaBulan/DD/NamaPegawai_IDPegawai/Absen_Masuk.jpg` &
  `Absen_Pulang.jpg`. Contoh: `ABSENSI_KPU/2026/10_Oktober/21/Andi_00123/`
  (ilustrasi, bukan data nyata). Nama folder bulan `MM_NamaBulan` (Indonesia);
  folder pegawai memakai `Nama_IDPegawai` (ID internal sebagai kunci).
- Foto susulan: `ABSENSI_KPU/YYYY/MM_NamaBulan/Foto_Susulan/` (DEC-P24).
- `gas/Drive.gs` menyediakan `monthFolderName_`/`pegawaiFolderName_`/
  `sanitizePathSegment_` (fungsi murni) agar format folder konsisten; folder
  dibuat otomatis & dipakai ulang (`getOrCreateSubfolder_`).
- `path` folder dicatat di sheet `BuktiAbsensi`; `drive_file_id` tetap
  referensi utama. Nilai hanya di Script Properties (tidak di repo).
- Referensi file (ID, path, tanggal, jenis) disimpan di `BuktiAbsensi`.

## Batasan Arsitektur yang Diakui
- Google Sheets bukan DB transaksional penuh (tanpa foreign key/transaksi kuat) → mitigasi rencana: `LockService`, kunci unik, validasi ulang.
- Apps Script memiliki kuota waktu eksekusi & limit harian (AMB-24).
- CORS/Kredensial lintas-origin adalah risiko utama (AMB-21).
- Tidak ada backend server mandiri di GitHub Pages.

## BELUM DITETAPKAN
- Validasi `Origin`/CORS (D8 memilih akses publik; batas domain belum).
- Skema sheet phase lanjutan (absensi, susulan, dll.).
- Format respons & aturan bisnis absensi.

## Autentikasi (DIIMPLEMENTASIKAN)
Karena cookie tidak tersedia dan header tidak terbaca (lihat `PHASE2_AUDIT.md`
TC-02/03), model yang dipakai:
```
Login:  POST body { action:'login', data:{ nip, pin, agen } } -> server verifikasi PIN
        -> server buat token acak, simpan HASH token di sheet `Sesi`
        -> server balas token (DI BODY, bukan query string)
Klien:  menyimpan token HANYA di memori (D1) — TANPA cookie/localStorage
Request terautentikasi: POST body { action, token, data }
        -> server: hash(token) -> cari di `Sesi` -> cek kedaluwarsa/tercabut
        -> cek status akun & peran dari data server (BUKAN dari klien)
Logout: POST { action:'logout', token } -> tandai `dicabut_pada`
```
Lapisan: `Auth.gs` (hash/verify, sesi, lockout), `Repo.gs` (sheet + `LockService`),
`AuthService.gs` (alur + otorisasi), aksi di `Code.gs`. Detail keputusan: D0–D8.

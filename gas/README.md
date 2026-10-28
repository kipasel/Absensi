# Backend Google Apps Script — Absensi, Panel Admin & Laporan (PHASE 2–5)

Backend Sistem Absensi KPU Kabupaten Aceh Selatan. Tersedia: autentikasi
(login NIP/NIPK + PIN, sesi, logout, manajemen akun admin), mesin absensi
reguler (PHASE 3), **panel admin** (PHASE 4: pengelolaan pegawai,
daftar/detail absensi, foto ber-token, log audit), dan **laporan & ekspor
CSV** (PHASE 5: filter periode, rekapitulasi, ekspor CSV — admin saja).

## Berkas
| Berkas | Fungsi |
|--------|--------|
| `Code.gs` | Titik masuk `doGet`/`doPost`, router aksi, respons JSON, penanganan error. |
| `Config.gs` | Konfigurasi Script Properties + kebijakan (iterasi PBKDF2, TTL sesi, lockout). |
| `Auth.gs` | Primitif PBKDF2-HMAC-SHA256, PIN, token, lockout, validitas sesi. |
| `Repo.gs` | Akses Google Sheets, `LockService`, ID internal, log aktivitas; fungsi manual `reconcileAbsensiStatusesPreview()` / `reconcileAbsensiStatusesApply()` untuk memperbaiki kolom `status` dari catatan aktual. |
| `AuthService.gs` | Alur login/logout/session.check, otorisasi peran, manajemen akun admin. |
| `AdminService.gs` | Endpoint panel admin (semua wajib peran `admin` diverifikasi server). |
| `ReportService.gs` | Endpoint laporan, rekap, dan ekspor CSV (PHASE 5; semua wajib peran `admin`). |
| `TimeRule.gs` | Aturan jendela waktu absensi (WIB; DEC-003/DEC-P18). |
| `Geo.gs` | Haversine + evaluasi GPS masuk WFO (radius ≤50 m). |
| `Drive.gs` | Simpan foto JPEG ke folder Drive privat `ABSENSI_KPU/{YYYY}/{MM_NamaBulan}/{DD}/{Nama_ID}/Absen_Masuk|Absen_Pulang.jpg` (DEC-P29). |
| `Attendance.gs` | Mesin absensi reguler (validasi, lock, kompensasi parsial). |
| `Bootstrap.gs` | Fungsi manual `initializeSheets()` & `seedAdmin()`. |
| `appsscript.json` | Manifest (zona waktu `Asia/Jakarta`, runtime V8, `webapp` D8). |

## Endpoint
Permintaan tulis/autentikasi dikirim sebagai **POST** body JSON:
`{ "action": "...", "token": "...", "data": { ... } }`
Token sesi HANYA dikirim di body (bukan query string).

| Aksi | Metode | Token? | Keterangan |
|------|--------|--------|------------|
| `health` | GET/POST | Tidak | Status dasar; tidak mengakses data privat. |
| `login` | POST | Tidak | `data:{nip,pin,agen}` → `{token, peran, nama, expiresAt}`. |
| `logout` | POST | Ya | Mencabut sesi (`dicabut_pada`). |
| `session.check` | POST | Ya | Memvalidasi sesi aktif. |
| `admin.account.create` | POST | Ya (admin) | Membuat akun untuk pegawai terdaftar dengan PIN 6 digit yang ditentukan admin. |
| `admin.account.setActive` | POST | Ya (admin) | Aktif/nonaktif akun; nonaktif mencabut semua sesi. |
| `admin.account.resetPin` | POST | Ya (admin) | Reset PIN 6 digit dan membuka lockout akun. |
| `attendance.submit` | POST | Ya | Absensi reguler (foto JPEG + GPS masuk WFO). |
| `attendance.mine` | POST | Ya (pegawai) | Riwayat pribadi per bulan dan status absen masuk/pulang hari ini; identitas ditentukan dari sesi. |
| `susulan.submit` | POST | Ya | **NOT_AVAILABLE**; fitur susulan dinonaktifkan pada route aktif (DEC-P31). |
| `admin.pegawai.list` | POST | Ya (admin) | Daftar pegawai (filter q/status/limit). |
| `admin.pegawai.detail` | POST | Ya (admin) | Detail pegawai + info akun (tanpa hash PIN). |
| `admin.pegawai.create` | POST | Ya (admin) | Tambah pegawai (kolom DATA_DICTIONARY §1). |
| `admin.pegawai.update` | POST | Ya (admin) | Ubah nama/NIP/jabatan/unit kerja. |
| `admin.pegawai.setActive` | POST | Ya (admin) | Aktif/nonaktif pegawai; nonaktif mencabut sesi; riwayat absensi tetap. |
| `admin.absensi.list` | POST | Ya (admin) | Daftar absensi (filter tanggal/jenis/pegawai); tanpa referensi foto. |
| `admin.absensi.detail` | POST | Ya (admin) | Detail absensi + metadata bukti (ada/mime/ukuran/path). |
| `admin.absensi.photo` | POST | Ya (admin) | Isi foto absensi (base64+mime) via referensi `id_bukti` (DEC-P25). |
| `admin.susulan.*` | POST | Ya (admin) | **NOT_AVAILABLE**; fitur susulan dinonaktifkan pada route aktif (DEC-P31). |
| `admin.log.list` | POST | Ya (admin) | Log audit (filter aksi/limit). |
| `report.absensi.list` | POST | Ya (admin) | Daftar absensi untuk laporan (rentang wajib, filter; join nama). |
| `report.rekap` | POST | Ya (admin) | Rekapitulasi fakta terhitung per filter (tanpa indikator kebijakan). |
| `report.absensi.exportCsv` | POST | Ya (admin) | Ekspor CSV (rentang wajib, filter); maks 5000 baris. |

Catatan PHASE 5:
- Rentang tanggal wajib dan maksimum **92 hari** (`REPORT_MAX_RANGE_DAYS`).
- Ekspor maksimum **5000 baris** (`REPORT_EXPORT_MAX_ROWS`); kelebihan →
  `EXPORT_TOO_LARGE` (tidak dipotong diam-diam).
- CSV diawali BOM UTF-8; guard formula-injection hanya pada berkas ekspor;
  kolom tetap tanpa `drive_file_id`, URL foto, PIN, atau token.
- Indikator kebijakan (terlambat, persentase kehadiran, dll.) **tidak
  dihitung** — aturannya belum ditetapkan (DEC-P07).
- Ekspor tercatat di log sebagai `report_exported`.
- Status masuk/pulang laporan diturunkan ulang dari catatan aktual; CSV memuat
  kolom `status_masuk` dan `status_pulang`.

Catatan PHASE 4:
- Respons **tidak pernah** memuat `pin_hash`, `pin_salt`, `drive_file_id`, atau
  URL foto; akses foto lewat endpoint blob ber-token (DEC-P25).
- Keputusan susulan hanya mengubah status pengajuan + log; **tidak** otomatis
  menulis baris `Absensi` (keputusan aturan belum ada).
- Struktur folder foto absensi: `ABSENSI_KPU/{YYYY}/{MM_NamaBulan}/{DD}/{Nama_ID}/`
  dengan file `Absen_Masuk.jpg`/`Absen_Pulang.jpg` (DEC-P29). Foto susulan
  terpisah di `.../{MM_NamaBulan}/Foto_Susulan/`.

Contoh respons login sukses:
```json
{ "status": "ok", "ok": true, "token": "<rahasia>", "peran": "pegawai",
  "nama": "...", "expiresAt": "2026-10-15T11:00:00.000Z" }
```
Login gagal selalu: `{ "ok": false, "error": "AUTH_FAILED", "message": "NIP atau PIN tidak sesuai." }`
(tidak membedakan akun tidak ada / PIN salah / terkunci).

## Properti Script yang Digunakan
Isi via **Project Settings → Script Properties** (jangan simpan di kode):

| Kunci | Wajib? | Status saat ini |
|-------|--------|-----------------|
| `SPREADSHEET_ID` | Ya (PHASE 2) | BELUM DIKONFIGURASI (AMB-23 / DEC-P08) |
| `DRIVE_FOLDER_ID` | Nanti (PHASE 3+) | BELUM DIKONFIGURASI (AMB-23) |
| `OFFICE_LATITUDE` / `OFFICE_LONGITUDE` | PHASE 3 | BELUM DITETAPKAN (AMB-07) |
| `OFFICE_RADIUS_METERS` | PHASE 3 | 50 (DEC-004) |
| `PIN_KDF_ITERATIONS` | Opsional | 10000 sementara — **WAJIB benchmark** (D2) |
| `SESSION_TTL_MINUTES` | Opsional | 480 (8 jam) |
| `ADMIN_SETUP_NIP` | Ya (bootstrap) | BELUM DIISI (D4) |
| `ADMIN_SETUP_PIN` | Ya (bootstrap) | BELUM DIISI (D4) — HAPUS setelah seed |
| `ADMIN_SETUP_NAMA` | Opsional | BELUM DIISI (D4) |

> Script Properties **bukan** pengganti autentikasi. Setiap endpoint sensitif tetap
> memverifikasi identitas & peran di backend.

## Langkah Bootstrap (manual, sekali)
1. Set Script Properties `SPREADSHEET_ID` dan (sementara) `ADMIN_SETUP_NIP`,
   `ADMIN_SETUP_PIN`, opsional `ADMIN_SETUP_NAMA`.
2. Di editor Apps Script, jalankan `initializeSheets()` → membuat sheet
   `Pegawai`, `Akun`, `Sesi`, `Absensi`, `BuktiAbsensi`, `PengajuanSusulan`,
   `LogAktivitas` beserta header.
3. Jalankan `seedAdmin()` → membuat 1 akun admin. **Hapus** `ADMIN_SETUP_PIN`
   (dan `ADMIN_SETUP_NIP`) setelah berhasil.
4. Deploy → **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** (D8).
5. Salin URL `/exec` ke `assets/js/config.js` → `API_BASE_URL` (URL publik, bukan rahasia).

## Batasan yang Diakui
- Apps Script tidak punya KDF bawaan → PBKDF2 di sini kode kustom, **belum diaudit**.
- Tidak ada cookie (`HttpOnly`/`Secure`/`SameSite`) → token di memori (D1).
- Tidak ada IP klien andal → lockout per-akun (5 gagal → 15 menit, D3).
- Iterasi PBKDF2 default belum di-benchmark di runtime nyata.

## Belum Diimplementasikan
- Impor CSV (AMB-14), retensi (AMB-18), notifikasi (AMB-25).
- Indikator kebijakan laporan (terlambat, tidak hadir, persentase kehadiran) —
  aturannya belum ditetapkan (DEC-P07).

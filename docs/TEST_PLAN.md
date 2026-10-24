# TEST PLAN — Rencana Pengujian

> Status: **PHASE 1 & pengujian otomatis PHASE 2 sebagian dieksekusi.** Rencana +
> hasil apa adanya (lulus/gagal/tidak dijalankan). Pengujian otomatis berjalan di
> Node dengan stub; integrasi runtime Apps Script & browser BELUM dijalankan.
>
> Catatan 2026-10-24 (DEC-P31): suite otomatis `check-foundation` 74, `auth` 56,
> `attendance` 200, `admin` 166, `report` 178, `susulan` 67 — semua LULUS.

## Strategi
- Unit test logika murni (perhitungan jarak, evaluasi jam, validasi input) bila memungkinkan di JS.
- Test integrasi manual terhadap Apps Script Web App (endpoint backend).
- Test end-to-end manual di browser desktop & seluler.
- Test batas (boundary) untuk semua aturan waktu & radius.

## 0. Fondasi (PHASE 1) — otomatis
Dijalankan dengan `node tests/check-foundation.mjs`.

| ID | Kasus | Hasil |
|----|-------|-------|
| FD-01 | Struktur berkas lengkap | LULUS |
| FD-02 | Sintaks JS frontend (`config.js`, `api.js`, `app.js`, `auth.js`, `admin.js`, `report.js`, `service-worker.js`) | LULUS |
| FD-03 | Sintaks Apps Script (`Code.gs`, `Config.gs`, `Auth.gs`, `Repo.gs`, `AuthService.gs`, `AdminService.gs`, `ReportService.gs`, `Bootstrap.gs`) | LULUS |
| FD-04 | Validitas JSON (`manifest.webmanifest`, `appsscript.json`) | LULUS |
| FD-05 | Ikon PNG valid & berdimensi 192/512 | LULUS |
| FD-06 | Ikon manifest ada di disk; `start_url`/`scope` relatif | LULUS |
| FD-07 | Semua referensi aset lokal `index.html` ada | LULUS |
| FD-08 | Tidak ada rahasia di berkas frontend | LULUS |
| FD-09 | `API_BASE_URL` = URL Web App Apps Script yang valid (dikonfirmasi pengguna) | LULUS (2026-10-19: pengguna mengonfirmasi URL deployment; sebelumnya gagal karena tes mensyaratkan kosong) |
| FD-10 | Tidak ada data mirip NIP/pegawai di frontend | LULUS |
| FD-11 | Halaman & seluruh aset termuat via HTTP lokal (200) | LULUS |
| FD-12 | Perilaku service worker online/offline di browser | BELUM DIJALANKAN |
| FD-13 | Responsivitas visual di berbagai ukuran layar | BELUM DIJALANKAN |
| FD-14 | Integrasi backend (`action=health`) | BELUM DIJALANKAN |
| FD-15 | Instalabilitas PWA | BELUM DIJALANKAN |
| FD-16 | Pengujian autentikasi otomatis (`tests/auth.test.mjs`, 56 cek) | LULUS |
| FD-17 | Vektor PBKDF2-HMAC-SHA256 RFC 7914 §11 (c=1, c=80000) | LULUS |
| FD-18 | Benchmark iterasi PBKDF2 di runtime Apps Script nyata | BELUM DIJALANKAN |
| FD-19 | Pengujian mesin absensi (`tests/attendance.test.mjs`, 200 cek) | LULUS |
| FD-20 | Pengujian panel admin (`tests/admin.test.mjs`, 166 cek) | LULUS |
| FD-21 | Pengujian laporan (`tests/report.test.mjs`, 178 cek) | LULUS |
| FD-22 | Pengujian pengajuan susulan (`tests/susulan.test.mjs`, 67 cek) | LULUS |

## 1. Aturan Waktu (zona `Asia/Jakarta`)
| ID | Kasus | Ekspektasi |
|----|-------|------------|
| WT-01 | Masuk 07:00:00 | Diterima |
| WT-02 | Masuk 08:29:59 | Diterima `TEPAT_WAKTU` |
| WT-03 | Masuk 08:30:00 | Diterima `TEPAT_WAKTU` |
| WT-03a | Masuk 08:30:01 | Diterima `TERLAMBAT` |
| WT-03b | Masuk setelah 08:30 sampai 23:59:59 | Diterima `TERLAMBAT` |
| WT-04 | Masuk 06:59:59 | Ditolak |
| WT-05 | Pulang 16:00:00 | Diterima |
| WT-06 | Pulang 23:59:59 | Diterima |
| WT-07 | Pulang 00:00:01 hari berikutnya (untuk tanggal sebelumnya) | Ditolak sebagai reguler |
| WT-08 | Waktu server dijadikan acuan (jam perangkat dimanipulasi) | Keputusan tetap sesuai server |

## 2. Radius & GPS (WFO masuk)
| ID | Kasus | Ekspektasi |
|----|-------|------------|
| GP-01 | Jarak 49,9 m | Diterima |
| GP-02 | Jarak 50,0 m | Sesuai keputusan batas (≤ 50) — perlu ketegasan inklusif/eksklusif |
| GP-03 | Jarak 50,1 m | Ditolak |
| GP-04 | Koordinat tidak valid (NaN/out-of-range) | Ditolak eksplisit |
| GP-05 | Izin GPS ditolak | Absensi reguler tidak dicatat berhasil |
| GP-06 | Akurasi GPS buruk | Perlu keputusan (AMB-08) |

## 3. Foto & Kamera
| ID | Kasus | Ekspektasi |
|----|-------|------------|
| PH-01 | Unggah dari galeri | Ditolak untuk alur reguler |
| PH-02 | Izin kamera ditolak | Absensi reguler tidak berhasil |
| PH-03 | Foto berhasil, simpan Drive gagal | Status bukan "berhasil" |
| PH-04 | Foto disimpan, metadata gagal | Status "perlu ditindaklanjuti" + tidak ada tautan publik |

## 4. Autentikasi & Otorisasi (PHASE 2)
Kode autentikasi tersedia (`gas/Auth.gs`, `gs/AuthService.gs`, dll.). Kasus di bawah
diuji otomatis di Node dengan stub (`tests/auth.test.mjs`) — BUKAN runtime Apps Script.
| ID | Kasus | Ekspektasi | Hasil |
|----|-------|------------|-------|
| AU-01 | Login PIN valid | Token diterbitkan | LULUS (otomatis) |
| AU-02 | PIN salah berulang | Lockout sesuai D3 | LULUS (otomatis; 5×) |
| AU-03 | Login akun nonaktif | Ditolak | LULUS (otomatis) |
| AU-04 | Login tanpa NIP/PIN | Ditolak | LULUS (otomatis) |
| AU-05 | Sesi kedaluwarsa / dicabut | Ditolak | LULUS sebagian (dicabut; kedaluwarsa via unit `isSessionValid_`) |
| AU-06 | Logout | Sesi dicabut di server | LULUS (otomatis) |
| AU-07 | Pegawai akses endpoint admin | Ditolak | LULUS (otomatis, FORBIDDEN) |
| AU-08 | Pemalsuan `role` di body | Diabaikan; peran dari server | LULUS (otomatis) |
| AU-09 | Manipulasi `id_pegawai` | Ditolak | LULUS (otomatis, NOT_FOUND) |
| AU-10 | Buat akun duplikat | Ditolak | LULUS (otomatis, DUPLICATE) |
| AU-11 | Reset PIN tanpa otorisasi | Ditolak | LULUS (otomatis, `admin.account.resetPin` kini aktif — DEC-P22) |
| AU-12 | PIN/token mentah di log | Tidak ada | LULUS (otomatis) |
| AU-13 | Permintaan bersamaan (lockout/status) | Konsisten (`LockService`) | BELUM DIJALANKAN (butuh runtime) |
| AU-14 | Kegagalan penyimpanan | Respons gagal, bukan sukses | BELUM DIJALANKAN |
| AU-15 | Pesan login seragam (akun tak ada vs PIN salah) | Identik | LULUS (otomatis) |
| AU-16 | Token hanya diterima dari body POST (bukan query) | Query diabaikan | LULUS sebagian (desain; belum uji runtime HTTP) |

## 5. Transaksi & Konkurensi
| ID | Kasus | Ekspektasi |
|----|-------|------------|
| TX-01 | Dua absen masuk pada tanggal sama | Yang kedua ditolak |
| TX-02 | Absen pulang tanpa catatan masuk | Diterima; status `TANPA_ABSEN_MASUK`; tanpa baris masuk sintetis |
| TX-02a | Absen pulang dengan/tanpa masuk, syarat pekerjaan dan foto lengkap | Diterima |
| TX-02b | Uraian/output/foto wajib tidak tersedia | Ditolak sebelum file/row ditulis |
| TX-02c | Pulang tanpa masuk kedua kali pada hari yang sama | Ditolak sebagai `DUPLICATE` |
| TX-03 | Dua request masuk bersamaan | Hanya satu tercatat |
| TX-04 | Klik ganda | Tidak menghasilkan duplikat |
| TX-05 | Laporan harian: masuk+pulang, masuk tanpa pulang, pulang tanpa masuk | Kondisi per pegawai/hari dibedakan; waktu yang tidak memiliki catatan kosong; uraian/output pulang tersedia |

## 6. PWA & Privasi
| ID | Kasus | Ekspektasi |
|----|-------|------------|
| PW-01 | Offline | Tampilkan absensi tidak dapat dikirim; tidak ada antrean diam-diam |
| PW-02 | Cache service worker | Tidak memuat data privat/sesi/foto |
| PW-03 | Tautan file Drive diakses tanpa izin | Gagal (privat) |

## 7. Panel Admin (PHASE 4) — otomatis
Dijalankan dengan `node tests/admin.test.mjs` (166 cek) — Node + stub,
BUKAN runtime Apps Script. Data uji sintetis berlabel `TEST`.
| ID | Kasus | Hasil |
|----|-------|-------|
| AD-01 | 11 endpoint admin tanpa token → `UNAUTHORIZED` | LULUS (otomatis) |
| AD-02 | 11 endpoint admin dengan token pegawai → `FORBIDDEN` | LULUS (otomatis) |
| AD-03 | Peran palsu di body diabaikan (peran dari sesi server) | LULUS (otomatis) |
| AD-04 | Metode GET endpoint admin → `METHOD_NOT_ALLOWED` | LULUS (otomatis) |
| AD-05 | Daftar pegawai: filter status/q/limit; tanpa `pin_hash`/`pin_salt`/URL | LULUS (otomatis) |
| AD-06 | Detail pegawai: kolom DATA_DICTIONARY §1 + info akun tanpa rahasia | LULUS (otomatis) |
| AD-07 | Tambah pegawai: validasi, NIP duplikat → `DUPLICATE`, metadata admin, log | LULUS (otomatis) |
| AD-08 | Edit pegawai: nama/NIP/jabatan/unit; NIP bentrok → `DUPLICATE`; log | LULUS (otomatis) |
| AD-09 | Aktif/nonaktif pegawai: sesi dicabut, login ditolak, riwayat absensi tetap | LULUS (otomatis) |
| AD-10 | Daftar absensi: filter tanggal/jenis/pegawai; join nama; **tanpa `drive_file_id`/URL** | LULUS (otomatis) |
| AD-11 | Detail absensi: metadata bukti (ada/mime/ukuran/path) tanpa referensi foto | LULUS (otomatis) |
| AD-12 | Daftar/detail pengajuan susulan + filter status | LULUS (otomatis) |
| AD-13 | Setujui/tolak: status, `id_admin`, `waktu_keputusan` server, log | LULUS (otomatis) |
| AD-14 | Keputusan ganda → `CONFLICT` | LULUS (otomatis) |
| AD-15 | Keputusan susulan TIDAK menulis baris Absensi (belum ada aturan) | LULUS (otomatis) |
| AD-16 | Log audit: filter, limit, tanpa token/PIN mentah | LULUS (otomatis) |
| AD-17 | Router/doPost JSON endpoint admin; `health.phase='admin'`; header `PengajuanSusulan` | LULUS (otomatis) |
| AD-18 | UI panel admin di browser (form, tab, visibilitas peran) | BELUM DIJALANKAN |
| AD-19 | Otorisasi admin terhadap Web App nyata (runtime Apps Script) | BELUM DIJALANKAN |
| AD-20 | Buat akun & reset PIN via panel (PIN 6 digit, unlock, log tanpa PIN) | LULUS (otomatis — DEC-P22) |
| AD-21 | Foto absensi/susulan: endpoint blob ber-token; byte utuh tanpa `drive_file_id`/URL | LULUS (otomatis — DEC-P25) |
| AD-22 | Referensi foto mengikuti catatan absensi; struktur folder baru (DEC-P29) | LULUS (otomatis) |

## 8. Laporan & Ekspor (PHASE 5) — otomatis
Dijalankan dengan `node tests/report.test.mjs` (178 cek) — Node + stub,
BUKAN runtime Apps Script. Data uji sintetis berlabel `TEST`.
| ID | Kasus | Hasil |
|----|-------|-------|
| RP-01 | 3 endpoint `report.*` tanpa token → `UNAUTHORIZED` | LULUS (otomatis) |
| RP-02 | Endpoint `report.*` dengan token pegawai → `FORBIDDEN` | LULUS (otomatis) |
| RP-03 | Peran palsu di body diabaikan (peran dari sesi server) | LULUS (otomatis) |
| RP-04 | Metode GET endpoint laporan → `METHOD_NOT_ALLOWED` | LULUS (otomatis) |
| RP-05 | Rentang wajib & valid; format tanggal; dari > sampai; >92 hari → `INVALID_INPUT` | LULUS (otomatis) |
| RP-06 | `id_pegawai` tidak ada → `NOT_FOUND`; enum filter divalidasi backend | LULUS (otomatis) |
| RP-07 | Daftar: filter gabungan + join nama/NIP + paginasi; **tanpa `drive_file_id`/URL** | LULUS (otomatis) |
| RP-08 | Pemilihan tanggal memakai kolom `tanggal` (Asia/Jakarta), bukan timestamp UTC | LULUS (otomatis) |
| RP-09 | Rekap: fakta terhitung per filter; susulan per status (`menunggu`/`diterima`/`ditolak`); TANPA indikator kebijakan (terlambat/persen) | LULUS (otomatis) |
| RP-10 | CSV: BOM UTF-8, quote RFC 4180, round-trip utuh, kolom tetap, tanpa rahasia/foto | LULUS (otomatis) |
| RP-11 | Guard formula-injection (`=` `+` `-` `@`) hanya di berkas ekspor; data sumber tak diubah | LULUS (otomatis) |
| RP-12 | Ekspor >5000 baris → `EXPORT_TOO_LARGE` (bukan potong diam-diam); log `report_exported` tanpa token/PIN | LULUS (otomatis) |
| RP-13 | Sheet Absensi belum ada → `NOT_CONFIGURED` (bukan ok/kosong) | LULUS (otomatis) |
| RP-14 | Router `doPost`: ekspor → JSON `ok` + `csv`/`filename`/`rows` | LULUS (otomatis) |
| RP-15 | UI tab Laporan di browser (filter, rekap, paginasi, visibilitas peran) | BELUM DIJALANKAN |
| RP-16 | Unduhan Blob CSV di browser (nama berkas, isi) | BELUM DIJALANKAN |
| RP-17 | Otorisasi & data laporan pada Web App nyata (runtime Apps Script) | BELUM DIJALANKAN |

## 8b. PHASE 6 — QA rilis (2026-10-19) — otomatis + verifikasi runtime
Dijalankan: `node tests/check-foundation.mjs` (64 cek), `auth` (42),
`attendance` (112), `admin` (156), `report` (162) — semua LULUS. Verifikasi
runtime non-destruktif terhadap Web App ter-deploy & GitHub Pages.
| ID | Kasus | Hasil |
|----|-------|-------|
| QA-01 | Regresi: urutan pemulihan stage/`disabled` di `submitAttendance` | LULUS (statis) |
| QA-02 | Regresi: `att-submit` di-reset saat `showStage('summary')` | LULUS (statis) |
| QA-03 | Regresi: `auth.js` menangani `auth:session-lost` (`clearToken`) | LULUS (statis) |
| QA-04 | Konsistensi `config.VERSION` == `CACHE_VERSION` service worker | LULUS (statis) |
| QA-05 | Health live Web App: `GET ?action=health` → `ok:true`, `phase:report` | LULUS (runtime) |
| QA-06 | Login live dengan kredensial sintetis → `NOT_CONFIGURED` (tanpa kebocoran) | LULUS (runtime) |
| QA-07 | GitHub Pages `GET https://kipasel.github.io/Absensi/` (+ aset) | LULUS (runtime) — 200, versi 0.5.1 |
| QA-08 | Uji browser nyata (kamera/GPS/SW/unduh CSV) | BELUM DIJALANKAN (butuh perangkat + Pages aktif) |
| QA-09 | Integrasi runtime penuh (login/absensi/laporan) | BELUM DIJALANKAN (butuh `SPREADSHEET_ID`, DEC-P08) |
| QA-10 | Benchmark PBKDF2 di runtime Apps Script (D2) | BELUM DIJALANKAN (butuh Sheets) |

## 8c. Pengajuan Susulan (REQUIREMENTS §8) — otomatis
Dijalankan dengan `node tests/susulan.test.mjs` (67 cek) — Node + stub,
BUKAN runtime Apps Script. Data uji sintetis berlabel `TEST`.
| ID | Kasus | Hasil |
|----|-------|-------|
| SU-01 | Tanggal: format YYYY-MM-DD, kalender valid, kabisat; tolak mendatang & >3 hari | LULUS (otomatis — DEC-P23) |
| SU-02 | Waktu diklaim: normalkan HH:MM→HH:MM:SS, tolak jam/menit tak valid, terima lintas-malam secara format | LULUS (otomatis) |
| SU-03 | Alasan wajib; batas 500 karakter (500 diterima, 501 ditolak) | LULUS (otomatis — DEC-P24) |
| SU-04 | Foto wajib; magic JPEG; PNG ditolak (`PHOTO_INVALID`) | LULUS (otomatis) |
| SU-05 | `susulan.submit` valid: baris `PengajuanSusulan`, foto `Foto_Susulan`, log tanpa PIN/token | LULUS (otomatis) |
| SU-06 | Identitas dari SESI (payload `id_pegawai` diabaikan) | LULUS (otomatis) |
| SU-07 | Duplikat: menunggu/diterima menghalangi; ditolak boleh ulang; jenis/pegawai lain tak memblokir | LULUS (otomatis) |
| SU-08 | Otorisasi: tanpa/salah token → `UNAUTHORIZED`; GET → `METHOD_NOT_ALLOWED` | LULUS (otomatis) |
| SU-09 | Router/`doPost` (`susulan.submit`), penolakan input tak menulis baris/foto | LULUS (otomatis) |
| SU-10 | UI form susulan di browser (tanggal batas, konversi foto, kirim, pesan) | BELUM DIJALANKAN |
| SU-11 | Otorisasi & penyimpanan susulan pada Web App nyata (runtime) | BELUM DIJALANKAN |

## 8d. Struktur Folder Foto Absensi (DEC-P29) — otomatis
Dijalankan di `tests/attendance.test.mjs` (200 cek) — Node + stub Drive
in-memory. Struktur diverifikasi lewat `BuktiAbsensi.path`, nama file, dan
pohon folder stub. Data uji sintetis.
| ID | Kasus | Hasil |
|----|-------|-------|
| DF-01 | Nama folder bulan `MM_NamaBulan` (Indonesia) | LULUS (otomatis) |
| DF-02 | Nama folder pegawai `Nama_IDPegawai` (sanitasi karakter) | LULUS (otomatis) |
| DF-03 | Check-in → `.../DD/Nama_ID/Absen_Masuk.jpg` di path benar | LULUS (otomatis) |
| DF-04 | Check-out → `Absen_Pulang.jpg` folder pegawai yang sama | LULUS (otomatis) |
| DF-05 | Tanggal berbeda → folder tanggal berbeda | LULUS (otomatis) |
| DF-06 | Nama pegawai sama tidak tertukar (ID internal di folder) | LULUS (otomatis) |
| DF-07 | Folder tahun/bulan/tanggal/pegawai dipakai ulang (tidak dibuat ulang) | LULUS (otomatis) |
| DF-08 | Klik ganda & retry idempoten → tanpa file/bukti kedua | LULUS (otomatis) |
| DF-09 | Kegagalan Drive → tanpa file/baris, `ATTENDANCE_NOT_STORED`, log orphan | LULUS (otomatis) |
| DF-10 | Kegagalan Sheets → `ATTENDANCE_STORAGE_PARTIAL`, file orphan dicatat | LULUS (otomatis) |
| DF-11 | Foto privat (`setSharing`), byte utuh lewat endpoint ber-token | LULUS (otomatis) |
| DF-12 | Aturan lama (jam/GPS/sesi) tetap berlaku | LULUS (otomatis) |
| DF-13 | Struktur folder pada Drive nyata (runtime Apps Script) | BELUM DIJALANKAN |

## 9. Yang BELUM Diuji
- Kasus susulan SU-10/SU-11 & folder DF-13 (browser & runtime) — baru otomatis Node.
- Catatan: folder lama berstruktur `YYYY/MM/Foto_Masuk|Foto_Pulang/` tidak
  dipindah/dihapus (DEC-P29/DEC-P26); tidak ada uji migrasi karena tidak ada migrasi.
- Kasus laporan RP-15/RP-16/RP-17 (browser & runtime) — baru otomatis Node.
- Kasus panel admin AD-18/AD-19 (browser & runtime) — baru otomatis Node.
- Kasus fungsional absensi (WT/GP/PH/TX) dijalankan otomatis via
  `tests/attendance.test.mjs` (200 cek) tetapi **belum** diuji di runtime &
  browser nyata; kasus AU-13/AU-14 dan integrasi runtime (FD-14, FD-18) belum.
- Pengujian autentikasi E2E di browser (form masuk, sesi di memori, offline).
- Kasus PWA (PW-01..03).
- Perilaku service worker online/offline di browser nyata (FD-12).
- Responsivitas visual (FD-13), integrasi backend (FD-14), instalabilitas PWA (FD-15).
- Pengujian beban/kuota Apps Script (AMB-24).
- Pengujian pemulihan bencana (AMB-30).
- Pengujian keamanan/penetrasi independen.

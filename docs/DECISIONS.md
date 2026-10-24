# DECISIONS — Catatan Keputusan

> Format tiap entri: ID, tanggal, status, keputusan, alasan, dampak, dokumen terkait.
> Aturan: keputusan lama tidak dihapus diam-diam. Perubahan disetujui dicatat sebagai
> keputusan baru yang merujuk keputusan lama.

## Keputusan yang Sudah Ditetapkan (dari spesifikasi disetujui)

### DEC-001 — Stack teknologi
- Tanggal: 2026-10-15
- Status: DISETUJUI (dari spesifikasi master prompt)
- Keputusan: Frontend HTML/CSS/JS di GitHub Pages; backend Google Apps Script Web App; database Google Sheets; foto di Google Drive privat; bentuk PWA.
- Alasan: ditetapkan pengguna.
- Dampak: seluruh arsitektur mengikuti batas ini; tidak boleh diganti tanpa persetujuan.

### DEC-002 — Zona waktu bisnis
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Semua aturan waktu memakai `Asia/Jakarta`; keputusan memakai waktu server, bukan jam perangkat.
- Dampak: project Apps Script harus di-set timezone `Asia/Jakarta`; format penyimpanan waktu harus konsisten (lihat AMB-17).

### DEC-003 — Jam absensi reguler
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Masuk `07:00:00–08:29:59` (≥08:30:00 ditolak); pulang `16:00:00–23:59:59`; absen pulang lintas tanggal ditolak sebagai reguler.

### DEC-004 — Kebijakan foto & GPS
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Kamera wajib untuk semua absensi reguler; GPS wajib hanya untuk masuk WFO; radius maks 50 m; tanpa watermark; simpan foto asli; metadata terpisah; dilarang tautan publik.

### DEC-005 — Aturan transaksi
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Satu masuk + satu pulang reguler per pegawai per tanggal; pulang mensyaratkan masuk valid; validasi backend; anti duplikasi.

### DEC-006 — Mode kerja
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Mode WFO/WFH-WFA dipilih pegawai saat absensi; admin tidak menetapkan mode harian.

### DEC-007 — Privasi Drive
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Folder Drive privat; struktur `ABSENSI_KPU/YYYY/MM/Foto_Masuk|Foto_Pulang/`; dilarang publik/"anyone with link"; bukti tidak dihapus saat akun nonaktif.

### DEC-008 — Service worker
- Tanggal: 2026-10-15
- Status: DISETUJUI
- Keputusan: Cache hanya aset statis aman; dilarang cache data privat; tidak ada antrean absensi offline.

## Keputusan Pending (menunggu jawaban pengguna)
| ID | Terkait | Keputusan yang dibutuhkan | Status |
|----|---------|---------------------------|--------|
| DEC-P01 | AMB-21 | Visibilitas Web App & strategi CORS/token | DIJAWAB DEC-P16 (D8) |
| DEC-P02 | AMB-03/04/05 | Mekanisme PIN, hash, lockout, sesi | DIJAWAB sebagian DEC-P09..P13; format PIN disahkan DEC-P22 |
| DEC-P03 | AMB-07 | Nilai koordinat kantor | DISETUJUI 2026-10-19 (lihat DEC-P20) |
| DEC-P04 | AMB-15/16/17 | Skema data & format waktu | DIJAWAB DEC-P15 (D6/D7) |
| DEC-P05 | AMB-11/12 | Aturan susulan | DIGANTIKAN DEC-P23/P24 |
| DEC-P06 | AMB-18 | Retensi data | DIGANTIKAN DEC-P26 |
| DEC-P30 | AMB-05/D1 | Penyimpanan token sesi persisten ("Ingat saya") | DISETUJUI 2026-10-21 (mengubah DEC-P09) |
| DEC-P07 | AMB-19 | Laporan & ekspor | DISETUJUI 2026-10-19 |
| DEC-P08 | AMB-23 | Nilai konfigurasi resource | DISETUJUI 2026-10-19 (nilai di Script Properties; tidak di repo — `backendConfigured:true`) |
| DEC-P09 | AMB-05 | **D1** penyimpanan token sesi (memori/sessionStorage/localStorage/ubah arsitektur) | DIUBAH DEC-P30 (2026-10-21) |
| DEC-P10 | AMB-03 | **D2** metode penyimpanan & verifikasi PIN (PBKDF2 buatan sendiri / SHA-256+lockout / layanan eksternal) | DISETUJUI 2026-10-15 |
| DEC-P11 | AMB-04 | **D3** ambang & durasi lockout | DISETUJUI 2026-10-15 |
| DEC-P12 | AMB-06 | **D4** bootstrap admin pertama | DISETUJUI 2026-10-15 |
| DEC-P13 | AMB-01/02 | **D5** penerbitan PIN awal & reset | DISETUJUI 2026-10-15 |

## Keputusan Autentikasi yang Sudah Ditetapkan (PHASE 2)
Sumber: jawaban pengguna atas pertanyaan D0–D8 (lihat `docs/PHASE2_AUDIT.md`).

### DEC-P14 — Login (D0)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: Login memakai **NIP/NIPK + PIN** (PIN saja tidak dapat mengidentifikasi akun).

### DEC-P09 — Penyimpanan token sesi (D1)
- Tanggal: 2026-10-15; Status: DIUBAH oleh DEC-P30 (2026-10-21)
- Keputusan: Token sesi disimpan di **memori JS saja** (tanpa localStorage/sessionStorage/cookie).
- Dampak: memuat ulang halaman = keluar; pengguna harus masuk lagi.
- Diperbarui DEC-P30: ditambah opsi "Ingat saya" → token juga di `localStorage`
  (tetap tanpa cookie); tanpa centang tetap memori saja.

### DEC-P10 — Hash PIN (D2)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: **PBKDF2-HMAC-SHA256** (RFC 2898) dengan salt unik per akun; DIVALIDASI
  terhadap vektor uji RFC 7914 §11. Iterasi default 10000 (sementara) dan WAJIB
  di-benchmark di runtime Apps Script sebelum produksi.
- Catatan: Apps Script tidak menyediakan KDF bawaan → kode kustom, belum diaudit independen.

### DEC-P11 — Lockout (D3)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: **5 kali gagal → terkunci 15 menit** (per-akun; tidak ada IP klien andal).

### DEC-P12 — Bootstrap admin (D4)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: Admin pertama dibuat lewat **Script Properties + fungsi `seedAdmin()` satu kali**.
  Tidak ada PIN default di kode. `ADMIN_SETUP_PIN` dihapus setelah seed.

### DEC-P13 — Penerbitan/reset PIN (D5)
- Tanggal: 2026-10-15; Status: DISETUJUI (ditunda)
- Keputusan: Penerbitan & reset PIN **DIPISAH** dari PHASE 2. Hanya manajemen akun yang
  dibangun. Action `admin.account.resetPin` mengembalikan `NOT_AVAILABLE`.

### DEC-P15 — Skema data & format waktu (D6/D7)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: Menyetujui draf skema `docs/DATA_DICTIONARY.md`; ID berupa string;
  waktu ISO-8601 UTC + kolom tanggal lokal; sheet `Sesi` disetujui.

### DEC-P16 — Akses Web App (D8)
- Tanggal: 2026-10-15; Status: DISETUJUI
- Keputusan: Deploy Web App *Execute as* **USER_DEPLOYING** & *Who has access*
  **ANYONE_ANONYMOUS**. Diimplementasikan pada `gas/appsscript.json`.

## PASAL PENTING (PHASE 2)
- Cookie `HttpOnly`/`Secure`/`SameSite` **tidak tersedia** pada Apps Script Web App
  (ContentService tidak bisa `Set-Cookie`; `doGet/doPost` tak membaca Cookie).
  Sesi berbasis cookie dinyatakan tidak mungkin dengan stack saat ini.
- Apps Script tidak menyediakan KDF bawaan (PBKDF2/bcrypt/argon2).
- Detail & sumber: `docs/PHASE2_AUDIT.md` §2.
- D1–D8 telah dijawab; PHASE 2 diimplementasikan dan diuji lokal (lihat PROGRESS.md).
- Tidak ada standar keamanan yang diturunkan secara diam-diam.

### DEC-P17 — Format & ukuran foto absensi (AMB-22)
- Tanggal: 2026-10-19; Status: DISETUJUI (berdasarkan jawaban pengguna)
- Keputusan:
  - Foto dikonversi klien: canvas → JPEG, kualitas ~0.85, sisi terpanjang 1280 px.
  - Maksimum ukuran **1.000.000 byte** (1,0 MB). Ditetapkan melalui Script Properties
    `PHASE3_PHOTO_MAX_BYTES` (default 1.000.000 byte), dibaca oleh backend via
    `photoMaxBytes_()`.
  - Backend memvalidasi: decode base64, memeriksa magic bytes `FF D8 FF` (JPEG),
    dan membatasi ukuran aktual. MIME bukan satu-satunya pemeriksaan.
- Alasan: menyeimbangkan kualitas visual, ukuran unggahan (<=~33% overhead base64),
  dan batas Drive/Apps Script.
- Sumber: instruksi pengguna, TEST_PLAN.md AMB-22.

### DEC-P18 — Jendela jam berlaku setiap hari (AMB-10)
- Tanggal: 2026-10-19; Status: DISETUJUI (berdasarkan jawaban pengguna)
- Keputusan:
  - Aturan waktu masuk (07:00.00–08:29.59 WIB) dan pulang (16:00.00–23:59.59 WIB)
    berlaku **setiap hari** — **tidak ada** pengecualian hari libur/akhir pekan.
  - Tidak ada kalender kegiatan/cuti terintegrasi pada PHASE 3; bila dibutuhkan,
    dibahas di phase berikutnya.
- Alasan: implementasi lebih sederhana, validasi jelas, tidak bergantung pada
  daftar hari libur yang belum ditetapkan.
- Sumber: instruksi pengguna, TEST_PLAN.md AMB-10.

### DEC-P07 — Laporan & format ekspor (AMB-19)
- Tanggal: 2026-10-19; Status: DISETUJUI (sebagian — lihat butir 3)
- Keputusan:
  1. **Format ekspor: CSV saja** (jawaban pengguna atas pertanyaan pilihan format).
     PDF/dimensi lain TIDAK diminta → TIDAK diimplementasikan. Tidak ada
     dependensi baru; penulisan CSV di Apps Script + unduhan Blob di klien.
  2. **Penerima laporan = admin.** Halaman laporan dirujuk pengguna sebagai
     "laporan admin"; seluruh endpoint `report.*` memakai `requirePost_` +
     `requireAdmin_` (peran dari sesi server, bukan klien).
  3. **Isi rekap = fakta terhitung saja** (jumlah catatan masuk/pulang/total,
     pegawai unik, pecahan mode kerja & sumber, status pengajuan susulan,
     rekap per tanggal). Indikator kebijakan (terlambat, tidak hadir,
     persentase kehadiran, hari kerja efektif) **TIDAK ditampilkan** karena
     aturannya masih `BELUM DITETAPKAN` (AMB-19 bagian "isi rekap" bagian
     aturan tetap menunggu keputusan tersendiri).
- Asumsi teknis sementara (bukan keputusan pengguna; ditandai eksplisit di kode):
  - Rentang laporan maksimum **92 hari** per permintaan (`REPORT_MAX_RANGE_DAYS`).
  - Ekspor maksimum **5000 baris** (`REPORT_EXPORT_MAX_ROWS`); kelebihan →
    error `EXPORT_TOO_LARGE` (tidak dipotong diam-diam).
  - Paginasi daftar: default 50, maksimum 200 baris per halaman.
  Nilai-nilai ini dapat diubah bila ada masukan pengguna.
- Sumber: instruksi pengguna (phase 5: laporan admin + ekspor), jawaban
  question tool 2026-10-19 (format CSV).

### DEC-P19 — URL deployment Apps Script (AMB-23 sebagian, FD-09)
- Tanggal: 2026-10-19; Status: DISETUJUI (berdasarkan jawaban pengguna);
  **nilai URL lama digantikan oleh DEC-P21** (2026-10-19).
- Keputusan:
   - Nilai `API_BASE_URL` di `assets/js/config.js` dikonfirmasi pengguna sebagai
     URL Web App Apps Script yang benar dan disengaja. Nilai terkini (pembaruan
     pengguna, 2026-10-19):
     `https://script.google.com/macros/s/AKfycbzuL5JnVA90o-Q-aZBp7X-4_rdxFXOdHz0O0Y2rSy-e488KtGyUuFk3xfvLu0WDJ-5p/exec`
     (nilai sebelumnya diganti mengikuti instruksi pengguna "update API"; format
     & sifatnya sama — URL Web App Apps Script). Versi aset dinaikkan ke `0.5.2`
     agar service worker menarik `config.js` terbaru.
  - Tes fondasi FD-09 disesuaikan: mensyaratkan `API_BASE_URL` berformat URL
    Web App Apps Script yang valid (bukan lagi "harus kosong").
  - Verifikasi awal (2026-10-19): `GET ?action=health` pada URL terkini
    merespons `{"ok":true,"phase":"report","backendConfigured":false,...}`.
- Yang TIDAK termasuk (tetap menunggu DEC-P08):
  - `SPREADSHEET_ID` & `DRIVE_FOLDER_ID` — belum dikonfigurasi di Script
    Properties (`backendConfigured:false`); jangan mengarang nilai.
- Sumber: instruksi pengguna (menyertakan URL API & pembaruan URL), cek langsung
  endpoint.

### DEC-P20 — Lokasi kantor & konfigurasi resource (AMB-07, AMB-23)
- Tanggal: 2026-10-19; Status: DISETUJUI (data dari pengguna).
- Keputusan:
  - **AMB-07 ANSWERED:** pengguna menetapkan titik kantor
    (`OFFICE_LATITUDE`, `OFFICE_LONGITUDE`) dan radius `OFFICE_RADIUS_METERS`
    = **50 meter** (sesuai DEC-004). Nilai koordinat disimpan di **Script
    Properties** dan **tidak di-commit ke repositori** (kebijakan
    `docs/DEPLOYMENT.md` §A). Dengan terisinya nilai ini,
    `officeLocationConfigured` menjadi `true` dan validasi GPS WFO aktif.
  - **DEC-P08 / AMB-23 (sebagian):** `SPREADSHEET_ID` & `DRIVE_FOLDER_ID` telah
    diisi di Script Properties — health check melaporkan `backendConfigured:true`
    (2026-10-19). Nilai resource tidak di-commit (kebijakan §A). Sheet `Akun`
    terverifikasi ada (probe login menjawab `AUTH_FAILED`, bukan
    `NOT_CONFIGURED`).
- Yang masih pending: benchmark iterasi PBKDF2 (D2), penerbitan/reset PIN (D5),
  aturan susulan (AMB-11/12), akses foto admin (AMB-20), impor (AMB-14),
  retensi (AMB-18), notifikasi (AMB-25), indikator kebijakan laporan.
- Sumber: instruksi pengguna 2026-10-19 (koordinat + radius 50 m), health check.

### DEC-P21 — Pembaruan URL Web App & verifikasi lokasi kantor (AMB-07 selesai)
- Tanggal: 2026-10-19; Status: DISETUJUI (instruksi pengguna + verifikasi langsung).
- Keputusan:
  - `API_BASE_URL` di `assets/js/config.js` diubah ke URL Web App terbaru
    (sumber: instruksi pengguna "update API"):
    `https://script.google.com/macros/s/AKfycbwugyBMKan9v3rHZECItwAmxtO0aOn5RVHClSNXQhSBq_Px61svqHSWXd00J8PGf8RZ/exec`
    (URL publik, bukan rahasia; format & sifat sama dengan DEC-P19).
  - Versi aset dinaikkan `0.6.0` → **`0.6.1`** (`config.js` VERSION ==
    `service-worker.js` CACHE_VERSION `app-v0.6.1`) agar service worker menarik
    `config.js` terbaru; `nav.js` ikut di daftar aset statis.
  - **AMB-07 kini SELESAI diverifikasi:** health check URL terbaru
    (POST `action=health`) mengembalikan `backendConfigured:true` dan
    **`officeLocationConfigured:true`** (2026-10-19T07:57:04Z) → koordinat kantor
    & radius sudah tersimpan di Script Properties; validasi GPS WFO aktif.
  - Routing terverifikasi: POST `action=login` NIP sintetis → `AUTH_FAILED`
    (bukan `NOT_CONFIGURED`) → sheet `Akun` ada. Catatan: `GET ?action=health`
    tanpa body tidak merespons di deployment ini — verifikasi health harus via POST.
- Yang TIDAK termasuk: nilai koordinat/ID resource tetap di Script Properties
  (kebijakan `docs/DEPLOYMENT.md` §A); belum ada uji browser/absensi nyata.
- Sumber: instruksi pengguna 2026-10-19 (URL API baru), cek langsung endpoint.

### DEC-P22 — Penerbitan & reset PIN oleh admin (AMB-01/02, sisa AMB-03)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan:
  1. **Admin mengetik PIN** saat `admin.account.create` (PIN wajib diisi) dan saat
     `admin.account.resetPin`; admin menyampaikan PIN ke pegawai secara langsung
     di luar aplikasi. Reset PIN kini **diaktifkan** (menggantikan status ditunda
     D5/`NOT_AVAILABLE` — lihat DEC-P13 yang digantikan sebagian).
  2. **Format PIN: tepat 6 digit angka** (`0-9`), divalidasi di backend untuk
     pembuatan & reset. (Sisa AMB-03.)
- Dampak: `handleAccountCreate_` mewajibkan `pin`; `handleResetPin_` diimplementasi
  (reset juga membuka kunci akun yang terkunci); log audit `pin_reset`.
  Tidak ada PIN default/otomatis di kode; tidak ada PIN di log/respons.
- Sumber: jawaban question tool 2026-10-21 (opsi "Admin ketik PIN saat buat/reset",
  "6 digit angka").

### DEC-P23 — Batas tanggal pengajuan susulan (AMB-11)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan: Pegawai hanya boleh mengajukan susulan untuk tanggal absensi
  **maksimum 3 hari sebelum hari server (WIB)** dan **tidak untuk tanggal mendatang**.
- Dampak: validasi backend `susulan.submit`; melebihi batas → `INVALID_INPUT`.
- Sumber: jawaban question tool 2026-10-21 (opsi "3 hari"); menggantikan DEC-P05.

### DEC-P24 — Bukti pengajuan susulan (AMB-12)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan: Pengajuan susulan wajib memuat **alasan teks + foto** (JPEG,
  validasi & batas ukuran sama dengan foto absensi reguler, DEC-P17); foto
  disimpan ke Drive privat pada folder susulan.
- Dampak: endpoint `susulan.submit` (wajib auth pegawai, alasan + foto);
  keputusan admin tetap TIDAK menulis baris Absensi (PHASE 4 — konversi ke
  absensi tetap menunggu keputusan aturan tersendiri).
- Sumber: jawaban question tool 2026-10-21 (opsi "Alasan + foto").

### DEC-P25 — Akses foto absensi oleh admin (AMB-20)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan: Admin melihat foto lewat **endpoint blob ber-token** khusus
  (`admin.absensi.photo`, `admin.susulan.photo`): POST + token sesi admin →
  mengembalikan isi foto (base64) + MIME; ditampilkan inline di panel admin.
  Tanpa tautan publik, tanpa `drive_file_id` di respons.
- Dampak: foto tetap privat; respons daftar/tetap tidak memuat referensi Drive.
- Sumber: jawaban question tool 2026-10-21 (opsi "Endpoint blob ber-token").

### DEC-P26 — Retensi data (AMB-18)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan: **Simpan permanen** — tanpa penghapusan otomatis foto maupun data
  absensi. Penghapusan (bila kelak diperlukan) adalah tindakan manual/administratif.
- Dampak: tidak ada fitur retensi yang dibangun; dokumentasi kebijakan diperbarui.
- Sumber: jawaban question tool 2026-10-21 (opsi "Simpan permanen");
  menggantikan DEC-P06.

### DEC-P27 — Impor data & notifikasi (AMB-14, AMB-25)
- Tanggal: 2026-10-21; Status: DISETUJUI (jawaban question tool 2026-10-21).
- Keputusan: Impor CSV pegawai (AMB-14) dan notifikasi (AMB-25) **perlu, tetapi
  rilis lanjut** — TIDAK dikerjakan pada rilis ini; tetap dicatat sebagai
  kebutuhan fase berikutnya.
- Sumber: jawaban question tool 2026-10-21.

### DEC-P28 — Indikator kebijakan laporan (sisa AMB-19, merujuk DEC-P07)
- Tanggal: 2026-10-21; Status: DISETUJUI (konfirmasi keputusan lama).
- Keputusan: Laporan **tetap fakta terhitung saja** — tanpa indikator terlambat,
  tidak hadir, atau persentase kehadiran. Konfirmasi atas DEC-P07 butir 3;
  tidak ada perubahan implementasi.
- Sumber: jawaban question tool 2026-10-21 (opsi "Tidak, fakta saja").

### DEC-P29 — Struktur penyimpanan foto absensi (hierarkis)
- Tanggal: 2026-10-21; Status: DISETUJUI (instruksi pengguna 2026-10-21).
- Keputusan: Struktur folder foto absensi reguler diubah menjadi
  `ABSENSI_KPU/{TAHUN}/{MM_NamaBulan}/{DD}/{NamaPegawai_IDPegawai}/` dengan nama
  file tetap `Absen_Masuk.jpg` / `Absen_Pulang.jpg` (nama bulan Indonesia).
  Menggantikan struktur `YYYY/MM/Foto_Masuk|Foto_Pulang/` (DEC-007).
- Batasan: folder utama `DRIVE_FOLDER_ID` tetap wadah yang dikonfigurasi
  operator (tidak di repo); nama folder disanitasi; ID pegawai internal
  dipertahankan sebagai kunci agar nama sama tidak tertukar.
- Tidak berubah: privasi Drive (privat, tanpa "anyone with link"), validasi
  foto/sesi/waktu/GPS, tanpa watermark, foto susulan tetap terpisah
  (`.../{MM_NamaBulan}/Foto_Susulan/`, DEC-P24), retensi permanen (DEC-P26).
- Pencegahan duplikat: nama file tetap + prasyarat satu masuk/satu pulang per
  pegawai per tanggal + idempotensi `id_absensi` + `LockService`.
- Migrasi: foto lama berstruktur lama TIDAK dipindah/dihapus (DEC-007/DEC-P26);
  struktur baru hanya berlaku untuk penyimpanan baru.

### DEC-P30 — Penyimpanan token sesi persisten ("Ingat saya") (D1 diperbarui)
- Tanggal: 2026-10-21; Status: DISETUJUI (instruksi pengguna 2026-10-21).
- Mengubah: DEC-P09/D1 (token HANYA di memori).
- Keputusan: formulir login menambahkan centang **"Ingat saya"**. Bila
  dicentang, token sesi **juga** disimpan di `localStorage` (`absensi-kpu.token`)
  agar pengguna tidak perlu login ulang setiap memuat ulang halaman. Bila tidak
  dicentang, perilaku tetap seperti sebelumnya (token hanya di memori).
- Masa berlaku: tetap mengikuti TTL **server 8 jam** — tidak ada perpanjangan
  maupun refresh token. Setelah kedaluwarsa/dicabut, token ditolak server dan
  dibersihkan klien; pengguna login kembali.
- Cookie: **tetap tidak dipakai** — Apps Script tidak dapat menerima `Cookie`
  maupun mengirim `Set-Cookie`, sehingga `HttpOnly`/`Secure`/`SameSite` tidak
  tersedia (lihat `docs/SECURITY.md`). ADR: penyimpanan lewat `localStorage`.
- Risiko/penanganan: token persisten lebih rentan eksfiltrasi XSS (bertahan di
  perangkat). Mitigasi: token acak kuat, disimpan sebagai hash di server, TTL
  pendek (8 jam), dapat dicabut (logout/penonaktifan akun), pembersihan otomatis
  saat server menolak; frontend tidak memakai `innerHTML`.
- Pembersihan: `clearToken()` menghapus nilai di memori dan `localStorage`;
  `auth:session-lost`/`session.check` gagal juga membersihkan.
- Pemulihan saat muat halaman: aplikasi membaca token tersimpan, lalu
  membuktikan validitasnya lewat `session.check` sebelum menampilkan status
  "masuk" (tidak mempercayai nilai lokal begitu saja).
- Penerapan: `assets/js/api.js` (kapsul `localStorage`, `restoreToken`),
  `assets/js/auth.js` (`restoreSession`, centang "Ingat saya"),
  `index.html` (`#remember`).

### DEC-P31 — Absensi pulang mandiri dan status catatan masuk
- Tanggal: 2026-10-24; Status: DISETUJUI (instruksi pengguna).
- Mengubah DEC-003/DEC-005 untuk aturan berikut: masuk sebelum 07:00:00 ditolak;
  07:00:00–08:30:00 diterima dengan status `TEPAT_WAKTU`; setelah 08:30:00
  sampai 23:59:59 diterima dengan status `TERLAMBAT`. `TERLAMBAT` ditandai
  merah melalui conditional formatting pada kolom status Google Sheets.
- Pulang 16:00:00–23:59:59 tidak mensyaratkan baris masuk. Pulang tetap butuh
  sesi valid, foto kamera, Uraian Pekerjaan, dan Output Pekerjaan; GPS tidak
  diwajibkan. Duplikat pulang per pegawai/tanggal tetap ditolak di bawah lock.
- Bila baris masuk tanggal tersebut tidak ditemukan, hanya baris pulang yang
  disimpan dengan status `TANPA_ABSEN_MASUK`. Ini menyatakan catatan masuk tidak
  tersedia; bukan bukti ketidakhadiran. Tidak ada baris masuk/foto/GPS sintetis.
- Laporan detail menampilkan status, waktu catatan, uraian, dan output; rekap
  harian memisahkan jumlah pulang tanpa catatan masuk. Header baru ditambahkan
  di kanan pada sheet lama dan baris historis tidak diubah.
- Form pengajuan susulan tetap nonaktif dalam antarmuka dan router aktif.
- Sumber: MASTER CHANGE PROMPT pengguna "IZINKAN ABSENSI PULANG TANPA ABSENSI MASUK".

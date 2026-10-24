# SECURITY — Threat Model Awal & Mitigasi

> Status: **PHASE 4 — panel admin diimplementasikan & diuji lokal (Node).**
> Ini model ancaman, bukan jaminan keamanan. Aplikasi TIDAK boleh diklaim
> "sepenuhnya aman" — belum ada audit independen maupun pengujian runtime.
> Bagian autentikasi/PHASE 2: lihat `docs/PHASE2_AUDIT.md`.

## Keterbatasan Arsitektur Terverifikasi (PHASE 2)
Dirujuk dari dokumentasi resmi/praktik terbukti (bukan asumsi):
- **Tidak ada cookie.** Apps Script Web App tidak dapat menerima header `Cookie`
  dan ContentService tidak dapat mengirim `Set-Cookie`. Akibatnya `HttpOnly`,
  `Secure`, dan `SameSite` **tidak tersedia**. Sesi tidak dapat memakai cookie.
- **Tidak ada KDF bawaan.** Hanya `computeDigest` (SHA family) & HMAC. PBKDF2
  harus diimplementasikan manual (kripto buatan sendiri) atau memakai fast-hash.
- **Tidak ada IP klien andal.** Pembatasan percobaan hanya bisa per-akun, bukan per-IP.
- **Token hanya via body POST.** Query string dilarang; header tidak terbaca.
Lihat `docs/PHASE2_AUDIT.md` §2 untuk sumber dan implikasi.


## Asumsi Dasar
- Frontend di GitHub Pages bersifat publik dan seluruh kode/konfigurasi yang dikirim
  ke browser dapat dibaca penyerang.
- Apps Script adalah satu-satunya tempat validasi yang dipercaya.
- Google Sheets bukan database transaksional penuh.

## Daftar Ancaman & Mitigasi Rencana
| ID | Ancaman | Dampak | Mitigasi rencana | Status |
|----|---------|--------|------------------|--------|
| T-01 | Brute-force PIN | Akun diambil alih | PBKDF2-HMAC-SHA256 + salt + lockout 5×/15 mnt (D3); pencatatan percobaan | Sebagian (kode; uji lokal LULUS, runtime belum) |
| T-02 | Pemalsuan request dari frontend (mis. timestamp/GPS dikirim klien) | Absensi palsu | Waktu & validasi ditentukan server; klien hanya mengirim data mentah yang diverifikasi ulang (AMB-07/08) | Belum diterapkan |
| T-03 | Manipulasi jam perangkat | Absensi di luar jam | Server memakai waktu server `Asia/Jakarta`, bukan klien | Belum diterapkan |
| T-04 | Manipulasi parameter ID pegawai | Akses/pengubahan data pegawai lain | Otorisasi per-identitas di backend; token sesi terikat ke pegawai | Sebagian (admin: ID diverifikasi terhadap sheet, bukan klien; akses pegawai-sendiiri belum) |
| T-05 | Akses data lintas pegawai | Kebocoran data pribadi | Backend hanya mengembalikan data milik pemanggil (kecuali admin) | Sebagian (endpoint admin ber-otorisasi; endpoint data pegawai non-admin belum ada) |
| T-06 | Akses foto via tautan publik | Foto privat bocor | Drive privat; dilarang anyone-with-link; akses via backend ber-otorisasi (AMB-20/DEC-P25) | Sebagian (tanggap admin TANPA `drive_file_id`/URL; endpoint foto blob ber-token; runtime belum) |
| T-07 | Penyalahgunaan endpoint admin | Manipulasi data | Cek peran admin di backend setiap request (jangan percaya klien) | Sebagian (**PHASE 4; diuji lokal 166 cek LULUS; runtime & browser belum**) |
| T-08 | Permintaan ganda / race condition | Duplikasi absensi | `LockService` + kunci unik (pegawai+tanggal+jenis); idempotency; nama file tetap | Sebagian (tulisan absensi & admin dibungkus lock di kode; keputusan susulan ganda → CONFLICT; uji runtime belum) |
| T-09 | Penyalahgunaan token/sesi | Akses tidak sah | Token acak kuat, disimpan sebagai hash, masa berlaku, revoke saat logout | Sebagian (kode; token di memori — atau `localStorage` bila "Ingat saya" DEC-P30) |
| T-10 | Kebocoran konfigurasi/log | Eksposur resource | Secrets via Script Properties; log tanpa data pribadi/PIN/token | Sebagian (kode + uji lokal LULUS; log admin diuji tanpa token/PIN) |
| T-11 | Perubahan/penghapusan tanpa jejak | Tidak dapat diaudit | `LogAktivitas` append-only dengan aktor & waktu | Sebagian (login/logout/akun + **aksi pegawai & keputusan susulan (PHASE 4)** dicat; kode) |
| T-12 | Kegagalan parsial Drive↔Sheets | Data tak konsisten | Urutan tulis & kompensasi; tandai status "perlu ditindaklanjuti"; jangan klaim berhasil | Sebagian (absensi: gagal Drive → tidak menulis apa pun; gagal Sheets → bukti dikompensasi, file orphan dicatat, respons `ATTENDANCE_STORAGE_PARTIAL`; TIDAK ada transaksi atomik) |
| T-13 | CORS / endpoint Apps Script publik | Request dari domain tak dikenal | Batasi/validasi Origin; token wajib (terkait AMB-21) | Belum diterapkan (D8 `ANYONE_ANONYMOUS`; validasi Origin belum) |

## Hasil Tinjauan Keamanan PHASE 1
- Tidak ada rahasia (ID resource, PIN, token) di frontend. Diperiksa otomatis oleh
  `tests/check-foundation.mjs` (pola private key, API key, token, dsb.) → lulus.
- `API_BASE_URL` sengaja kosong; halaman menampilkan **BELUM DIKONFIGURASI** dan
  tidak mengklaim backend terhubung.
- Service worker hanya meng-cache aset statis same-origin; permintaan lintas-origin
  (calon backend) tidak di-cache; tidak ada antrean offline; tidak ada caching respons API.
- `gas/appsscript.json` (PHASE 2) memuat blok `webapp` sesuai keputusan D8
  (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`). Endpoint publik →
  token sesi wajib & otorisasi di backend; validasi `Origin` belum diterapkan.
- Endpoint `health` tidak mengakses data privat (hanya metadata waktu & status
  konfigurasi boolean).

## Prinsip Wajib
- Tidak ada rahasia (ID Spreadsheet, PIN, token) di repositori frontend.
- Validasi penting diulang di backend.
- Setiap endpoint sensitif memverifikasi identitas & peran.
- Gagal simpan → status UI bukan "berhasil".

## Keterbatasan yang Diakui
- Browser tidak dapat membuktikan foto berasal dari kamera fisik (bukan anti-curang mutlak).
- Validasi GPS dapat dipengaruhi spoofing lokasi; 50 m hanya kontrol, bukan jaminan.
- Google Sheets tidak menjamin transaksi penuh; perlu mitigasi aplikatif.
- Belum ada pengujian penetrasi / review keamanan independen → **BELUM DILAKUKAN**.
- CORS/visibilitas Web App belum diputuskan (AMB-21); keamanan endpoint belum final.

## Status Autentikasi PHASE 2 (terimplementasi, diuji lokal)
Kontrol yang sekarang ada di kode (`gas/Auth.gs`, `gas/AuthService.gs`, `gas/Repo.gs`):
- **PIN**: disimpan sebagai PBKDF2-HMAC-SHA256 + salt unik per akun; diversifikasi
  iterasi disimpan per baris (`pin_iterasi`). Diuji vs vektor RFC 7914 §11.
- **Token sesi**: acak (~244 bit dari UUID v4), disimpan sebagai SHA-256 base64;
  token mentah tidak disimpan/ dilog. Disimpan klien di memori; **atau di
  `localStorage` bila pengguna mencentang "Ingat saya"** (DEC-P30, mengubah
  D1/DEC-P09). Cookie tetap tidak dipakai (tidak didukung stack ini).
- **Lockout**: 5 gagal → kunci 15 menit (D3), per-akun (tidak ada IP andal).
- **Pesan seragam**: login gagal selalu `AUTH_FAILED` dengan pesan identik
  (akun tak ada / PIN salah / terkunci tidak dibedakan); verifikasi "dummy"
  dijalankan untuk akun tanpa kredensial untuk mengurangi kebocoran waktu.
- **Otorisasi**: peran diambil dari sesi terverifikasi, TIDAK dari body klien.
- **Log**: `login_failed`, `login_success`, `logout`, aksi akun — tanpa PIN/token.
- Tidak ada PIN default/kredensial di repositori frontend; `API_BASE_URL` kosong.

Belum / belum terverifikasi:
- **Benchmark jumlah iterasi PBKDF2 di runtime Apps Script nyata** (D2) — nilai 10000 sementara.
- Integrasi runtime Apps Script (butuh `SPREADSHEET_ID` — DEC-P08).
- Validasi `Origin`/CORS belum ada; endpoint Web App publik (D8).
- Belum ada pengujian penetrasi / review independen.
- Kripto PBKDF2 adalah kode kustom (Apps Script tanpa KDF bawaan) → risiko implementasi.
- Audit & opsi keputusan: `docs/PHASE2_AUDIT.md`.

## Status Panel Admin PHASE 4 (terimplementasi, diuji lokal)
Kontrol di `gas/AdminService.gs` (semua aksi `admin.*`):
- **Otorisasi server penuh:** setiap aksi → `requirePost_` + `requireAdmin_`;
  peran diambil dari sesi terverifikasi server, TIDAK dari body klien.
  Diuji: tanpa token → `UNAUTHORIZED`; token pegawai → `FORBIDDEN`;
  peran palsu di body diabaikan; GET → `METHOD_NOT_ALLOWED` (166 cek LULUS).
- **Rahasia tidak dikirim:** `pin_hash`/`pin_salt` tidak pernah masuk respons
  pegawai; log admin diuji tanpa token/PIN mentah.
- **Foto:** respons absensi/susulan hanya metadata bukti (ada/mime/ukuran/path);
  `drive_file_id`/URL TIDAK dikirim; akses foto lewat endpoint blob ber-token
  admin (`admin.absensi.photo`, `admin.susulan.photo`; DEC-P25) — tanpa tautan
  publik, file dibuat privat (`setSharing` defensif).
- **Keputusan susulan:** hanya admin sesi; status awal wajib `menunggu`
  (keputusan ganda → `CONFLICT`); `waktu_keputusan` dari server; `id_admin`
  = id_akun pemutus; seluruh keputusan tercatat di `LogAktivitas`.
- **Tulisan di bawah `LockService`** (create/update/setActive/decide);
  keputusan susulan sengaja TIDAK menulis baris Absensi (belum ada aturan).
- **UI `admin.js`:** hanya hiasan; render via `textContent` (anti-XSS);
  backend tetap memvalidasi ulang semua input (validasi enum/tanggal/limit).

Belum / belum terverifikasi (PHASE 4):
- Pengujian runtime Apps Script & browser (AD-18/AD-19 di TEST_PLAN).
- Konkurensi `LockService` pada eksekusi nyata.
- Pembatasan jumlah data (limit 200) belum diuji pada volume besar.
- Belum ada pembatasan rate/kuota khusus endpoint admin (kuota platform saja).

## Status Laporan & Ekspor PHASE 5 (terimplementasi, diuji lokal)
Kontrol di `gas/ReportService.gs` (semua aksi `report.*`):
- **Otorisasi server penuh:** `requirePost_` + `requireAdmin_`; peran diambil
  dari sesi terverifikasi server, TIDAK dari body klien. Penerima laporan =
  admin (DEC-P07). Diuji: tanpa token → `UNAUTHORIZED`; token pegawai →
  `FORBIDDEN`; peran palsu diabaikan; GET → `METHOD_NOT_ALLOWED` (178 cek LULUS).
- **Ekspor CSV aman secara konten:** kolom tetap (tidak mengikuti filter apa
  pun ke keamanan); TIDAK memuat `drive_file_id`, tautan/URL foto, `pin_hash`,
  `pin_salt`, atau token. Guard formula-injection (nilai berawalan
  `=` `+` `-` `@` → diapostrofi) HANYA pada berkas ekspor; data sumber di
  Sheet tidak dimodifikasi (dites).
- **Batas data:** rentang ≤92 hari/permintaan; ekspor ≤5000 baris →
  `EXPORT_TOO_LARGE` (tidak dipotong diam-diam) untuk membatasi jumlah data
  yang keluar dalam satu respons.
- **Log:** ekspor tercatat di `LogAktivitas` (`report_exported`) tanpa
  token/PIN/isi baris pribadi.
- **UI `report.js`:** hanya hiasan; render via `textContent` (anti-XSS);
  unduhan CSV memakai Blob lokal dengan nama berkas divalidasi regex —
  tanpa permintaan lintas-origin dan tanpa menyimpan token di URL.

Belum / belum terverifikasi (PHASE 5):
- Pengujian runtime Apps Script & browser (RP-15..RP-17 di TEST_PLAN).
- Perilaku pada volume data besar (query penuh per rentang tanpa indeks khusus).
- Pembatasan rate/kuota khusus endpoint laporan (hanya kuota platform).
- Review independen terhadap logika filter & rekap.

## Audit Keamanan PHASE 6 (2026-10-19)
Dilakukan pada commit `6fc4292` (sebelum perbaikan) dengan pembacaan seluruh
kode backend & frontend, bukan hanya tes otomatis. Hasil:

Kontrol yang terverifikasi (lulus audit kode):
- **Otorisasi server:** seluruh aksi non-health melalui `requirePost_`; aksi
  admin/laporan tambahan `requireAdmin_` (peran dari sesi server, bukan klien).
  Token hanya diterima dari BODY (`Code.gs`), query string diabaikan.
- **Tanpa rahasia di klien:** `config.js` hanya memuat URL publik; tanpa
  `localStorage`/`sessionStorage`/cookie; token hanya di variabel modul `api.js`.
- **Anti-XSS:** tidak ada `innerHTML`/`eval`/`document.write` di frontend; semua
  render data server memakai `textContent`.
- **Tanpa kebocoran log:** audit seluruh `Logger.log`/`console.*` — tidak ada
  PIN, token, `pin_hash`, atau data pribadi yang dicetak.
- **Health check minimal:** `handleHealth_` hanya mengembalikan status konfigurasi
  & waktu, tanpa data privat.
- **Service worker:** hanya meng-cache aset statis same-origin; permintaan
  lintas-origin (backend Apps Script) diteruskan ke jaringan, tidak di-cache.
- **Secret scan repo:** regex (private key, AWS/Google API key, bearer,
  literal pin/password) + pola NIP 18 digit → bersih di berkas frontend.
- **Verifikasi runtime non-destruktif:** `health` → `ok:true`, `phase:report`,
  `backendConfigured:false`; `POST login` (kredensial sintetis) →
  `NOT_CONFIGURED` — tidak ada kebocoran data/stack trace.

Perbaikan bug frontend PHASE 6 (bukan celah keamanan, tapi integritas alur):
1. `attendance.js` — tombol "Kirim absensi" tidak diaktifkan kembali setelah
   kegagalan (urutan pemulihan `stage`/`disabled` terbalik) → retry idempoten
   (termasuk jalur `ATTENDANCE_STORAGE_PARTIAL`) tidak dapat dilakukan.
2. `attendance.js` — `att-submit` tidak di-reset saat `showStage('summary')`
   sehingga state `disabled` lama dapat memblokir pengiriman berikutnya.
3. `auth.js` — event `auth:session-lost` tidak ditangani; token & tampilan sesi
   tetap aktif setelah server menolak sesi. Kini `clearToken()` +
   `renderLoggedOut()`. Regression check statis ditambahkan di
   `check-foundation.mjs` (versi 0.5.1).

Risiko yang masih DIAKUI (belum dapat dihilangkan, dicatat apa adanya):
- Tanpa cookie `HttpOnly` (keterbatasan Apps Script) → token di memori; XSS
  teoretis tetap berarti pencurian token. Mitigasi: tanpa `innerHTML`, tetapi
  TIDAK ada CSP/`Trusted Types`.
- PBKDF2 kustom belum diaudit & iterasi 10000 belum di-benchmark (D2).
- Belum ada rate limiting khusus aplikasi (hanya kuota platform & lockout login).
- Belum ada review keamanan independen/pihak ketiga.
- `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS` (D8) → siapa pun yang
  memiliki URL dapat memanggil endpoint; keamanan bergantung pada verifikasi
  token di setiap aksi (sudah diterapkan).

Kesimpulan audit: tidak ditemukan celah autentikasi/otorisasi/kebocoran rahasia
yang tidak diketahui. Rilis tetap terblokir oleh **konfigurasi**, bukan kerentanan
baru: `SPREADSHEET_ID` (DEC-P08), koordinat kantor (AMB-07), benchmark PBKDF2 (D2).

## Struktur Penyimpanan Foto (DEC-P29) — tinjauan keamanan
- Struktur: `ABSENSI_KPU/{TAHUN}/{MM_NamaBulan}/{DD}/{NamaPegawai_IDPegawai}/`
  dengan nama file tetap `Absen_Masuk.jpg`/`Absen_Pulang.jpg`.
- **Privasi:** file tetap dibuat privat; `setSharing(ANYONE_WITH_LINK, NONE)`
  dipanggil defensif; tidak ada URL foto di respons manapun; admin mengakses
  lewat endpoint blob ber-token (DEC-P25).
- **Sanitasi nama:** `sanitizePathSegment_` mengganti `\ / : * ? " < > |` &
  karakter kontrol → mencegah injeksi path/karakter aneh dari nama pegawai.
  ID internal disertakan sehingga nama pegawai yang sama tidak tertukar.
- **Anti-duplikat:** nama file tetap + prasyarat satu masuk/satu pulang per
  pegawai per tanggal + idempotensi `id_absensi` + `withLock_`. (T-08)
- **Kegagalan parsial (T-12):** gagal Drive → tidak ada tulisan sama sekali
  (`ATTENDANCE_NOT_STORED`); gagal Sheets setelah file dibuat → baris bukti
  dikompensasi, file **tidak** dihapus & dicatat sebagai orphan
  (`orphan_drive_file=…`) untuk rekonsiliasi; respons `ATTENDANCE_STORAGE_PARTIAL`.
  Google Sheets & Drive **bukan** transaksi atomik — konsistensi didekati, bukan
  dijamin.
- **Retensi:** foto lama berstruktur lama tidak dipindah/dihapus (DEC-P26).

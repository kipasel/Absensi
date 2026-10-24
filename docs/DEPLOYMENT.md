# DEPLOYMENT — Konfigurasi & Deployment

> Status: **PHASE 6 (QA rilis).** Langkah di bawah sesuai berkas di repo.
> Jangan menaruh nilai rahasia (ID resource, PIN, token) di repositori.
> Nilai yang belum tersedia ditandai **BELUM DIKONFIGURASI** / **BELUM DITETAPKAN**.

## A. Konfigurasi Publik vs Server
| Jenis | Contoh | Lokasi | Boleh di Git? |
|-------|--------|--------|----------------|
| Publik | Nama aplikasi, versi, URL Web App | `assets/js/config.js` | Ya (URL `/exec` bersifat publik) |
| Server | `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, koordinat kantor, radius | Apps Script **Script Properties** | Tidak |

Script Properties **bukan** pengganti autentikasi/otorisasi. Endpoint sensitif
tetap wajib memverifikasi identitas & peran di backend.

## B. Membuat Google Spreadsheet
1. Buat Spreadsheet baru milik akun pengelola (jangan bagikan ke publik).
2. Salin **Spreadsheet ID** (bagian di antara `/d/` dan `/edit` pada URL).
3. Simpan ID di Script Properties dengan kunci `SPREADSHEET_ID`.
4. **Jangan** menaruh ID di kode frontend atau di repo.
5. Buat sheet & header dengan menjalankan `initializeSheets()` dari editor Apps
   Script (PHASE 2: `Pegawai`, `Akun`, `Sesi`, `LogAktivitas`). Sheet phase
   lanjutan menyusul sesuai `docs/DATA_DICTIONARY.md`.

## C. Menyiapkan Google Drive Privat
1. Buat folder, misalnya `ABSENSI_KPU` (milik akun pengelola).
2. **Jangan** mengubah izin menjadi "Siapa pun yang memiliki tautan".
3. Salin **Folder ID** (bagian `folders/<ID>` pada URL).
4. Simpan di Script Properties dengan kunci `DRIVE_FOLDER_ID`.
5. Struktur sub-folder `YYYY/MM/Foto_Masuk|Foto_Pulang` dibuat oleh backend pada
   PHASE 3 (belum dibuat sekarang).
6. Cara menghindari tautan publik: jangan panggil `setSharing(...ANYONE...)`;
   akses foto hanya melalui backend ber-otorisasi; jangan menyalin `webViewLink`
   ke antarmuka publik.

## D. Menyiapkan Apps Script
1. Buat proyek Apps Script baru.
2. Salin isi `gas/` (`Code.gs`, `Config.gs`, `Auth.gs`, `Repo.gs`,
   `AuthService.gs`, `Bootstrap.gs`, `appsscript.json`).
   - Aktifkan manifest lewat **Project Settings → Show "appsscript.json"**.
3. Set **Project Settings → Time zone** = `Asia/Jakarta`.
4. Isi **Script Properties** (kolom Name/Value):
   | Kunci | Nilai |
   |-------|-------|
   | `SPREADSHEET_ID` | Diisi oleh pengelola (nilai di Script Properties, **tidak** di repo — DEC-P08/DEC-P20; `backendConfigured:true`) |
   | `DRIVE_FOLDER_ID` | Diisi oleh pengelola (nilai di Script Properties, **tidak** di repo — DEC-P20) |
   | `OFFICE_LATITUDE` | Ditetapkan pengguna 2026-10-19 (nilai di Script Properties, **tidak** di repo — AMB-07/DEC-P20) |
   | `OFFICE_LONGITUDE` | Ditetapkan pengguna 2026-10-19 (nilai di Script Properties, **tidak** di repo — AMB-07/DEC-P20) |
   | `OFFICE_RADIUS_METERS` | `50` (DEC-004 / DEC-P20) |
   | `PIN_KDF_ITERATIONS` | Opsional (default 10000 — **WAJIB benchmark**, D2) |
   | `SESSION_TTL_MINUTES` | Opsional (default 480) |
   | `ADMIN_SETUP_NIP` | Ya untuk bootstrap (D4) — hapus setelah seed |
   | `ADMIN_SETUP_PIN` | Ya untuk bootstrap (D4) — hapus setelah seed |
   | `ADMIN_SETUP_NAMA` | Opsional (D4) |
5. **Akses Web App** (keputusan D8): *Execute as* = **Me**,
   *Who has access* = **Anyone**. Nilai ini ada di `appsscript.json` blok `webapp`.
6. Jalankan `initializeSheets()` lalu `seedAdmin()` (lihat `gas/README.md`).
   Hapus `ADMIN_SETUP_PIN` setelah berhasil.
   Untuk backend yang sudah aktif, unggah versi terbaru `Repo.gs` dan
   `Attendance.gs`, jalankan `initializeSheets()` sekali. Fungsi ini
   menambahkan header absensi yang belum ada di kolom baru dan mempertahankan
   data/baris historis; kolom baru `status`, `uraian_pekerjaan`, dan
   `output_pekerjaan` tidak memerlukan pengisian ulang. Pastikan aturan
   conditional formatting `TERLAMBAT` merah muncul pada kolom `status`.
7. Deploy sebagai Web app → salin URL `/exec`.
8. Salin URL `/exec` ke `assets/js/config.js` → `API_BASE_URL` (publik, bukan rahasia).
9. Deploy Apps Script sebagai versi Web App baru setelah perubahan absensi;
   lalu terbitkan frontend dengan `VERSION` dan `CACHE_VERSION` yang sama.

## E. Menguji Akses Resource (setelah dikonfigurasi)
1. Buka `https://script.google.com/macros/s/<ID>/exec?action=health`.
2. Respons yang benar: JSON dengan `"ok": true` dan `"backendConfigured": true`.
   Catatan (2026-10-19): pada deployment ini `GET ?action=health` tanpa body
   **tidak** merespons; health harus diverifikasi via **POST** body
   `{"action":"health"}` lalu ikuti redirect 302 (GET ke `Location`).
3. Bila `backendConfigured: false`, properti `SPREADSHEET_ID`/`DRIVE_FOLDER_ID`
   belum diisi.
4. Uji login dengan akun admin hasil `seedAdmin()`.
   **Status verifikasi (2026-10-19, URL terbaru — DEC-P21):** health check merespons
   `ok:true`, `phase:report`, `backendConfigured:true`,
   **`officeLocationConfigured:true`** (`SPREADSHEET_ID`/`DRIVE_FOLDER_ID` & koordinat
   kantor tersimpan; sheet `Akun` terverifikasi ada). Uji login/absensi/laporan
   penuh dengan akun nyata **belum dijalankan**.

## F. Deploy Frontend ke GitHub Pages
1. Push repositori (tanpa berkas rahasia; lihat `.gitignore`).
2. Settings → Pages → Deploy from branch → pilih branch & folder root `/`.
3. Seluruh path aset memakai referensi relatif (`./...`) sehingga kompatibel
   dengan sub-path repositori (`https://<user>.github.io/<repo>/`).
4. Verifikasi URL halaman `.html` termuat dan service worker terdaftar.
   **Status verifikasi PHASE 6 (2026-10-19):** Pages diaktifkan (branch `master`,
   root `/`). `GET https://kipasel.github.io/Absensi/` → **200**; aset
   `config.js`/`service-worker.js`/`manifest.webmanifest` → 200; versi tersaji
   `0.6.2`. Uji browser nyata (kamera/GPS/SW) **belum dijalankan**.

## G. Memisahkan Lingkungan Uji dan Produksi
- Gunakan Spreadsheet, folder Drive, dan proyek Apps Script **terpisah** untuk uji
  dan produksi; masing-masing punya Script Properties sendiri.
- Frontend uji dapat berupa branch/URL Pages terpisah; `API_BASE_URL` diarahkan
  ke Web App uji.
- Data pegawai produksi tidak boleh dimasukkan ke lingkungan uji; gunakan data
  sintetis berlabel `TEST` (AMB-29).

## H. Regenerasi Ikon
```
node tools/generate-icons.mjs
```
Ikon yang dihasilkan adalah **placeholder netral**, bukan logo resmi.

## I. Pemulihan (rancangan; detail AMB-30)
- Backup Spreadsheet & Drive: **BELUM DITETAPKAN**.
- Rollback deployment: **BELUM DITETAPKAN**.
- Kepemilikan akun Google pengelola: **BELUM DITETAPKAN**.

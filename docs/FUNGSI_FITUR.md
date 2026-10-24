# CATATAN FUNGSI & FITUR APLIKASI

> Ringkasan fungsi aplikasi dan fitur yang tersedia, untuk memudahkan
> orientasi. Sumber kebenaran tetap `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`,
> dan kode. Dokumen ini **tidak** menambah/mengubah aturan.
> Terakhir diperbarui: 2026-10-24 (kode lokal `0.6.6`, DEC-P31; belum dideploy).

## 1. Ringkasan Aplikasi

Aplikasi absensi pegawai **KPU Kabupaten Aceh Selatan** berbentuk **PWA**
(Progressive Web App) untuk perangkat mobile & desktop.

| Aspek | Keterangan |
|-------|------------|
| Frontend | HTML/CSS/JavaScript, di-host di GitHub Pages |
| Backend | Google Apps Script Web App (menjalankan logika & validasi) |
| Database | Google Sheets (satu Spreadsheet) |
| Foto | Google Drive **privat** |
| Zona waktu | `Asia/Jakarta` (SEMUA keputusan waktu memakai waktu server) |
| Versi | `0.6.6` (`assets/js/config.js`, lokal; live masih `0.6.5`) |

Alur data: `Browser/PWA → HTTPS → Apps Script → Sheets + Drive`.

## 2. Fungsi Aplikasi (untuk siapa & untuk apa)

1. **Pegawai** melakukan **absensi masuk & pulang** dengan **foto** sebagai
   bukti, memakai **kamera** (bukan unggah galeri).
2. Pengajuan absensi susulan **nonaktif** pada UI dan router yang digunakan.
3. **Admin** mengelola **data pegawai & akun** (termasuk PIN).
4. **Admin** memantau **catatan absensi** dan **melihat foto bukti** (tanpa tautan publik).
5. **Admin** membuat **laporan** periode tertentu dan **mengekspor CSV**.

## 3. Fitur per Peran

### 3.1 Otentikasi (semua pengguna)
- Login dengan **NIP/NIPK + PIN**.
- Token sesi di memori; opsi "Ingat saya" menyimpan token hingga TTL server
  8 jam di `localStorage`. Cookie tidak digunakan.
- **Lockout**: 5 kali gagal → terkunci 15 menit (per akun).
- Akun **nonaktif** tidak dapat login; sesi aktif dicabut saat akun dinonaktifkan.
- Pesan login seragam (tidak membedakan akun tidak ada vs PIN salah).

### 3.2 Absensi Reguler (pegawai)
- **Jenis**: `masuk` / `pulang`.
- **Mode kerja**: `WFO` / `WFH_WFA` (dipilih pegawai).
- **Jendela waktu (WIB, setiap hari, DEC-P18)**:
  - Masuk sebelum 07:00:00: ditolak.
  - 07:00:00–08:30:00: diterima `TEPAT_WAKTU`.
  - Setelah 08:30:00 sampai 23:59:59: diterima `TERLAMBAT` (status ditandai merah di Sheet).
  - Pulang: **16:00:00–23:59:59**
- **GPS wajib untuk masuk WFO**; radius kantor ≤ **50 m** (Haversine).
  Mode `WFH_WFA` tidak memerlukan GPS.
- **Foto JPEG wajib** (dari kamera, dikonversi di canvas; batas default
  ±1.000.000 byte; magic-bytes diperiksa server).
- Pulang tidak membutuhkan catatan masuk. Jika masuk belum tercatat, pulang
  disimpan dengan `TANPA_ABSEN_MASUK`; ini hanya menandai catatan masuk yang
  tidak tersedia, bukan bukti ketidakhadiran. Tidak dibuat catatan masuk palsu.
- Pulang wajib Uraian Pekerjaan, Output Pekerjaan, dan foto dari kamera;
  GPS tidak diwajibkan. Tetap hanya satu catatan pulang per pegawai/tanggal.
- **Idempoten**: kirim ulang dengan `id_absensi` sama tidak menghasilkan duplikat.

### 3.3 Pengajuan Susulan (nonaktif)
- Aksi pengajuan dan panel susulan tidak tersedia pada aplikasi aktif.
- Baris historis tidak dihapus otomatis.

### 3.4 Panel Admin
- **Pegawai**: daftar (filter nama/NIP & status), detail, tambah, edit,
  aktif/nonaktif.
- **Akun**: **buat akun** dengan PIN 6 digit, **reset PIN** (sekaligus membuka
  lockout).
- **Absensi**: daftar (filter tanggal/jenis/pegawai), detail + metadata bukti,
  **lihat foto** (endpoint blob ber-token).
- **Susulan**: fitur UI/router nonaktif sesuai instruksi DEC-P31.
- **Log audit**: daftar aktivitas (tanpa PIN/token mentah).

### 3.5 Laporan & Ekspor (admin)
- Filter: periode (wajib, maks. 92 hari), pegawai, jenis, mode, sumber, status.
- **Rekapitulasi fakta terhitung** + tabel harian + rincian berpaginasi;
  detail dan CSV menampilkan kondisi serta pasangan waktu masuk/pulang,
  status, uraian dan output pekerjaan. Waktu yang tidak tercatat tetap kosong.
  Rekap memisahkan pulang tanpa catatan masuk.
- **Ekspor CSV** (BOM UTF-8, quote RFC 4180, guard formula-injection,
  maks. 5000 baris) — **tanpa** PIN/token/referensi foto.
- Status `TERLAMBAT` dicatat per baris masuk sesuai DEC-P31; rekap tidak
  menghitung persentase kehadiran atau indikator kebijakan lain.

### 3.6 Tampilan / PWA
- Antarmuka **mobile app shell**: app bar + **bilah navigasi bawah**
  (Beranda/Absensi/Admin/Profil) — item Admin hanya untuk peran `admin`.
- Warna ciri khas KPU (merah `#D82731`, marun `#771414`, emas `#F8A73E`),
  mode gelap mengikuti sistem.
- Service worker meng-cache **aset statis saja**; **tidak** menyimpan data
  privat/sesi/foto; **tidak ada** antrean absensi offline (offline → blokir kirim).

## 4. Aturan & Keamanan Penting

- **Server sebagai sumber kebenaran**: waktu, identitas, peran, tanggal, dan
  GPS diverifikasi ulang di backend; data dari klien tidak dipercaya.
- **Rahasia** (PIN/token/kredensial/ID resource) hanya di Script Properties,
  **tidak** di frontend.
- **Foto privat**: tanpa "anyone with link"; admin mengakses via endpoint
  ber-token; respons umum tanpa `drive_file_id`/URL foto.
- **Retensi**: simpan **permanen** (tanpa penghapusan otomatis, DEC-P26).
- Sheets & Drive **bukan** transaksi atomik → kegagalan parsial ditangani
  (tidak diklaim sukses).

## 5. Struktur Penyimpanan Foto (Drive)

```
ABSENSI_KPU/{TAHUN}/{MM_NamaBulan}/{DD}/{NamaPegawai_IDPegawai}/
    Absen_Masuk.jpg
    Absen_Pulang.jpg
```
Contoh: `ABSENSI_KPU/2026/10_Oktober/15/Budi_Santoso_PEG-00123/`.
- Nama bulan berbahasa Indonesia (`10_Oktober`).
- Folder pegawai memakai **ID internal** agar nama sama tidak tertukar.
- Foto **susulan** tersimpan terpisah: `.../{MM_NamaBulan}/Foto_Susulan/`.

## 6. Daftar Aksi Backend (endpoint)

| Aksi | Akses | Fungsi |
|------|-------|--------|
| `health` | publik | Status backend/konfigurasi/waktu |
| `login` | publik | Masuk (NIP + PIN) → token |
| `logout` | sesi | Keluar (cabut sesi) |
| `session.check` | sesi | Periksa sesi |
| `attendance.submit` | pegawai | Absensi reguler |
| `admin.account.create` | admin | Buat akun + PIN |
| `admin.account.setActive` | admin | Aktif/nonaktif akun |
| `admin.account.resetPin` | admin | Reset PIN |
| `admin.pegawai.list/detail/create/update/setActive` | admin | Kelola pegawai |
| `admin.absensi.list/detail/photo` | admin | Absensi + foto |
| `admin.log.list` | admin | Log audit |
| `report.absensi.list` / `report.rekap` / `report.absensi.exportCsv` | admin | Laporan & ekspor |

## 7. Dokumen Terkait

| Dokumen | Isi |
|---------|-----|
| `README.md` | Ringkasan proyek & cara menjalankan |
| `docs/REQUIREMENTS.md` | Persyaratan yang disetujui |
| `docs/DECISIONS.md` | Keputusan (DEC-xxx / DEC-Pxx) |
| `docs/ARCHITECTURE.md` | Arsitektur sistem |
| `docs/DATA_DICTIONARY.md` | Skema data (sheet/kolom) |
| `docs/SECURITY.md` | Model ancaman & mitigasi |
| `docs/TEST_PLAN.md` | Rencana & hasil pengujian |
| `docs/DEPLOYMENT.md` | Prosedur konfigurasi & deploy |
| `docs/PROGRESS.md` | Progres per phase |
| `gas/README.md` | Dokumentasi backend Apps Script |

## 8. Status & Batasan

- **BELUM SIAP RILIS**: tersisa **uji integrasi/browser nyata** (kamera, GPS,
  PWA/service worker, login & absensi akun nyata).
- Uji otomatis Node (stub): foundation 74, auth 56, attendance 200,
  admin 166, report 178, susulan 67 — semua lulus.
- Ikon masih **placeholder** (bukan logo resmi KPU).
- Benchmark PBKDF2 di runtime nyata **belum** dijalankan (nilai iterasi sementara).

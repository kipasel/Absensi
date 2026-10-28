# AGENTS.md — Aturan untuk Sesi OpenCode Berikutnya

> WAJIB dibaca sebelum mengubah kode/dokumen apa pun pada proyek ini.

## Identitas Proyek
Sistem Absensi KPU Kabupaten Aceh Selatan. PWA: HTML/CSS/JS (GitHub Pages) →
Google Apps Script → Google Sheets + Google Drive privat. Zona waktu `Asia/Jakarta`.

## Aturan Mutlak
1. **Jangan mengarang** kebutuhan, fitur, aturan bisnis, data pegawai, identitas,
   jadwal, konfigurasi, koordinat kantor, NIP, PIN, atau kredensial.
2. **Jangan mengisi placeholder dengan rekaan.** Tandai `BELUM DITETAPKAN`.
3. Jika keputusan belum ada dan memengaruhi implementasi, **berhenti** dan bertanya.
4. Jangan mengubah stack (HTML/CSS/JS, GitHub Pages, Apps Script, Sheets, Drive)
   tanpa persetujuan.
5. Jangan menaruh rahasia/PIN/token/kredensial di frontend.
   Semua rahasia via Apps Script `Script Properties`.
6. Validasi penting diulang di **backend**. Jangan percaya klien.
7. Jangan mengklaim selesai/aman/teruji tanpa verifikasi nyata.
8. Jangan commit kecuali diminta.

## Urutan Sumber Kebenaran
1. Instruksi terbaru pengguna. 2. `docs/REQUIREMENTS.md` disetujui.
3. Dokumen arsitektur/keputusan disetujui. 4. Dokumentasi resmi teknologi.
5. Asumsi teknis sementara yang dicatat eksplisit.

## Alur Kerja
- Kerjakan **satu phase** pada satu waktu (lihat `docs/PROGRESS.md`).
- Sebelum coding: baca dokumen, audit ambiguitas, jelaskan rencana & file yang diubah.
- Sesudah coding: jalankan pengujian yang ada, laporkan hasil apa adanya,
  perbarui `docs/PROGRESS.md`, dan jangan lanjut phase tanpa instruksi.
- Perubahan sekecil mungkin; jangan refactor tak berkaitan.

## Status Saat Ini
- Perubahan DEC-P33 (2026-10-28) menetapkan status pulang dari catatan pulang
  valid: `SUDAH_ABSEN_PULANG`/`BELUM_ABSEN_PULANG`; `TANPA_ABSEN_MASUK` tetap
  dipakai untuk status masuk yang tidak tersedia. Frontend `0.10.5` terbit
  (commit `11711e2`), tetapi deployment backend dan verifikasi absensi nyata
  belum dikonfirmasi.
- PHASE 0–6 dikerjakan. PHASE 3 (mesin absensi), PHASE 4 (panel admin),
  PHASE 5 (laporan & ekspor) **selesai (lokal)**. PHASE 6 (QA rilis) **selesai
  (lokal)**: audit kode & keamanan, 3 perbaikan frontend, verifikasi runtime.
  Keputusan rilis: **BELUM SIAP RILIS** (lihat `docs/PROGRESS.md` PHASE 6).
- Pasca-PHASE 6 (2026-10-21): PIN admin 6 digit (buat/reset), endpoint foto admin
  ber-token, handler susulan, retensi permanen; keputusan DEC-P22..P28; suite uji
  jadi 6 berkas. Per 2026-10-24 route/UI pengajuan susulan nonaktif (DEC-P31).
- Keputusan D0–D8 sudah dijawab pengguna (lihat `docs/DECISIONS.md` DEC-P09..P16);
  aturan waktu & foto: DEC-P17/P18; ekspor CSV + Excel `.xlsx` (DEC-P34),
  laporan = admin (DEC-P07).
- Kode: autentikasi (`gas/Auth*.gs`, `assets/js/auth.js`), absensi
  (`gas/TimeRule.gs`, `Geo.gs`, `Drive.gs`, `Attendance.gs`, `Susulan.gs`;
  `assets/js/camera.js`,   `attendance.js`, `susulan.js`), panel admin (`gas/AdminService.gs`; `assets/js/admin.js`),
  laporan (`gas/ReportService.gs`; `assets/js/report.js`).
  Struktur foto (DEC-P29): `ABSENSI_KPU/{YYYY}/{MM_NamaBulan}/{DD}/{Nama_ID}/`
  dengan `Absen_Masuk.jpg`/`Absen_Pulang.jpg`.
  Keterbatasan terverifikasi: Apps Script tak punya cookie (`HttpOnly` tak
  tersedia) & tak punya KDF bawaan (PBKDF2 kode kustom, belum diaudit).
- Fitur Pasca-PHASE 6 (2026-10-21, DEC-P22..P28): PIN admin 6 digit buat/reset,
  endpoint foto admin ber-token, pengajuan susulan pegawai (`susulan.submit`),
  retensi permanen. Impor CSV (AMB-14) & notifikasi (AMB-25) dikesampingkan.
- Perintah uji: `node tests/check-foundation.mjs`, `node tests/auth.test.mjs`,
  `node tests/attendance.test.mjs`, `node tests/admin.test.mjs`,
  `node tests/report.test.mjs`, `node tests/susulan.test.mjs`,
  `node tests/datetime.test.mjs`.
  Hasil terakhir (2026-10-28): 84 / 57 / 218 / 170 / 282 / 67 / 14 — semua **0 gagal**.
- Tampilan tanggal/waktu memakai `assets/js/datetime.js` (Asia/Jakarta);
  timestamp server tetap ISO-8601 UTC dan CSV dikonversi sekali di backend.
- Status masuk/pulang laporan **diturunkan ulang** dari catatan aktual (DEC-P33):
  pulang valid = `SUDAH_ABSEN_PULANG`; tanpa pulang valid tetapi ada masuk =
  `BELUM_ABSEN_PULANG`; tanpa masuk valid tetapi ada pulang =
  `status_masuk: TANPA_ABSEN_MASUK` + `status_pulang: SUDAH_ABSEN_PULANG`.
  Baris pulang valid di sheet berstatus `SUDAH_ABSEN_PULANG` (bukan TANPA).
  Rekonsiliasi aman: `reconcileAbsensiStatusesPreview()` lalu
  `reconcileAbsensiStatusesApply()` (hanya kolom `status`). Belum dijalankan
  pada spreadsheet produksi.
- Endpoint Web App terbaru (2026-10-28):
  `https://script.google.com/macros/s/AKfycbyrUXAu0hU99hBWzooq8MdeUv22mbrhlGeUqlxAWuryDYjvblxDIFUMKY02W1uaAe0Vsw/exec`;
  health `ok:true`, `backendConfigured:true`, `officeLocationConfigured:true`.
  Disetel di `assets/js/config.js`; frontend/cache `0.10.5`.
- Perbaikan status 2026-10-28: frontend `0.9.7` terbit dari commit `e5a6075`
  (`master`/`main`); Pages build `1321281841` sukses dan aset live memuat
  `0.9.7`. Backend `gas/TimeRule.gs`, `ReportService.gs`, `Repo.gs`,
  `Attendance.gs`, `MyAttendanceService.gs` belum dideploy.
- Perbaikan normalisasi tanggal 2026-10-28: `readObjects_()` mengubah sel
  tanggal bisnis bertipe Date menjadi `YYYY-MM-DD` (zona `Asia/Jakarta`) agar
  filter laporan tidak menghasilkan 0. Frontend `0.9.8` terbit dari commit
  `1118341` (`master`/`main`); Pages build `1321313591` sukses dan aset live
  memuat `0.9.8` + API baru. Backend belum dideploy.
- Pilihan jumlah baris laporan 10/20/30/50 ditambahkan; frontend `0.9.9`
  terbit dari commit `03d60e5` (`master`/`main`), Pages build `1321339598`
  sukses, dan aset live memuat `0.9.9`.
- Data table laporan (cari, urut kolom, 10/20/30/50, navigasi) terbit di
  frontend `0.10.0` (commit `b474ea8`, `master`/`main`); Pages run `40680476712`
  sukses dan aset live memuat `0.10.0` + header sortable. `report.absensi.list`
  menerima `q`/`sort`/`order`. Backend **belum dideploy** sehingga pencarian/urut
  server belum aktif di live.
- Tombol gulir kiri/kanan tabel dan ekspor Excel `.xlsx` terbit di frontend
  `0.10.5` (commit `11711e2`); Pages run `40686168966` sukses dan aset live
  memuat `0.10.5`. Uji browser nyata belum dijalankan.
- Scrollbar vertikal sisi kanan dan header sticky tabel laporan ada lokal di
  frontend/cache `0.10.6`; belum diuji browser atau diterbitkan.
- Jalankan lokal: `py -m http.server 8765` lalu buka `http://127.0.0.1:8765/`.

## Blocker Aktif (jangan diimplementasikan sebelum dijawab)
- **Benchmark iterasi PBKDF2 di runtime Apps Script nyata** (D2) — nilai 10000
  masih sementara.
- Integrasi runtime/browser dengan akun nyata (login/absensi/laporan, GPS WFO,
  PWA/SW) **belum dijalankan** meski `backendConfigured` & `officeLocationConfigured`
  sudah `true`.
- Koordinat kantor (AMB-07/DEC-P20): **sudah tersimpan di Script Properties**
  (titik & radius 50 m) — health 2026-10-19 `officeLocationConfigured:true`.
  Nilai hanya di Script Properties (tidak di repo); jangan ubah tanpa instruksi.
- Penerbitan/reset PIN (AMB-01/02) → **SUDAH DIJAWAB** DEC-P22: PIN 6 digit
  diketik admin pada `admin.account.create` & `admin.account.resetPin` (aktif).
- Aturan susulan (AMB-11/12) → **SUDAH DIJAWAB** DEC-P23/P24: maksimal 3 hari
  lampau, bukti alasan + foto JPEG, keputusan admin tidak menulis baris Absensi.
  Endpoint `susulan.submit` sudah diimplementasikan.
- Akses foto admin (AMB-20) → **SUDAH DIJAWAB** DEC-P25: endpoint blob ber-token.
- Retensi (AMB-18) → **SUDAH DIJAWAB** DEC-P26: simpan permanen.
- Impor CSV (AMB-14) & notifikasi (AMB-25) → dikesampingkan (DEC-P27).
- Konversi persetujuan susulan menjadi baris absensi → masih butuh keputusan
  aturan; jangan diimplementasikan sendiri.
- Indikator kebijakan laporan (terlambat, tidak hadir, persentase kehadiran,
  hari kerja efektif) → **BELUM DITETAPKAN** (DEC-P28); jangan ditambahkan sendiri.
- Jangan mulai PHASE 7 (atau fitur baru) tanpa instruksi.

## Catatan Runtime (2026-10-19)
- `API_BASE_URL` diperbarui ke URL Web App terbaru pengguna (DEC-P21); versi aset
  kini `0.6.3` (Pasca-PHASE 6: PIN admin, foto admin, form susulan).
- **UI 0.6.0**: app shell mobile (app bar + bilah navigasi bawah
  Beranda/Absensi/Admin/Profil) via `assets/js/nav.js`; `index.html`,
  `assets/css/styles.css` dirombak. Hook JS (ID/kelas `att-*`, `admin-*`,
  `report-*`, `dot*`, `form-message*`, `session-info*`, `admin-tab--active`)
  dipertahankan; logika bisnis tidak diubah. `[hidden]{display:none!important}`
  ditambahkan (memperbaiki langkah absensi yang sebelumnya bisa saling tampil).
- **Palet UI 0.6.2 (warna ciri khas KPU):** merah `#D82731`, marun `#771414`,
  emas `#F8A73E` (sumber: `www.kpu.go.id`) + netral lembut; latar gradien radial
  + kisi halus (tanpa aset gambar); `theme-color` kini `#771414`. Warnai kembali
  **hanya** bila pengguna meminta; jangan ubah aturan aksesibilitas/kontras.
- Health live URL terbaru: `backendConfigured:true` (`SPREADSHEET_ID`/`DRIVE_FOLDER_ID`
  sudah diisi di Script Properties — DEC-P20, nilai tidak di repo),
  `officeLocationConfigured:true` (koordinat AMB-07 sudah tersimpan, 2026-10-19).
- Probe `POST action=login` (NIP sintetis) → `AUTH_FAILED` → sheet `Akun` sudah ada.
- Frontend live: `https://kipasel.github.io/Absensi/` (HTTP 200, versi 0.6.2);
  uji browser nyata belum dijalankan.

## Catatan Runtime Terbaru (2026-10-24)
- PHASE 7 dimulai atas instruksi pengguna: penyegaran visual dashboard dan
  komponen agar lebih korporat, tanpa mengubah aturan bisnis.
- Iterasi referensi pengguna menambahkan kartu aksi Masuk/Pulang dan memilih
  jenis pada alur absensi yang sudah ada; versi `0.8.0` biru-putih diterbitkan.
- Tidak ada riwayat pegawai mandiri di backend; jangan isi kartu riwayat dengan
  data contoh.
- Form login memiliki ornamen motion CSS yang halus; aturan
  `prefers-reduced-motion` tetap berlaku.
- Commit `69f63df` terbit di `master`/`main`; Pages run `40097305219` sukses,
  dan aset live memuat versi `0.8.0` serta motion login.
- Menjaga hook/ID HTML untuk alur JS; catatan dan validasi desain di
  `docs/PROGRESS.md`.
- URL Web App terbaru dari pengguna:
  `https://script.google.com/macros/s/AKfycbykCQVMRUNLR8SQAdHDX-J0HCPyKeb-WOkZa9fiLWDoxMtKh7szvQRb8o-dEwFHF4ez/exec`.
- Disetel di `assets/js/config.js`; versi frontend/cache lokal menjadi `0.6.9`.
- Probe health: `ok:true`, `backendConfigured:true`, `officeLocationConfigured:true`.
- Probe login kosong: `UNKNOWN_ACTION`; deployment baru tampaknya belum
  menyediakan aksi frontend ini atau kontraknya berbeda.
- Suite Node pada tree gabungan lulus: foundation 74, auth 57, attendance 200,
  admin 168, report 178, susulan 67 (semua 0 gagal).
- Commit `82dd095` masuk GitHub; merge `9f47efc` diterbitkan dari `master`.
  Pages run `40096085564` berhasil; URL live memuat versi `0.6.9` dan API baru.
- Pengguna memberi URL Web App baru (DEC-P21 diperbarui):
  `https://script.google.com/macros/s/AKfycbwSt9-bh1pwbVK7lOupLWfQi4Np3RQT0LqRLUPvXN7icLuN27PbnKH21A2LCSt3Lj9M/exec`.
- URL disetel di `assets/js/config.js`; versi frontend/cache lokal menjadi `0.6.8`.
- Health API merespons `ok:true`; probe POST login kosong menghasilkan `INTERNAL_ERROR`.
- Eksekusi `seedAdmin` gagal karena admin aktif sudah ada (duplikasi dicegah), bukan karena belum ada akun admin.
- Tangkapan layar pengguna memperlihatkan frontend live `0.6.8`; backend login masih belum terverifikasi beres.
- Jangan menyatakan backend login berfungsi sebelum uji login nyata berhasil.

## Format Laporan Phase
Lihat bagian 14 master prompt: PHASE, STATUS, PERUBAHAN, VALIDASI, KEAMANAN,
KEPUTUSAN YANG DIBUTUHKAN, LANGKAH BERIKUTNYA.

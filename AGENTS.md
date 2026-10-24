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
- Perubahan DEC-P31 (2026-10-24) mengizinkan absen pulang tanpa catatan masuk,
  menambahkan status `TANPA_ABSEN_MASUK`, dan memisahkan status terlambat masuk.
  Perubahan lokal versi aset `0.6.8` belum dideploy.
- PHASE 0–6 dikerjakan. PHASE 3 (mesin absensi), PHASE 4 (panel admin),
  PHASE 5 (laporan & ekspor) **selesai (lokal)**. PHASE 6 (QA rilis) **selesai
  (lokal)**: audit kode & keamanan, 3 perbaikan frontend, verifikasi runtime.
  Keputusan rilis: **BELUM SIAP RILIS** (lihat `docs/PROGRESS.md` PHASE 6).
- Pasca-PHASE 6 (2026-10-21): PIN admin 6 digit (buat/reset), endpoint foto admin
  ber-token, handler susulan, retensi permanen; keputusan DEC-P22..P28; suite uji
  jadi 6 berkas. Per 2026-10-24 route/UI pengajuan susulan nonaktif (DEC-P31).
- Keputusan D0–D8 sudah dijawab pengguna (lihat `docs/DECISIONS.md` DEC-P09..P16);
  aturan waktu & foto: DEC-P17/P18; ekspor **CSV saja** + laporan = admin:
  DEC-P07 (AMB-19 ANSWERED).
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
  `node tests/report.test.mjs`, `node tests/susulan.test.mjs`.
  Hasil terakhir (2026-10-24): 74 / 56 / 200 / 166 / 178 / 67 — semua **0 gagal**.
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
- Pengguna memberi URL Web App baru (DEC-P21 diperbarui):
  `https://script.google.com/macros/s/AKfycbwSt9-bh1pwbVK7lOupLWfQi4Np3RQT0LqRLUPvXN7icLuN27PbnKH21A2LCSt3Lj9M/exec`.
- URL disetel di `assets/js/config.js`; versi frontend/cache lokal menjadi `0.6.8`.
- Jangan menyatakan endpoint sudah berfungsi atau frontend telah terbit sebelum verifikasi nyata.

## Format Laporan Phase
Lihat bagian 14 master prompt: PHASE, STATUS, PERUBAHAN, VALIDASI, KEAMANAN,
KEPUTUSAN YANG DIBUTUHKAN, LANGKAH BERIKUTNYA.

# AMBIGUITIES — Daftar Ketidakpastian & Keputusan yang Belum Ditetapkan

> Status: **PHASE 0 — Audit.** Semua item di bawah **BELUM DITETAPKAN** kecuali
> ditandai lain. Jangan mengarang jawaban. Setiap item harus dijawab pengguna
> sebelum bagian terkait diimplementasikan.

Legenda status: `OPEN` (belum dijawab) · `ANSWERED` (dijawab) · `DEFERRED` (sengaja ditunda).

| ID | Topik | Pertanyaan / Ketidakpastian | Phase terdampak | Status |
|----|-------|-----------------------------|-----------------|--------|
| AMB-01 | Penerbitan PIN awal | Bagaimana PIN awal dibuat & didistribusikan ke pegawai? | 2 | ANSWERED 2026-10-21 (DEC-P22: admin mengetik PIN saat buat/reset, disampaikan langsung) |
| AMB-02 | Aktivasi & pemulihan akun | Proses aktivasi akun baru & pemulihan bila PIN hilang/lupa? | 2 | ANSWERED 2026-10-21 (DEC-P22: reset PIN oleh admin) |
| AMB-03 | Format & hash PIN | Panjang/format PIN (angka? 6 digit?) dan algoritma hash yang dipakai di Apps Script? | 2 | ANSWERED (DEC-P10 hash PBKDF2; DEC-P22 format 6 digit angka) |
| AMB-04 | Anti brute-force | Jumlah percobaan gagal yang diizinkan, durasi lockout, cakupan (per akun/per IP)? | 2 | ANSWERED (DEC-P11: 5x gagal, 15 menit, per-akun) |
| AMB-05 | Sesi & token | Mekanisme sesi antar-request (Apps Script tanpa sesi bawaan), tempat penyimpanan token di klien, masa berlaku, cara logout? | 2 | ANSWERED (DEC-P09: token hanya di memori JS; TTL sesi di Config) |
| AMB-06 | Bootstrap admin | Siapa admin pertama dan bagaimana peran admin ditetapkan/diubah dengan aman? | 2 | ANSWERED (DEC-P12: seedAdmin via Script Properties) |
| AMB-07 | Koordinat kantor | Nilai latitude/longitude titik kantor (dinyatakan belum ditetapkan). Fitur validasi lokasi diblokir sampai ini diisi. | 3 | ANSWERED 2026-10-19 (DEC-P20: titik & radius 50 m ditetapkan; nilai di Script Properties, tidak di repo) |
| AMB-08 | Akurasi GPS | Toleransi `accuracy` GPS; perilaku bila akurasi rendah/tidak pasti; apakah butuh banyak sampel? | 3 | OPEN |
| AMB-09 | Multi-lokasi | Apakah hanya satu titik kantor, atau boleh banyak titik/lokasi? | 3 | OPEN |
| AMB-10 | Hari libur & akhir pekan | Apakah absensi pada hari libur/Sabtu-Minggu diizinkan? Sumber daftar libur (`HariLibur`) & aturannya? | 3 | ANSWERED 2026-10-19 (DEC-P18: jendela berlaku setiap hari, tanpa filter hari) |
| AMB-11 | Batas susulan | Batas maksimal tanggal pengajuan susulan (dinyatakan belum ditetapkan). | 4 | ANSWERED 2026-10-21 (DEC-P23: maksimum 3 hari, tanpa tanggal mendatang) |
| AMB-12 | Bukti susulan | Bukti wajib untuk pengajuan susulan (foto? dokumen? keterangan atasan?) & formatnya? | 4 | ANSWERED 2026-10-21 (DEC-P24: alasan teks + foto JPEG) |
| AMB-13 | Field pegawai | Konfirmasi field final `Pegawai` & `Akun` (ID internal, NIP/NIPPPK, jabatan, unit kerja, dll.). | 2 | OPEN |
| AMB-14 | Impor data | Apakah impor CSV/Excel wajib? Format & validasi kolomnya? | 2 | ANSWERED 2026-10-21 (DEC-P27: perlu, rilis lanjut — tidak dikerjakan sekarang) |
| AMB-15 | Kolom sheet | Kolom final tiap sheet di `DATA_DICTIONARY.md`. | 1 | ANSWERED (DEC-P15: draf DATA_DICTIONARY disetujui) |
| AMB-16 | Skema ID | Format ID internal stabil (Pegawai, Absensi, Bukti, Pengajuan). | 1 | ANSWERED (DEC-P15: ID berupa string) |
| AMB-17 | Format waktu & tanggal | Simpan UTC ISO-8601 atau waktu lokal `Asia/Jakarta`? Batas "tanggal" untuk aturan masuk/pulang. | 1,3 | ANSWERED (DEC-P15: ISO-8601 UTC + kolom tanggal lokal; DEC-002 zona waktu) |
| AMB-18 | Retensi data | Kebijakan retensi & penghapusan foto/metadata (dinyatakan belum ditetapkan). | 4 | ANSWERED 2026-10-21 (DEC-P26: simpan permanen, tanpa hapus otomatis) |
| AMB-19 | Laporan & ekspor | Isi rekap, format ekspor (CSV/PDF), siapa yang boleh mengekspor? | 5 | ANSWERED (DEC-P07: admin; DEC-P28: indikator kebijakan; DEC-P34: CSV/XLSX; DEC-P35/P36: rekap bulanan) |
| AMB-20 | Akses foto admin | Bagaimana admin melihat foto privat secara aman (tanpa tautan publik)? Ditampilkan inline, unduhan terproteksi? | 4 | ANSWERED 2026-10-21 (DEC-P25: endpoint blob ber-token, inline) |
| AMB-21 | Visibilitas Web App | Deploy Apps Script sebagai "Execute as: Me" + "Who has access: Anyone" (perlu untuk PWA lintas-origin) atau "Anyone with Google account"? Implikasi CORS & keamanan. | 1 | ANSWERED (DEC-P16: USER_DEPLOYING + ANYONE_ANONYMOUS) |
| AMB-22 | Ukuran & kompresi foto | Batas ukuran/kompresi foto; resolusi; batas payload base64 ke Apps Script; penanganan kegagalan unggah besar. | 3 | ANSWERED (DEC-P17: JPEG q0.85, sisi terpanjang 1280 px, maks 1.000.000 byte) |
| AMB-23 | Konfigurasi resource | Nilai `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, nama/URL repo GitHub, URL deployment Apps Script. | 1 | ANSWERED 2026-10-19 (DEC-P19 URL; DEC-P20 `SPREADSHEET_ID`/`DRIVE_FOLDER_ID` diisi di Script Properties, `backendConfigured:true`) |
| AMB-24 | Kuota & beban | Strategi menghadapi kuota Apps Script (waktu eksekusi 6 menit, trigger, limit harian) saat ramai. | 6 | OPEN |
| AMB-25 | Notifikasi | Apakah diperlukan notifikasi (mis. ke admin saat ada pengajuan susulan)? (belum disebut sebagai kebutuhan). | 4 | ANSWERED 2026-10-21 (DEC-P27: perlu, rilis lanjut — tidak dikerjakan sekarang) |
| AMB-26 | Akun nonaktif | Perilaku saat pegawai nonaktif mencoba login (pesan, penanganan riwayat). | 2 | OPEN |
| AMB-27 | Mode kerja harian | Apakah ada validasi bahwa mode WFH/WFA sesuai kebijakan kantor, atau sepenuhnya mandiri tanpa validasi? | 3 | OPEN |
| AMB-28 | Jam khusus | Apakah ada jam masuk/pulang berbeda untuk hari tertentu (mis. Jumat) atau untuk admin? | 3 | OPEN |
| AMB-29 | Data uji | Di mana & bagaimana data sintetis `TEST` disimpan agar terpisah dari produksi (spreadsheet terpisah? flag?) | 1,6 | OPEN |
| AMB-30 | Pemulihan bencana | Prosedur backup/restore Sheets & Drive; RPO/RTO; kepemilikan akun Google. | 6 | OPEN |

## Ringkasan Blocker Kritis (semua sudah dijawab)
1. ~~**AMB-07 (koordinat kantor)**~~ — ANSWERED 2026-10-19 (DEC-P20).
2. ~~**AMB-21 (visibilitas Web App + CORS)**~~ — ANSWERED (DEC-P16).
3. ~~**AMB-03/AMB-04/AMB-05 (PIN, lockout, sesi)**~~ — ANSWERED (DEC-P09..P13,
   DEC-P22 untuk format PIN 6 digit & penerbitan/reset).
4. ~~**AMB-15/AMB-16/AMB-17 (skema data & format waktu)**~~ — ANSWERED (DEC-P15).
5. ~~**AMB-11/AMB-12 (aturan susulan)**~~ — ANSWERED 2026-10-21 (DEC-P23/P24).
6. ~~**AMB-20 (akses foto admin)**~~ — ANSWERED 2026-10-21 (DEC-P25).

Masih OPEN (belum memblokir rilis; sebagian kebutuhan rilis lanjut):
AMB-08 (akurasi GPS — perilaku sementara: akurasi hanya dicatat), AMB-09,
AMB-24, AMB-26..AMB-30.

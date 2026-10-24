# DATA DICTIONARY — Kamus Data

> Status: **DRAFT PHASE 2 — belum final.** Kolom berikut adalah **usulan** berdasarkan
> spesifikasi. Tidak ada kolom yang boleh dianggap final sampai disetujui.
> Semua nama teknis (ID, format) ditandai BELUM DITETAPKAN (AMB-15/16/17).
> Rincian keputusan PHASE 2: `docs/PHASE2_AUDIT.md`.

Legenda: `PK` kunci utama internal · `FK` referensi · `?` belum tersedia/opsional.

## 1. `Pegawai`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_pegawai` (PK) | String | ID internal stabil (format: AMB-16) |
| `nama` | String | Nama pegawai |
| `nip_nipk` | String | NIP/NIPPPK/identitas resmi (AMB-13) |
| `jabatan` | String | Jabatan |
| `unit_kerja` | String | Unit kerja |
| `status_aktif` | Boolean | Aktif/nonaktif |
| `dibuat_pada` | DateTime | Metadata (AMB-17) |
| `dibuat_oleh` | String | Aktor |
| `diubah_pada` | DateTime | Metadata |
| `diubah_oleh` | String | Aktor |

## 2. `Akun`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_akun` (PK) | String | ID akun (format: AMB-16) |
| `id_pegawai` (FK) | String | → Pegawai |
| `pin_hash` | String | Hash PIN (bukan teks biasa; algoritma: AMB-03) |
| `pin_salt` | String | Salt unik per akun |
| `pin_algo` | String | Nama algoritma/versi (mis. `pbkdf2-sha256`) — usulan |
| `pin_iterasi` | Number | Jumlah iterasi KDF (usulan parameter, AMB-03) |
| `peran` | Enum | `pegawai` \| `admin` |
| `status_aktif` | Boolean | Status akun |
| `gagal_login` | Number | Penghitung percobaan (AMB-04) |
| `terkunci_sampai` | DateTime | Lockout (AMB-04) |
| `diubah_pada` | DateTime | Metadata (AMB-17) |
| `diubah_oleh` | String | Aktor |

## 3. `Absensi`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_absensi` (PK) | String | ID unik |
| `id_pegawai` (FK) | String | → Pegawai |
| `tanggal` | Date | Tanggal absensi (Asia/Jakarta) |
| `jenis` | Enum | `masuk` \| `pulang` |
| `mode_kerja` | Enum | `WFO` \| `WFH` |
| `waktu_server` | DateTime | Waktu keputusan server (AMB-17) |
| `lintang` | Number? | Latitude (jika ada) |
| `bujur` | Number? | Longitude (jika ada) |
| `akurasi` | Number? | Akurasi GPS |
| `jarak_meter` | Number? | Jarak ke kantor (WFO masuk) |
| `sumber` | Enum | `reguler` \| `susulan_disetujui` |
| `id_bukti` (FK)? | String | → BuktiAbsensi |
| `status` | String | `masuk`: `TEPAT_WAKTU`/`TERLAMBAT`; `pulang`: `TANPA_ABSEN_MASUK` bila tidak ada catatan masuk, selain itu kosong. Bukan indikator ketidakhadiran. |
| `uraian_pekerjaan` | String | Wajib pada catatan pulang; kosong pada catatan masuk |
| `output_pekerjaan` | String | Wajib pada catatan pulang; kosong pada catatan masuk |
| `dibuat_pada` | DateTime | Metadata |
| `diubah_pada` | DateTime | Metadata |
| `diubah_oleh` | String | Aktor |

## 4. `BuktiAbsensi`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_bukti` (PK) | String | ID bukti |
| `id_absensi` (FK) | String | → Absensi |
| `drive_file_id` | String | ID file Drive (privat) — referensi utama foto |
| `path` | String | Path/struktur folder (DEC-P29): `ABSENSI_KPU/YYYY/MM_NamaBulan/DD/NamaPegawai_IDPegawai/Absen_Masuk|Absen_Pulang.jpg` |
| `mime` | String | Tipe file (`image/jpeg`) |
| `ukuran` | Number | Ukuran (byte) |
| `dibuat_pada` | DateTime | Metadata |

> Catatan DEC-P29: struktur folder di atas menggantikan usulan lama
> `YYYY/MM/Foto_Masuk|Foto_Pulang/`. Nama file tetap per jenis; duplikat
> dicegah oleh batas unik satu catatan untuk setiap jenis per pegawai/tanggal,
> idempotensi `id_absensi`, dan `LockService`. Catatan pulang boleh berdiri
> sendiri; status `TANPA_ABSEN_MASUK` menandai data masuk yang tidak tersedia.
> Foto diamankan via
> `drive_file_id` (bukan nama file).

## 5. `Pengaturan`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `kunci` (PK) | String | Nama pengaturan |
| `nilai` | String | Nilai |
| `diubah_pada` | DateTime | Metadata |
| `diubah_oleh` | String | Aktor |
> Catatan: koordinat kantor & parameter operasional dapat di sini (AMB-07).

## 6. `HariLibur`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `tanggal` (PK) | Date | Tanggal libur |
| `keterangan` | String | Nama libur |
> Aturan pemakaian: BELUM DITETAPKAN (AMB-10).

## 7. `LogAktivitas`
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_log` (PK) | String | ID log |
| `waktu` | DateTime | Waktu server |
| `id_aktor` | String | Pelaku |
| `peran_aktor` | String | Peran saat aksi |
| `aksi` | String | Jenis aksi |
| `target` | String | Objek terkait |
| `detail` | String | Ringkasan (tanpa data pribadi berlebihan) |
> Append-only; tidak diubah/dihapus.

## 8. `PengajuanSusulan`
> **Digunakan sejak PHASE 4** (daftar/detail/keputusan admin — `AdminService.gs`);
> dibuat oleh `initializeSheets()`. Pengajuan oleh pegawai & aturan susulan
> (AMB-11/12) belum ada — kolom di bawah tetap mengikuti draf yang disetujui (DEC-P15).
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_pengajuan` (PK) | String | ID pengajuan |
| `id_pegawai` (FK) | String | → Pegawai |
| `tanggal_absensi` | Date | Tanggal yang diajukan |
| `jenis` | Enum | `masuk` \| `pulang` |
| `mode_kerja` | Enum | `WFO` \| `WFH` |
| `waktu_diklaim` | DateTime | Waktu aktual yang diklaim pegawai |
| `waktu_pengajuan_server` | DateTime | Waktu server saat pengajuan diterima |
| `alasan` | String | Alasan |
| `bukti_file_id`? | String | Bukti (AMB-12) |
| `status` | Enum | `menunggu` \| `diterima` \| `ditolak` |
| `id_admin`? | String | Admin pemutus |
| `waktu_keputusan`? | DateTime | Waktu keputusan |
| `catatan_keputusan`? | String | Alasan keputusan |
| `diubah_pada`? | DateTime | Metadata |

## 9. `Sesi` (usulan baru — PHASE 2, menunggu AMB-05)
> Diperlukan karena cookie tidak tersedia (lihat `docs/PHASE2_AUDIT.md` TC-02/03).
| Kolom (usulan) | Tipe | Keterangan |
|----------------|------|------------|
| `id_sesi` (PK) | String | ID sesi (format: AMB-16) |
| `id_akun` (FK) | String | → Akun |
| `token_hash` | String | Hash token sesi (token mentah TIDAK disimpan) |
| `dibuat_pada` | DateTime | Waktu server (AMB-17) |
| `kedaluwarsa_pada` | DateTime | Masa berlaku (AMB-05) |
| `dicabut_pada` | DateTime? | Waktu logout/revoke |
| `agen` | String | Ringkasan user-agent (tanpa data sensitif) |

## 10. Ekspor CSV laporan (PHASE 5 — berkas keluaran, bukan sheet)
Dibuat `report.absensi.exportCsv` sesuai DEC-P07 (CSV saja). Urutan kolom tetap:

| Kolom | Sumber | Keterangan |
|-------|--------|------------|
| `id_absensi` | Absensi | ID baris |
| `tanggal` | Absensi | Tanggal absensi (`YYYY-MM-DD`, Asia/Jakarta) |
| `id_pegawai` | Absensi | ID internal pegawai |
| `nama` | Pegawai (join) | Nama pegawai |
| `nip_nipk` | Pegawai (join) | NIP/NIPK |
| `jenis` | Absensi | `masuk` / `pulang` |
| `mode_kerja` | Absensi | `WFO` / `WFH_WFA` |
| `waktu_server` | Absensi | Waktu server (ISO-8601) |
| `sumber` | Absensi | `reguler` / `susulan_disetujui` |
| `jarak_meter` | Absensi | Jarak ke kantor (WFO); kosong bila tidak berlaku |
| `ada_bukti` | Absensi | `ada` / `tidak ada` (hanya metadata; tanpa referensi foto) |
| `status` | Absensi | Status baris masuk atau marker `TANPA_ABSEN_MASUK` pada pulang |
| `kondisi_harian` | Absensi (turunan) | `ADA_MASUK_DAN_PULANG`, `ADA_MASUK_TANPA_PULANG`, atau `TANPA_MASUK_DENGAN_PULANG` |
| `waktu_masuk` | Absensi (turunan) | Waktu server masuk yang ada; kosong jika tidak ada catatan masuk |
| `waktu_pulang` | Absensi (turunan) | Waktu server pulang yang ada; kosong jika tidak ada catatan pulang |
| `uraian_pekerjaan` | Absensi | Uraian dari baris pulang; kosong bila tidak ada |
| `output_pekerjaan` | Absensi | Output dari baris pulang; kosong bila tidak ada |

Catatan:
- TIDAK ada `drive_file_id`, URL foto, `pin_hash`, `pin_salt`, atau token.
- Nilai yang diawali `=` `+` `-` `@` diapostrofi pada berkas ekspor
  (guard formula-injection); data sumber tidak diubah.
- Berkas diawali BOM UTF-8; pemisah `,`; quoting RFC 4180; baris `\r\n`.
- Nama berkas: `laporan-absensi_YYYY-MM-DD_YYYY-MM-DD.csv`.

## Belum Ditetapkan
- Format ID (AMB-16), format waktu (AMB-17), field akhir (AMB-13/15).
- Retensi & penghapusan (AMB-18).
- Parameter KDF PIN & kebijakan lockout (AMB-03/04) → `docs/PHASE2_AUDIT.md`.
- Skema `Sesi` final (AMB-05).

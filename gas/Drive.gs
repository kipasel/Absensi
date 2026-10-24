/**
 * Drive.gs — penyimpanan foto absensi di Google Drive privat (PHASE 3).
 *
 * Keputusan:
 * - DEC-007 (privasi) & DEC-P29 (struktur hierarkis): struktur privat
 *   <root>/ABSENSI_KPU/YYYY/MM_NamaBulan/DD/NamaPegawai_IDPegawai/ dengan
 *   nama file tetap Absen_Masuk.jpg / Absen_Pulang.jpg.
 * - DRIVE_FOLDER_ID adalah folder ROOT wadah (dibuat operator); sub-folder
 *   ABSENSI_KPU dibuat otomatis oleh backend.
 * - File tidak mengubah ACL saat dibuat; folder induk wajib privat dan akses
 *   foto pegawai hanya melalui endpoint admin ber-token.
 * - Foto susulan TIDAK memakai struktur ini (bukan catatan absensi reguler,
 *   DEC-P24) — lihat saveSusulanPhoto_.
 *
 * Validasi berkas (DEC-P17):
 * - Format yang diterima: JPEG (magic bytes FF D8 FF). Klien selalu mengirim
 *   hasil konversi canvas → JPEG; MIME kiriman klien BUKAN satu-satunya
 *   pemeriksaan — byte aktual diperiksa di sini.
 * - Ukuran maksimum: PHASE3_PHOTO_MAX_BYTES (default 1.000.000 byte).
 *
 * Keterbatasan yang diakui: konversi canvas ke JPEG membuat berkas TIDAK
 * identik byte-per-byte dengan buffer sensor kamera. Tidak ada watermark/
 * teks yang ditambahkan pada piksel.
 */

var DRIVE_ROOT_FOLDER_NAME = 'ABSENSI_KPU';
var PHOTO_MAGIC_JPEG = [0xff, 0xd8, 0xff];
var PHOTO_MIME_ALLOWED = 'image/jpeg';
var PHOTO_EXT = '.jpg';

/** Nama file tetap per jenis (DEC-P29) — menimpa dicegah lewat prasyarat. */
var ATTENDANCE_FILE_NAMES = Object.freeze({
  masuk: 'Absen_Masuk' + PHOTO_EXT,
  pulang: 'Absen_Pulang' + PHOTO_EXT
});

/** Nama bulan bahasa Indonesia (indeks 1..12). */
var MONTH_NAMES_ID = Object.freeze(['', 'Januari', 'Februari', 'Maret', 'April',
  'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']);

/**
 * Membersihkan komponen nama folder/berkas agar aman di Drive.
 * Mengganti karakter pemisah path & kontrol dengan '_'. Fungsi murni.
 * @param {*} raw
 * @return {string}
 */
function sanitizePathSegment_(raw) {
  var s = raw === null || raw === undefined ? '' : String(raw);
  s = s.replace(/[\\/:*?"<>|]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '_');
  s = s.replace(/^\.+/, '_').trim();
  s = s.replace(/\s+/g, '_');
  if (!s) s = 'TANPA_NAMA';
  if (s.length > 120) s = s.substring(0, 120);
  return s;
}

/**
 * Membentuk nama folder bulan 'MM_NamaBulan' (DEC-P29). Fungsi murni.
 * @param {number|string} mm bulan 1..12
 * @return {string}
 */
function monthFolderName_(mm) {
  var n = parseInt(mm, 10);
  if (!isFinite(n) || n < 1 || n > 12) {
    return 'BELUM_DITETAPKAN';
  }
  return ('0' + n).slice(-2) + '_' + MONTH_NAMES_ID[n];
}

/**
 * Membentuk nama folder pegawai 'NamaPegawai_IDPegawai' (DEC-P29). Fungsi
 * murni. ID pegawai dipertahankan sebagai kunci identitas agar nama sama tidak
 * tertukar.
 * @param {*} nama
 * @param {*} idPegawai
 * @return {string}
 */
function pegawaiFolderName_(nama, idPegawai) {
  return sanitizePathSegment_(nama) + '_' + sanitizePathSegment_(idPegawai);
}


/**
 * @param {string} base64 teks base64 murni atau data-URL.
 * @return {number[]} byte hasil decode (kosong bila gagal).
 */
function decodePhotoBase64_(base64) {
  var s = String(base64 || '');
  var comma = s.indexOf(',');
  if (s.substring(0, 5) === 'data:' && comma !== -1) {
    s = s.substring(comma + 1);
  }
  s = s.replace(/\s/g, '');
  if (!s) return [];
  try {
    return toUint8_(Utilities.base64Decode(s));
  } catch (err) {
    return [];
  }
}

/**
 * Memeriksa apakah byte adalah JPEG (magic FF D8 FF). Fungsi murni.
 * @param {number[]} bytes
 * @return {boolean}
 */
function hasJpegMagic_(bytes) {
  if (!bytes || bytes.length < 3) return false;
  return (bytes[0] & 0xff) === 0xff &&
    (bytes[1] & 0xff) === 0xd8 &&
    (bytes[2] & 0xff) === 0xff;
}

/**
 * Memvalidasi foto mentah (decode, magic, ukuran). Fungsi murni kecuali decode.
 * @param {string} base64
 * @param {number} maxBytes
 * @return {{ok:boolean, code:(string|null), message:(string|null), bytes:(number[]|null)}}
 */
function validatePhotoBlob_(base64, maxBytes) {
  if (!base64 || typeof base64 !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', message: 'Foto wajib diisi.', bytes: null };
  }
  var bytes = decodePhotoBase64_(base64);
  if (!bytes.length) {
    return { ok: false, code: 'PHOTO_INVALID', message: 'Foto tidak dapat dibaca (base64 tidak valid).', bytes: null };
  }
  if (!hasJpegMagic_(bytes)) {
    return { ok: false, code: 'PHOTO_INVALID', message: 'Format foto tidak didukung (harus JPEG).', bytes: null };
  }
  if (bytes.length > maxBytes) {
    return {
      ok: false, code: 'PHOTO_TOO_LARGE',
      message: 'Ukuran foto melebihi batas ' + maxBytes + ' byte.',
      bytes: null
    };
  }
  return { ok: true, code: null, message: null, bytes: bytes };
}

function getDriveRootFolder_() {
  var id = getServerConfig_().DRIVE_FOLDER_ID;
  if (!id) {
    throw AppError_('NOT_CONFIGURED', 'Folder Drive belum dikonfigurasi (DRIVE_FOLDER_ID).', true);
  }
  return DriveApp.getFolderById(String(id));
}

/**
 * Mengambil sub-folder; membuatnya bila belum ada.
 * @param {GoogleAppsScript.Drive.Folder} parent
 * @param {string} name
 * @return {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/**
 * Menyimpan foto absensi ke struktur folder hierarkis privat (DEC-P29):
 * ABSENSI_KPU/YYYY/MM_NamaBulan/DD/NamaPegawai_IDPegawai/Absen_Masuk|Absen_Pulang.jpg
 * Folder dibuat otomatis bila belum ada dan dipakai ulang bila sudah ada
 * (getOrCreateSubfolder_ tidak menghapus/membuat ulang folder yang ada).
 *
 * Pencegahan duplikat: prasyarat tanggal/jenis (satu masuk + satu pulang per
 * pegawai per tanggal) + idempotensi `id_absensi` + `withLock_` di
 * Attendance.gs memastikan fungsi ini dipanggil maksimal sekali per
 * (pegawai, tanggal, jenis). Lihat docs/SECURITY.md.
 *
 * @param {{idAbsensi:string, idPegawai:string, idPegawaiNama:string,
 *          tanggal:string, jenis:string, bytes:number[]}} params
 * @return {{driveFileId:string, path:string, mime:string, ukuran:number}}
 */
function saveAttendancePhoto_(params) {
  var yyyy = params.tanggal.substring(0, 4);
  var mm = params.tanggal.substring(5, 7);
  var dd = params.tanggal.substring(8, 10);

  if (!ATTENDANCE_FILE_NAMES[params.jenis]) {
    throw AppError_('INVALID_INPUT', 'Jenis absensi tidak valid untuk penyimpanan foto.', true);
  }
  var fileName = ATTENDANCE_FILE_NAMES[params.jenis];

  var root = getDriveRootFolder_();
  var folder = getOrCreateSubfolder_(root, DRIVE_ROOT_FOLDER_NAME);
  folder = getOrCreateSubfolder_(folder, yyyy);
  folder = getOrCreateSubfolder_(folder, monthFolderName_(mm));
  folder = getOrCreateSubfolder_(folder, dd);
  folder = getOrCreateSubfolder_(folder,
    pegawaiFolderName_(params.idPegawaiNama, params.idPegawai));

  var blob = Utilities.newBlob(params.bytes, PHOTO_MIME_ALLOWED, fileName);
  var file = folder.createFile(blob);

  // Jangan mengubah ACL file. File mewarisi akses dari folder induk yang
  // wajib privat (lihat docs/DEPLOYMENT.md); Permission.NONE bukan permission
  // yang dapat dipakai bersama ANYONE_WITH_LINK pada DriveApp.

  var path = DRIVE_ROOT_FOLDER_NAME + '/' + yyyy + '/' + monthFolderName_(mm) + '/' +
    dd + '/' + pegawaiFolderName_(params.idPegawaiNama, params.idPegawai) + '/' + fileName;
  return {
    driveFileId: file.getId(),
    path: path,
    mime: PHOTO_MIME_ALLOWED,
    ukuran: params.bytes.length
  };
}

/**
 * Menyimpan foto bukti susulan ke Drive (folder Foto_Susulan per bulan,
 * DEC-P24). Struktur sama dengan foto reguler, tetapi jenis digabung dalam
 * satu folder karena susulan adalah dokumen pengajuan, bukan catatan absensi.
 * @param {{idPengajuan:string, idPegawai:string, tanggal:string,
 *          jenis:string, bytes:number[]}} params
 * @return {{driveFileId:string, path:string, mime:string, ukuran:number}}
 */
function saveSusulanPhoto_(params) {
  var yyyy = params.tanggal.substring(0, 4);
  var mm = params.tanggal.substring(5, 7);

  var root = getDriveRootFolder_();
  var folder = getOrCreateSubfolder_(root, DRIVE_ROOT_FOLDER_NAME);
  folder = getOrCreateSubfolder_(folder, yyyy);
  folder = getOrCreateSubfolder_(folder, mm);
  folder = getOrCreateSubfolder_(folder, 'Foto_Susulan');

  var fileName = 'susulan_' + params.idPegawai + '_' + params.tanggal +
    '_' + params.jenis + '_' + params.idPengajuan + PHOTO_EXT;
  var blob = Utilities.newBlob(params.bytes, PHOTO_MIME_ALLOWED, fileName);
  var file = folder.createFile(blob);

  // Jangan mengubah ACL file; folder induk harus privat seperti foto reguler.

  var path = DRIVE_ROOT_FOLDER_NAME + '/' + yyyy + '/' + mm + '/Foto_Susulan/' + fileName;
  return {
    driveFileId: file.getId(),
    path: path,
    mime: PHOTO_MIME_ALLOWED,
    ukuran: params.bytes.length
  };
}

/**
 * Mencoba menghapus file Drive (kompensasi kegagalan parsial). Tidak pernah
 * melempar; hasil dicatat pemanggil.
 * @param {string} fileId
 * @return {boolean} true bila berhasil dihapus
 */
function tryDeleteDriveFile_(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Membaca isi foto privat untuk ditampilkan admin (DEC-P25).
 * File ID tidak pernah dikembalikan ke klien. Tanpa tautan publik.
 * @param {string} fileId
 * @return {{mime:string, ukuran:number, base64:string}}
 */
function readAttendancePhoto_(fileId) {
  if (!fileId) throw AppError_('NOT_FOUND', 'Foto tidak tersedia.', true);
  var file;
  try {
    file = DriveApp.getFileById(String(fileId));
  } catch (err) {
    throw AppError_('NOT_FOUND', 'Foto tidak tersedia.', true);
  }
  var blob = file.getBlob();
  var bytes = toUint8_(blob.getBytes());
  var mime = String(blob.getContentType() || '');
  if (mime.indexOf('image/') !== 0) mime = PHOTO_MIME_ALLOWED;
  return {
    mime: mime,
    ukuran: bytes.length,
    base64: Utilities.base64Encode(bytes)
  };
}

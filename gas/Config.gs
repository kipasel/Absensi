/**
 * Konfigurasi server — Sistem Absensi KPU Kabupaten Aceh Selatan.
 * PHASE 1 (fondasi).
 *
 * Nilai rahasia/operasional TIDAK boleh ada di file ini. Semua nilai disimpan
 * di Script Properties (lihat docs/DEPLOYMENT.md). Fungsi di bawah membaca
 * properti tersebut; nilai yang belum diisi ditandai sebagai BELUM DIKONFIGURASI.
 */

/**
 * Nama kunci Script Properties yang digunakan proyek.
 * Tambahkan kunci baru hanya setelah keputusannya disetujui.
 */
var PROPERTY_KEYS = Object.freeze({
  SPREADSHEET_ID: 'SPREADSHEET_ID',       // AMB-23
  DRIVE_FOLDER_ID: 'DRIVE_FOLDER_ID',     // AMB-23
  OFFICE_LATITUDE: 'OFFICE_LATITUDE',     // AMB-07; nilai operasional hanya di Script Properties
  OFFICE_LONGITUDE: 'OFFICE_LONGITUDE',   // AMB-07; nilai operasional hanya di Script Properties
  OFFICE_RADIUS_METERS: 'OFFICE_RADIUS_METERS', // 50 (DEC-004), dapat dikonfigurasi
  PHASE3_PHOTO_MAX_BYTES: 'PHASE3_PHOTO_MAX_BYTES', // 1000000 (DEC-P17), dapat dikonfigurasi
  PIN_KDF_ITERATIONS: 'PIN_KDF_ITERATIONS', // D2 (opsional; benchmark sebelum produksi)
  SESSION_TTL_MINUTES: 'SESSION_TTL_MINUTES', // D1 (opsional; default 480)
  ADMIN_SETUP_NIP: 'ADMIN_SETUP_NIP',       // D4 (seed admin; rahasia, jangan di frontend)
  ADMIN_SETUP_PIN: 'ADMIN_SETUP_PIN',       // D4 (seed admin; rahasia)
  ADMIN_SETUP_NAMA: 'ADMIN_SETUP_NAMA'      // D4 (opsional; nama admin awal)
});

/**
 * Membaca seluruh konfigurasi server dari Script Properties.
 * Nilai yang belum diisi menjadi null.
 * @return {Object}
 */
function getServerConfig_() {
  var props = PropertiesService.getScriptProperties();
  var out = {};
  Object.keys(PROPERTY_KEYS).forEach(function (name) {
    var value = props.getProperty(PROPERTY_KEYS[name]);
    out[name] = (value === '' || value === undefined) ? null : value;
  });
  return out;
}

/**
 * Menentukan apakah resource backend minimum sudah dikonfigurasi.
 * Hanya ID Spreadsheet & folder Drive yang diperiksa pada phase ini.
 * @return {boolean}
 */
function isBackendConfigured_() {
  var config = getServerConfig_();
  return Boolean(config.SPREADSHEET_ID && config.DRIVE_FOLDER_ID);
}

/**
 * Menentukan apakah koordinat kantor sudah ditetapkan.
 * Fitur validasi GPS (PHASE 3) tidak boleh aktif selama fungsi ini false.
 * @return {boolean}
 */
function isOfficeLocationConfigured_() {
  var config = getServerConfig_();
  return Boolean(config.OFFICE_LATITUDE && config.OFFICE_LONGITUDE);
}

/* ---------------- Kebijakan PHASE 2 ---------------- */

/**
 * Error aplikasi dengan kode stabil untuk dipetakan ke respons JSON.
 * @param {string} code
 * @param {string} message
 * @param {boolean} expose true bila pesan aman ditampilkan ke klien.
 * @constructor
 */
function AppError_(code, message, expose) {
  var err = new Error(message);
  err.name = 'AppError';
  err.code = code;
  err.expose = Boolean(expose);
  return err;
}

/**
 * Jumlah iterasi PBKDF2. Diambil dari Script Properties bila valid.
 * @return {number}
 */
function pinKdfIterations_() {
  var raw = getServerConfig_().PIN_KDF_ITERATIONS;
  var n = parseInt(raw, 10);
  return (isFinite(n) && n > 0) ? n : PIN_KDF_DEFAULT_ITERATIONS;
}

/**
 * Masa berlaku sesi (ms). Default 480 menit (D1); dapat dikonfigurasi.
 * @return {number}
 */
function sessionTtlMs_() {
  var raw = getServerConfig_().SESSION_TTL_MINUTES;
  var n = parseInt(raw, 10);
  var minutes = (isFinite(n) && n > 0) ? n : 480;
  return minutes * 60 * 1000;
}

/**
 * Kebijakan lockout (D3): 5 gagal → 15 menit. Dapat dikonfigurasi.
 * @return {{maxFailures:number, lockMs:number}}
 */
function lockPolicy_() {
  return { maxFailures: LOCK_MAX_FAILURES, lockMs: LOCK_DURATION_MS };
}

/** Batas ukuran foto default (DEC-P17): 1.000.000 byte. */
var PHOTO_MAX_BYTES_DEFAULT = 1000000;

/**
 * Batas ukuran foto (byte) dari Script Properties; default 1.000.000 (DEC-P17).
 * @return {number}
 */
function photoMaxBytes_() {
  var raw = getServerConfig_().PHASE3_PHOTO_MAX_BYTES;
  var n = parseInt(raw, 10);
  return (isFinite(n) && n > 0) ? n : PHOTO_MAX_BYTES_DEFAULT;
}

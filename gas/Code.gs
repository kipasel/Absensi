/**
 * Sistem Absensi KPU Kabupaten Aceh Selatan — titik masuk backend Apps Script.
 * PHASE 2 (autentikasi) + PHASE 3 (mesin absensi).
 *
 * Titik masuk:
 * - doGet(e)  : permintaan baca ringan (health check).
 * - doPost(e) : permintaan tulis/autentikasi/absensi.
 *
 * Catatan keamanan:
 * - Token sesi hanya diterima/dikirim lewat BODY (bukan query string).
 * - Web App: execute as USER_DEPLOYING, access ANYONE_ANONYMOUS (D8) →
 *   TIDAK ada cookie HttpOnly (keterbatasan Apps Script); lihat docs/SECURITY.md.
 * - Detail error internal tidak dibocorkan ke pemanggil.
 * - Identitas pegawai & waktu keputusan selalu dari server (bukan klien).
 */

/**
 * @param {Object} e Event parameter Apps Script.
 * @return {ContentService.TextOutput} Respons JSON.
 */
function doGet(e) {
  return handleRequest_(e, 'GET');
}

/**
 * @param {Object} e Event parameter Apps Script.
 * @return {ContentService.TextOutput} Respons JSON.
 */
function doPost(e) {
  return handleRequest_(e, 'POST');
}

/**
 * Router internal.
 * @param {Object} e Event parameter.
 * @param {string} method 'GET' atau 'POST'.
 * @return {ContentService.TextOutput}
 */
function handleRequest_(e, method) {
  try {
    var params = (e && e.parameter) || {};
    var payload = {};

    if (method === 'POST' && e && e.postData && e.postData.contents) {
      payload = parseJsonSafe_(e.postData.contents);
    }

    var action = payload.action || params.action || '';
    var data = payload.data || {};
    // Token sesi hanya dari body; query string diabaikan untuk mencegah kebocoran via URL.
    if (data && typeof data === 'object' && !data.token && payload.token) {
      data.token = payload.token;
    }

    var result = route_(action, data, method);
    return jsonResponse_(result);
  } catch (err) {
    if (err && err.name === 'AppError' && err.expose) {
      return jsonResponse_({ ok: false, error: err.code, message: err.message });
    }
    if (typeof Logger !== 'undefined') {
      Logger.log('handleRequest_ error: ' + (err && err.stack ? err.stack : err));
    }
    return jsonResponse_({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server.'
    });
  }
}

/**
 * Router aksi. Tambahkan aksi baru hanya setelah keputusannya disetujui.
 * @param {string} action
 * @param {Object} payload
 * @param {string} method
 * @return {Object} Objek respons standar.
 */
function route_(action, payload, method) {
  switch (action) {
    case 'health':
      return handleHealth_();
    case 'login':
      return handleLogin_(payload, method);
    case 'logout':
      return handleLogout_(payload, method);
    case 'session.check':
      return handleSessionCheck_(payload, method);
    case 'admin.account.create':
      return handleAccountCreate_(payload, method);
    case 'admin.account.setActive':
      return handleAccountSetActive_(payload, method);
    case 'admin.account.resetPin':
      return handleResetPin_(payload, method);
    case 'attendance.submit':
      return handleAttendanceSubmit_(payload, method);
    case 'susulan.submit':
      throw AppError_('NOT_AVAILABLE', 'Fitur absensi susulan telah dinonaktifkan.', true);
    case 'admin.pegawai.list':
      return handleAdminPegawaiList_(payload, method);
    case 'admin.pegawai.detail':
      return handleAdminPegawaiDetail_(payload, method);
    case 'admin.pegawai.create':
      return handleAdminPegawaiCreate_(payload, method);
    case 'admin.pegawai.update':
      return handleAdminPegawaiUpdate_(payload, method);
    case 'admin.pegawai.setActive':
      return handleAdminPegawaiSetActive_(payload, method);
    case 'admin.absensi.list':
      return handleAdminAbsensiList_(payload, method);
    case 'admin.absensi.detail':
      return handleAdminAbsensiDetail_(payload, method);
    case 'admin.absensi.photo':
      return handleAdminAbsensiPhoto_(payload, method);
    case 'admin.susulan.list':
      throw AppError_('NOT_AVAILABLE', 'Fitur absensi susulan telah dinonaktifkan.', true);
    case 'admin.susulan.detail':
      throw AppError_('NOT_AVAILABLE', 'Fitur absensi susulan telah dinonaktifkan.', true);
    case 'admin.susulan.photo':
      throw AppError_('NOT_AVAILABLE', 'Fitur absensi susulan telah dinonaktifkan.', true);
    case 'admin.susulan.decide':
      throw AppError_('NOT_AVAILABLE', 'Fitur absensi susulan telah dinonaktifkan.', true);
    case 'admin.log.list':
      return handleAdminLogList_(payload, method);
    case 'report.absensi.list':
      return handleReportAbsensiList_(payload, method);
    case 'report.rekap':
      return handleReportRekap_(payload, method);
    case 'report.absensi.exportCsv':
      return handleReportAbsensiExportCsv_(payload, method);
    default:
      return {
        ok: false,
        error: 'UNKNOWN_ACTION',
        message: 'Aksi tidak dikenali atau belum tersedia pada tahap ini.'
      };
  }
}

/**
 * Health check: tidak mengakses data privat, aman dipanggil tanpa autentikasi.
 * @return {Object}
 */
function handleHealth_() {
  return {
    ok: true,
    service: 'absensi-kpu-aceh-selatan',
    phase: 'report',
    timezone: getAppTimezone_(),
    backendConfigured: isBackendConfigured_(),
    officeLocationConfigured: isOfficeLocationConfigured_(),
    serverTime: new Date().toISOString()
  };
}

/**
 * Membuat respons JSON konsisten.
 * @param {Object} obj
 * @return {ContentService.TextOutput}
 */
function jsonResponse_(obj) {
  var body = Object.assign({ status: obj && obj.ok ? 'ok' : 'error' }, obj || {});
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Parsing JSON yang aman; mengembalikan objek kosong bila gagal.
 * @param {string} text
 * @return {Object}
 */
function parseJsonSafe_(text) {
  try {
    var parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    return {};
  }
}

/**
 * @return {string} Zona waktu proyek Apps Script.
 */
function getAppTimezone_() {
  return Session.getScriptTimeZone();
}

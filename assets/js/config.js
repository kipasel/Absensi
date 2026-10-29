/*
 * Konfigurasi frontend — HANYA BOLEH berisi nilai PUBLIK.
 * Dilarang menaruh PIN, token, kredensial, ID Spreadsheet, atau ID folder Drive
 * di berkas ini. Konfigurasi server berada di Apps Script (Script Properties).
 */
window.APP_CONFIG = Object.freeze({
  APP_NAME: 'Sistem Absensi KPU Kabupaten Aceh Selatan',
  APP_SHORT_NAME: 'Absensi KPU',

  // Sumber tunggal versi aplikasi. Selaraskan dengan CACHE_VERSION di
  // service-worker.js dan catat perubahan di docs/PROGRESS.md.
  VERSION: '0.10.11',

  // URL Web App Apps Script (publik — URL /exec memang dirancang dapat diakses
  // publik; keamanan ada di backend: token sesi + otorisasi). Bukan rahasia.
  // Contoh format: 'https://script.google.com/macros/s/ID/exec'
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbwuie4IDBYdhJRxL2CcKwsUpkxhZvoC4ZTsi_PKDD5zvSbuL5oWaqH7fEo5E10dy6zpEA/exec',

  // Nama aksi health check yang sudah ada di kerangka backend (gas/Code.gs).
  HEALTH_ACTION: 'health'
});

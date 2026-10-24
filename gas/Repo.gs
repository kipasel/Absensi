/**
 * Repo.gs — akses Google Sheets untuk autentikasi & absensi.
 * PHASE 2–3. Skema mengikuti docs/DATA_DICTIONARY.md (disetujui).
 *
 * Catatan: Google Sheets bukan database transaksional penuh. Operasi tulis
 * dibungkus LockService untuk mengurangi race condition. ID internal stabil
 * (bukan nomor baris). Waktu disimpan ISO-8601 UTC; kolom `tanggal` memuat
 * tanggal bisnis lokal Asia/Jakarta (YYYY-MM-DD).
 */

var SHEET_HEADERS = Object.freeze({
  Pegawai: ['id_pegawai', 'nama', 'nip_nipk', 'jabatan', 'unit_kerja',
    'status_aktif', 'dibuat_pada', 'dibuat_oleh', 'diubah_pada', 'diubah_oleh'],
  Akun: ['id_akun', 'id_pegawai', 'pin_hash', 'pin_salt', 'pin_algo', 'pin_iterasi',
    'peran', 'status_aktif', 'gagal_login', 'terkunci_sampai', 'diubah_pada', 'diubah_oleh'],
  Sesi: ['id_sesi', 'id_akun', 'token_hash', 'dibuat_pada', 'kedaluwarsa_pada',
    'dicabut_pada', 'agen'],
  Absensi: ['id_absensi', 'id_pegawai', 'tanggal', 'jenis', 'mode_kerja', 'waktu_server',
    'lintang', 'bujur', 'akurasi', 'jarak_meter', 'sumber', 'id_bukti', 'status',
    'uraian_pekerjaan', 'output_pekerjaan', 'dibuat_pada', 'diubah_pada', 'diubah_oleh'],
  BuktiAbsensi: ['id_bukti', 'id_absensi', 'drive_file_id', 'path', 'mime', 'ukuran',
    'dibuat_pada'],
  PengajuanSusulan: ['id_pengajuan', 'id_pegawai', 'tanggal_absensi', 'jenis', 'mode_kerja',
    'waktu_diklaim', 'waktu_pengajuan_server', 'alasan', 'bukti_file_id', 'status',
    'id_admin', 'waktu_keputusan', 'catatan_keputusan', 'diubah_pada'],
  LogAktivitas: ['id_log', 'waktu', 'id_aktor', 'peran_aktor', 'aksi', 'target', 'detail']
});

/** Semua sheet yang dibuat initializeSheets() (PHASE 2 + PHASE 3). */
var ALL_SHEET_NAMES = Object.freeze(Object.keys(SHEET_HEADERS));

function getSpreadsheet_() {
  var id = getServerConfig_().SPREADSHEET_ID;
  if (!id) {
    throw AppError_('NOT_CONFIGURED', 'Spreadsheet belum dikonfigurasi (SPREADSHEET_ID).', true);
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) {
    throw AppError_('NOT_CONFIGURED', 'Sheet "' + name + '" belum ada. Jalankan initializeSheets().', true);
  }
  return sh;
}

/** Membuat sheet + header bila belum ada. */
function ensureAllSheets_() {
  var ss = getSpreadsheet_();
  ALL_SHEET_NAMES.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(SHEET_HEADERS[name]);
    }
  });
}

/**
 * @param {string} name
 * @return {Array<Object>} objek per baris + properti `__row` (nomor baris sheet).
 */
function readObjects_(name) {
  var sh = getSheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
    }
    obj.__row = r + 1;
    out.push(obj);
  }
  return out;
}

function appendObject_(name, obj) {
  var sh = getSheet_(name);
  var headers = SHEET_HEADERS[name];
  var row = headers.map(function (h) {
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  sh.appendRow(row);
}

function updateObjectRow_(name, rowNumber, obj) {
  var sh = getSheet_(name);
  var headers = SHEET_HEADERS[name];
  var row = headers.map(function (h) {
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

/** Menjalankan fn di bawah script lock (mengurangi race condition). */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- ID & waktu ---------------- */

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function nowMs_() {
  return Date.now();
}

/* ---------------- Pencarian ---------------- */

function findPegawaiByNip_(nip) {
  var rows = readObjects_('Pegawai');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].nip_nipk).trim() === String(nip).trim()) return rows[i];
  }
  return null;
}

function findPegawaiById_(id) {
  var rows = readObjects_('Pegawai');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_pegawai) === String(id)) return rows[i];
  }
  return null;
}

function findAkunByPegawaiId_(idPegawai) {
  var rows = readObjects_('Akun');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_pegawai) === String(idPegawai)) return rows[i];
  }
  return null;
}

function findAkunById_(id) {
  var rows = readObjects_('Akun');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_akun) === String(id)) return rows[i];
  }
  return null;
}

function findSesiByTokenHash_(tokenHash) {
  var rows = readObjects_('Sesi');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].token_hash) === String(tokenHash)) return rows[i];
  }
  return null;
}

function findAbsensiById_(id) {
  var rows = readObjects_('Absensi');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_absensi) === String(id)) return rows[i];
  }
  return null;
}

/** Mencari absensi berdasar (pegawai, tanggal bisnis, jenis) — kunci duplikasi. */
function findAbsensiByUniq_(idPegawai, tanggal, jenis) {
  var rows = readObjects_('Absensi');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_pegawai) === String(idPegawai) &&
        String(rows[i].tanggal) === String(tanggal) &&
        String(rows[i].jenis) === String(jenis)) {
      return rows[i];
    }
  }
  return null;
}

/** Mencari pengajuan susulan berdasar ID. */
function findPengajuanById_(id) {
  var rows = readObjects_('PengajuanSusulan');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_pengajuan) === String(id)) return rows[i];
  }
  return null;
}

/** Mencabut seluruh sesi aktif milik satu akun (mis. saat akun dinonaktifkan). */
function revokeSessionsForAccount_(idAkun, nowMs) {
  var rows = readObjects_('Sesi');
  var stamp = new Date(nowMs).toISOString();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id_akun) === String(idAkun) && !rows[i].dicabut_pada) {
      rows[i].dicabut_pada = stamp;
      updateObjectRow_('Sesi', rows[i].__row, rows[i]);
    }
  }
}

function storeAkun_(akun) {
  updateObjectRow_('Akun', akun.__row, akun);
}

/**
 * Log aktivitas append-only. Detail TIDAK boleh memuat PIN/token.
 */
function logActivity_(aksi, aktorId, peran, target, detail) {
  try {
    appendObject_('LogAktivitas', {
      id_log: newId_('LOG'),
      waktu: nowIso_(),
      id_aktor: aktorId || '',
      peran_aktor: peran || '',
      aksi: aksi,
      target: target || '',
      detail: detail || ''
    });
  } catch (e) {
    // Kegagalan log tidak boleh menggagalkan operasi utama, tetapi tidak disembunyikan.
    if (typeof Logger !== 'undefined') {
      Logger.log('logActivity_ gagal: ' + (e && e.message));
    }
  }
}

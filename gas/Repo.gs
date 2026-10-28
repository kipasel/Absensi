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

/**
 * Menyelaraskan zona waktu spreadsheet dengan zona bisnis aplikasi.
 * Nilai sel tidak diubah; hanya konfigurasi tampilan spreadsheet.
 */
function ensureSpreadsheetTimezone_(ss) {
  try {
    if (typeof BIZ_TIMEZONE === 'undefined') return;
    if (!ss.getSpreadsheetTimeZone || !ss.setSpreadsheetTimeZone) return;
    if (ss.getSpreadsheetTimeZone() !== BIZ_TIMEZONE) {
      ss.setSpreadsheetTimeZone(BIZ_TIMEZONE);
    }
  } catch (e) {
    if (typeof Logger !== 'undefined') {
      Logger.log('ensureSpreadsheetTimezone_ gagal: ' + (e && e.message));
    }
  }
}

/** Membuat sheet + menambahkan kolom baru tanpa mengubah urutan/data lama. */
function ensureAllSheets_() {
  var ss = getSpreadsheet_();
  ensureSpreadsheetTimezone_(ss);
  ALL_SHEET_NAMES.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(SHEET_HEADERS[name]);
    } else {
      ensureSheetHeaders_(name, sh);
    }
    if (name === 'Absensi') ensureLateStatusFormatting_(sh);
  });
}

function ensureSheetHeaders_(name, sh) {
  var data = sh.getDataRange().getValues();
  var firstRow = data.length ? data[0] : [];
  var hasHeader = firstRow.some(function (h) { return String(h).trim() !== ''; });
  if (!hasHeader) {
    if (data.length > 1) {
      throw AppError_('SCHEMA_INVALID',
        'Header sheet "' + name + '" kosong tetapi ada data. Data tidak diubah; periksa sheet secara manual.', true);
    }
    var initialHeaders = SHEET_HEADERS[name].slice();
    sh.getRange(1, 1, 1, initialHeaders.length).setValues([initialHeaders]);
    return initialHeaders;
  }
  var headers = firstRow.map(function (h) { return String(h); });
  var missing = SHEET_HEADERS[name].filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  return headers;
}

/**
 * Format status pada kolom `status`: TERLAMBAT merah, TANPA_ABSEN_MASUK
 * kuning-netral, SUDAH_ABSEN_PULANG hijau-netral. Aturan lain tidak diganti.
 */
function ensureLateStatusFormatting_(sh) {
  var headers = sh.getDataRange().getValues()[0].map(function (h) { return String(h); });
  var statusColumn = headers.indexOf('status') + 1;
  if (!statusColumn || !sh.getConditionalFormatRules ||
      !sh.setConditionalFormatRules || !SpreadsheetApp.newConditionalFormatRule) return;
  var rules = sh.getConditionalFormatRules();
  function hasRule(value) {
    return rules.some(function (rule) {
      var condition = rule.getBooleanCondition && rule.getBooleanCondition();
      if (!condition || condition.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO) return false;
      var values = condition.getCriteriaValues();
      if (!values || String(values[0]) !== value) return false;
      return (rule.getRanges() || []).some(function (range) {
        return range.getColumn() === statusColumn;
      });
    });
  }
  var changed = false;
  if (!hasRule('TERLAMBAT')) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('TERLAMBAT')
      .setBackground('#fce8e6')
      .setFontColor('#b3261e')
      .setRanges([sh.getRange(2, statusColumn, Math.max(1, sh.getMaxRows() - 1), 1)])
      .build());
    changed = true;
  }
  if (!hasRule('TANPA_ABSEN_MASUK')) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('TANPA_ABSEN_MASUK')
      .setBackground('#fff4e5')
      .setFontColor('#8a4b00')
      .setRanges([sh.getRange(2, statusColumn, Math.max(1, sh.getMaxRows() - 1), 1)])
      .build());
    changed = true;
  }
  if (!hasRule('SUDAH_ABSEN_PULANG')) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('SUDAH_ABSEN_PULANG')
      .setBackground('#e6f4ea')
      .setFontColor('#137333')
      .setRanges([sh.getRange(2, statusColumn, Math.max(1, sh.getMaxRows() - 1), 1)])
      .build());
    changed = true;
  }
  if (changed) sh.setConditionalFormatRules(rules);
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
  var businessDateColumns = name === 'Absensi' ? ['tanggal']
    : (name === 'PengajuanSusulan' ? ['tanggal_absensi'] : []);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var value = values[r][c];
      if (businessDateColumns.indexOf(headers[c]) !== -1) {
        value = normalizeBusinessDate_(value);
      }
      obj[headers[c]] = value;
    }
    obj.__row = r + 1;
    out.push(obj);
  }
  return out;
}

/**
 * Normalisasi nilai sel tanggal bisnis dari Sheets menjadi YYYY-MM-DD.
 * Timestamp dinormalisasi di zona bisnis aplikasi; tanggal tanpa waktu
 * mempertahankan tanggal kalender yang direpresentasikan.
 */
function normalizeBusinessDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, BIZ_TIMEZONE, 'yyyy-MM-dd');
  }
  var text = String(value == null ? '' : value).trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 &&
        probe.getUTCDate() === day) return text;
  }
  return text;
}

function appendObject_(name, obj) {
  var sh = getSheet_(name);
  var headers = ensureSheetHeaders_(name, sh);
  if (name === 'Absensi') ensureLateStatusFormatting_(sh);
  var row = headers.map(function (h) {
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  sh.appendRow(row);
}

function updateObjectRow_(name, rowNumber, obj) {
  var sh = getSheet_(name);
  var headers = ensureSheetHeaders_(name, sh);
  var row = headers.map(function (h) {
    return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '';
  });
  sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

/**
 * Menyegarkan status baris pulang pegawai/tanggal berdasarkan validitas
 * timestamp (jendela pulang Asia/Jakarta). Hanya kolom status yang diubah;
 * timestamp dan data historis lain tidak disentuh. Dipanggil di dalam lock.
 * @return {number} jumlah baris yang diperbarui
 */
function refreshPulangStatusForDay_(idPegawai, tanggal) {
  var sh = getSheet_('Absensi');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0].map(function (h) { return String(h); });
  var col = {
    id_pegawai: headers.indexOf('id_pegawai'),
    tanggal: headers.indexOf('tanggal'),
    jenis: headers.indexOf('jenis'),
    waktu_server: headers.indexOf('waktu_server'),
    status: headers.indexOf('status')
  };
  if (col.id_pegawai < 0 || col.tanggal < 0 || col.jenis < 0 ||
      col.waktu_server < 0 || col.status < 0) return 0;
  var changed = 0;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col.id_pegawai]) !== String(idPegawai) ||
        String(values[r][col.tanggal]) !== String(tanggal) ||
        String(values[r][col.jenis]) !== 'pulang') continue;
    var expected = pulangStatusFromServerIso_(values[r][col.waktu_server]) || '';
    if (String(values[r][col.status] || '') === expected) continue;
    sh.getRange(r + 1, col.status + 1).setValue(expected);
    changed++;
  }
  return changed;
}

/**
 * Rekonsiliasi kolom status pada sheet Absensi berdasarkan catatan aktual.
 * - Masuk: status dihitung ulang dari `waktu_server`; timestamp tidak valid
 *   atau di luar jendela masuk menghasilkan status kosong (tidak pernah
 *   TEPAT_WAKTU/TERLAMBAT tanpa catatan masuk valid).
 * - Pulang: SUDAH_ABSEN_PULANG bila timestamp valid pada jendela pulang;
 *   selain itu kosong. Status masuk tidak ikut diubah.
 * Hanya kolom status yang diubah. Default mode pratinjau (apply:false).
 * @param {{apply?:boolean, limit?:number}} [options]
 * @return {Object} ringkasan
 */
function reconcileAbsensiStatuses(options) {
  options = options || {};
  var apply = options.apply === true;
  function run() {
    return reconcileAbsensiStatuses_(apply, options.limit);
  }
  return apply ? withLock_(run) : run();
}

/** Pratinjau rekonsiliasi status (tanpa menulis). Jalankan dari editor Apps Script. */
function reconcileAbsensiStatusesPreview() {
  return reconcileAbsensiStatuses({ apply: false, limit: 50 });
}

/** Terapkan rekonsiliasi status setelah pratinjau diperiksa. */
function reconcileAbsensiStatusesApply() {
  return reconcileAbsensiStatuses({ apply: true, limit: 50 });
}

function reconcileAbsensiStatuses_(apply, limitRaw) {
  var sh = getSheet_('Absensi');
  var values = sh.getDataRange().getValues();
  var headerRow = values.length ? values[0].map(function (h) { return String(h); }) : [];
  var col = {
    id_absensi: headerRow.indexOf('id_absensi'),
    id_pegawai: headerRow.indexOf('id_pegawai'),
    tanggal: headerRow.indexOf('tanggal'),
    jenis: headerRow.indexOf('jenis'),
    waktu_server: headerRow.indexOf('waktu_server'),
    status: headerRow.indexOf('status')
  };
  ['id_absensi', 'id_pegawai', 'tanggal', 'jenis', 'waktu_server', 'status'].forEach(function (name) {
    if (col[name] < 0) {
      throw AppError_('SCHEMA_INVALID', 'Kolom "' + name + '" tidak ditemukan pada sheet Absensi.', true);
    }
  });
  var limit = parseInt(limitRaw, 10);
  if (!isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  var validMasuk = {};
  var catatanMasukValid = 0;
  var i;
  for (i = 1; i < values.length; i++) {
    if (String(values[i][col.jenis]) !== 'masuk') continue;
    if (!masukStatusFromServerIso_(values[i][col.waktu_server])) continue;
    catatanMasukValid++;
    validMasuk[String(values[i][col.id_pegawai]) + '|' + String(values[i][col.tanggal])] = true;
  }

  var candidates = [];
  var diperiksa = 0;
  var pulangTanpaMasuk = 0;
  for (i = 1; i < values.length; i++) {
    diperiksa++;
    var jenis = String(values[i][col.jenis]);
    var key = String(values[i][col.id_pegawai]) + '|' + String(values[i][col.tanggal]);
    var expected = '';
    if (jenis === 'masuk') {
      expected = masukStatusFromServerIso_(values[i][col.waktu_server]) || '';
    } else if (jenis === 'pulang') {
      expected = pulangStatusFromServerIso_(values[i][col.waktu_server]) || '';
      if (expected && !validMasuk[key]) pulangTanpaMasuk++;
    }
    var lama = String(values[i][col.status] || '');
    if (lama === expected) continue;
    candidates.push({
      baris: i + 1,
      id_absensi: String(values[i][col.id_absensi]),
      id_pegawai: String(values[i][col.id_pegawai]),
      tanggal: String(values[i][col.tanggal]),
      jenis: jenis,
      status_lama: lama,
      status_baru: expected
    });
  }

  var diperbaiki = 0;
  if (apply) {
    candidates.forEach(function (item) {
      sh.getRange(item.baris, col.status + 1).setValue(item.status_baru);
      diperbaiki++;
    });
    if (diperbaiki > 0) {
      logActivity_('absensi_status_reconciled', 'sistem', 'sistem', 'Absensi',
        'diperiksa=' + diperiksa + ';diperbaiki=' + diperbaiki);
    }
  }

  return {
    ok: true,
    mode: apply ? 'apply' : 'preview',
    diperiksa: diperiksa,
    catatan_masuk_valid: catatanMasukValid,
    pulang_tanpa_masuk: pulangTanpaMasuk,
    perlu_diperbaiki: candidates.length,
    diperbaiki: diperbaiki,
    contoh: candidates.slice(0, limit)
  };
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

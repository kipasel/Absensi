/**
 * ReportService.gs — laporan, rekapitulasi & ekspor CSV (PHASE 5).
 *
 * Seluruh aksi: POST + token sesi + peran 'admin' diverifikasi di backend
 * (reportRequire_ → requireAdmin_). Peran TIDAK PERNAH diambil dari klien.
 *
 * Ruang lingkup (AMB-19/DEC-P07 — format ekspor CSV disetujui pengguna):
 * - report.absensi.list      — tabel detail absensi (filter + paginasi offset).
 * - report.rekap             — rekapitulasi hitungan fakta (lihat definisi di
 *                              REKAP_DEFINITIONS di bawah & docs/DATA_DICTIONARY).
 * - report.absensi.exportCsv — ekspor CSV (UTF-8 + BOM, CRLF, quote RFC 4180,
 *                              cegah formula injection; SATU sumber kebenaran
 *                              dengan daftar — filter identik, tanpa paginasi).
 *
 * Sengaja TIDAK diimplementasikan (belum ada keputusan):
 * - Metrik "terlambat"/"tidak hadir"/"tingkat kehadiran"/"persentase disiplin"/
 *   "hari kerja efektif" — definisi & kebijakan BELUM DITETAPKAN.
 * - Ekspor Excel/PDF/drv. — hanya CSV yang disetujui (DEC-P19).
 * - Tautan/ID file foto dalam ekspor (tetap privat; AMB-20).
 * - Konversi persetujuan susulan menjadi baris Absensi (belum ada aturan).
 *
 * Batasan teknis (asumsi sementara, bukan kebijakan bisnis):
 * - Rentang tanggal maksimal REPORT_MAX_RANGE_DAYS hari per permintaan.
 * - Ekspor maksimal REPORT_EXPORT_MAX_ROWS baris (tidak dipotong diam-diam;
 *   kelebihan → EXPORT_TOO_LARGE agar pengguna mempersempit rentang).
 * - Pembacaan sheet penuh per permintaan (volume besar belum diuji; AMB-24).
 */

var REPORT_MAX_RANGE_DAYS = 92;
var REPORT_DEFAULT_PAGE_LIMIT = 50;
var REPORT_MAX_PAGE_LIMIT = 200;
var REPORT_EXPORT_MAX_ROWS = 5000;

/**
 * Definisi metrik rekapitulasi (dokumentasi hidup — dipakai tes & docs).
 * Setiap metrik menghitung CATATAN (baris), bukan "pegawai hadir", kecuali
 * `pegawai_unik` yang menghitung identitas internal unik (id_pegawai).
 */
var REKAP_DEFINITIONS = Object.freeze({
  catatan_total: 'jumlah baris Absensi pada rentang + filter aktif',
  catatan_masuk: 'jumlah baris Absensi dengan jenis=masuk pada rentang + filter aktif',
  catatan_pulang: 'jumlah baris Absensi dengan jenis=pulang pada rentang + filter aktif',
  pegawai_unik: 'jumlah id_pegawai berbeda yang memiliki >=1 baris Absensi pada rentang + filter aktif',
  mode_WFO: 'jumlah baris Absensi dengan mode_kerja=WFO pada rentang + filter aktif',
  mode_WFH_WFA: 'jumlah baris Absensi dengan mode_kerja=WFH_WFA pada rentang + filter aktif',
  sumber_reguler: "jumlah baris Absensi dengan sumber='reguler' pada rentang + filter aktif",
  sumber_susulan_disetujui: "jumlah baris Absensi dengan sumber='susulan_disetujui' pada rentang + filter aktif",
  susulan_menunggu: 'jumlah baris PengajuanSusulan dengan status=menunggu & tanggal_absensi pada rentang (+ filter pegawai/jenis/mode/status pegawai; filter sumber TIDAK berlaku)',
  susulan_diterima: 'sama, status=diterima',
  susulan_ditolak: 'sama, status=ditolak',
  harian: 'daftar tanggal yang memiliki >=1 baris Absensi pada rentang + filter aktif, beserta hitungan masuk/pulang dan pulang_tanpa_masuk per tanggal; penanda tanpa masuk hanya berarti catatan masuk tidak tersedia'
});

/* ---------------- Util input ---------------- */

function reportRequire_(payload, method) {
  requirePost_(method);
  return requireAdmin_(payload && payload.token);
}

function isRealDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var y = parseInt(s.substring(0, 4), 10);
  var m = parseInt(s.substring(5, 7), 10);
  var d = parseInt(s.substring(8, 10), 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseTanggalLaporan_(raw, label) {
  var s = cleanText_(raw, 10);
  if (!s) {
    throw AppError_('INVALID_INPUT', label + ' wajib diisi (YYYY-MM-DD).', true);
  }
  if (!isRealDate_(s)) {
    throw AppError_('INVALID_INPUT', label + ' tidak valid (format YYYY-MM-DD).', true);
  }
  return s;
}

function dayCountInclusive_(dari, sampai) {
  var f = Date.parse(dari + 'T00:00:00Z');
  var t = Date.parse(sampai + 'T00:00:00Z');
  return Math.floor((t - f) / 86400000) + 1;
}

/** Validasi rentang: format, urutan, dan batas teknis maksimal. */
function parseReportRange_(payload) {
  var dari = parseTanggalLaporan_(payload.tanggal_dari, 'Tanggal awal');
  var sampai = parseTanggalLaporan_(payload.tanggal_sampai, 'Tanggal akhir');
  if (dari > sampai) {
    throw AppError_('INVALID_INPUT', 'Tanggal awal melewati tanggal akhir.', true);
  }
  var days = dayCountInclusive_(dari, sampai);
  if (days > REPORT_MAX_RANGE_DAYS) {
    throw AppError_('INVALID_INPUT',
      'Rentang laporan maksimal ' + REPORT_MAX_RANGE_DAYS + ' hari per permintaan.', true);
  }
  return { dari: dari, sampai: sampai, days: days };
}

function normalizeModeFilterLaporan_(raw) {
  var s = cleanText_(raw, 10).toUpperCase();
  if (s === '' || s === 'SEMUA') return '';
  if (s === 'WFO' || s === 'WFH_WFA') return s;
  throw AppError_('INVALID_INPUT', 'Mode kerja tidak valid (WFO atau WFH_WFA).', true);
}

function normalizeSumberFilter_(raw) {
  var s = cleanText_(raw, 20).toLowerCase();
  if (s === '' || s === 'semua') return '';
  if (s === 'reguler' || s === 'susulan_disetujui') return s;
  throw AppError_('INVALID_INPUT', 'Sumber tidak valid (reguler atau susulan_disetujui).', true);
}

function normalizeStatusPegawaiFilter_(raw) {
  return normalizePegawaiFilterStatus_(raw);
}

function parseReportLimit_(raw, fallback) {
  var n = parseInt(raw, 10);
  if (!isFinite(n) || n < 1) return fallback;
  return n > REPORT_MAX_PAGE_LIMIT ? REPORT_MAX_PAGE_LIMIT : n;
}

function parseReportOffset_(raw) {
  var n = parseInt(raw, 10);
  if (!isFinite(n) || n < 1) return 0;
  return n > 1000000 ? 1000000 : n;
}

/**
 * Memvalidasi filter gabungan laporan. Mengembalikan objek filter ternormalisasi.
 * id_pegawai divalidasi eksis (NOT_FOUND bila tidak ada).
 */
function parseReportFilters_(payload) {
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai).trim() : '';
  var filters = {
    id_pegawai: idPegawai,
    jenis: normalizeJenisFilter_(payload.jenis),
    mode_kerja: normalizeModeFilterLaporan_(payload.mode_kerja),
    sumber: normalizeSumberFilter_(payload.sumber),
    status_pegawai: normalizeStatusPegawaiFilter_(payload.status_pegawai)
  };
  if (idPegawai) {
    var pegawai = findPegawaiById_(idPegawai);
    if (!pegawai) throw AppError_('NOT_FOUND', 'Pegawai tidak ditemukan.', true);
    filters.pegawai_row = pegawai;
  } else {
    filters.pegawai_row = null;
  }
  return filters;
}

/** Peta status_aktif pegawai (untuk filter status pegawai & hitungan unik). */
function pegawaiStatusMap_() {
  var rows = readObjects_('Pegawai');
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[String(rows[i].id_pegawai)] = {
      aktif: isTruthy_(rows[i].status_aktif),
      nama: String(rows[i].nama),
      nip_nipk: String(rows[i].nip_nipk)
    };
  }
  return map;
}

/**
 * Menyaring baris Absensi terhadap rentang + filter. Fungsi inti yang dipakai
 * daftar, rekap, dan ekspor agar ketiganya selalu konsisten.
 * @return {Array<Object>} baris yang cocok (urutan sheet dipertahankan).
 */
function filterAbsensiRows_(rows, range, filters, statusMap) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var tanggal = String(r.tanggal);
    if (tanggal < range.dari || tanggal > range.sampai) continue;
    if (filters.id_pegawai && String(r.id_pegawai) !== filters.id_pegawai) continue;
    if (filters.jenis && String(r.jenis) !== filters.jenis) continue;
    if (filters.mode_kerja && String(r.mode_kerja) !== filters.mode_kerja) continue;
    if (filters.sumber && String(r.sumber) !== filters.sumber) continue;
    if (filters.status_pegawai) {
      var info = statusMap[String(r.id_pegawai)];
      if (!info) continue;
      if (filters.status_pegawai === 'aktif' && !info.aktif) continue;
      if (filters.status_pegawai === 'nonaktif' && info.aktif) continue;
    }
    out.push(r);
  }
  out.sort(function (a, b) {
    if (String(a.tanggal) !== String(b.tanggal)) {
      return String(a.tanggal) < String(b.tanggal) ? -1 : 1;
    }
    return String(a.waktu_server).localeCompare(String(b.waktu_server));
  });
  return out;
}

/** Menyaring baris PengajuanSusulan: rentang tanggal_absensi + filter relevan. */
function filterSusulanRows_(rows, range, filters, statusMap) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var tanggal = String(r.tanggal_absensi);
    if (tanggal < range.dari || tanggal > range.sampai) continue;
    if (filters.id_pegawai && String(r.id_pegawai) !== filters.id_pegawai) continue;
    if (filters.jenis && String(r.jenis) !== filters.jenis) continue;
    if (filters.mode_kerja && String(r.mode_kerja) !== filters.mode_kerja) continue;
    // Filter sumber TIDAK berlaku pada susulan (baris susulan tidak punya sumber).
    if (filters.status_pegawai) {
      var info = statusMap[String(r.id_pegawai)];
      if (!info) continue;
      if (filters.status_pegawai === 'aktif' && !info.aktif) continue;
      if (filters.status_pegawai === 'nonaktif' && info.aktif) continue;
    }
    out.push(r);
  }
  return out;
}

function reportAbsensiDayMap_(rows) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var key = String(row.id_pegawai) + '|' + String(row.tanggal);
    if (!out[key]) out[key] = {
      ada_masuk: false, ada_pulang: false, waktu_masuk: '', waktu_pulang: '',
      uraian_pekerjaan: '', output_pekerjaan: ''
    };
    if (String(row.jenis) === 'masuk' && !out[key].ada_masuk) {
      out[key].ada_masuk = true;
      out[key].waktu_masuk = String(row.waktu_server || '');
    } else if (String(row.jenis) === 'pulang') {
      if (!out[key].ada_pulang) out[key].waktu_pulang = String(row.waktu_server || '');
      out[key].ada_pulang = true;
      out[key].uraian_pekerjaan = String(row.uraian_pekerjaan || '');
      out[key].output_pekerjaan = String(row.output_pekerjaan || '');
    }
  }
  Object.keys(out).forEach(function (key) {
    var day = out[key];
    day.kondisi_harian = day.ada_masuk
      ? (day.ada_pulang ? 'ADA_MASUK_DAN_PULANG' : 'ADA_MASUK_TANPA_PULANG')
      : (day.ada_pulang ? 'TANPA_MASUK_DENGAN_PULANG' : '');
  });
  return out;
}

function reportAbsensiFields_(row, statusMap, dayMap) {
  var info = statusMap[String(row.id_pegawai)] || { nama: '', nip_nipk: '' };
  var day = (dayMap || {})[String(row.id_pegawai) + '|' + String(row.tanggal)] || {};
  return {
    id_absensi: String(row.id_absensi),
    id_pegawai: String(row.id_pegawai),
    nama: info.nama,
    nip_nipk: info.nip_nipk,
    tanggal: String(row.tanggal),
    jenis: String(row.jenis),
    mode_kerja: String(row.mode_kerja),
    waktu_server: String(row.waktu_server || ''),
    sumber: String(row.sumber || ''),
    jarak_meter: (row.jarak_meter === '' || row.jarak_meter === null || row.jarak_meter === undefined)
      ? null : row.jarak_meter,
    ada_bukti: Boolean(row.id_bukti),
    status: String(row.status || ''),
    kondisi_harian: String(day.kondisi_harian || ''),
    waktu_masuk: String(day.waktu_masuk || ''),
    waktu_pulang: String(day.waktu_pulang || ''),
    uraian_pekerjaan: String(day.uraian_pekerjaan || row.uraian_pekerjaan || ''),
    output_pekerjaan: String(day.output_pekerjaan || row.output_pekerjaan || '')
  };
}

/* ---------------- Tabel detail ---------------- */

function handleReportAbsensiList_(payload, method) {
  reportRequire_(payload, method);
  var range = parseReportRange_(payload);
  var filters = parseReportFilters_(payload);
  var limit = parseReportLimit_(payload.limit, REPORT_DEFAULT_PAGE_LIMIT);
  var offset = parseReportOffset_(payload.offset);

  var statusMap = pegawaiStatusMap_();
  var allRows = readObjects_('Absensi');
  var dayMap = reportAbsensiDayMap_(allRows);
  var matched = filterAbsensiRows_(allRows, range, filters, statusMap);
  var items = [];
  for (var i = offset; i < matched.length && items.length < limit; i++) {
    items.push(reportAbsensiFields_(matched[i], statusMap, dayMap));
  }
  return {
    ok: true,
    tanggal_dari: range.dari,
    tanggal_sampai: range.sampai,
    total: matched.length,
    offset: offset,
    limit: limit,
    has_more: offset + items.length < matched.length,
    items: items
  };
}

/* ---------------- Rekapitulasi ---------------- */

function handleReportRekap_(payload, method) {
  reportRequire_(payload, method);
  var range = parseReportRange_(payload);
  var filters = parseReportFilters_(payload);
  var statusMap = pegawaiStatusMap_();

  var absensi = filterAbsensiRows_(readObjects_('Absensi'), range, filters, statusMap);
  var masuk = 0, pulang = 0, wfo = 0, wfh = 0, reguler = 0, susulanSetuju = 0;
  var unik = {};
  var harianMap = {};
  for (var i = 0; i < absensi.length; i++) {
    var r = absensi[i];
    var jenis = String(r.jenis);
    if (jenis === 'masuk') { masuk++; } else if (jenis === 'pulang') { pulang++; }
    var mode = String(r.mode_kerja);
    if (mode === 'WFO') { wfo++; } else if (mode === 'WFH_WFA') { wfh++; }
    var sumber = String(r.sumber);
    if (sumber === 'susulan_disetujui') { susulanSetuju++; } else { reguler++; }
    unik[String(r.id_pegawai)] = true;
    var t = String(r.tanggal);
    if (!harianMap[t]) harianMap[t] = {
      tanggal: t, catatan_masuk: 0, catatan_pulang: 0, pulang_tanpa_masuk: 0
    };
    if (jenis === 'masuk') harianMap[t].catatan_masuk++;
    else if (jenis === 'pulang') {
      harianMap[t].catatan_pulang++;
      if (String(r.status || '') === 'TANPA_ABSEN_MASUK') harianMap[t].pulang_tanpa_masuk++;
    }
  }
  susulanSetuju = 0;
  var harian = [];
  for (var key in harianMap) {
    if (Object.prototype.hasOwnProperty.call(harianMap, key)) harian.push(harianMap[key]);
  }
  harian.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; });

  var susulan = [];
  var sMenunggu = 0, sDiterima = 0, sDitolak = 0;

  var pegawaiUnik = 0;
  for (var id in unik) {
    if (Object.prototype.hasOwnProperty.call(unik, id)) pegawaiUnik++;
  }

  return {
    ok: true,
    tanggal_dari: range.dari,
    tanggal_sampai: range.sampai,
    filter: {
      id_pegawai: filters.id_pegawai,
      jenis: filters.jenis,
      mode_kerja: filters.mode_kerja,
      sumber: filters.sumber,
      status_pegawai: filters.status_pegawai
    },
    catatan: { total: absensi.length, masuk: masuk, pulang: pulang },
    pegawai_unik: pegawaiUnik,
    mode_kerja: { WFO: wfo, WFH_WFA: wfh },
    sumber: { reguler: reguler, susulan_disetujui: 0 },
    susulan: { total: susulan.length, menunggu: sMenunggu, diterima: sDiterima, ditolak: sDitolak },
    harian: harian,
    definisi: REKAP_DEFINITIONS
  };
}

/* ---------------- Ekspor CSV ---------------- */

/**
 * Menjaga nilai teks berawalan karakter formula agar tidak dieksekusi
 * spreadsheet. Guard HANYA diterapkan pada berkas ekspor, TIDAK mengubah
 * data sumber. Karakter: = + - @ tab CR (praktik OWASP CSV injection).
 */
function csvNeedsFormulaGuard_(s) {
  if (!s) return false;
  var c = s.charAt(0);
  return c === '=' || c === '+' || c === '-' || c === '@' || c === '\t' || c === '\r';
}

/** Escape satu field CSV (RFC 4180) + guard formula. */
function csvEscapeField_(value) {
  var s = (value === null || value === undefined) ? '' : String(value);
  if (csvNeedsFormulaGuard_(s)) s = "'" + s;
  if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 ||
      s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

var CSV_REPORT_HEADERS = Object.freeze([
  'id_absensi', 'tanggal', 'id_pegawai', 'nama', 'nip_nipk', 'jenis',
  'mode_kerja', 'waktu_server', 'sumber', 'jarak_meter', 'ada_bukti', 'status',
  'kondisi_harian', 'waktu_masuk', 'waktu_pulang', 'uraian_pekerjaan', 'output_pekerjaan'
]);

/**
 * Membangun isi CSV dari baris yang sudah tersaring. UTF-8 BOM di awal
 * (kompatibel Excel), baris CRLF, tanpa nilai selain kolom di atas
 * (TANPA drive_file_id/URL foto, PIN, atau token).
 */
function buildAbsensiCsv_(matched, statusMap, dayMap) {
  var lines = [CSV_REPORT_HEADERS.join(',')];
  for (var i = 0; i < matched.length; i++) {
    var f = reportAbsensiFields_(matched[i], statusMap, dayMap);
    lines.push([
      csvEscapeField_(f.id_absensi),
      csvEscapeField_(f.tanggal),
      csvEscapeField_(f.id_pegawai),
      csvEscapeField_(f.nama),
      csvEscapeField_(f.nip_nipk),
      csvEscapeField_(f.jenis),
      csvEscapeField_(f.mode_kerja),
      csvEscapeField_(f.waktu_server),
      csvEscapeField_(f.sumber),
      csvEscapeField_(f.jarak_meter === null ? '' : f.jarak_meter),
      csvEscapeField_(f.ada_bukti ? 'ya' : 'tidak'),
      csvEscapeField_(f.status),
      csvEscapeField_(f.kondisi_harian),
      csvEscapeField_(f.waktu_masuk),
      csvEscapeField_(f.waktu_pulang),
      csvEscapeField_(f.uraian_pekerjaan),
      csvEscapeField_(f.output_pekerjaan)
    ].join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function handleReportAbsensiExportCsv_(payload, method) {
  var ctx = reportRequire_(payload, method);
  var range = parseReportRange_(payload);
  var filters = parseReportFilters_(payload);
  var statusMap = pegawaiStatusMap_();
  var allRows = readObjects_('Absensi');
  var dayMap = reportAbsensiDayMap_(allRows);
  var matched = filterAbsensiRows_(allRows, range, filters, statusMap);

  if (matched.length > REPORT_EXPORT_MAX_ROWS) {
    throw AppError_('EXPORT_TOO_LARGE',
      'Hasil ekspor melebihi batas ' + REPORT_EXPORT_MAX_ROWS +
      ' baris. Persempit rentang tanggal atau filter.', true);
  }

  var csv = buildAbsensiCsv_(matched, statusMap, dayMap);
  var filename = 'laporan-absensi_' + range.dari + '_' + range.sampai + '.csv';

  logActivity_('report_exported', ctx.account.id_akun, ctx.account.peran, 'laporan',
    range.dari + '..' + range.sampai + ' rows=' + matched.length);

  return {
    ok: true,
    filename: filename,
    rows: matched.length,
    content_type: 'text/csv;charset=utf-8',
    csv: csv
  };
}

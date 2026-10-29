/*
 * Pengujian laporan, rekapitulasi & ekspor CSV — PHASE 5.
 * Jalankan: node tests/report.test.mjs
 *
 * Mencakup: otorisasi endpoint laporan (wajib peran admin di backend),
 * validasi rentang tanggal, filter, paginasi, akurasi rekapitulasi (hitungan
 * fakta tanpa metrik kebijakan), ekspor CSV (RFC 4180, UTF-8 BOM, cegah
 * formula injection, kelengkapan tanpa paginasi), dan kegagalan sistem.
 * Data uji SINTETIS berlabel TEST — bukan data produksi (AMB-29).
 *
 * INI BUKAN pengganti pengujian di runtime Apps Script nyata / browser nyata
 * (lihat docs/TEST_PLAN.md bagian yang belum dijalankan).
 */
import { createEnv, seedAccount } from './harness.mjs';

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log('  PASS  ' + name);
}
function bad(name, detail) {
  failed++;
  console.log('  FAIL  ' + name + (detail ? '  ->  ' + detail : ''));
}
function check(name, fn) {
  try {
    const res = fn();
    if (res === false) bad(name);
    else ok(name);
  } catch (err) {
    bad(name, err.message);
  }
}
function eq(name, actual, expected) {
  check(name, () => {
    if (actual !== expected) throw new Error('aktual ' + actual + ' != harapan ' + expected);
    return true;
  });
}
function throwsCode(name, fn, code) {
  check(name, () => {
    try {
      fn();
    } catch (err) {
      if (err && err.code === code) return true;
      throw new Error('kode error ' + (err && err.code) + ' != ' + code);
    }
    throw new Error('tidak melempar error');
  });
}

/* ---------------- Fixture ---------------- */

const ADMIN_NIP = '9999888877776666';
const EMP_NIP = '1111222233334444';
const EMP2_NIP = '5555666677778888';

const RANGE = { tanggal_dari: '2026-10-01', tanggal_sampai: '2026-10-31' };

function envAdmin() {
  const env = createEnv({ props: {} });
  seedAccount(env.sandbox, env.props, {
    nip: ADMIN_NIP, pin: '135790', iterations: 1000,
    idPegawai: 'PEG-ADM-1', idAkun: 'AKN-ADM-1',
    nama: 'Admin Uji TEST', peran: 'admin'
  });
  seedAccount(env.sandbox, env.props, {
    nip: EMP_NIP, pin: '246810', iterations: 1000,
    idPegawai: 'PEG-EMP-1', idAkun: 'AKN-EMP-1',
    nama: 'Pegawai Uji TEST'
  });
  seedAccount(env.sandbox, env.props, {
    nip: EMP2_NIP, pin: '112233', iterations: 1000,
    idPegawai: 'PEG-EMP-2', idAkun: 'AKN-EMP-2',
    nama: 'Pegawai Dua TEST'
  });
  const tokenAdmin = env.sandbox
    .handleLogin_({ nip: ADMIN_NIP, pin: '135790' }, 'POST').token;
  const tokenEmp = env.sandbox
    .handleLogin_({ nip: EMP_NIP, pin: '246810' }, 'POST').token;
  return { env, tokenAdmin, tokenEmp };
}

function seedAbsensi(env, opts) {
  const waktu = opts.waktu_server || '2026-10-15T01:00:00.000Z';
  env.sandbox.appendObject_('Absensi', {
    id_absensi: opts.id_absensi,
    id_pegawai: opts.id_pegawai,
    tanggal: opts.tanggal || '2026-10-15',
    jenis: opts.jenis || 'masuk',
    mode_kerja: opts.mode_kerja || 'WFO',
    waktu_server: waktu,
    lintang: opts.lintang === undefined ? '-3.3' : opts.lintang,
    bujur: opts.bujur === undefined ? '97.1' : opts.bujur,
    akurasi: '12',
    jarak_meter: opts.jarak_meter === undefined ? '10.5' : opts.jarak_meter,
    sumber: opts.sumber || 'reguler',
    id_bukti: opts.id_bukti === undefined ? 'BKT-TEST' : opts.id_bukti,
    status: opts.status || '',
    uraian_pekerjaan: opts.uraian_pekerjaan || '',
    output_pekerjaan: opts.output_pekerjaan || '',
    dibuat_pada: waktu,
    diubah_pada: waktu,
    diubah_oleh: opts.id_pegawai
  });
}

function seedPengajuan(env, opts) {
  env.sandbox.appendObject_('PengajuanSusulan', {
    id_pengajuan: opts.id_pengajuan,
    id_pegawai: opts.id_pegawai,
    tanggal_absensi: opts.tanggal_absensi || '2026-10-14',
    jenis: opts.jenis || 'masuk',
    mode_kerja: opts.mode_kerja || 'WFH_WFA',
    waktu_diklaim: opts.waktu_diklaim || '2026-10-14T02:00:00.000Z',
    waktu_pengajuan_server: opts.waktu_pengajuan_server || '2026-10-15T03:00:00.000Z',
    alasan: opts.alasan || 'Lupa absen TEST',
    bukti_file_id: 'DRV-SUSULAN-TEST',
    status: opts.status || 'menunggu',
    id_admin: opts.id_admin || '',
    waktu_keputusan: opts.waktu_keputusan || '',
    catatan_keputusan: opts.catatan_keputusan || '',
    diubah_pada: ''
  });
}

/** Parser CSV mini (RFC 4180) untuk memverifikasi round-trip field. */
function parseCsv(text) {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuotes) {
      if (c === '"') {
        if (body[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r' && body[i + 1] === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      i++;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const REPORT_ACTIONS = [
  'report.absensi.list',
  'report.rekap',
  'report.absensi.exportCsv'
];

/* ================= Otorisasi ================= */

console.log('== Otorisasi endpoint laporan (backend) ==');
REPORT_ACTIONS.forEach((action) => {
  throwsCode(action + ' tanpa token → UNAUTHORIZED', () => {
    const { env } = envAdmin();
    env.sandbox.route_(action, { ...RANGE }, 'POST');
  }, 'UNAUTHORIZED');
});
REPORT_ACTIONS.forEach((action) => {
  throwsCode(action + ' token pegawai → FORBIDDEN', () => {
    const { env, tokenEmp } = envAdmin();
    env.sandbox.route_(action, { ...RANGE, token: tokenEmp }, 'POST');
  }, 'FORBIDDEN');
});
REPORT_ACTIONS.forEach((action) => {
  throwsCode(action + ' metode GET → METHOD_NOT_ALLOWED', () => {
    const { env, tokenAdmin } = envAdmin();
    env.sandbox.route_(action, { ...RANGE, token: tokenAdmin }, 'GET');
  }, 'METHOD_NOT_ALLOWED');
});
check('peran palsu di body diabaikan (token pegawai + peran admin → FORBIDDEN)', () => {
  const { env, tokenEmp } = envAdmin();
  throwsCode('FORBIDDEN', () => {
    env.sandbox.route_('report.absensi.list', { ...RANGE, token: tokenEmp, peran: 'admin' }, 'POST');
  }, 'FORBIDDEN');
  return true;
});
check('semua aksi laporan terhubung di route_ (bukan UNKNOWN_ACTION)', () => {
  const { env, tokenAdmin } = envAdmin();
  for (const action of REPORT_ACTIONS) {
    try {
      env.sandbox.route_(action, { ...RANGE, token: tokenAdmin }, 'POST');
    } catch (err) {
      if (err && err.code === 'UNKNOWN_ACTION') throw new Error(action + ' tidak terhubung');
    }
  }
  return true;
});
check('sesi kedaluwarsa/tercabut → UNAUTHORIZED (logout lalu dipakai)', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleLogout_({ token: tokenAdmin }, 'POST');
  throwsCode('UNAUTHORIZED', () => {
    env.sandbox.route_('report.absensi.list', { ...RANGE, token: tokenAdmin }, 'POST');
  }, 'UNAUTHORIZED');
  return true;
});
check('admin dinonaktifkan (sesi dicabut) → UNAUTHORIZED', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-ADM-1', aktif: false }, 'POST');
  throwsCode('UNAUTHORIZED', () => {
    env.sandbox.route_('report.rekap', { ...RANGE, token: tokenAdmin }, 'POST');
  }, 'UNAUTHORIZED');
  return true;
});

/* ================= Validasi rentang tanggal ================= */

console.log('== Validasi rentang tanggal ==');
check('rentang valid diterima (1 hari)', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-10-15', tanggal_sampai: '2026-10-15'
  }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('tanggal_dari', res.tanggal_dari, '2026-10-15');
  eq('tanggal_sampai', res.tanggal_sampai, '2026-10-15');
  return true;
});
check('tanggal_dari hilang → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_(
      { token: tokenAdmin, tanggal_sampai: '2026-10-31' }, 'POST');
  }, 'INVALID_INPUT');
});
check('tanggal_sampai hilang → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_(
      { token: tokenAdmin, tanggal_dari: '2026-10-01' }, 'POST');
  }, 'INVALID_INPUT');
});
check('format tanggal salah (15/10/2026) → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_({
      token: tokenAdmin, tanggal_dari: '15/10/2026', tanggal_sampai: '2026-10-31'
    }, 'POST');
  }, 'INVALID_INPUT');
});
check('tanggal bukan kalender (2026-02-30) → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_({
      token: tokenAdmin, tanggal_dari: '2026-02-30', tanggal_sampai: '2026-02-30'
    }, 'POST');
  }, 'INVALID_INPUT');
});
check('tanggal awal melewati akhir → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_({
      token: tokenAdmin, tanggal_dari: '2026-10-31', tanggal_sampai: '2026-10-01'
    }, 'POST');
  }, 'INVALID_INPUT');
});
check('rentang 92 hari (batas teknis) diterima', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-07-01', tanggal_sampai: '2026-09-30'
  }, 'POST');
  if (!res.ok) throw new Error('gagal');
  return true;
});
check('rentang 93 hari → INVALID_INPUT (batas teknis)', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiList_({
      token: tokenAdmin, tanggal_dari: '2026-07-01', tanggal_sampai: '2026-10-01'
    }, 'POST');
  }, 'INVALID_INPUT');
});
check('batas inklusif: catatan pada tanggal_dari & tanggal_sampai ikut; di luar tidak', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-B1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-01' });
  seedAbsensi(env, { id_absensi: 'ABS-B2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-31' });
  seedAbsensi(env, { id_absensi: 'ABS-B3', id_pegawai: 'PEG-EMP-1', tanggal: '2026-09-30' });
  seedAbsensi(env, { id_absensi: 'ABS-B4', id_pegawai: 'PEG-EMP-1', tanggal: '2026-11-01' });
  const res = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('total inklusif', res.total, 2);
  return true;
});
check('zona waktu: pemilihan tanggal bisnis memakai kolom tanggal (Asia/Jakarta), bukan timestamp klien', () => {
  const { env, tokenAdmin } = envAdmin();
  // Catatan 2026-10-14T17:30:00Z = 2026-10-15 00:30 WIB → tanggal bisnis 2026-10-15.
  seedAbsensi(env, {
    id_absensi: 'ABS-TZ', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-15', waktu_server: '2026-10-14T17:30:00.000Z'
  });
  const okRange = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-10-15', tanggal_sampai: '2026-10-15'
  }, 'POST');
  eq('masuk tanggal bisnis', okRange.total, 1);
  const skipRange = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-10-14', tanggal_sampai: '2026-10-14'
  }, 'POST');
  eq('tidak masuk tanggal UTC', skipRange.total, 0);
  return true;
});
check('kolom tanggal bertipe Date dari Google Sheets dinormalisasi ke tanggal bisnis', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-DATE-CELL', id_pegawai: 'PEG-EMP-1',
    tanggal: new Date('2026-10-27T17:00:00.000Z')
  });
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-10-28', tanggal_sampai: '2026-10-28'
  }, 'POST');
  eq('tanggal Date dicocokkan setelah konversi Asia/Jakarta', res.total, 1);
  eq('tanggal respons dinormalisasi', res.items[0].tanggal, '2026-10-28');
  return true;
});
check('periode tanpa data → total 0 & items [] (bukan error, bukan "gagal")', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2025-01-01', tanggal_sampai: '2025-01-31'
  }, 'POST');
  eq('ok', res.ok, true);
  eq('total', res.total, 0);
  eq('items', res.items.length, 0);
  return true;
});

/* ================= Filter & paginasi detail ================= */

console.log('== Filter, join, urutan & paginasi ==');
function seedLaporanDasar(env) {
  // 6 catatan campuran pada Oktober 2026
  seedAbsensi(env, { id_absensi: 'ABS-R1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-05', jenis: 'masuk', mode_kerja: 'WFO', waktu_server: '2026-10-05T00:30:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-R2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-05', jenis: 'pulang', mode_kerja: 'WFO', waktu_server: '2026-10-05T10:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-R3', id_pegawai: 'PEG-EMP-2', tanggal: '2026-10-06', jenis: 'masuk', mode_kerja: 'WFH_WFA', waktu_server: '2026-10-06T01:00:00.000Z', sumber: 'susulan_disetujui' });
  seedAbsensi(env, { id_absensi: 'ABS-R4', id_pegawai: 'PEG-EMP-2', tanggal: '2026-10-20', jenis: 'masuk', mode_kerja: 'WFO', waktu_server: '2026-10-20T01:00:00.000Z', id_bukti: '' });
  seedAbsensi(env, { id_absensi: 'ABS-R5', id_pegawai: 'PEG-EMP-1', tanggal: '2026-09-30', jenis: 'masuk', waktu_server: '2026-09-30T01:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-R6', id_pegawai: 'PEG-EMP-2', tanggal: '2026-11-01', jenis: 'masuk', waktu_server: '2026-11-01T01:00:00.000Z' });
}
check('filter rentang + join nama/NIP; urutan kronologis (tanggal lalu waktu naik)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('total oktober', res.total, 4);
  eq('id pertama (5 Okt, masuk)', res.items[0].id_absensi, 'ABS-R1');
  eq('id kedua (5 Okt, pulang)', res.items[1].id_absensi, 'ABS-R2');
  eq('id terakhir (20 Okt)', res.items[3].id_absensi, 'ABS-R4');
  eq('nama ter-join', res.items[0].nama, 'Pegawai Uji TEST');
  eq('nip ter-join', res.items[2].nip_nipk, EMP2_NIP);
  eq('ada_bukti false pada R4', res.items[3].ada_bukti, false);
  return true;
});
check('data table: pencarian nama/NIP/uraian berlaku sebelum paginasi', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  seedAbsensi(env, {
    id_absensi: 'ABS-CARI-URAIAN', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-21',
    jenis: 'pulang', waktu_server: '2026-10-21T10:00:00.000Z',
    uraian_pekerjaan: 'Arsip khusus TEST', output_pekerjaan: 'Dokumen TEST'
  });
  const byName = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, q: 'pegawai dua' }, 'POST');
  eq('cari nama (tanpa peduli huruf besar/kecil)', byName.total, 2);
  const byNip = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, q: EMP_NIP.slice(0, 8) }, 'POST');
  eq('cari NIP', byNip.total, 3);
  const byUraian = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, q: 'arsip khusus' }, 'POST');
  eq('cari uraian pekerjaan', byUraian.total, 1);
  eq('item hasil pencarian', byUraian.items[0].id_absensi, 'ABS-CARI-URAIAN');
  const paged = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, q: 'pegawai', limit: 1, offset: 1 }, 'POST');
  eq('total mengikuti hasil pencarian', paged.total, 5);
  eq('satu baris per halaman', paged.items.length, 1);
  eq('has_more di halaman pertama', paged.has_more, true);
  return true;
});
check('data table: urut tanggal/nama naik-turun dan kunci tak dikenal diabaikan', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const desc = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, sort: 'tanggal', order: 'desc' }, 'POST');
  eq('tanggal terbaru lebih dulu', desc.items[0].id_absensi, 'ABS-R4');
  eq('tanggal terlama paling akhir', desc.items[desc.items.length - 1].id_absensi, 'ABS-R1');
  const ascName = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, sort: 'nama', order: 'asc' }, 'POST');
  eq('nama A-Z', ascName.items[0].id_absensi, 'ABS-R3');
  const invalid = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, sort: 'drop_table', order: 'desc' }, 'POST');
  eq('sort tak dikenal memakai urutan default', invalid.items[0].id_absensi, 'ABS-R1');
  return true;
});
check('laporan menampilkan pulang tanpa masuk tanpa membuat data masuk', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-PULANG-TANPA-MASUK', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-15', jenis: 'pulang',
    waktu_server: '2026-10-15T09:00:00.000Z',
    lintang: '', bujur: '', jarak_meter: '', status: 'TANPA_ABSEN_MASUK',
    uraian_pekerjaan: 'Administrasi selesai TEST', output_pekerjaan: 'Dokumen TEST'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-PULANG-TANPA-MASUK');
  eq('waktu pulang server', item.waktu_server, '2026-10-15T09:00:00.000Z');
  eq('status catatan', item.status, 'SUDAH_ABSEN_PULANG');
  eq('status absen masuk', item.status_masuk, 'TANPA_ABSEN_MASUK');
  eq('status absen pulang', item.status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('kondisi hari', item.kondisi_harian, 'TANPA_MASUK_DENGAN_PULANG');
  eq('waktu masuk kosong', item.waktu_masuk, '');
  eq('waktu pulang aktual', item.waktu_pulang, '2026-10-15T09:00:00.000Z');
  eq('uraian pekerjaan', item.uraian_pekerjaan, 'Administrasi selesai TEST');
  eq('output pekerjaan', item.output_pekerjaan, 'Dokumen TEST');
  const rekap = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  const day = rekap.harian.find((r) => r.tanggal === '2026-10-15');
  eq('pulang terhitung', day.catatan_pulang, 1);
  eq('pulang tanpa masuk terpisah', day.pulang_tanpa_masuk, 1);
  return true;
});
check('laporan membedakan masuk+pulang dan masuk tanpa pulang', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const complete = list.items.find((r) => r.id_absensi === 'ABS-R1');
  eq('hari lengkap', complete.kondisi_harian, 'ADA_MASUK_DAN_PULANG');
  eq('status masuk tepat waktu', complete.status_masuk, 'TEPAT_WAKTU');
  eq('status pulang normal', complete.status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('waktu masuk pasangan', complete.waktu_masuk, '2026-10-05T00:30:00.000Z');
  eq('waktu pulang pasangan', complete.waktu_pulang, '2026-10-05T10:00:00.000Z');
  const entryOnly = list.items.find((r) => r.id_absensi === 'ABS-R3');
  eq('masuk tanpa pulang', entryOnly.kondisi_harian, 'ADA_MASUK_TANPA_PULANG');
  eq('waktu pulang kosong', entryOnly.waktu_pulang, '');
  return true;
});
check('status pulang valid konsisten untuk TEPAT_WAKTU, TERLAMBAT, dan TANPA_ABSEN_MASUK', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-M1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-24', jenis: 'masuk', waktu_server: '2026-10-24T00:30:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-P1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-24', jenis: 'pulang', waktu_server: '2026-10-24T10:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-M2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-25', jenis: 'masuk', waktu_server: '2026-10-25T02:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-P2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-25', jenis: 'pulang', waktu_server: '2026-10-25T10:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-P3', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-26', jenis: 'pulang', waktu_server: '2026-10-26T10:00:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-M4', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-27', jenis: 'masuk', waktu_server: '2026-10-27T00:30:00.000Z' });
  seedAbsensi(env, { id_absensi: 'ABS-M5', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-28', jenis: 'masuk', waktu_server: '2026-10-28T02:00:00.000Z' });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const byId = (id) => list.items.find((r) => r.id_absensi === id);
  eq('TEPAT + pulang: masuk', byId('ABS-M1').status_masuk, 'TEPAT_WAKTU');
  eq('TEPAT + pulang: pulang', byId('ABS-M1').status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('TEPAT + pulang: kondisi', byId('ABS-M1').kondisi_harian, 'ADA_MASUK_DAN_PULANG');
  eq('TERLAMBAT + pulang: masuk', byId('ABS-M2').status_masuk, 'TERLAMBAT');
  eq('TERLAMBAT + pulang: pulang', byId('ABS-M2').status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('TANPA masuk + pulang: masuk', byId('ABS-P3').status_masuk, 'TANPA_ABSEN_MASUK');
  eq('TANPA masuk + pulang: pulang', byId('ABS-P3').status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('TEPAT tanpa pulang: masuk', byId('ABS-M4').status_masuk, 'TEPAT_WAKTU');
  eq('TEPAT tanpa pulang: pulang', byId('ABS-M4').status_pulang, 'BELUM_ABSEN_PULANG');
  eq('TERLAMBAT tanpa pulang: masuk', byId('ABS-M5').status_masuk, 'TERLAMBAT');
  eq('TERLAMBAT tanpa pulang: pulang', byId('ABS-M5').status_pulang, 'BELUM_ABSEN_PULANG');
  return true;
});
check('pulang di luar jendela 16.00–23.59 WIB tidak dihitung SUDAH_ABSEN_PULANG', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-M-VALID', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-29',
    jenis: 'masuk', waktu_server: '2026-10-29T00:30:00.000Z'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-P-INVALID', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-29',
    jenis: 'pulang', waktu_server: '2026-10-29T01:00:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const masuk = list.items.find((r) => r.id_absensi === 'ABS-M-VALID');
  const pulang = list.items.find((r) => r.id_absensi === 'ABS-P-INVALID');
  eq('masuk tetap tepat waktu', masuk.status_masuk, 'TEPAT_WAKTU');
  eq('pulang tidak valid tidak SUDAH', pulang.status_pulang, 'BELUM_ABSEN_PULANG');
  eq('waktu pulang tidak dipakai', masuk.waktu_pulang, '');
  eq('kondisi tanpa pulang valid', masuk.kondisi_harian, 'ADA_MASUK_TANPA_PULANG');
  return true;
});
check('tanpa masuk valid dan tanpa pulang tidak mengarang status', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-INVALID-ONLY', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-30',
    jenis: 'masuk', waktu_server: '2026-10-30T23:30:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-INVALID-ONLY');
  eq('tanpa status masuk valid', item.status_masuk, '');
  eq('tanpa status pulang valid', item.status_pulang, '');
  eq('tanpa kondisi', item.kondisi_harian, '');
  return true;
});
check('status masuk tidak TEPAT_WAKTU saat hanya ada pulang (sel lama salah)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-ONLY-PULANG-BAD', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-15', jenis: 'pulang',
    waktu_server: '2026-10-15T10:00:00.000Z', status: 'TEPAT_WAKTU'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-ONLY-PULANG-BAD');
  eq('status baris disanitasi', item.status, 'SUDAH_ABSEN_PULANG');
  eq('status masuk', item.status_masuk, 'TANPA_ABSEN_MASUK');
  eq('status pulang', item.status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('tidak ada waktu masuk buatan', item.waktu_masuk, '');
  eq('kondisi hari', item.kondisi_harian, 'TANPA_MASUK_DENGAN_PULANG');
  return true;
});
check('masuk 09.00 WIB → TERLAMBAT; pulang valid → SUDAH_ABSEN_PULANG', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-LATE', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-16',
    jenis: 'masuk', waktu_server: '2026-10-16T02:00:00.000Z', status: 'TEPAT_WAKTU'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-LATE-PULANG', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-16',
    jenis: 'pulang', waktu_server: '2026-10-16T10:00:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-LATE');
  eq('status masuk dihitung ulang', item.status_masuk, 'TERLAMBAT');
  eq('status baris masuk', item.status, 'TERLAMBAT');
  eq('status pulang', item.status_pulang, 'SUDAH_ABSEN_PULANG');
  return true;
});
check('masuk 07.30 WIB tanpa pulang → TEPAT_WAKTU, pulang BELUM_ABSEN_PULANG', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-ENTRY-ONLY', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-17',
    jenis: 'masuk', waktu_server: '2026-10-17T00:30:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-ENTRY-ONLY');
  eq('status masuk', item.status_masuk, 'TEPAT_WAKTU');
  eq('status pulang belum', item.status_pulang, 'BELUM_ABSEN_PULANG');
  eq('tanpa pulang', item.kondisi_harian, 'ADA_MASUK_TANPA_PULANG');
  return true;
});
check('masuk sebelum 07.00 WIB tidak dianggap valid (bukan TEPAT_WAKTU)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-EARLY', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-18',
    jenis: 'masuk', waktu_server: '2026-10-17T23:30:00.000Z', status: 'TEPAT_WAKTU'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-EARLY-PULANG', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-18',
    jenis: 'pulang', waktu_server: '2026-10-18T10:00:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const item = list.items.find((r) => r.id_absensi === 'ABS-EARLY');
  eq('status baris', item.status, 'TANPA_ABSEN_MASUK');
  eq('status masuk', item.status_masuk, 'TANPA_ABSEN_MASUK');
  eq('status pulang', item.status_pulang, 'SUDAH_ABSEN_PULANG');
  return true;
});
check('pegawai berbeda pada tanggal sama tidak tertukar statusnya', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-SAME-DAY-1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-19',
    jenis: 'masuk', waktu_server: '2026-10-19T00:30:00.000Z'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-SAME-DAY-1-P', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-19',
    jenis: 'pulang', waktu_server: '2026-10-19T10:00:00.000Z'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-SAME-DAY-2', id_pegawai: 'PEG-EMP-2', tanggal: '2026-10-19',
    jenis: 'pulang', waktu_server: '2026-10-19T10:00:00.000Z'
  });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const one = list.items.find((r) => r.id_absensi === 'ABS-SAME-DAY-1');
  const two = list.items.find((r) => r.id_absensi === 'ABS-SAME-DAY-2');
  eq('pegawai 1 tetap tepat waktu', one.status_masuk, 'TEPAT_WAKTU');
  eq('pegawai 1 pulang normal', one.status_pulang, 'SUDAH_ABSEN_PULANG');
  eq('pegawai 2 tanpa masuk', two.status_masuk, 'TANPA_ABSEN_MASUK');
  eq('pegawai 2 pulang valid', two.status_pulang, 'SUDAH_ABSEN_PULANG');
  return true;
});
check('rekonsiliasi: pratinjau tidak menulis, apply memperbaiki hanya status', () => {
  const { env } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-REC-PULANG', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-22',
    jenis: 'pulang', waktu_server: '2026-10-22T10:00:00.000Z', status: 'TEPAT_WAKTU'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-REC-LATE', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-23',
    jenis: 'masuk', waktu_server: '2026-10-23T02:00:00.000Z', status: 'TEPAT_WAKTU'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-REC-STALE', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-23',
    jenis: 'pulang', waktu_server: '2026-10-23T10:00:00.000Z', status: 'TANPA_ABSEN_MASUK'
  });
  const before = env.sandbox.readObjects_('Absensi');
  const preview = env.sandbox.reconcileAbsensiStatuses({ apply: false });
  eq('mode pratinjau', preview.mode, 'preview');
  eq('ada yang perlu diperbaiki', preview.perlu_diperbaiki, 3);
  eq('pratinjau tidak menulis', env.sandbox.findAbsensiById_('ABS-REC-PULANG').status, 'TEPAT_WAKTU');
  const applied = env.sandbox.reconcileAbsensiStatuses({ apply: true });
  eq('mode apply', applied.mode, 'apply');
  eq('jumlah diperbaiki', applied.diperbaiki, 3);
  eq('pulang tanpa masuk', env.sandbox.findAbsensiById_('ABS-REC-PULANG').status, 'SUDAH_ABSEN_PULANG');
  eq('masuk terlambat', env.sandbox.findAbsensiById_('ABS-REC-LATE').status, 'TERLAMBAT');
  eq('marker pulang disegarkan', env.sandbox.findAbsensiById_('ABS-REC-STALE').status, 'SUDAH_ABSEN_PULANG');
  eq('jumlah baris tidak bertambah', env.sandbox.readObjects_('Absensi').length, before.length);
  eq('timestamp tidak berubah', env.sandbox.findAbsensiById_('ABS-REC-LATE').waktu_server, '2026-10-23T02:00:00.000Z');
  return true;
});
check('filter id_pegawai bekerja; id tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, ...RANGE, id_pegawai: 'PEG-EMP-1'
  }, 'POST');
  eq('pegawai 1', res.total, 2);
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleReportAbsensiList_({
      token: tokenAdmin, ...RANGE, id_pegawai: 'PEG-NOT-EXIST'
    }, 'POST');
  }, 'NOT_FOUND');
  return true;
});
check('filter jenis, mode_kerja & sumber bekerja', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  eq('jenis masuk', env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, jenis: 'masuk' }, 'POST').total, 3);
  eq('mode WFO', env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, mode_kerja: 'WFO' }, 'POST').total, 3);
  eq('sumber susulan_disetujui', env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, sumber: 'susulan_disetujui' }, 'POST').total, 1);
  return true;
});
check('filter enum tidak valid → INVALID_INPUT (mode, sumber, status_pegawai)', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('mode aneh', () => {
    env.sandbox.handleReportAbsensiList_(
      { token: tokenAdmin, ...RANGE, mode_kerja: 'KANTOR' }, 'POST');
  }, 'INVALID_INPUT');
  throwsCode('sumber aneh', () => {
    env.sandbox.handleReportAbsensiList_(
      { token: tokenAdmin, ...RANGE, sumber: 'harian' }, 'POST');
  }, 'INVALID_INPUT');
  throwsCode('status aneh', () => {
    env.sandbox.handleReportAbsensiList_(
      { token: tokenAdmin, ...RANGE, status_pegawai: 'cuti' }, 'POST');
  }, 'INVALID_INPUT');
  return true;
});
check('filter status_pegawai aktif/nonaktif bekerja', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-2', aktif: false }, 'POST');
  eq('aktif', env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, status_pegawai: 'aktif' }, 'POST').total, 2);
  eq('nonaktif', env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, status_pegawai: 'nonaktif' }, 'POST').total, 2);
  return true;
});
check('filter gabungan (rentang sempit + pegawai + jenis + mode) konsisten', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiList_({
    token: tokenAdmin, tanggal_dari: '2026-10-05', tanggal_sampai: '2026-10-05',
    id_pegawai: 'PEG-EMP-1', jenis: 'masuk', mode_kerja: 'WFO'
  }, 'POST');
  eq('gabungan', res.total, 1);
  eq('id', res.items[0].id_absensi, 'ABS-R1');
  return true;
});
check('paginasi: limit memotong items, total tetap, offset & has_more benar', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const page1 = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, limit: 2, offset: 0 }, 'POST');
  eq('page1 items', page1.items.length, 2);
  eq('page1 total', page1.total, 4);
  eq('page1 has_more', page1.has_more, true);
  const page2 = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, limit: 2, offset: 2 }, 'POST');
  eq('page2 items', page2.items.length, 2);
  eq('page2 has_more', page2.has_more, false);
  eq('page1 & page2 tidak bertumpuk', page1.items[1].id_absensi !== page2.items[0].id_absensi, true);
  return true;
});
check('limit di atas maksimum di-clamp 200; offset negatif dianggap 0', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, limit: 9999, offset: -5 }, 'POST');
  eq('limit clamp', res.limit, 200);
  eq('offset clamp', res.offset, 0);
  return true;
});
check('daftar TIDAK memuat drive_file_id/URL/PIN/token', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const text = JSON.stringify(res);
  if (/drive_file_id|https?:\/\//i.test(text)) throw new Error('bocor referensi foto');
  if (text.includes(tokenAdmin) || text.includes(tokenEmp)) throw new Error('token bocor');
  if (/pin_hash|pin_salt/.test(text)) throw new Error('PIN bocor');
  return true;
});

/* ================= Rekapitulasi ================= */

console.log('== Rekapitulasi (hitungan fakta) ==');
check('rekap: catatan total/masuk/pulang sesuai jumlah baris', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('total', res.catatan.total, 4);
  eq('masuk', res.catatan.masuk, 3);
  eq('pulang', res.catatan.pulang, 1);
  return true;
});
check('rekap: pulang_tanpa_masuk diturunkan dari catatan aktual', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-REKAP-P1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-16',
    jenis: 'pulang', waktu_server: '2026-10-16T09:00:00.000Z',
    lintang: '', bujur: '', jarak_meter: '', status: '',
    uraian_pekerjaan: 'Pulang saja TEST', output_pekerjaan: 'Dokumen TEST'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-REKAP-M2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-17',
    jenis: 'masuk', waktu_server: '2026-10-17T00:30:00.000Z',
    lintang: '', bujur: '', jarak_meter: '', status: 'TEPAT_WAKTU'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-REKAP-P2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-17',
    jenis: 'pulang', waktu_server: '2026-10-17T10:00:00.000Z',
    lintang: '', bujur: '', jarak_meter: '', status: 'TANPA_ABSEN_MASUK',
    uraian_pekerjaan: 'Pulang normal TEST', output_pekerjaan: 'Dokumen TEST'
  });
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  const d16 = res.harian.find((r) => r.tanggal === '2026-10-16');
  const d17 = res.harian.find((r) => r.tanggal === '2026-10-17');
  eq('pulang tanpa masuk walau sel kosong', d16.pulang_tanpa_masuk, 1);
  eq('pulang dengan masuk valid tidak dihitung', d17.pulang_tanpa_masuk, 0);
  return true;
});
check('rekap: pegawai_unik menghitung identitas unik (bukan catatan, tanpa ganda)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('pegawai unik = 2 (meski 4 catatan)', res.pegawai_unik, 2);
  return true;
});
check('rekap: mode_kerja & sumber terhitung benar', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('WFO', res.mode_kerja.WFO, 3);
  eq('WFH_WFA', res.mode_kerja.WFH_WFA, 1);
  eq('reguler', res.sumber.reguler, 3);
  eq('susulan_disetujui nonaktif', res.sumber.susulan_disetujui, 0);
  return true;
});
check('rekap: susulan dihitung per status berdasar tanggal_absensi dalam rentang', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-R1', id_pegawai: 'PEG-EMP-1', tanggal_absensi: '2026-10-10', status: 'menunggu' });
  seedPengajuan(env, { id_pengajuan: 'PJN-R2', id_pegawai: 'PEG-EMP-2', tanggal_absensi: '2026-10-11', status: 'diterima' });
  seedPengajuan(env, { id_pengajuan: 'PJN-R3', id_pegawai: 'PEG-EMP-1', tanggal_absensi: '2026-10-12', status: 'ditolak' });
  seedPengajuan(env, { id_pengajuan: 'PJN-R4', id_pegawai: 'PEG-EMP-1', tanggal_absensi: '2026-09-01', status: 'menunggu' });
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('susulan total nonaktif', res.susulan.total, 0);
  eq('menunggu nonaktif', res.susulan.menunggu, 0);
  eq('diterima nonaktif', res.susulan.diterima, 0);
  eq('ditolak nonaktif', res.susulan.ditolak, 0);
  return true;
});
check('rekap: pengajuan menunggu TIDAK dihitung sebagai absensi (tetap dihitung terpisah)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-R5', id_pegawai: 'PEG-EMP-1', tanggal_absensi: '2026-10-10', status: 'menunggu' });
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('catatan total 0', res.catatan.total, 0);
  eq('susulan tidak direkap saat nonaktif', res.susulan.menunggu, 0);
  return true;
});
check('rekap konsisten dengan detail: total rekap == total daftar pada filter sama', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  seedPengajuan(env, { id_pengajuan: 'PJN-R6', id_pegawai: 'PEG-EMP-1', tanggal_absensi: '2026-10-10' });
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const rekap = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('total sama', rekap.catatan.total, list.total);
  return true;
});
check('rekap: filter jenis aktif diterapkan konsisten (masuk=total, pulang=0)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_(
    { token: tokenAdmin, ...RANGE, jenis: 'masuk' }, 'POST');
  eq('total', res.catatan.total, 3);
  eq('masuk', res.catatan.masuk, 3);
  eq('pulang', res.catatan.pulang, 0);
  eq('echo filter jenis', res.filter.jenis, 'masuk');
  return true;
});
check('rekap: harian hanya memuat tanggal yang memiliki catatan', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  eq('jumlah tanggal', res.harian.length, 3);
  eq('tanggal pertama', res.harian[0].tanggal, '2026-10-05');
  eq('masuk tgl 5', res.harian[0].catatan_masuk, 1);
  eq('pulang tgl 5', res.harian[0].catatan_pulang, 1);
  eq('tanggal kedua', res.harian[1].tanggal, '2026-10-06');
  eq('tanggal ketiga', res.harian[2].tanggal, '2026-10-20');
  return true;
});
check('rekap TIDAK memuat label kebijakan (terlambat/tidak hadir/persentase)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportRekap_({ token: tokenAdmin, ...RANGE }, 'POST');
  const text = JSON.stringify(res).toLowerCase();
  for (const word of ['terlambat', 'tidak hadir', 'persentase', 'disiplin', 'kehadiran']) {
    if (text.includes(word)) throw new Error('metrik kebijakan muncul: ' + word);
  }
  return true;
});
check('rekap id_pegawai tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleReportRekap_(
      { token: tokenAdmin, ...RANGE, id_pegawai: 'PEG-NOT-EXIST' }, 'POST');
  }, 'NOT_FOUND');
  return true;
});

/* ================= Ekspor CSV ================= */

console.log('== Ekspor CSV ==');
check('ekspor dasar: filename, content_type, BOM, header, jumlah baris', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('filename', res.filename, 'laporan-absensi_2026-10-01_2026-10-31.csv');
  eq('content_type', res.content_type, 'text/csv;charset=utf-8');
  eq('rows', res.rows, 4);
  eq('BOM UTF-8', res.csv.charCodeAt(0), 0xfeff);
  const rows = parseCsv(res.csv);
  eq('baris = header + data', rows.length, 5);
  eq('header', rows[0].join(','), 'id_absensi,tanggal,id_pegawai,nama,nip_nipk,jenis,mode_kerja,waktu_server,sumber,jarak_meter,ada_bukti,status,kondisi_harian,waktu_masuk,waktu_pulang,uraian_pekerjaan,output_pekerjaan,status_masuk,status_pulang');
  eq('baris pertama id', rows[1][0], 'ABS-R1');
  return true;
});
check('CSV status_masuk/status_pulang sama dengan daftar laporan', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const list = env.sandbox.handleReportAbsensiList_({ token: tokenAdmin, ...RANGE }, 'POST');
  const res = env.sandbox.handleReportAbsensiExportCsv_({ token: tokenAdmin, ...RANGE }, 'POST');
  const rows = parseCsv(res.csv);
  const byId = {};
  for (let i = 1; i < rows.length; i++) byId[rows[i][0]] = rows[i];
  list.items.forEach((item) => {
    eq('status masuk CSV ' + item.id_absensi, byId[item.id_absensi][17], item.status_masuk);
    eq('status pulang CSV ' + item.id_absensi, byId[item.id_absensi][18], item.status_pulang);
  });
  return true;
});
check('CSV memuat status masuk/pulang yang konsisten untuk pulang tanpa masuk', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-CSV-ONLY-PULANG', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-15', jenis: 'pulang',
    waktu_server: '2026-10-15T10:00:00.000Z', status: 'TEPAT_WAKTU'
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  const rows = parseCsv(res.csv);
  eq('status masuk CSV', rows[1][17], 'TANPA_ABSEN_MASUK');
  eq('status pulang CSV', rows[1][18], 'SUDAH_ABSEN_PULANG');
  return true;
});
check('ekspor tanpa paginasi: seluruh baris terfilter ikut (kelengkapan lintas halaman)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const page = env.sandbox.handleReportAbsensiList_(
    { token: tokenAdmin, ...RANGE, limit: 2 }, 'POST');
  eq('halaman hanya 2', page.items.length, 2);
  const exp = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, ...RANGE, limit: 2 }, 'POST');
  eq('ekspor tetap semua (limit diabaikan)', exp.rows, 4);
  const rows = parseCsv(exp.csv);
  eq('baris csv', rows.length, 5);
  return true;
});
check('ekspor mengikuti filter yang sama dengan daftar (konsistensi)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const exp = env.sandbox.handleReportAbsensiExportCsv_({
    token: tokenAdmin, ...RANGE, id_pegawai: 'PEG-EMP-1', jenis: 'masuk'
  }, 'POST');
  eq('rows', exp.rows, 1);
  const rows = parseCsv(exp.csv);
  eq('id', rows[1][0], 'ABS-R1');
  return true;
});
check('ekspor data kosong → hanya BOM + header (bukan error)', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleReportAbsensiExportCsv_({
    token: tokenAdmin, tanggal_dari: '2025-01-01', tanggal_sampai: '2025-01-31'
  }, 'POST');
  eq('rows', res.rows, 0);
  const rows = parseCsv(res.csv);
  eq('hanya header', rows.length, 1);
  return true;
});
check('karakter khusus (koma, kutip, baris baru) di-quote RFC 4180 & round-trip utuh', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.appendObject_('Pegawai', {
    id_pegawai: 'PEG-KHUSUS', nama: 'Doe, "John"\nJr.', nip_nipk: '9000000000000001',
    jabatan: '', unit_kerja: '', status_aktif: true,
    dibuat_pada: '2026-10-01T00:00:00.000Z', dibuat_oleh: 'test',
    diubah_pada: '2026-10-01T00:00:00.000Z', diubah_oleh: 'test'
  });
  seedAbsensi(env, { id_absensi: 'ABS-KHUSUS', id_pegawai: 'PEG-KHUSUS', tanggal: '2026-10-08' });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-08', tanggal_sampai: '2026-10-08' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('nama round-trip', rows[1][3], 'Doe, "John"\nJr.');
  eq('jumlah kolom tetap', rows[1].length, 19);
  return true;
});
check('pencegahan formula injection: nilai berawalan = + - @ diapostrofi', () => {
  const { env, tokenAdmin } = envAdmin();
  const kasus = [
    ['PEG-F1', '=SUM(A1:A9)'],
    ['PEG-F2', '+1234'],
    ['PEG-F3', '-totally-safe'],
    ['PEG-F4', '@import'],
    ['PEG-F5', 'normal name']
  ];
  for (const [id, nama] of kasus) {
    env.sandbox.appendObject_('Pegawai', {
      id_pegawai: id, nama, nip_nipk: '9' + id.slice(-1) + '00000000000000',
      jabatan: '', unit_kerja: '', status_aktif: true,
      dibuat_pada: '2026-10-01T00:00:00.000Z', dibuat_oleh: 'test',
      diubah_pada: '2026-10-01T00:00:00.000Z', diubah_oleh: 'test'
    });
    seedAbsensi(env, { id_absensi: 'ABS-' + id, id_pegawai: id, tanggal: '2026-10-09' });
  }
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-09', tanggal_sampai: '2026-10-09' }, 'POST');
  const rows = parseCsv(res.csv);
  const namaById = {};
  for (let i = 1; i < rows.length; i++) namaById[rows[i][2]] = rows[i][3];
  eq('guard =', namaById['PEG-F1'], "'=SUM(A1:A9)");
  eq('guard +', namaById['PEG-F2'], "'+1234");
  eq('guard -', namaById['PEG-F3'], "'-totally-safe");
  eq('guard @', namaById['PEG-F4'], "'@import");
  eq('nama biasa tanpa guard', namaById['PEG-F5'], 'normal name');
  return true;
});
check('guard formula HANYA di ekspor — data sumber tidak diubah', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.appendObject_('Pegawai', {
    id_pegawai: 'PEG-SRC', nama: '=RX', nip_nipk: '9111111111111111',
    jabatan: '', unit_kerja: '', status_aktif: true,
    dibuat_pada: '2026-10-01T00:00:00.000Z', dibuat_oleh: 'test',
    diubah_pada: '2026-10-01T00:00:00.000Z', diubah_oleh: 'test'
  });
  seedAbsensi(env, { id_absensi: 'ABS-SRC', id_pegawai: 'PEG-SRC', tanggal: '2026-10-09' });
  env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-09', tanggal_sampai: '2026-10-09' }, 'POST');
  const pegawai = env.sandbox.findPegawaiById_('PEG-SRC');
  eq('nama sumber tetap =RX', String(pegawai.nama), '=RX');
  return true;
});
check('nilai kosong tetap kolom kosong (jarak_meter null tidak menggeser kolom)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-KOSONG', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-07',
    jarak_meter: '', id_bukti: ''
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-07', tanggal_sampai: '2026-10-07' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('jumlah kolom', rows[1].length, 19);
  eq('jarak kosong', rows[1][9], '');
  eq('ada_bukti tidak', rows[1][10], 'tidak');
  return true;
});
check('karakter non-ASCII (UTF-8) lolos utuh', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.appendObject_('Pegawai', {
    id_pegawai: 'PEG-UNI', nama: 'Siti Øra — ÇİĞDEM', nip_nipk: '9222222222222222',
    jabatan: '', unit_kerja: '', status_aktif: true,
    dibuat_pada: '2026-10-01T00:00:00.000Z', dibuat_oleh: 'test',
    diubah_pada: '2026-10-01T00:00:00.000Z', diubah_oleh: 'test'
  });
  seedAbsensi(env, { id_absensi: 'ABS-UNI', id_pegawai: 'PEG-UNI', tanggal: '2026-10-09' });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-09', tanggal_sampai: '2026-10-09' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('nama non-ASCII', rows[1][3], 'Siti Øra — ÇİĞDEM');
  return true;
});
check('ekspor TIDAK memuat drive_file_id/URL/PIN/token ( kolom dibatasi daftar tetap)', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  seedLaporanDasar(env);
  // Sisipkan baris absensi yang menunjuk bukti dengan file id rahasia.
  env.sandbox.appendObject_('BuktiAbsensi', {
    id_bukti: 'BKT-RAHASIA', id_absensi: 'ABS-R1',
    drive_file_id: 'DRV-ID-RAHASIA-TEST',
    path: 'ABSENSI_KPU/2026/10/Foto_Masuk/', mime: 'image/jpeg',
    ukuran: 1234, dibuat_pada: '2026-10-05T00:30:00.000Z'
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  if (res.csv.includes('DRV-ID-RAHASIA')) throw new Error('drive_file_id bocor');
  if (/https?:\/\//i.test(res.csv)) throw new Error('URL bocor');
  if (res.csv.includes(tokenAdmin) || res.csv.includes(tokenEmp)) throw new Error('token bocor');
  if (/pin_hash|pin_salt/.test(res.csv)) throw new Error('PIN bocor');
  return true;
});
check('kelebihan baris ( > 5000 ) → EXPORT_TOO_LARGE, bukan potong diam-diam', () => {
  const { env, tokenAdmin } = envAdmin();
  for (let i = 0; i < 5001; i++) {
    seedAbsensi(env, {
      id_absensi: 'ABS-BULK-' + i, id_pegawai: 'PEG-EMP-1',
      tanggal: '2026-10-15', denganBukti: false, id_bukti: ''
    });
  }
  throwsCode('EXPORT_TOO_LARGE', () => {
    env.sandbox.handleReportAbsensiExportCsv_(
      { token: tokenAdmin, ...RANGE }, 'POST');
  }, 'EXPORT_TOO_LARGE');
  return true;
});
check('ekspor tercatat di log (report_exported) tanpa token/PIN', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  seedLaporanDasar(env);
  env.sandbox.handleReportAbsensiExportCsv_({ token: tokenAdmin, ...RANGE }, 'POST');
  const logs = env.sandbox.readObjects_('LogAktivitas');
  const found = logs.find((l) => String(l.aksi) === 'report_exported');
  if (!found) throw new Error('log tidak ada');
  const detail = String(found.detail);
  if (!detail.includes('2026-10-01..2026-10-31')) throw new Error('detail rentang tidak ada');
  if (String(found.detail).includes(tokenAdmin) || String(found.detail).includes(tokenEmp)) {
    throw new Error('token bocor di log');
  }
  return true;
});
check('ekspor parameter tidak valid → INVALID_INPUT (bukan crash)', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleReportAbsensiExportCsv_({
      token: tokenAdmin, tanggal_dari: '2026-13-45', tanggal_sampai: '2026-10-31'
    }, 'POST');
  }, 'INVALID_INPUT');
  return true;
});

/* ================= Kegagalan sistem ================= */

console.log('== Kegagalan sistem ==');
check('SPREADSHEET_ID tidak dikonfigurasi → NOT_CONFIGURED (bukan ok/kosong)', () => {
  const env = createEnv({ props: {} });
  throwsCode('NOT_CONFIGURED', () => {
    env.sandbox.route_('report.absensi.list', {
      token: 'token-apapun', ...RANGE
    }, 'POST');
  }, 'NOT_CONFIGURED');
  return true;
});
check('sheet Absensi tidak ada (initializeSheets belum jalan) → NOT_CONFIGURED', () => {
  const env = createEnv({ props: { SPREADSHEET_ID: 'TEST_SS_ID' } });
  throwsCode('NOT_CONFIGURED', () => {
    env.sandbox.route_('report.rekap', {
      token: 'token-apapun', ...RANGE
    }, 'POST');
  }, 'NOT_CONFIGURED');
  return true;
});
check('router doPost: ekspor mengembalikan JSON ok + field csv', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const out = env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'report.absensi.exportCsv', token: tokenAdmin, data: { ...RANGE }
      })
    }
  });
  const parsed = JSON.parse(out.getContent());
  eq('ok', parsed.ok, true);
  if (typeof parsed.csv !== 'string' || !parsed.csv.length) throw new Error('csv kosong');
  return true;
});
check('router doPost: report.absensi.list tanpa token → JSON UNAUTHORIZED', () => {
  const { env } = envAdmin();
  const out = env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'report.absensi.list', data: { ...RANGE }
      })
    }
  });
  const parsed = JSON.parse(out.getContent());
  eq('error', parsed.error, 'UNAUTHORIZED');
  return true;
});

/* ================= Ekspor CSV: zona waktu WIB ================= */

console.log('== Ekspor CSV: zona waktu WIB ==');
check('CSV: ISO UTC → tanggal/jam WIB (tanpa pergeseran tanggal bisnis)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedLaporanDasar(env);
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  const rows = parseCsv(res.csv);
  const byId = {};
  for (let i = 1; i < rows.length; i++) byId[rows[i][0]] = rows[i];
  eq('tanggal bisnis ABS-R1', byId['ABS-R1'][1], '05/10/2026');
  eq('waktu server ABS-R1 (00:30Z → 07:30 WIB)', byId['ABS-R1'][7], '05/10/2026 07:30:00 WIB');
  eq('waktu server ABS-R2 (10:00Z → 17:00 WIB)', byId['ABS-R2'][7], '05/10/2026 17:00:00 WIB');
  eq('waktu masuk turunan', byId['ABS-R1'][13], '05/10/2026 07:30:00 WIB');
  eq('waktu pulang turunan', byId['ABS-R1'][14], '05/10/2026 17:00:00 WIB');
  return true;
});
check('CSV: konversi melewati tengah malam mengubah tanggal tampilan', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-MIDNIGHT', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-29', jenis: 'masuk',
    waktu_server: '2026-10-28T17:30:00.000Z'
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-29', tanggal_sampai: '2026-10-29' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('tanggal bisnis WIB', rows[1][1], '29/10/2026');
  eq('jam WIB berganti hari', rows[1][7], '29/10/2026 00:30:00 WIB');
  return true;
});
check('CSV: tidak menambah 7 jam dua kali', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-NODOUBLE', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-28', jenis: 'masuk',
    waktu_server: '2026-10-28T03:00:00.000Z'
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-28', tanggal_sampai: '2026-10-28' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('03:00Z → 10:00 WIB', rows[1][7], '28/10/2026 10:00:00 WIB');
  return true;
});
check('CSV: waktu kosong tetap kosong; data sumber tidak diubah', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, {
    id_absensi: 'ABS-EMPTY-WAKTU', id_pegawai: 'PEG-EMP-1',
    tanggal: '2026-10-30', jenis: 'masuk',
    waktu_server: '2026-10-30T09:00:00.000Z'
  });
  const res = env.sandbox.handleReportAbsensiExportCsv_(
    { token: tokenAdmin, tanggal_dari: '2026-10-30', tanggal_sampai: '2026-10-30' }, 'POST');
  const rows = parseCsv(res.csv);
  eq('waktu pulang turunan kosong', rows[1][14], '');
  const sumber = env.sandbox.findAbsensiById_('ABS-EMPTY-WAKTU');
  eq('waktu_server sumber tetap ISO UTC', String(sumber.waktu_server), '2026-10-30T09:00:00.000Z');
  return true;
});

console.log('\n== Rekap bulanan & jam efektif ==');
check('jam efektif bulanan: mulai 08:00 sebelum batas, mulai aktual sesudah batas, maksimum 7,5 jam; hari parsial belum terpenuhi', () => {
  const { env, tokenAdmin } = envAdmin();
  const rows = [
    ['2026-10-01', 'masuk', '2026-10-01T00:30:00.000Z'], // 07:30 WIB
    ['2026-10-01', 'pulang', '2026-10-01T09:00:00.000Z'], // 16:00 WIB => capped 7.5h
    ['2026-10-02', 'masuk', '2026-10-02T01:30:00.000Z'], // 08:30 WIB
    ['2026-10-02', 'pulang', '2026-10-02T09:00:00.000Z'], // 16:00 WIB => 7.5h
    ['2026-10-03', 'masuk', '2026-10-03T02:00:00.000Z'], // 09:00 WIB
    ['2026-10-03', 'pulang', '2026-10-03T09:00:00.000Z'], // 16:00 WIB => 7h
    ['2026-10-04', 'masuk', '2026-10-04T00:30:00.000Z'], // no out
    ['2026-10-05', 'pulang', '2026-10-05T09:00:00.000Z']  // no in
  ];
  rows.forEach((r, i) => seedAbsensi(env, {
    id_absensi: 'ABS-EFF-' + i, id_pegawai: 'PEG-EMP-1', tanggal: r[0],
    jenis: r[1], waktu_server: r[2], mode_kerja: i % 2 ? 'WFH_WFA' : 'WFO',
    status: r[1] === 'masuk' ? 'TEPAT_WAKTU' : 'SUDAH_ABSEN_PULANG'
  }));
  const res = env.sandbox.handleReportMonthlyRecap_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  const pegawai = res.pegawai.find((p) => p.id_pegawai === 'PEG-EMP-1');
  eq('total jam efektif dalam detik', pegawai.jam_efektif_detik, 22 * 3600);
  eq('hari terpenuhi', pegawai.hari_terpenuhi_75, 2);
  eq('hari belum terpenuhi termasuk pasangan tidak lengkap', pegawai.hari_belum_terpenuhi_75, 3);
  return true;
});
check('jam efektif: tanggal tanpa catatan tidak dihitung sebagai belum terpenuhi', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleReportMonthlyRecap_(
    { token: tokenAdmin, ...RANGE }, 'POST');
  const pegawai = res.pegawai.find((p) => p.id_pegawai === 'PEG-EMP-1');
  eq('durasi tanpa catatan', pegawai.jam_efektif_detik, 0);
  eq('hari terpenuhi tanpa catatan', pegawai.hari_terpenuhi_75, 0);
  eq('hari belum tanpa catatan', pegawai.hari_belum_terpenuhi_75, 0);
  return true;
});

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

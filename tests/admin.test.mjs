/*
 * Pengujian panel admin — PHASE 4.
 * Jalankan: node tests/admin.test.mjs
 *
 * Mencakup: otorisasi seluruh endpoint admin (wajib peran admin di backend),
 * pengelolaan pegawai (daftar/detail/tambah/edit/aktif-nonaktif), daftar/detail
 * absensi (tanpa ID/URL akses foto), persetujuan/penolakan susulan, dan log audit.
 * Data uji SINTETIS berlabel TEST — bukan data produksi (lihat AMB-29).
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

function envAdmin() {
  const env = createEnv({ props: {} });
  const admin = seedAccount(env.sandbox, env.props, {
    nip: ADMIN_NIP, pin: '135790', iterations: 1000,
    idPegawai: 'PEG-ADM-1', idAkun: 'AKN-ADM-1',
    nama: 'Admin Uji TEST', peran: 'admin'
  });
  const emp = seedAccount(env.sandbox, env.props, {
    nip: EMP_NIP, pin: '246810', iterations: 1000,
    idPegawai: 'PEG-EMP-1', idAkun: 'AKN-EMP-1',
    nama: 'Pegawai Uji TEST'
  });
  const emp2 = seedAccount(env.sandbox, env.props, {
    nip: EMP2_NIP, pin: '112233', iterations: 1000,
    idPegawai: 'PEG-EMP-2', idAkun: 'AKN-EMP-2',
    nama: 'Pegawai Dua TEST'
  });
  const tokenAdmin = env.sandbox
    .handleLogin_({ nip: ADMIN_NIP, pin: '135790' }, 'POST').token;
  const tokenEmp = env.sandbox
    .handleLogin_({ nip: EMP_NIP, pin: '246810' }, 'POST').token;
  return { env, admin, emp, emp2, tokenAdmin, tokenEmp };
}

function seedAbsensi(env, opts) {
  const waktu = opts.waktu_server || '2026-10-15T01:00:00.000Z';
  if (opts.denganBukti !== false) {
    env.sandbox.appendObject_('BuktiAbsensi', {
      id_bukti: opts.idBukti || 'BKT-TEST-1',
      id_absensi: opts.id_absensi,
      drive_file_id: opts.drive_file_id || 'DRV-ID-RAHASIA-TEST',
      path: 'ABSENSI_KPU/2026/10_Oktober/15/Pegawai_Uji_PEG-EMP-1/Absen_Masuk.jpg',
      mime: 'image/jpeg',
      ukuran: 12345,
      dibuat_pada: waktu
    });
  }
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
    id_bukti: opts.denganBukti === false ? '' : (opts.idBukti || 'BKT-TEST-1'),
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
    bukti_file_id: opts.bukti_file_id === undefined ? 'DRV-SUSULAN-TEST' : opts.bukti_file_id,
    status: opts.status || 'menunggu',
    id_admin: opts.id_admin || '',
    waktu_keputusan: opts.waktu_keputusan || '',
    catatan_keputusan: opts.catatan_keputusan || '',
    diubah_pada: ''
  });
}

const ADMIN_ACTIONS = [
  'admin.pegawai.list',
  'admin.pegawai.detail',
  'admin.pegawai.create',
  'admin.pegawai.update',
  'admin.pegawai.setActive',
  'admin.absensi.list',
  'admin.absensi.detail',
  'admin.log.list'
];

/* ================= Otorisasi ================= */

console.log('== Otorisasi endpoint admin (backend) ==');
ADMIN_ACTIONS.forEach((action) => {
  throwsCode(action + ' tanpa token → UNAUTHORIZED', () => {
    const { env } = envAdmin();
    env.sandbox.route_(action, {}, 'POST');
  }, 'UNAUTHORIZED');
});
ADMIN_ACTIONS.forEach((action) => {
  throwsCode(action + ' token pegawai → FORBIDDEN', () => {
    const { env, tokenEmp } = envAdmin();
    env.sandbox.route_(action, { token: tokenEmp }, 'POST');
  }, 'FORBIDDEN');
});
check('peran palsu di body diabaikan (token pegawai + peran admin → tetap FORBIDDEN)', () => {
  const { env, tokenEmp } = envAdmin();
  throwsCode('FORBIDDEN', () => {
    env.sandbox.route_('admin.pegawai.list', { token: tokenEmp, peran: 'admin' }, 'POST');
  }, 'FORBIDDEN');
  return true;
});
ADMIN_ACTIONS.forEach((action) => {
  throwsCode(action + ' metode GET → METHOD_NOT_ALLOWED', () => {
    const { env, tokenAdmin } = envAdmin();
    env.sandbox.route_(action, { token: tokenAdmin }, 'GET');
  }, 'METHOD_NOT_ALLOWED');
});
check('semua aksi admin terhubung di route_ (bukan UNKNOWN_ACTION)', () => {
  const { env, tokenAdmin } = envAdmin();
  for (const action of ADMIN_ACTIONS) {
    try {
      env.sandbox.route_(action, { token: tokenAdmin, limit: 1 }, 'POST');
    } catch (err) {
      // INVALID_INPUT dsb. berarti handler terhubung; yang dilarang UNKNOWN_ACTION.
      if (err && err.code === 'UNKNOWN_ACTION') throw new Error(action + ' tidak terhubung');
    }
  }
  return true;
});

/* ================= Pegawai: daftar & detail ================= */

console.log('== Pegawai: daftar & detail ==');
check('admin.pegawai.list mengembalikan 3 pegawai awal', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiList_({ token: tokenAdmin }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('total', res.total, 3);
  return true;
});
check('daftar pegawai TIDAK memuat pin_hash/pin_salt/URL', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiList_({ token: tokenAdmin }, 'POST');
  const text = JSON.stringify(res);
  if (/pin_hash|pin_salt|https?:\/\//i.test(text)) throw new Error('bocor field rahasia');
  return true;
});
check('filter status aktif/nonaktif bekerja', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-2', aktif: false }, 'POST');
  const aktif = env.sandbox.handleAdminPegawaiList_(
    { token: tokenAdmin, status: 'aktif' }, 'POST');
  eq('aktif=2', aktif.total, 2);
  const nonaktif = env.sandbox.handleAdminPegawaiList_(
    { token: tokenAdmin, status: 'nonaktif' }, 'POST');
  eq('nonaktif=1', nonaktif.total, 1);
  return true;
});
check('pencarian q bekerja (nama)', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiList_(
    { token: tokenAdmin, q: 'Pegawai Dua' }, 'POST');
  eq('q total', res.total, 1);
  eq('q id', res.items[0].id_pegawai, 'PEG-EMP-2');
});
check('filter status tidak valid → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminPegawaiList_({ token: tokenAdmin, status: 'aneh' }, 'POST');
  }, 'INVALID_INPUT');
});
check('limit membatasi jumlah item tetapi total tetap', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiList_({ token: tokenAdmin, limit: 1 }, 'POST');
  eq('items', res.items.length, 1);
  eq('total', res.total, 3);
});
check('admin.pegawai.detail mengembalikan pegawai + info akun tanpa rahasia', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiDetail_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1' }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('nama', res.pegawai.nama, 'Pegawai Uji TEST');
  eq('peran akun', res.akun.peran, 'pegawai');
  eq('ada_pin', res.akun.ada_pin, true);
  const text = JSON.stringify(res);
  if (/pin_hash|pin_salt|https?:\/\//i.test(text)) throw new Error('bocor field rahasia');
  return true;
});
check('admin.pegawai.detail pegawai tanpa akun → akun null', () => {
  const { env, tokenAdmin, admin } = envAdmin();
  env.sandbox.appendObject_('Pegawai', {
    id_pegawai: 'PEG-TEST-TANPA-AKUN', nama: 'Tanpa Akun TEST', nip_nipk: '0001112223334445',
    jabatan: '', unit_kerja: '', status_aktif: true,
    dibuat_pada: '2026-10-15T00:00:00.000Z', dibuat_oleh: 'test',
    diubah_pada: '2026-10-15T00:00:00.000Z', diubah_oleh: 'test'
  });
  const res = env.sandbox.handleAdminPegawaiDetail_(
    { token: tokenAdmin, id_pegawai: 'PEG-TEST-TANPA-AKUN' }, 'POST');
  eq('akun null', res.akun, null);
  return true;
});
check('detail tanpa id_pegawai → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminPegawaiDetail_({ token: tokenAdmin }, 'POST');
  }, 'INVALID_INPUT');
});
check('detail pegawai tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminPegawaiDetail_(
      { token: tokenAdmin, id_pegawai: 'PEG-NOT-EXIST' }, 'POST');
  }, 'NOT_FOUND');
});

/* ================= Pegawai: tambah & edit ================= */

console.log('== Pegawai: tambah & edit ==');
check('tambah pegawai sukses (kolom DATA_DICTIONARY §1 + metadata admin)', () => {
  const { env, tokenAdmin, admin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiCreate_({
    token: tokenAdmin, nama: 'Pegawai Baru TEST', nip_nipk: '7777888899990000',
    jabatan: 'Staf TEST', unit_kerja: 'Unit TEST'
  }, 'POST');
  if (!res.ok) throw new Error('gagal');
  const row = env.sandbox.findPegawaiById_(res.id_pegawai);
  if (!row) throw new Error('baris tidak ada');
  eq('dibuat_oleh = id_akun admin', String(row.dibuat_oleh), String(admin.akun.id_akun));
  eq('jabatan', String(row.jabatan), 'Staf TEST');
  eq('unit_kerja', String(row.unit_kerja), 'Unit TEST');
  eq('status_aktif default', String(row.status_aktif), 'true');
  return true;
});
check('tambah pegawai tanpa nama/NIP → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminPegawaiCreate_({ token: tokenAdmin, nama: '', nip_nipk: '' }, 'POST');
  }, 'INVALID_INPUT');
});
check('tambah pegawai NIP duplikat → DUPLICATE', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('DUPLICATE', () => {
    env.sandbox.handleAdminPegawaiCreate_({
      token: tokenAdmin, nama: 'Duplikat TEST', nip_nipk: EMP_NIP
    }, 'POST');
  }, 'DUPLICATE');
});
check('tambah pegawai tercatat di log (pegawai_created)', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiCreate_({
    token: tokenAdmin, nama: 'Log Uji TEST', nip_nipk: '3333444455556666'
  }, 'POST');
  const logs = env.sandbox.readObjects_('LogAktivitas');
  // Konvensi log: target = jenis objek, detail = ID (sama seperti AuthService).
  const found = logs.find((l) => String(l.aksi) === 'pegawai_created' &&
    String(l.detail) === String(res.id_pegawai));
  if (!found) throw new Error('log tidak ada');
  return true;
});
check('edit pegawai (nama/jabatan/unit) → berubah + diubah_oleh admin', () => {
  const { env, tokenAdmin, admin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiUpdate_({
    token: tokenAdmin, id_pegawai: 'PEG-EMP-1',
    nama: 'Pegawai Diubah TEST', jabatan: 'Kasi TEST', unit_kerja: 'Bagian TEST'
  }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('changed ada 3', res.changed.length, 3);
  const row = env.sandbox.findPegawaiById_('PEG-EMP-1');
  eq('nama baru', String(row.nama), 'Pegawai Diubah TEST');
  eq('diubah_oleh', String(row.diubah_oleh), String(admin.akun.id_akun));
  return true;
});
check('edit NIP menjadi milik pegawai lain → DUPLICATE', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('DUPLICATE', () => {
    env.sandbox.handleAdminPegawaiUpdate_({
      token: tokenAdmin, id_pegawai: 'PEG-EMP-1', nip_nipk: EMP2_NIP
    }, 'POST');
  }, 'DUPLICATE');
});
check('edit NIP sendiri (tanpa perubahan) tidak dianggap duplikat', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminPegawaiUpdate_({
    token: tokenAdmin, id_pegawai: 'PEG-EMP-1', nip_nipk: EMP_NIP
  }, 'POST');
  if (!res.ok) throw new Error('gagal: ' + res.error);
  eq('tidak ada perubahan', res.changed.length, 0);
  return true;
});
check('edit tanpa field yang dikirim → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminPegawaiUpdate_({ token: tokenAdmin, id_pegawai: 'PEG-EMP-1' }, 'POST');
  }, 'INVALID_INPUT');
});
check('edit pegawai tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminPegawaiUpdate_({
      token: tokenAdmin, id_pegawai: 'PEG-NOT-EXIST', nama: 'X'
    }, 'POST');
  }, 'NOT_FOUND');
});

/* ================= Pegawai: aktif/nonaktif ================= */

console.log('== Pegawai: aktif/nonaktif ==');
check('nonaktifkan pegawai → status false + sesi dicabut + riwayat absensi tetap', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1', aktif: false }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('status_aktif', res.status_aktif, false);
  throwsCode('sesi pegawai dicabut → UNAUTHORIZED', () => {
    env.sandbox.handleSessionCheck_({ token: tokenEmp }, 'POST');
  }, 'UNAUTHORIZED');
  eq('riwayat absensi tidak dihapus', env.sandbox.readObjects_('Absensi').length, 1);
  return true;
});
check('pegawai dinonaktifkan → login ditolak (AUTH_FAILED, tanpa detail)', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1', aktif: false }, 'POST');
  const res = env.sandbox.handleLogin_({ nip: EMP_NIP, pin: '246810' }, 'POST');
  eq('ok', res.ok, false);
  eq('error', res.error, 'AUTH_FAILED');
  return true;
});
check('aktifkan kembali pegawai → status true', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1', aktif: false }, 'POST');
  const res = env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1', aktif: true }, 'POST');
  eq('aktif lagi', res.status_aktif, true);
  const login = env.sandbox.handleLogin_({ nip: EMP_NIP, pin: '246810' }, 'POST');
  if (!login.ok) throw new Error('login seharusnya bisa lagi');
  return true;
});
check('log pegawai_deactivated tercatat', () => {
  const { env, tokenAdmin } = envAdmin();
  env.sandbox.handleAdminPegawaiSetActive_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-1', aktif: false }, 'POST');
  const logs = env.sandbox.readObjects_('LogAktivitas');
  const found = logs.find((l) => String(l.aksi) === 'pegawai_deactivated');
  if (!found) throw new Error('log tidak ada');
  return true;
});
check('nonaktifkan pegawai tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminPegawaiSetActive_(
      { token: tokenAdmin, id_pegawai: 'PEG-NOT-EXIST', aktif: false }, 'POST');
  }, 'NOT_FOUND');
});

/* ================= Absensi: daftar & detail ================= */

console.log('== Absensi: daftar & detail ==');
check('admin.absensi.list (tanpa filter) + join nama pegawai', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminAbsensiList_({ token: tokenAdmin }, 'POST');
  eq('total', res.total, 1);
  eq('nama ter-join', res.items[0].nama, 'Pegawai Uji TEST');
  eq('ada_bukti', res.items[0].ada_bukti, true);
  return true;
});
check('daftar absensi TIDAK memuat drive_file_id / URL', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminAbsensiList_({ token: tokenAdmin }, 'POST');
  const text = JSON.stringify(res);
  if (/drive_file_id|DRV-ID-RAHASIA|https?:\/\//i.test(text)) throw new Error('bocor referensi foto');
  return true;
});
check('filter tanggal & jenis bekerja', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-15', jenis: 'masuk' });
  seedAbsensi(env, {
    id_absensi: 'ABS-TEST-2', id_pegawai: 'PEG-EMP-1', tanggal: '2026-10-15', jenis: 'pulang',
    idBukti: 'BKT-TEST-2'
  });
  seedAbsensi(env, {
    id_absensi: 'ABS-TEST-3', id_pegawai: 'PEG-EMP-2', tanggal: '2026-10-16', jenis: 'masuk',
    idBukti: 'BKT-TEST-3'
  });
  eq('filter tanggal', env.sandbox.handleAdminAbsensiList_(
    { token: tokenAdmin, tanggal: '2026-10-15' }, 'POST').total, 2);
  eq('filter jenis', env.sandbox.handleAdminAbsensiList_(
    { token: tokenAdmin, jenis: 'pulang' }, 'POST').total, 1);
  eq('filter id_pegawai', env.sandbox.handleAdminAbsensiList_(
    { token: tokenAdmin, id_pegawai: 'PEG-EMP-2' }, 'POST').total, 1);
  return true;
});
check('filter tanggal salah format → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminAbsensiList_({ token: tokenAdmin, tanggal: '15/10/2026' }, 'POST');
  }, 'INVALID_INPUT');
});
check('filter jenis salah → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminAbsensiList_({ token: tokenAdmin, jenis: 'istirahat' }, 'POST');
  }, 'INVALID_INPUT');
});
check('admin.absensi.detail: field lengkap + metadata bukti TANPA drive_file_id', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminAbsensiDetail_(
    { token: tokenAdmin, id_absensi: 'ABS-TEST-1' }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('bukti.ada', res.bukti.ada, true);
  eq('bukti.mime', res.bukti.mime, 'image/jpeg');
  eq('bukti.ukuran', res.bukti.ukuran, 12345);
  eq('pegawainama', res.pegawai.nama, 'Pegawai Uji TEST');
  eq('jarak_meter', String(res.absensi.jarak_meter), '10.5');
  const text = JSON.stringify(res);
  if (/drive_file_id|DRV-ID-RAHASIA|https?:\/\//i.test(text)) throw new Error('bocor referensi foto');
  return true;
});
check('detail absensi tanpa bukti → bukti.ada false', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-NOBUKTI', id_pegawai: 'PEG-EMP-1', denganBukti: false });
  const res = env.sandbox.handleAdminAbsensiDetail_(
    { token: tokenAdmin, id_absensi: 'ABS-NOBUKTI' }, 'POST');
  eq('ada', res.bukti.ada, false);
  return true;
});
check('detail absensi: metadata bukti memakai struktur folder DEC-P29', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminAbsensiDetail_(
    { token: tokenAdmin, id_absensi: 'ABS-TEST-1' }, 'POST');
  const path = String(res.bukti.path || '');
  if (path.indexOf('ABSENSI_KPU/2026/10_Oktober/15/') !== 0) throw new Error('path ' + path);
  if (path.indexOf('/Absen_Masuk.jpg') === -1) throw new Error('nama file ' + path);
  return true;
});
check('foto absensi diambil lewat id_bukti (terikat catatan absensi)', () => {
  const { env, tokenAdmin } = envAdmin();
  const fileId = seedDrivePhoto(env, [0xff, 0xd8, 0xff, 1, 2, 3]);
  seedAbsensi(env, { id_absensi: 'ABS-TIE-1', id_pegawai: 'PEG-EMP-1', drive_file_id: fileId });
  const photo = env.sandbox.handleAdminAbsensiPhoto_(
    { token: tokenAdmin, id_absensi: 'ABS-TIE-1' }, 'POST');
  eq('mime', photo.mime, 'image/jpeg');
  eq('ukuran', photo.ukuran, 6);
  return true;
});
check('detail absensi tak ada → NOT_FOUND; tanpa id → INVALID_INPUT', () => {
  const { env, tokenAdmin } = envAdmin();
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminAbsensiDetail_(
      { token: tokenAdmin, id_absensi: 'ABS-NOT-EXIST' }, 'POST');
  }, 'NOT_FOUND');
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminAbsensiDetail_({ token: tokenAdmin }, 'POST');
  }, 'INVALID_INPUT');
  return true;
});

/* ================= Susulan ================= */

console.log('== Absensi susulan: daftar, detail, putuskan ==');
check('admin.susulan.list + filter status', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-1', id_pegawai: 'PEG-EMP-1' });
  seedPengajuan(env, {
    id_pengajuan: 'PJN-TEST-2', id_pegawai: 'PEG-EMP-2',
    status: 'diterima', id_admin: 'AKN-ADM-1',
    waktu_keputusan: '2026-10-15T04:00:00.000Z', catatan_keputusan: 'OK TEST'
  });
  const semua = env.sandbox.handleAdminSusulanList_({ token: tokenAdmin }, 'POST');
  eq('semua', semua.total, 2);
  eq('nama ter-join', semua.items[0].nama.length > 0 || semua.items[1].nama.length > 0, true);
  const menunggu = env.sandbox.handleAdminSusulanList_(
    { token: tokenAdmin, status: 'menunggu' }, 'POST');
  eq('menunggu', menunggu.total, 1);
  eq('filter tidak valid → INVALID_INPUT', (() => {
    try {
      env.sandbox.handleAdminSusulanList_({ token: tokenAdmin, status: 'nonsense' }, 'POST');
      return 'tidak gagal';
    } catch (e) { return e.code; }
  })(), 'INVALID_INPUT');
  return true;
});
check('admin.susulan.detail: lengkap + ada_bukti', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminSusulanDetail_(
    { token: tokenAdmin, id_pengajuan: 'PJN-TEST-1' }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('alasan', res.pengajuan.alasan, 'Lupa absen TEST');
  eq('ada_bukti', res.ada_bukti, true);
  eq('status', res.pengajuan.status, 'menunggu');
  return true;
});
check('detail susulan tanpa bukti → ada_bukti false; tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-NObukti', id_pegawai: 'PEG-EMP-1', bukti_file_id: '' });
  const res = env.sandbox.handleAdminSusulanDetail_(
    { token: tokenAdmin, id_pengajuan: 'PJN-TEST-NObukti' }, 'POST');
  eq('ada_bukti', res.ada_bukti, false);
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminSusulanDetail_(
      { token: tokenAdmin, id_pengajuan: 'PJN-NOT-EXIST' }, 'POST');
  }, 'NOT_FOUND');
  return true;
});
check('setujui pengajuan → status diterima + id_admin + waktu_keputusan server + log', () => {
  const { env, tokenAdmin, admin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminSusulanDecide_({
    token: tokenAdmin, id_pengajuan: 'PJN-TEST-1', keputusan: 'terima',
    catatan_keputusan: 'Disetujui admin TEST'
  }, 'POST');
  if (!res.ok) throw new Error('gagal');
  eq('status', res.status, 'diterima');
  const row = env.sandbox.findPengajuanById_('PJN-TEST-1');
  eq('id_admin', String(row.id_admin), String(admin.akun.id_akun));
  if (!row.waktu_keputusan) throw new Error('waktu_keputusan kosong');
  eq('catatan', String(row.catatan_keputusan), 'Disetujui admin TEST');
  const logs = env.sandbox.readObjects_('LogAktivitas');
  if (!logs.find((l) => String(l.aksi) === 'susulan_approved')) throw new Error('log tidak ada');
  return true;
});
check('tolak pengajuan → status ditolak + log susulan_rejected', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-2', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminSusulanDecide_({
    token: tokenAdmin, id_pengajuan: 'PJN-TEST-2', keputusan: 'tolak',
    catatan_keputusan: 'Bukti tidak jelas TEST'
  }, 'POST');
  eq('status', res.status, 'ditolak');
  const logs = env.sandbox.readObjects_('LogAktivitas');
  if (!logs.find((l) => String(l.aksi) === 'susulan_rejected')) throw new Error('log tidak ada');
  return true;
});
check('keputusan ganda → CONFLICT (pengajuan sudah diputuskan)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-3', id_pegawai: 'PEG-EMP-1' });
  env.sandbox.handleAdminSusulanDecide_(
    { token: tokenAdmin, id_pengajuan: 'PJN-TEST-3', keputusan: 'terima' }, 'POST');
  throwsCode('CONFLICT', () => {
    env.sandbox.handleAdminSusulanDecide_(
      { token: tokenAdmin, id_pengajuan: 'PJN-TEST-3', keputusan: 'tolak' }, 'POST');
  }, 'CONFLICT');
  return true;
});
check('keputusan tidak valid → INVALID_INPUT; pengajuan tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-4', id_pegawai: 'PEG-EMP-1' });
  throwsCode('INVALID_INPUT', () => {
    env.sandbox.handleAdminSusulanDecide_(
      { token: tokenAdmin, id_pengajuan: 'PJN-TEST-4', keputusan: 'bimbang' }, 'POST');
  }, 'INVALID_INPUT');
  throwsCode('NOT_FOUND', () => {
    env.sandbox.handleAdminSusulanDecide_(
      { token: tokenAdmin, id_pengajuan: 'PJN-NOT-EXIST', keputusan: 'terima' }, 'POST');
  }, 'NOT_FOUND');
  return true;
});
check('momen keputusan TIDAK menulis baris Absensi (belum ada aturan konversi)', () => {
  const { env, tokenAdmin } = envAdmin();
  seedPengajuan(env, { id_pengajuan: 'PJN-TEST-5', id_pegawai: 'PEG-EMP-1' });
  const before = env.sandbox.readObjects_('Absensi').length;
  env.sandbox.handleAdminSusulanDecide_(
    { token: tokenAdmin, id_pengajuan: 'PJN-TEST-5', keputusan: 'terima' }, 'POST');
  eq('jumlah Absensi tidak berubah', env.sandbox.readObjects_('Absensi').length, before);
  return true;
});

/* ================= Log audit ================= */

console.log('== Log audit ==');
check('admin.log.list mengembalikan log login & aksi admin, terbaru di atas', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TEST-1', id_pegawai: 'PEG-EMP-1' });
  const res = env.sandbox.handleAdminLogList_({ token: tokenAdmin }, 'POST');
  if (!res.ok) throw new Error('gagal');
  const aksis = res.items.map((i) => i.aksi);
  if (!aksis.includes('login_success')) throw new Error('login_success tidak ada');
  if (aksis.length < 2) throw new Error('log terlalu sedikit');
  return true;
});
check('filter aksi bekerja', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminLogList_({ token: tokenAdmin, aksi: 'login_success' }, 'POST');
  if (res.total < 1) throw new Error('login_success tidak ditemukan');
  for (const item of res.items) {
    if (item.aksi !== 'login_success') throw new Error('filter bocor: ' + item.aksi);
  }
  return true;
});
check('log TIDAK memuat token/PIN mentah', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  env.sandbox.handleAdminPegawaiCreate_({
    token: tokenAdmin, nama: 'Log Uji TEST', nip_nipk: '3333444455556666'
  }, 'POST');
  const res = env.sandbox.handleAdminLogList_({ token: tokenAdmin }, 'POST');
  const text = JSON.stringify(res);
  if (text.includes(tokenAdmin) || text.includes(tokenEmp)) throw new Error('token bocor di log');
  if (/pin_hash|"pin"|pin_salt/.test(text)) throw new Error('PIN/hash bocor di log');
  return true;
});
check('limit log membatasi item', () => {
  const { env, tokenAdmin } = envAdmin();
  const res = env.sandbox.handleAdminLogList_({ token: tokenAdmin, limit: 2 }, 'POST');
  eq('items', res.items.length, 2);
  if (res.total < 2) throw new Error('total aneh');
  return true;
});

/* ================= Foto admin (AMB-20 / DEC-P25) ================= */

console.log('== Foto admin: endpoint blob ber-token ==');

function seedDrivePhoto(env, bytes) {
  const folder = env.sandbox.DriveApp.getFolderById('ROOT-UJI');
  const blob = env.sandbox.Utilities.newBlob(bytes, 'image/jpeg', 'uji.jpg');
  return folder.createFile(blob).getId();
}

check('foto absensi: otorisasi (UNAUTHORIZED/FORBIDDEN/METHOD_NOT_ALLOWED)', () => {
  const { env, tokenEmp } = envAdmin();
  throwsCode('tanpa token',
    () => env.sandbox.handleAdminAbsensiPhoto_({ id_absensi: 'ABS-1' }, 'POST'),
    'UNAUTHORIZED');
  throwsCode('token pegawai',
    () => env.sandbox.handleAdminAbsensiPhoto_({ token: tokenEmp, id_absensi: 'ABS-1' }, 'POST'),
    'FORBIDDEN');
  throwsCode('metode GET',
    () => env.sandbox.handleAdminAbsensiPhoto_({ id_absensi: 'ABS-1' }, 'GET'),
    'METHOD_NOT_ALLOWED');
  return true;
});

check('foto absensi: isi foto kembali utuh tanpa referensi Drive', () => {
  const { env, tokenAdmin } = envAdmin();
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
  const fileId = seedDrivePhoto(env, bytes);
  seedAbsensi(env, { id_absensi: 'ABS-FOTO-1', id_pegawai: 'PEG-EMP-1', drive_file_id: fileId });
  const res = env.sandbox.handleAdminAbsensiPhoto_(
    { token: tokenAdmin, id_absensi: 'ABS-FOTO-1' }, 'POST');
  if (!res.ok) throw new Error('gagal ambil foto');
  eq('mime', res.mime, 'image/jpeg');
  const decoded = Buffer.from(res.base64, 'base64');
  if (decoded.length !== bytes.length) throw new Error('panjang byte berubah');
  for (let i = 0; i < bytes.length; i++) {
    if (decoded[i] !== bytes[i]) throw new Error('byte ' + i + ' berubah');
  }
  const text = JSON.stringify(res);
  if (/drive_file_id|DRV-|"file_id"/.test(text)) throw new Error('File ID bocor di respons');
  return true;
});

check('foto absensi: tanpa bukti / absensi tak ada → NOT_FOUND', () => {
  const { env, tokenAdmin } = envAdmin();
  seedAbsensi(env, { id_absensi: 'ABS-TANPA-FOTO', id_pegawai: 'PEG-EMP-1', denganBukti: false });
  throwsCode('tanpa bukti',
    () => env.sandbox.handleAdminAbsensiPhoto_(
      { token: tokenAdmin, id_absensi: 'ABS-TANPA-FOTO' }, 'POST'),
    'NOT_FOUND');
  throwsCode('absensi tak ada',
    () => env.sandbox.handleAdminAbsensiPhoto_(
      { token: tokenAdmin, id_absensi: 'TIDAK-ADA' }, 'POST'),
    'NOT_FOUND');
  throwsCode('tanpa id',
    () => env.sandbox.handleAdminAbsensiPhoto_({ token: tokenAdmin }, 'POST'),
    'INVALID_INPUT');
  return true;
});

check('foto susulan: isi foto kembali utuh + otorisasi & tanpa bukti', () => {
  const { env, tokenAdmin, tokenEmp } = envAdmin();
  const bytes = [0xff, 0xd8, 0xff, 0xe1, 0x08, 0x0c, 0x45, 0x78, 0x69, 0x66];
  const fileId = seedDrivePhoto(env, bytes);
  seedPengajuan(env, { id_pengajuan: 'PJN-FOTO-1', id_pegawai: 'PEG-EMP-1', bukti_file_id: fileId });
  const res = env.sandbox.handleAdminSusulanPhoto_(
    { token: tokenAdmin, id_pengajuan: 'PJN-FOTO-1' }, 'POST');
  if (!res.ok) throw new Error('gagal ambil foto susulan');
  const decoded = Buffer.from(res.base64, 'base64');
  if (decoded.length !== bytes.length) throw new Error('panjang byte berubah');
  if (JSON.stringify(res).includes(fileId)) throw new Error('File ID bocor');
  throwsCode('token pegawai ditolak',
    () => env.sandbox.handleAdminSusulanPhoto_(
      { token: tokenEmp, id_pengajuan: 'PJN-FOTO-1' }, 'POST'),
    'FORBIDDEN');
  seedPengajuan(env, { id_pengajuan: 'PJN-NOFOTO', id_pegawai: 'PEG-EMP-2', bukti_file_id: '' });
  throwsCode('tanpa bukti → NOT_FOUND',
    () => env.sandbox.handleAdminSusulanPhoto_(
      { token: tokenAdmin, id_pengajuan: 'PJN-NOFOTO' }, 'POST'),
    'NOT_FOUND');
  throwsCode('pengajuan tak ada → NOT_FOUND',
    () => env.sandbox.handleAdminSusulanPhoto_(
      { token: tokenAdmin, id_pengajuan: 'TIDAK-ADA' }, 'POST'),
    'NOT_FOUND');
  return true;
});

/* ================= Router & transport ================= */

console.log('== Router & transport (Code.gs) ==');
check('doPost admin.pegawai.list mengembalikan JSON ok', () => {
  const { env, tokenAdmin } = envAdmin();
  const out = env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({ action: 'admin.pegawai.list', token: tokenAdmin, data: {} })
    }
  });
  const parsed = JSON.parse(out.getContent());
  if (!parsed.ok) throw new Error('bukan ok: ' + out.getContent());
  return true;
});
check('doPost aksi admin tanpa token → JSON UNAUTHORIZED (bukan crash)', () => {
  const { env } = envAdmin();
  const out = env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'admin.absensi.list', data: {} }) }
  });
  const parsed = JSON.parse(out.getContent());
  eq('error', parsed.error, 'UNAUTHORIZED');
  eq('status', parsed.status, 'error');
  return true;
});
check('route foto absensi berotorisasi; foto susulan dinonaktifkan', () => {
  const { env } = envAdmin();
  let attendanceCode = null;
  try { env.sandbox.route_('admin.absensi.photo', {}, 'POST'); }
  catch (err) { attendanceCode = err && err.code; }
  if (attendanceCode !== 'UNAUTHORIZED') throw new Error('admin.absensi.photo: ' + attendanceCode);
  let susulanCode = null;
  try { env.sandbox.route_('admin.susulan.photo', {}, 'POST'); }
  catch (err) { susulanCode = err && err.code; }
  if (susulanCode !== 'NOT_AVAILABLE') throw new Error('admin.susulan.photo: ' + susulanCode);
  return true;
});
check('health phase = report (PHASE 5)', () => {
  const { env } = envAdmin();
  const h = env.sandbox.handleHealth_();
  eq('phase', h.phase, 'report');
  return true;
});
check('initializeSheets membuat sheet PengajuanSusulan dengan header §8', () => {
  const { env } = envAdmin();
  const sh = env.sandbox.getSheet_('PengajuanSusulan');
  const headers = sh.getDataRange().getValues()[0];
  const expected = ['id_pengajuan', 'id_pegawai', 'tanggal_absensi', 'jenis', 'mode_kerja',
    'waktu_diklaim', 'waktu_pengajuan_server', 'alasan', 'bukti_file_id', 'status',
    'id_admin', 'waktu_keputusan', 'catatan_keputusan', 'diubah_pada'];
  eq('jumlah kolom', headers.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) throw new Error('kolom ' + i + ': ' + headers[i]);
  }
  return true;
});

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

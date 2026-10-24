/*
 * Pengujian mesin pengajuan susulan — REQUIREMENTS §8 (DEC-P23/P24).
 * Jalankan: node tests/susulan.test.mjs
 *
 * Mencakup: aturan tanggal (murni & integrasi), waktu diklaim, alasan, foto,
 * alur susulan.submit (sukses, duplikat, otorisasi, transport).
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

// JPEG semu: magic FF D8 FF E0 + sisa byte (cukup untuk pipeline validasi).
const TINY_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]).toString('base64');
const PNG_MAGIC_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d]).toString('base64');

// Waktu uji: 2026-10-15 pukul 09:00 WIB (kamis) — hari server '2026-10-15'.
const NOW_MS = Date.parse('2026-10-15T02:00:00Z');

function envSusulan(opts = {}) {
  const env = createEnv({ props: {} });
  seedAccount(env.sandbox, env.props, {
    nip: '5555666677778888', pin: '135790', iterations: 1000,
    idPegawai: 'PEG-SUS-1', idAkun: 'AKN-SUS-1', nama: 'Pegawai Susulan'
  });
  env.props.set('DRIVE_FOLDER_ID', 'TEST_DRIVE_ROOT');
  const token = env.sandbox
    .handleLogin_({ nip: '5555666677778888', pin: '135790' }, 'POST').token;
  env.sandbox.nowMs_ = () => NOW_MS;
  if (opts.withSecond) {
    seedAccount(env.sandbox, env.props, {
      nip: '9999000011112222', pin: '024680', iterations: 1000,
      idPegawai: 'PEG-SUS-2', idAkun: 'AKN-SUS-2', nama: 'Pegawai Susulan Dua'
    });
  }
  return { env, token };
}

function submit(env, token, overrides = {}) {
  const payload = Object.assign({
    token,
    tanggal_absensi: '2026-10-15',
    jenis: 'masuk',
    mode_kerja: 'WFO',
    waktu_diklaim: '07:05',
    alasan: 'Kamera ponsel rusak sehingga absen reguler terlewat.',
    foto_base64: TINY_JPEG_B64,
    foto_mime: 'image/jpeg'
  }, overrides);
  ['tanggal_absensi', 'jenis', 'mode_kerja', 'waktu_diklaim', 'alasan',
    'foto_base64', 'foto_mime'].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(overrides, k) && overrides[k] === undefined) {
      delete payload[k];
    }
  });
  return env.sandbox.handleSusulanSubmit_(payload, 'POST');
}

function countSusulan(env) {
  return env.sandbox.readObjects_('PengajuanSusulan').length;
}

/* ================= Aturan tanggal (murni) ================= */

console.log('== Aturan tanggal: fungsi murni (DEC-P23) ==');
const T0 = '2026-10-15';
check('format bukan YYYY-MM-DD ditolak', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('15-10-2026', T0);
  return r.ok === false && r.code === 'INVALID_INPUT';
});
check('tanggal kalender tidak valid (2026-02-30) ditolak', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-02-30', T0);
  return r.ok === false;
});
check('tanggal bisnis kabisat valid (2024-02-29, hari 2024-03-01) diterima', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2024-02-29', '2024-03-01');
  return r.ok === true && r.tanggal === '2024-02-29';
});
check('2026-02-29 ditolak (bukan tahun kabisat)', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-02-29', T0);
  return r.ok === false;
});
check('tanggal mendatang ditolak', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-10-16', T0);
  return r.ok === false && /mendatang/.test(r.message);
});
check('4 hari sebelumnya ditolak', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-10-11', T0);
  return r.ok === false && /maksimal 3/.test(r.message);
});
check('3 hari sebelumnya (batas) diterima', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-10-12', T0);
  return r.ok === true && r.tanggal === '2026-10-12';
});
check('hari berjalan diterima', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-10-15', T0);
  return r.ok === true;
});
check('lintas-bulan tetap dihitung (2026-09-30, hari 2026-10-03) diterima', () => {
  const r = envSusulan().env.sandbox.evaluateSusulanTanggal_('2026-09-30', '2026-10-03');
  return r.ok === true;
});

/* ================= Waktu diklaim (murni) ================= */

console.log('== Waktu diklaim: fungsi murni ==');
check('HH:MM dinormalkan ke HH:MM:SS', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('7:05');
  return r.ok === true && r.waktu === '07:05:00';
});
check('HH:MM:SS diterima apa adanya', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('16:30:15');
  return r.ok === true && r.waktu === '16:30:15';
});
check('waktu kosong ditolak', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('');
  return r.ok === false;
});
check('jam 25:00 ditolak', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('25:00');
  return r.ok === false;
});
check('menit 2 digit wajib (07:5) ditolak', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('07:5');
  return r.ok === false;
});
check('teks acak ditolak', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('pagi');
  return r.ok === false;
});
check('durasi lintas-malam (00:05) valid secara format', () => {
  const r = envSusulan().env.sandbox.normalizeWaktuDiklaim_('00:05');
  return r.ok === true && r.waktu === '00:05:00';
});

/* ================= Alur susulan.submit ================= */

console.log('== susulan.submit: alur sukses ==');
check('pengajuan valid tersimpan lengkap (baris, foto, log, respons)', () => {
  const { env, token } = envSusulan();
  const res = submit(env, token);
  eq('res.ok', res.ok, true);
  eq('res.status', res.status, 'menunggu');
  eq('res.jenis', res.jenis, 'masuk');
  eq('res.tanggal_absensi', res.tanggal_absensi, '2026-10-15');
  if (!/^PJN-/.test(String(res.id_pengajuan))) throw new Error('id_pengajuan aneh');

  const rows = env.sandbox.readObjects_('PengajuanSusulan');
  eq('jumlah baris', rows.length, 1);
  const row = rows[0];
  eq('row.id_pegawai', row.id_pegawai, 'PEG-SUS-1');
  eq('row.waktu_diklaim', row.waktu_diklaim, '07:05:00');
  eq('row.status', row.status, 'menunggu');
  if (!row.bukti_file_id) throw new Error('bukti_file_id kosong');
  if (!/alasan|Alasan/i.test(String(row.alasan)) && !String(row.alasan)) {
    throw new Error('alasan kosong');
  }

  const files = env.driveRegistry.files;
  eq('file Drive', files.length, 1);
  const fileId = String(row.bukti_file_id);
  const file = files.find((f) => f.getId() === fileId);
  if (!file) throw new Error('file Drive tidak ditemukan');
  if (String(file._name).indexOf('susulan_') !== 0) throw new Error('nama file: ' + file._name);

  const logs = env.sandbox.readObjects_('LogAktivitas');
  if (!logs.find((l) => String(l.aksi) === 'susulan_submitted')) {
    throw new Error('log susulan_submitted tidak ada');
  }
  return true;
});
check('id_pegawai dari SESI — payload diabaikan', () => {
  const { env, token } = envSusulan();
  submit(env, token, { id_pegawai: 'PEG-LAIN' });
  const row = env.sandbox.readObjects_('PengajuanSusulan')[0];
  eq('id_pegawai', row.id_pegawai, 'PEG-SUS-1');
});
check('tanggal 3 hari lampau (batas) sukses', () => {
  const { env, token } = envSusulan();
  const res = submit(env, token, { tanggal_absensi: '2026-10-12' });
  eq('ok', res.ok, true);
  eq('tanggal', res.tanggal_absensi, '2026-10-12');
});
check('waktu_diklaim lintas-malam diterima (format saja)', () => {
  const { env, token } = envSusulan();
  const res = submit(env, token, { waktu_diklaim: '00:10:00' });
  eq('ok', res.ok, true);
  const row = env.sandbox.readObjects_('PengajuanSusulan')[0];
  eq('waktu_diklaim', row.waktu_diklaim, '00:10:00');
});
check('alasan tepat 500 karakter diterima', () => {
  const { env, token } = envSusulan();
  const res = submit(env, token, { alasan: 'x'.repeat(500) });
  eq('ok', res.ok, true);
});

console.log('== susulan.submit: penolakan input ==');
throwsCode('tanggal 4 hari lampau ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { tanggal_absensi: '2026-10-11' });
}, 'INVALID_INPUT');
throwsCode('tanggal mendatang ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { tanggal_absensi: '2026-10-16' });
}, 'INVALID_INPUT');
throwsCode('alasan kosong ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { alasan: '' });
}, 'INVALID_INPUT');
throwsCode('alasan 501 karakter ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { alasan: 'x'.repeat(501) });
}, 'INVALID_INPUT');
throwsCode('waktu_diklaim kosong ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { waktu_diklaim: undefined });
}, 'INVALID_INPUT');
throwsCode('foto tidak ada ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { foto_base64: undefined });
}, 'INVALID_INPUT');
throwsCode('foto non-JPEG (PNG) ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { foto_base64: PNG_MAGIC_B64 });
}, 'PHOTO_INVALID');
throwsCode('jenis tidak valid ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { jenis: 'istirahat' });
}, 'INVALID_INPUT');
throwsCode('mode kerja tidak valid ditolak', () => {
  const { env, token } = envSusulan();
  submit(env, token, { mode_kerja: 'PANTAI' });
}, 'INVALID_INPUT');
check('penolakan input tidak menulis baris', () => {
  const { env, token } = envSusulan();
  try { submit(env, token, { alasan: '' }); } catch (err) { /* expected */ }
  eq('jumlah baris', countSusulan(env), 0);
  eq('jumlah file Drive', env.driveRegistry.files.length, 0);
  return true;
});

console.log('== susulan.submit: duplikat ==');
throwsCode('pengajuan menunggu menghalangi pengajuan baru', () => {
  const { env, token } = envSusulan();
  submit(env, token);
  submit(env, token);
}, 'DUPLICATE');
throwsCode('pengajuan diterima menghalangi pengajuan baru', () => {
  const { env, token } = envSusulan();
  submit(env, token);
  const row = env.sandbox.readObjects_('PengajuanSusulan')[0];
  env.sandbox.updateObjectRow_('PengajuanSusulan', row.__row,
    Object.assign({}, row, { status: 'diterima' }));
  submit(env, token);
}, 'DUPLICATE');
check('pengajuan ditolak boleh diajukan ulang', () => {
  const { env, token } = envSusulan();
  submit(env, token);
  const row = env.sandbox.readObjects_('PengajuanSusulan')[0];
  env.sandbox.updateObjectRow_('PengajuanSusulan', row.__row,
    Object.assign({}, row, { status: 'ditolak' }));
  const res = submit(env, token);
  eq('ok', res.ok, true);
  eq('jumlah baris', countSusulan(env), 2);
  return true;
});
check('jenis berbeda pada tanggal sama tidak saling memblokir', () => {
  const { env, token } = envSusulan();
  submit(env, token, { jenis: 'masuk' });
  const res = submit(env, token, { jenis: 'pulang' });
  eq('ok', res.ok, true);
  eq('jumlah baris', countSusulan(env), 2);
  return true;
});
check('pegawai berbeda tidak saling memblokir', () => {
  const { env, token } = envSusulan({ withSecond: true });
  submit(env, token);
  const token2 = env.sandbox
    .handleLogin_({ nip: '9999000011112222', pin: '024680' }, 'POST').token;
  const res = submit(env, token2);
  eq('ok', res.ok, true);
  eq('jumlah baris', countSusulan(env), 2);
  return true;
});

console.log('== susulan.submit: otorisasi & transport ==');
throwsCode('tanpa token → UNAUTHORIZED', () => {
  const { env } = envSusulan();
  env.sandbox.handleSusulanSubmit_(
    { tanggal_absensi: '2026-10-15', jenis: 'masuk', mode_kerja: 'WFO',
      waktu_diklaim: '07:05', alasan: 'uji', foto_base64: TINY_JPEG_B64 }, 'POST');
}, 'UNAUTHORIZED');
throwsCode('token salah → UNAUTHORIZED', () => {
  const { env } = envSusulan();
  env.sandbox.handleSusulanSubmit_(
    { token: 'token-salah', tanggal_absensi: '2026-10-15', jenis: 'masuk',
      mode_kerja: 'WFO', waktu_diklaim: '07:05', alasan: 'uji', foto_base64: TINY_JPEG_B64 },
    'POST');
}, 'UNAUTHORIZED');
throwsCode('metode GET → METHOD_NOT_ALLOWED', () => {
  const { env, token } = envSusulan();
  env.sandbox.handleSusulanSubmit_({ token: token }, 'GET');
}, 'METHOD_NOT_ALLOWED');
check('route_ terhubung (bukan UNKNOWN_ACTION)', () => {
  const { env } = envSusulan();
  let code = null;
  try {
    env.sandbox.route_('susulan.submit', {}, 'POST');
  } catch (err) {
    code = err && err.code;
  }
  if (code !== 'NOT_AVAILABLE') throw new Error('kode: ' + code);
  return true;
});
check('doPost susulan.submit tanpa token → JSON NOT_AVAILABLE (bukan crash)', () => {
  const { env } = envSusulan();
  const out = env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'susulan.submit', data: {} }) }
  });
  const parsed = JSON.parse(out.getContent());
  eq('error', parsed.error, 'NOT_AVAILABLE');
  eq('status', parsed.status, 'error');
  return true;
});
check('doPost susulan.submit valid → JSON NOT_AVAILABLE', () => {
  const { env, token } = envSusulan();
  const out = env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'susulan.submit',
        token,
        data: {
          tanggal_absensi: '2026-10-15', jenis: 'masuk', mode_kerja: 'WFO',
          waktu_diklaim: '07:05', alasan: 'uji transport', foto_base64: TINY_JPEG_B64
        }
      })
    }
  });
  const parsed = JSON.parse(out.getContent());
  if (parsed.ok !== false || parsed.error !== 'NOT_AVAILABLE') throw new Error('bukan ok: ' + out.getContent());
  return true;
});

/* ================= Ringkasan ================= */

console.log('');
console.log('== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
if (failed > 0) process.exitCode = 1;

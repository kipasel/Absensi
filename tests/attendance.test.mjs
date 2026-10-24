/*
 * Pengujian mesin absensi — PHASE 3.
 * Jalankan: node tests/attendance.test.mjs
 *
 * Mencakup: aturan waktu (batas detik), mode kerja, GPS/Haversine (koordinat
 * sintetis — BUKAN konfigurasi produksi), alur attendance.submit (duplikat,
 * idempotensi, prasyarat pulang, otorisasi, foto, kegagalan penyimpanan).
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
  console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
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

// JPEG semu: magic FF D8 FF E0 + sisa byte acak (cukup untuk pipeline validasi).
const TINY_JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]).toString('base64');
const PNG_MAGIC_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d]).toString('base64');

// Koordinat kantor SINTETIS untuk pengujian (AMB-07: bukan produksi).
const OFFICE = { lat: -3.3, lng: 97.1 };
const M_PER_DEG_LAT = Math.PI * 6371000 / 180; // ≈ 111194.93

// Waktu uji (WIB = UTC+7); 2026-10-15 = Kamis.
const T = {
  beforeOpen: Date.parse('2026-10-14T23:59:59Z'),  // 06:59:59 WIB
  open: Date.parse('2026-10-15T00:00:00Z'),        // 07:00:00 WIB
  midMasuk: Date.parse('2026-10-15T00:30:00Z'),    // 07:30:00 WIB
  lastMasuk: Date.parse('2026-10-15T01:29:59Z'),   // 08:29:59 WIB
  afterMasuk: Date.parse('2026-10-15T01:30:00Z'),  // 08:30:00 WIB
  beforePulang: Date.parse('2026-10-15T08:59:59Z'), // 15:59:59 WIB
  openPulang: Date.parse('2026-10-15T09:00:00Z'),  // 16:00:00 WIB
  lastPulang: Date.parse('2026-10-15T16:59:59Z'),  // 23:59:59 WIB
  nextDay: Date.parse('2026-10-15T17:00:01Z'),     // 00:00:01 WIB 16 Okt
  sundayOpen: Date.parse('2026-10-18T00:00:00Z')    // Minggu 07:00:00 WIB
};

let idSeq = 0;
function nextId() {
  idSeq++;
  return 'ABS-uji-' + String(idSeq).padStart(4, '0');
}

function envAttendance(opts = {}) {
  const env = createEnv({ props: {} });
  seedAccount(env.sandbox, env.props, {
    nip: '1111222233334444', pin: '246810', iterations: 1000,
    idPegawai: 'PEG-ATT-1', idAkun: 'AKN-ATT-1', nama: 'Pegawai Absensi'
  });
  env.props.set('DRIVE_FOLDER_ID', 'TEST_DRIVE_ROOT');
  if (opts.office !== false) {
    env.props.set('OFFICE_LATITUDE', String(opts.lat ?? OFFICE.lat));
    env.props.set('OFFICE_LONGITUDE', String(opts.lng ?? OFFICE.lng));
    env.props.set('OFFICE_RADIUS_METERS', String(opts.radius ?? 50));
  }
  const token = env.sandbox
    .handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST').token;
  return { env, token };
}

function submit(env, token, overrides = {}) {
  const payload = Object.assign({
    token,
    id_absensi: nextId(),
    jenis: 'masuk',
    mode_kerja: 'WFO',
    foto_base64: TINY_JPEG_B64,
    foto_mime: 'image/jpeg',
    gps: { lat: OFFICE.lat, lng: OFFICE.lng, accuracy: 12 }
  }, overrides);
  if (Object.prototype.hasOwnProperty.call(overrides, 'gps') && overrides.gps === null) {
    delete payload.gps;
  }
  if (payload.jenis === 'pulang') {
    if (!Object.prototype.hasOwnProperty.call(overrides, 'uraian_pekerjaan')) {
      payload.uraian_pekerjaan = 'Pekerjaan hari ini';
    }
    if (!Object.prototype.hasOwnProperty.call(overrides, 'output_pekerjaan')) {
      payload.output_pekerjaan = 'Output pekerjaan';
    }
  }
  return env.sandbox.handleAttendanceSubmit_(payload, 'POST');
}

function atTime(env, ms) {
  env.sandbox.nowMs_ = () => ms;
}

function countAbsensi(env) {
  return env.sandbox.readObjects_('Absensi').length;
}
function countBukti(env) {
  return env.sandbox.readObjects_('BuktiAbsensi').length;
}

/** Mengisi satu absensi pulang (masuk dulu) memakai waktu uji yang diberikan. */
function submitPulang(env, token) {
  atTime(env, T.midMasuk);
  const masuk = submit(env, token);
  atTime(env, T.openPulang);
  const pulang = submit(env, token, { id_absensi: nextId(), jenis: 'pulang', gps: null, uraian_pekerjaan: 'Pekerjaan hari ini', output_pekerjaan: 'Output pekerjaan' });
  return { masuk, pulang };
}

/* ================= TimeRule (murni) ================= */

console.log('== Aturan waktu: primitif murni ==');
check('hmsToSecondsOfDay_ valid (07:00:00 = 25200)', () => {
  const { sandbox } = createEnv();
  if (sandbox.hmsToSecondsOfDay_(7, 0, 0) !== 25200) throw new Error('salah');
  return true;
});
check('hmsToSecondsOfDay_ tidak valid (24:00:00 → null)', () => {
  const { sandbox } = createEnv();
  if (sandbox.hmsToSecondsOfDay_(24, 0, 0) !== null) throw new Error('harus null');
  if (sandbox.hmsToSecondsOfDay_(7, 60, 0) !== null) throw new Error('menit 60 harus null');
  if (sandbox.hmsToSecondsOfDay_('a', 0, 0) !== null) throw new Error('huruf harus null');
  return true;
});

console.log('== Aturan waktu: jendela masuk/pulang ==');
const windowCases = [
  ['WT-04 masuk 06:59:59 ditolak', 'masuk', 6 * 3600 + 59 * 60 + 59, false],
  ['WT-01 masuk 07:00:00 diterima', 'masuk', 7 * 3600, true],
  ['masuk 07:30:00 diterima', 'masuk', 7 * 3600 + 30 * 60, true],
  ['WT-02 masuk 08:29:59 diterima', 'masuk', 8 * 3600 + 29 * 60 + 59, true],
  ['WT-03 masuk 08:30:00 diterima', 'masuk', 8 * 3600 + 30 * 60, true],
  ['WT-04b masuk 12:00:00 diterima', 'masuk', 12 * 3600, true],
  ['WT-04c pulang 06:59:59 ditolak', 'pulang', 6 * 3600 + 59 * 60 + 59, false],
  ['WT-04d pulang 08:30:00 ditolak', 'pulang', 8 * 3600 + 30 * 60, false],
  ['WT-04e pulang 15:59:59 ditolak', 'pulang', 15 * 3600 + 59 * 60 + 59, false],
  ['WT-05 pulang 16:00:00 diterima', 'pulang', 16 * 3600, true],
  ['WT-06 pulang 23:59:59 diterima', 'pulang', 23 * 3600 + 59 * 60 + 59, true],
  ['WT-07 masuk 00:00:00 ditolak', 'masuk', 0, false],
  ['WT-07b pulang 00:00:01 ditolak', 'pulang', 1, false]
];
for (const [name, jenis, sec, expectOk] of windowCases) {
  check(name, () => {
    const { sandbox } = createEnv();
    const res = sandbox.evaluateTimeWindow_(jenis, sec);
    if (res.ok !== expectOk) throw new Error('ok=' + res.ok + ' seharusnya ' + expectOk);
    if (!expectOk && res.code !== 'TIME_WINDOW') throw new Error('kode ' + res.code);
    return true;
  });
}
check('jenis tak dikenal → INVALID_INPUT', () => {
  const { sandbox } = createEnv();
  if (sandbox.evaluateTimeWindow_('susulan', 25200).code !== 'INVALID_INPUT') throw new Error('salah');
  return true;
});
check('detik hari di luar rentang → INVALID_INPUT', () => {
  const { sandbox } = createEnv();
  if (sandbox.evaluateTimeWindow_('masuk', 99999).code !== 'INVALID_INPUT') throw new Error('salah');
  return true;
});

console.log('== Aturan waktu: ekstraksi waktu server Asia/Jakarta ==');
check('civilFromServerMs_ 2026-10-15T00:30Z → 2026-10-15 07:30 WIB', () => {
  const { sandbox } = createEnv();
  const c = sandbox.civilFromServerMs_(T.midMasuk);
  if (c.tanggal !== '2026-10-15') throw new Error('tanggal ' + c.tanggal);
  if (c.detikHari !== 7 * 3600 + 30 * 60) throw new Error('detik ' + c.detikHari);
  return true;
});
check('civilFromServerMs_ 2026-10-15T16:59:59Z → 23:59:59 WIB tanggal sama', () => {
  const { sandbox } = createEnv();
  const c = sandbox.civilFromServerMs_(T.lastPulang);
  if (c.tanggal !== '2026-10-15') throw new Error('tanggal ' + c.tanggal);
  if (c.detikHari !== 86399) throw new Error('detik ' + c.detikHari);
  return true;
});
check('civilFromServerMs_ 2026-10-15T17:00:01Z → tanggal 2026-10-16 (lintas hari)', () => {
  const { sandbox } = createEnv();
  const c = sandbox.civilFromServerMs_(T.nextDay);
  if (c.tanggal !== '2026-10-16') throw new Error('tanggal ' + c.tanggal);
  if (c.detikHari !== 1) throw new Error('detik ' + c.detikHari);
  return true;
});
check('evaluateAttendanceTime_ menolak pulang lintas tanggal (00:00:01)', () => {
  const { sandbox } = createEnv();
  const r = sandbox.evaluateAttendanceTime_('pulang', T.nextDay);
  if (r.ok) throw new Error('seharusnya ditolak');
  if (r.code !== 'TIME_WINDOW') throw new Error('kode ' + r.code);
  if (r.tanggal !== '2026-10-16') throw new Error('tanggal bisnis ' + r.tanggal);
  return true;
});

console.log('== Mode kerja & jenis ==');
check('normalizeModeKerja_: WFO/WFH_WFA (case-insensitive), lain ditolak', () => {
  const { sandbox } = createEnv();
  if (sandbox.normalizeModeKerja_('WFO').mode !== 'WFO') throw new Error('WFO');
  if (sandbox.normalizeModeKerja_('wfo').mode !== 'WFO') throw new Error('wfo');
  if (sandbox.normalizeModeKerja_('WFH_WFA').mode !== 'WFH_WFA') throw new Error('WFH_WFA');
  if (sandbox.normalizeModeKerja_('wfh/wfa').ok) throw new Error('slash diterima');
  if (sandbox.normalizeModeKerja_('WFH').ok) throw new Error('WFH lama diterima');
  if (sandbox.normalizeModeKerja_('').ok) throw new Error('kosong diterima');
  if (sandbox.normalizeModeKerja_(null).ok) throw new Error('null diterima');
  return true;
});
check('normalizeJenis_: masuk/pulang (case-insensitive), lain ditolak', () => {
  const { sandbox } = createEnv();
  if (sandbox.normalizeJenis_('MASUK').jenis !== 'masuk') throw new Error('MASUK');
  if (sandbox.normalizeJenis_('Pulang').jenis !== 'pulang') throw new Error('Pulang');
  if (sandbox.normalizeJenis_('susulan').ok) throw new Error('susulan diterima');
  return true;
});

/* ================= Geo (murni) ================= */

console.log('== GPS: validasi koordinat & Haversine ==');
check('isValidLatitude_/isValidLongitude_ batas rentang', () => {
  const { sandbox } = createEnv();
  if (!sandbox.isValidLatitude_(90) || !sandbox.isValidLatitude_(-90)) throw new Error('90/-90');
  if (sandbox.isValidLatitude_(90.0001) || sandbox.isValidLatitude_(-90.1)) throw new Error('luar 90');
  if (!sandbox.isValidLongitude_(180) || !sandbox.isValidLongitude_(-180)) throw new Error('180/-180');
  if (sandbox.isValidLongitude_(180.1)) throw new Error('luar 180');
  if (sandbox.isValidLatitude_(NaN) || sandbox.isValidLatitude_('abc')) throw new Error('NaN/huruf');
  return true;
});
check('haversineMeters_ titik sama = 0', () => {
  const { sandbox } = createEnv();
  const d = sandbox.haversineMeters_(OFFICE.lat, OFFICE.lng, OFFICE.lat, OFFICE.lng);
  if (Math.abs(d) > 1e-6) throw new Error('jarak ' + d);
  return true;
});
check('haversineMeters_ ~1 km selatan cocok dengan rumus kosinus (tol 0.5 m)', () => {
  const { sandbox } = createEnv();
  const lat2 = OFFICE.lat - 0.009; // ≈ 1000.75 m
  const hav = sandbox.haversineMeters_(OFFICE.lat, OFFICE.lng, lat2, OFFICE.lng);
  const R = 6371000;
  const rad = (x) => x * Math.PI / 180;
  const cos = R * Math.acos(
    Math.sin(rad(OFFICE.lat)) * Math.sin(rad(lat2)) +
    Math.cos(rad(OFFICE.lat)) * Math.cos(rad(lat2)));
  if (Math.abs(hav - cos) > 0.5) throw new Error('hav ' + hav + ' vs cos ' + cos);
  if (Math.abs(hav - 1000.75) > 1.0) throw new Error('tidak ~1 km: ' + hav);
  return true;
});
check('haversineMeters_ ~50 m utara ≈ 50 m (galat < 0.05 m)', () => {
  const { sandbox } = createEnv();
  const lat2 = OFFICE.lat + 50 / M_PER_DEG_LAT;
  const d = sandbox.haversineMeters_(OFFICE.lat, OFFICE.lng, lat2, OFFICE.lng);
  if (Math.abs(d - 50) > 0.05) throw new Error('jarak ' + d);
  return true;
});

console.log('== GPS: keputusan masuk WFO ==');
check('koordinat kantor belum dikonfigurasi → OFFICE_NOT_CONFIGURED', () => {
  const { sandbox } = createEnv();
  const r = sandbox.evaluateGpsForMasukWfo_({ lat: 0, lng: 0 }, null);
  if (r.ok || r.code !== 'OFFICE_NOT_CONFIGURED') throw new Error('kode ' + r.code);
  return true;
});
check('tanpa objek GPS → GPS_REQUIRED', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  if (sandbox.evaluateGpsForMasukWfo_(null, office).code !== 'GPS_REQUIRED') throw new Error('salah');
  if (sandbox.evaluateGpsForMasukWfo_(undefined, office).code !== 'GPS_REQUIRED') throw new Error('salah 2');
  return true;
});
check('koordinat tidak valid → GPS_INVALID', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  for (const gps of [
    { lat: 999, lng: 0 }, { lat: 0, lng: -999 }, { lat: 'abc', lng: 0 },
    { lat: NaN, lng: 0 }, { lat: '', lng: '' }, {}
  ]) {
    const r = sandbox.evaluateGpsForMasukWfo_(gps, office);
    if (r.code !== 'GPS_INVALID') throw new Error('gps ' + JSON.stringify(gps) + ' → ' + r.code);
  }
  return true;
});
check('tepat di titik kantor → diterima, jarak 0', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  const r = sandbox.evaluateGpsForMasukWfo_({ lat: OFFICE.lat, lng: OFFICE.lng, accuracy: 8 }, office);
  if (!r.ok) throw new Error('ditolak: ' + r.code);
  if (r.jarakMeter !== 0) throw new Error('jarak ' + r.jarakMeter);
  if (r.accuracy !== 8) throw new Error('akurasi tidak dicatat');
  return true;
});
check('dalam radius (~44 m) → diterima', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  const lat2 = OFFICE.lat + 44 / M_PER_DEG_LAT;
  const r = sandbox.evaluateGpsForMasukWfo_({ lat: lat2, lng: OFFICE.lng }, office);
  if (!r.ok) throw new Error('ditolak: ' + r.code);
  return true;
});
check('tepat di batas 50,0 m → diterima (inklusif, GP-02)', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  const lat2 = OFFICE.lat + 50 / M_PER_DEG_LAT;
  const r = sandbox.evaluateGpsForMasukWfo_({ lat: lat2, lng: OFFICE.lng }, office);
  if (!r.ok) throw new Error('batas 50,0 m ditolak: ' + r.code + ' jarak ' + r.jarakMeter);
  return true;
});
check('di luar radius (~50,2 m) → OUT_OF_RADIUS (GP-03)', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  const lat2 = OFFICE.lat + 50.2 / M_PER_DEG_LAT;
  const r = sandbox.evaluateGpsForMasukWfo_({ lat: lat2, lng: OFFICE.lng }, office);
  if (r.ok || r.code !== 'OUT_OF_RADIUS') throw new Error('kode ' + r.code);
  if (r.jarakMeter <= 50) throw new Error('jarak tidak masuk akal ' + r.jarakMeter);
  return true;
});
check('akurasi buruk TIDAK menolak (AMB-08: hanya dicatat)', () => {
  const { sandbox } = createEnv();
  const office = { lat: OFFICE.lat, lng: OFFICE.lng, radiusMeters: 50 };
  const r = sandbox.evaluateGpsForMasukWfo_(
    { lat: OFFICE.lat, lng: OFFICE.lng, accuracy: 5000 }, office);
  if (!r.ok) throw new Error('ditolak karena akurasi: ' + r.code);
  if (r.accuracy !== 5000) throw new Error('akurasi hilang');
  return true;
});
check('OFFICE_RADIUS_METERS dari properti (mis. 100) dipakai getOfficeLocation_', () => {
  const { env } = envAttendance({ radius: 100 });
  const office = env.sandbox.getOfficeLocation_();
  if (office.radiusMeters !== 100) throw new Error('radius ' + office.radiusMeters);
  const lat2 = OFFICE.lat + 80 / M_PER_DEG_LAT;
  const r = env.sandbox.evaluateGpsForMasukWfo_({ lat: lat2, lng: OFFICE.lng }, office);
  if (!r.ok) throw new Error('80 m seharusnya ok dengan radius 100');
  return true;
});
check('getOfficeLocation_ null saat AMB-07 belum diisi', () => {
  const { env } = envAttendance({ office: false });
  if (env.sandbox.getOfficeLocation_() !== null) throw new Error('harus null');
  return true;
});

/* ================= Foto ================= */

console.log('== Validasi foto ==');
check('validatePhotoBlob_: JPEG valid diterima', () => {
  const { sandbox } = createEnv();
  const r = sandbox.validatePhotoBlob_(TINY_JPEG_B64, 1000000);
  if (!r.ok) throw new Error('ditolak: ' + r.code);
  if (!sandbox.hasJpegMagic_(r.bytes)) throw new Error('magic hilang');
  return true;
});
check('validatePhotoBlob_: base64 rusak → PHOTO_INVALID', () => {
  const { sandbox } = createEnv();
  if (sandbox.validatePhotoBlob_('!!!bukan-base64!!!', 10000).code !== 'PHOTO_INVALID') {
    throw new Error('salah');
  }
  return true;
});
check('validatePhotoBlob_: magic PNG ditolak (bukan JPEG)', () => {
  const { sandbox } = createEnv();
  if (sandbox.validatePhotoBlob_(PNG_MAGIC_B64, 10000).code !== 'PHOTO_INVALID') {
    throw new Error('PNG diterima');
  }
  return true;
});
check('validatePhotoBlob_: kosong/tidak ada → INVALID_INPUT', () => {
  const { sandbox } = createEnv();
  if (sandbox.validatePhotoBlob_('', 10000).code !== 'INVALID_INPUT') throw new Error('string kosong');
  if (sandbox.validatePhotoBlob_(null, 10000).code !== 'INVALID_INPUT') throw new Error('null');
  return true;
});
check('validatePhotoBlob_: melebihi batas → PHOTO_TOO_LARGE', () => {
  const { sandbox } = createEnv();
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 1)]).toString('base64');
  if (sandbox.validatePhotoBlob_(big, 100).code !== 'PHOTO_TOO_LARGE') throw new Error('salah');
  return true;
});
check('validatePhotoBlob_: menerima data-URL prefix', () => {
  const { sandbox } = createEnv();
  const r = sandbox.validatePhotoBlob_('data:image/jpeg;base64,' + TINY_JPEG_B64, 10000);
  if (!r.ok) throw new Error('data-URL ditolak: ' + r.code);
  return true;
});

/* ================= Alur attendance.submit ================= */

console.log('== attendance.submit: alur sukses ==');
check('masuk WFO 07:00:00 → tercatat (baris Absensi + Bukti + file Drive + log)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.open);
  const res = submit(env, token);
  if (!res.ok || res.status !== 'tercatat') throw new Error('respons ' + JSON.stringify(res));
  if (res.tanggal !== '2026-10-15') throw new Error('tanggal ' + res.tanggal);
  if (res.jarak_meter === null) throw new Error('jarak_meter kosong');
  const rows = env.sandbox.readObjects_('Absensi');
  if (rows.length !== 1) throw new Error('baris ' + rows.length);
  if (rows[0].id_pegawai !== 'PEG-ATT-1') throw new Error('pegawai ' + rows[0].id_pegawai);
  if (rows[0].mode_kerja !== 'WFO') throw new Error('mode ' + rows[0].mode_kerja);
  if (rows[0].sumber !== 'reguler') throw new Error('sumber ' + rows[0].sumber);
  if (countBukti(env) !== 1) throw new Error('bukti ' + countBukti(env));
  if (env.driveRegistry.files.length !== 1) throw new Error('file drive ' + env.driveRegistry.files.length);
  const logRows = env.sandbox.readObjects_('LogAktivitas');
  if (!logRows.some((r) => r.aksi === 'attendance_recorded')) throw new Error('log absensi hilang');
  const logJson = JSON.stringify(logRows);
  if (logJson.indexOf(TINY_JPEG_B64) !== -1) throw new Error('foto bocor ke log');
  return true;
});
check('masuk WFO 08:29:59 → tercatat (batas akhir)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.lastMasuk);
  if (!submit(env, token).ok) throw new Error('ditolak');
  return true;
});
check('pulang 16:00:00 setelah masuk → tercatat', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.openPulang);
  const res = submit(env, token, { jenis: 'pulang', gps: null });
  if (!res.ok) throw new Error('ditolak: ' + res.error);
  if (res.jarak_meter !== null) throw new Error('pulang tidak boleh memuat jarak');
  return true;
});
check('pulang 23:59:59 → tercatat (batas akhir)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.lastPulang);
  if (!submit(env, token, { jenis: 'pulang', gps: null }).ok) throw new Error('ditolak');
  return true;
});
check('Minggu 07:00 tetap diterima (DEC-P18: tanpa filter hari)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.sundayOpen);
  const res = submit(env, token);
  if (!res.ok) throw new Error('ditolak: ' + res.error);
  if (res.tanggal !== '2026-10-18') throw new Error('tanggal ' + res.tanggal);
  return true;
});
check('masuk WFH_WFA tanpa GPS → tercatat, koordinat kosong', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const res = submit(env, token, { mode_kerja: 'WFH_WFA', gps: null });
  if (!res.ok) throw new Error('ditolak: ' + res.error);
  const row = env.sandbox.readObjects_('Absensi')[0];
  if (row.lintang !== '') throw new Error('lintang terisi: ' + row.lintang);
  if (row.jarak_meter !== '') throw new Error('jarak terisi');
  return true;
});
check('pulang WFO tanpa GPS → tercatat (GPS hanya wajib masuk WFO)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.openPulang);
  if (!submit(env, token, { jenis: 'pulang', gps: null }).ok) throw new Error('ditolak');
  return true;
});
check('masuk WFH_WFA dengan payload gps → gps diabaikan backend', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token, {
    mode_kerja: 'WFH_WFA',
    gps: { lat: 10.0, lng: 20.0, accuracy: 5 }
  });
  const row = env.sandbox.readObjects_('Absensi')[0];
  if (row.lintang !== '' || row.bujur !== '') throw new Error('gps tidak diabaikan');
  return true;
});

console.log('== attendance.submit: penolakan aturan waktu ==');
check('masuk 06:59:59 → TIME_WINDOW, tanpa tulisan apa pun', () => {
  const { env, token } = envAttendance();
  atTime(env, T.beforeOpen);
  throwsCode('TIME_WINDOW', () => submit(env, token), 'TIME_WINDOW');
  if (countAbsensi(env) !== 0 || countBukti(env) !== 0 || env.driveRegistry.files.length !== 0) {
    throw new Error('ada tulisan saat ditolak');
  }
  return true;
});
check('masuk 08:30:00 diterima TEPAT_WAKTU', () => {
  const { env, token } = envAttendance();
  atTime(env, T.afterMasuk);
  const r = submit(env, token);
  eq('status respons', r.status, 'tercatat');
  const rec = env.sandbox.findAbsensiById_(r.id_absensi);
  eq('status masuk 08:30', rec.status, 'TEPAT_WAKTU');
  eq('foto tersimpan', env.driveRegistry.files.length, 1);
  return true;
});
check('masuk 08:30:01 diterima TERLAMBAT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.afterMasuk + 1000);
  const r = submit(env, token);
  eq('status masuk setelah batas', env.sandbox.findAbsensiById_(r.id_absensi).status, 'TERLAMBAT');
  return true;
});
check('pulang 15:59:59 → TIME_WINDOW', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.beforePulang);
  throwsCode('TIME_WINDOW', () => submit(env, token, { jenis: 'pulang', gps: null }), 'TIME_WINDOW');
  return true;
});
check('pulang 00:00:01 hari berikutnya → TIME_WINDOW (lintas tanggal)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.nextDay);
  throwsCode('TIME_WINDOW',
    () => submit(env, token, { jenis: 'pulang', gps: null }), 'TIME_WINDOW');
  if (countAbsensi(env) !== 1) throw new Error('baris berubah');
  return true;
});

console.log('== attendance.submit: GPS WFO ==');
check('masuk WFO tanpa gps → GPS_REQUIRED', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('GPS_REQUIRED', () => submit(env, token, { gps: null }), 'GPS_REQUIRED');
  if (countAbsensi(env) !== 0) throw new Error('tetap tercatat');
  return true;
});
check('masuk WFO tanpa konfigurasi kantor → OFFICE_NOT_CONFIGURED', () => {
  const { env, token } = envAttendance({ office: false });
  atTime(env, T.midMasuk);
  throwsCode('OFFICE_NOT_CONFIGURED', () => submit(env, token), 'OFFICE_NOT_CONFIGURED');
  if (countAbsensi(env) !== 0) throw new Error('tetap tercatat');
  return true;
});
check('masuk WFO di luar radius → OUT_OF_RADIUS', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const latFar = OFFICE.lat + 200 / M_PER_DEG_LAT;
  throwsCode('OUT_OF_RADIUS',
    () => submit(env, token, { gps: { lat: latFar, lng: OFFICE.lng, accuracy: 10 } }),
    'OUT_OF_RADIUS');
  return true;
});
check('masuk WFO koordinat tidak valid → GPS_INVALID', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('GPS_INVALID',
    () => submit(env, token, { gps: { lat: 999, lng: 0 } }), 'GPS_INVALID');
  return true;
});

console.log('== attendance.submit: duplikat, idempotensi, prasyarat ==');
check('masuk ganda pada tanggal sama → DUPLICATE', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  throwsCode('DUPLICATE', () => submit(env, token), 'DUPLICATE');
  if (countAbsensi(env) !== 1) throw new Error('baris ' + countAbsensi(env));
  return true;
});
check('retry dengan id_absensi sama (respons hilang) → sukses idempoten, 1 baris', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const id = nextId();
  const first = submit(env, token, { id_absensi: id });
  if (!first.ok) throw new Error('percobaan pertama gagal');
  const replay = submit(env, token, { id_absensi: id });
  if (!replay.ok) throw new Error('replay ditolak: ' + replay.error);
  if (replay.id_absensi !== id) throw new Error('id berbeda');
  if (countAbsensi(env) !== 1) throw new Error('duplikat baris');
  if (env.driveRegistry.files.length !== 1) throw new Error('file ganda');
  return true;
});
check('pulang tanpa masuk berhasil dengan TANPA_ABSEN_MASUK', () => {
  const { env, token } = envAttendance();
  atTime(env, T.openPulang);
  const res = submit(env, token, { jenis: 'pulang', mode_kerja: 'WFH_WFA', gps: null });
  const row = env.sandbox.findAbsensiById_(res.id_absensi);
  eq('tanggal server', row.tanggal, '2026-10-15');
  eq('status kondisi', row.status, 'TANPA_ABSEN_MASUK');
  eq('uraian tersimpan', row.uraian_pekerjaan, 'Pekerjaan hari ini');
  eq('output tersimpan', row.output_pekerjaan, 'Output pekerjaan');
  eq('baris tunggal tanpa masuk palsu', countAbsensi(env), 1);
  eq('jenis tersimpan', row.jenis, 'pulang');
  eq('GPS kosong', row.lintang, '');
  eq('foto tersimpan', countBukti(env), 1);
  return true;
});
check('pulang tanpa uraian ditolak sebelum Drive/Sheets', () => {
  const { env, token } = envAttendance();
  atTime(env, T.openPulang);
  throwsCode('INVALID_INPUT', () => submit(env, token, {
    jenis: 'pulang', gps: null, uraian_pekerjaan: ''
  }), 'INVALID_INPUT');
  eq('tanpa absensi', countAbsensi(env), 0);
  eq('tanpa bukti', countBukti(env), 0);
  eq('tanpa file', env.driveRegistry.files.length, 0);
  return true;
});
check('pulang tanpa output ditolak sebelum Drive/Sheets', () => {
  const { env, token } = envAttendance();
  atTime(env, T.openPulang);
  throwsCode('INVALID_INPUT', () => submit(env, token, {
    jenis: 'pulang', gps: null, output_pekerjaan: ''
  }), 'INVALID_INPUT');
  eq('tanpa absensi', countAbsensi(env), 0);
  eq('tanpa file', env.driveRegistry.files.length, 0);
  return true;
});
check('pulang tanpa foto ditolak', () => {
  const { env, token } = envAttendance();
  atTime(env, T.openPulang);
  throwsCode('INVALID_INPUT', () => submit(env, token, {
    jenis: 'pulang', gps: null, foto_base64: undefined
  }), 'INVALID_INPUT');
  eq('tanpa absensi', countAbsensi(env), 0);
  eq('tanpa file', env.driveRegistry.files.length, 0);
  return true;
});
check('status pulang normal tidak menyalin status TERLAMBAT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.afterMasuk + 60 * 60 * 1000);
  const masukRes = submit(env, token);
  eq('masuk terlambat', env.sandbox.findAbsensiById_(masukRes.id_absensi).status, 'TERLAMBAT');
  atTime(env, T.openPulang);
  const pulangRes = submit(env, token, { jenis: 'pulang', gps: null });
  eq('status pulang normal kosong', env.sandbox.findAbsensiById_(pulangRes.id_absensi).status, '');
  return true;
});
check('status TERLAMBAT diformat merah satu kali', () => {
  const { env } = envAttendance();
  const sheet = env.spreadsheet.getSheetByName('Absensi');
  const late = sheet.getConditionalFormatRules().filter((rule) =>
    rule._style && rule._style.value === 'TERLAMBAT');
  eq('satu rule', late.length, 1);
  eq('latar merah muda', late[0]._style.background, '#fce8e6');
  eq('teks merah', late[0]._style.fontColor, '#b3261e');
  env.sandbox.initializeSheets();
  eq('idempotensi', sheet.getConditionalFormatRules().length, 1);
  return true;
});
check('pulang ganda → DUPLICATE', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.openPulang);
  submit(env, token, { jenis: 'pulang', gps: null });
  throwsCode('DUPLICATE',
    () => submit(env, token, { jenis: 'pulang', gps: null }), 'DUPLICATE');
  if (countAbsensi(env) !== 2) throw new Error('baris ' + countAbsensi(env));
  return true;
});
check('pulang tanpa masuk kedua kali tetap DUPLICATE', () => {
  const { env, token } = envAttendance();
  atTime(env, T.openPulang);
  const first = submit(env, token, { jenis: 'pulang', gps: null });
  throwsCode('DUPLICATE', () => submit(env, token, { jenis: 'pulang', gps: null }), 'DUPLICATE');
  eq('satu catatan', countAbsensi(env), 1);
  eq('satu file', env.driveRegistry.files.length, 1);
  eq('status marker', env.sandbox.findAbsensiById_(first.id_absensi).status, 'TANPA_ABSEN_MASUK');
  return true;
});
check('id_absensi dipakai untuk pegawai lain → INVALID_INPUT (bentrok ID)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const id = nextId();
  submit(env, token, { id_absensi: id });
  // Pegawai kedua di env sama mencoba memakai ID yang sama (via sesi lain).
  seedAccount(env.sandbox, env.props, {
    nip: '5555666677778888', pin: '998877', iterations: 1000,
    idPegawai: 'PEG-ATT-2', idAkun: 'AKN-ATT-2', nama: 'Pegawai Dua'
  });
  const token2 = env.sandbox
    .handleLogin_({ nip: '5555666677778888', pin: '998877' }, 'POST').token;
  throwsCode('INVALID_INPUT',
    () => submit(env, token2, { id_absensi: id }), 'INVALID_INPUT');
  return true;
});

console.log('== attendance.submit: autentikasi & input ==');
check('tanpa token → UNAUTHORIZED', () => {
  const { env } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('UNAUTHORIZED', () => submit(env, ''), 'UNAUTHORIZED');
  return true;
});
check('token palsu → UNAUTHORIZED', () => {
  const { env } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('UNAUTHORIZED', () => submit(env, 'token-palsu'), 'UNAUTHORIZED');
  return true;
});
check('akun dinonaktifkan → sesi dicabut → UNAUTHORIZED', () => {
  const { env, token } = envAttendance();
  seedAccount(env.sandbox, env.props, {
    nip: '9000111122223333', pin: '112233', iterations: 1000,
    peran: 'admin', idPegawai: 'PEG-ADM-2', idAkun: 'AKN-ADM-2', nama: 'Admin'
  });
  const adminToken = env.sandbox
    .handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST').token;
  env.sandbox.handleAccountSetActive_(
    { token: adminToken, id_akun: 'AKN-ATT-1', aktif: false }, 'POST');
  atTime(env, T.midMasuk);
  throwsCode('UNAUTHORIZED', () => submit(env, token), 'UNAUTHORIZED');
  return true;
});
check('id_pegawai palsu di body diabaikan (identitas dari sesi)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token, { id_pegawai: 'PEG-KORBAN' });
  const row = env.sandbox.readObjects_('Absensi')[0];
  if (row.id_pegawai !== 'PEG-ATT-1') throw new Error('id_pegawai ' + row.id_pegawai);
  return true;
});
check('timestamp klien diabaikan; waktu_server dari server', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token, { waktu_klien: '1999-01-01T00:00:00Z', tanggal: '1999-01-01' });
  const row = env.sandbox.readObjects_('Absensi')[0];
  if (row.waktu_server !== new Date(T.midMasuk).toISOString()) {
    throw new Error('waktu_server ' + row.waktu_server);
  }
  if (row.tanggal !== '2026-10-15') throw new Error('tanggal ' + row.tanggal);
  return true;
});
check('mode kerja tidak valid → INVALID_INPUT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('INVALID_INPUT', () => submit(env, token, { mode_kerja: 'WFH' }), 'INVALID_INPUT');
  throwsCode('INVALID_INPUT (kosong)', () => submit(env, token, { mode_kerja: '' }), 'INVALID_INPUT');
  return true;
});
check('jenis tidak valid → INVALID_INPUT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('INVALID_INPUT', () => submit(env, token, { jenis: 'susulan' }), 'INVALID_INPUT');
  return true;
});
check('id_absensi tidak valid → INVALID_INPUT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('INVALID_INPUT', () => submit(env, token, { id_absensi: 'x' }), 'INVALID_INPUT');
  throwsCode('INVALID_INPUT (kosong)', () => submit(env, token, { id_absensi: '' }), 'INVALID_INPUT');
  return true;
});
check('foto tidak ada → INVALID_INPUT', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('INVALID_INPUT', () => submit(env, token, { foto_base64: '' }), 'INVALID_INPUT');
  return true;
});
check('foto base64 rusak → PHOTO_INVALID', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('PHOTO_INVALID', () => submit(env, token, { foto_base64: '@@!!@@' }), 'PHOTO_INVALID');
  return true;
});
check('foto bukan JPEG (magic PNG) → PHOTO_INVALID', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('PHOTO_INVALID', () => submit(env, token, { foto_base64: PNG_MAGIC_B64 }), 'PHOTO_INVALID');
  return true;
});
check('foto melebihi PHASE3_PHOTO_MAX_BYTES → PHOTO_TOO_LARGE', () => {
  const { env, token } = envAttendance();
  env.props.set('PHASE3_PHOTO_MAX_BYTES', '10');
  atTime(env, T.midMasuk);
  throwsCode('PHOTO_TOO_LARGE', () => submit(env, token), 'PHOTO_TOO_LARGE');
  return true;
});
check('metode GET ditolak', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  throwsCode('METHOD_NOT_ALLOWED',
    () => env.sandbox.handleAttendanceSubmit_({ token, jenis: 'masuk' }, 'GET'),
    'METHOD_NOT_ALLOWED');
  return true;
});

console.log('== attendance.submit: kegagalan penyimpanan ==');
check('Drive gagal unggah → ATTENDANCE_NOT_STORED, tanpa baris', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  // Simulasikan Drive tak terjangkau: akses root folder gagal.
  env.sandbox.DriveApp.getFolderById = () => { throw new Error('drive penuh'); };
  throwsCode('ATTENDANCE_NOT_STORED', () => submit(env, token), 'ATTENDANCE_NOT_STORED');
  if (countAbsensi(env) !== 0 || countBukti(env) !== 0) throw new Error('ada tulisan');
  const logRows = env.sandbox.readObjects_('LogAktivitas');
  if (!logRows.some((r) => r.aksi === 'attendance_drive_failed')) {
    throw new Error('kegagalan drive tidak dicatat');
  }
  return true;
});
check('Sheets gagal setelah Drive → ATTENDANCE_STORAGE_PARTIAL; bukti dikompensasi; foto tetap (audit)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const original = env.sandbox.appendObject_;
  env.sandbox.appendObject_ = function (name, obj) {
    if (name === 'Absensi') throw new Error('sheet penuh');
    return original.call(this, name, obj);
  };
  throwsCode('ATTENDANCE_STORAGE_PARTIAL', () => submit(env, token), 'ATTENDANCE_STORAGE_PARTIAL');
  if (countAbsensi(env) !== 0) throw new Error('absensi seharusnya kosong');
  if (countBukti(env) !== 0) throw new Error('baris bukti seharusnya dikompensasi (dihapus)');
  if (env.driveRegistry.files.length !== 1) throw new Error('file drive seharusnya tetap untuk audit');
  if (env.driveRegistry.files[0]._trashed) throw new Error('file tidak boleh dihapus');
  const logRows = env.sandbox.readObjects_('LogAktivitas');
  if (!logRows.some((r) => r.aksi === 'attendance_storage_partial')) {
    throw new Error('orphan tidak dicatat di LogAktivitas');
  }
  // Retry setelah kegagalan: harus berhasil & tidak menghasilkan ganda.
  env.sandbox.appendObject_ = original;
  const retry = submit(env, token);
  if (!retry.ok) throw new Error('retry gagal: ' + retry.error);
  if (countAbsensi(env) !== 1) throw new Error('retry menghasilkan ' + countAbsensi(env) + ' baris');
  return true;
});
check('foto Drive privat: setSharing defensif dipanggil (bukan publik)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const file = env.driveRegistry.files[0];
  if (!file._shared) throw new Error('setSharing defensif tidak dipanggil');
  return true;
});
check('struktur folder ABSENSI_KPU/YYYY/MM_NamaBulan/DD/Nama_ID dibuat', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const row = env.sandbox.readObjects_('Absensi')[0];
  if (String(row.tanggal) !== '2026-10-15') throw new Error('tanggal');
  const bukti = env.sandbox.readObjects_('BuktiAbsensi')[0];
  const want = 'ABSENSI_KPU/2026/10_Oktober/15/Pegawai_Absensi_PEG-ATT-1/Absen_Masuk.jpg';
  if (String(bukti.path) !== want) throw new Error('path ' + bukti.path);
  const file = env.driveRegistry.files[0];
  if (String(file._name) !== 'Absen_Masuk.jpg') throw new Error('nama file ' + file._name);
  return true;
});
check('folder pegawai berisi ID internal (nama sama tidak tertukar)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const folder = env.driveRegistry.folders.find((f) => /Pegawai_Absensi_PEG-ATT-1$/.test(f._path));
  if (!folder) throw new Error('folder pegawai tidak ada');
  if (folder._path.indexOf('ABSENSI_KPU/2026/10_Oktober/15/') === -1) {
    throw new Error('path folder ' + folder._path);
  }
  return true;
});

console.log('== Struktur folder foto absensi (DEC-P29) ==');
check('nama folder bulan = MM_NamaBulan (Indonesia)', () => {
  const { env } = envAttendance();
  eq('Oktober', env.sandbox.monthFolderName_('10'), '10_Oktober');
  eq('Januari', env.sandbox.monthFolderName_(1), '01_Januari');
  eq('Desember', env.sandbox.monthFolderName_('12'), '12_Desember');
  eq('bulan tak valid', env.sandbox.monthFolderName_(13), 'BELUM_DITETAPKAN');
});
check('nama folder pegawai = Nama_ID (fungsi murni)', () => {
  const { env } = envAttendance();
  eq('nama+id', env.sandbox.pegawaiFolderName_('Andi Saputra', 'PEG-00123'),
    'Andi_Saputra_PEG-00123');
  eq('karakter terlarang disanitasi', env.sandbox.pegawaiFolderName_('A/B:C', 'PEG-1'),
    'A_B_C_PEG-1');
  eq('nama kosong → TANPA_NAMA', env.sandbox.pegawaiFolderName_('', 'PEG-1'), 'TANPA_NAMA_PEG-1');
});
check('check-in menyimpan Absen_Masuk.jpg di folder tanggal', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const bukti = env.sandbox.readObjects_('BuktiAbsensi')[0];
  eq('path', bukti.path,
    'ABSENSI_KPU/2026/10_Oktober/15/Pegawai_Absensi_PEG-ATT-1/Absen_Masuk.jpg');
  eq('nama file', env.driveRegistry.files[0]._name, 'Absen_Masuk.jpg');
  eq('jenis', env.sandbox.readObjects_('Absensi')[0].jenis, 'masuk');
});
check('check-out menyimpan Absen_Pulang.jpg pada folder pegawai yang sama', () => {
  const { env, token } = envAttendance();
  submitPulang(env, token);
  const bukti = env.sandbox.readObjects_('BuktiAbsensi');
  eq('jumlah bukti', bukti.length, 2);
  eq('path pulang', bukti[1].path,
    'ABSENSI_KPU/2026/10_Oktober/15/Pegawai_Absensi_PEG-ATT-1/Absen_Pulang.jpg');
  const names = env.driveRegistry.files.map((f) => f._name).sort();
  eq('nama file', names.join(','), 'Absen_Masuk.jpg,Absen_Pulang.jpg');
});
check('tanggal berbeda → folder tanggal berbeda', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  atTime(env, T.sundayOpen);
  submit(env, token, { id_absensi: nextId() });
  const bukti = env.sandbox.readObjects_('BuktiAbsensi');
  eq('path hari-1', bukti[0].path,
    'ABSENSI_KPU/2026/10_Oktober/15/Pegawai_Absensi_PEG-ATT-1/Absen_Masuk.jpg');
  eq('path hari-2 (18 Okt)', bukti[1].path,
    'ABSENSI_KPU/2026/10_Oktober/18/Pegawai_Absensi_PEG-ATT-1/Absen_Masuk.jpg');
});
check('KLIK GANDA: duplikat masuk ditolak, tidak ada file kedua', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  let code = null;
  try { submit(env, token, { id_absensi: nextId() }); } catch (err) { code = err && err.code; }
  eq('kode', code, 'DUPLICATE');
  eq('jumlah file', env.driveRegistry.files.length, 1);
  eq('jumlah bukti', countBukti(env), 1);
});
check('RETRY idempoten: id_absensi sama → tidak menambah file/bukti (anti-duplikat)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const id = nextId();
  const first = submit(env, token, { id_absensi: id });
  const second = submit(env, token, { id_absensi: id });
  eq('id sama', second.id_absensi, first.id_absensi);
  eq('jumlah file', env.driveRegistry.files.length, 1);
  eq('jumlah bukti', countBukti(env), 1);
  eq('jumlah absensi', countAbsensi(env), 1);
});
check('folder dipakai ulang (tidak dibuat ulang) untuk absensi berikutnya', () => {
  const { env, token } = envAttendance();
  submitPulang(env, token);
  const pegawaiFolders = env.driveRegistry.folders
    .filter((f) => /Pegawai_Absensi_PEG-ATT-1$/.test(f._path));
  eq('folder pegawai unik', pegawaiFolders.length, 1);
  const dayFolders = env.driveRegistry.folders.filter((f) => /\/15$/.test(f._path));
  eq('folder tanggal unik', dayFolders.length, 1);
});
check('KEGAGALAN DRIVE: tidak ada file kosong/baris, respons bukan sukses', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const original = env.sandbox.Utilities.newBlob;
  env.sandbox.Utilities.newBlob = function () { throw new Error('DriveApp gagal (uji)'); };
  let code = null;
  try { submit(env, token); } catch (err) { code = err && err.code; }
  env.sandbox.Utilities.newBlob = original;
  eq('kode', code, 'ATTENDANCE_NOT_STORED');
  eq('jumlah file', env.driveRegistry.files.length, 0);
  eq('jumlah absensi', countAbsensi(env), 0);
  eq('jumlah bukti', countBukti(env), 0);
  const logs = env.sandbox.readObjects_('LogAktivitas');
  if (!logs.find((l) => String(l.aksi) === 'attendance_drive_failed')) {
    throw new Error('log attendance_drive_failed tidak ada');
  }
});
check('KEGAGALAN SHEETS: baris tak tertulis, file orphan dicatat (bukan sukses)', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const original = env.sandbox.appendObject_;
  env.sandbox.appendObject_ = function (name, obj) {
    if (name === 'Absensi' || name === 'BuktiAbsensi') {
      throw new Error('Spreadsheet gagal (uji)');
    }
    return original.call(env.sandbox, name, obj);
  };
  let code = null;
  try { submit(env, token); } catch (err) { code = err && err.code; }
  if (code !== 'ATTENDANCE_STORAGE_PARTIAL' && code !== 'ATTENDANCE_NOT_STORED') {
    throw new Error('kode: ' + code);
  }
  eq('jumlah absensi', countAbsensi(env), 0);
  const logs = env.sandbox.readObjects_('LogAktivitas');
  const partial = logs.find((l) => String(l.aksi) === 'attendance_storage_partial');
  if (!partial) throw new Error('log attendance_storage_partial tidak ada');
  if (String(partial.detail).indexOf('orphan_drive_file=') === -1) {
    throw new Error('detail orphan tidak dicatat: ' + partial.detail);
  }
});
check('foto privat: setSharing defensif dipanggil pada struktur baru', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const file = env.driveRegistry.files[0];
  if (!file._shared) throw new Error('setSharing tidak dipanggil');
  const photo = env.sandbox.readAttendancePhoto_(String(
    env.sandbox.readObjects_('BuktiAbsensi')[0].drive_file_id));
  eq('byte utuh', photo.ukuran, env.driveRegistry.files[0]._bytes.length);
});
check('absensi masuk pada batas 08:30:00 tepat waktu', () => {
  const { env, token } = envAttendance();
  atTime(env, T.afterMasuk);
  const res = submit(env, token);
  eq('status absensi', env.sandbox.findAbsensiById_(res.id_absensi).status, 'TEPAT_WAKTU');
  eq('jumlah file', env.driveRegistry.files.length, 1);
});
check('PIN/token/foto tidak muncul di log', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  submit(env, token);
  const logged = env.logs.join('\n');
  if (logged.indexOf('246810') !== -1) throw new Error('PIN di log');
  if (logged.indexOf(token) !== -1) throw new Error('token di log');
  return true;
});

console.log('== Router & health ==');
check('route_ attendance.submit terhubung', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const res = env.sandbox.route_('attendance.submit',
    { token, id_absensi: nextId(), jenis: 'masuk', mode_kerja: 'WFO', foto_base64: TINY_JPEG_B64, gps: { lat: OFFICE.lat, lng: OFFICE.lng } },
    'POST');
  if (!res.ok) throw new Error('gagal: ' + res.error);
  return true;
});
check('health phase admin + officeLocationConfigured', () => {
  const withOffice = envAttendance();
  const h1 = withOffice.env.sandbox.handleHealth_();
  if (h1.phase !== 'report') throw new Error('phase ' + h1.phase);
  if (h1.officeLocationConfigured !== true) throw new Error('koordinat harus true');
  const noOffice = envAttendance({ office: false });
  if (noOffice.env.sandbox.handleHealth_().officeLocationConfigured !== false) {
    throw new Error('koordinat harus false');
  }
  return true;
});
check('doPost attendance.submit mengembalikan JSON', () => {
  const { env, token } = envAttendance();
  atTime(env, T.midMasuk);
  const out = env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'attendance.submit',
        token,
        data: {
          id_absensi: nextId(), jenis: 'masuk', mode_kerja: 'WFO',
          foto_base64: TINY_JPEG_B64, gps: { lat: OFFICE.lat, lng: OFFICE.lng }
        }
      })
    }
  });
  const parsed = JSON.parse(out.getContent());
  if (!parsed.ok) throw new Error('bukan ok: ' + out.getContent());
  return true;
});

check('migrasi header Absensi mempertahankan data lama dan menambah kolom baru', () => {
  const env = createEnv({ props: { SPREADSHEET_ID: 'TEST_SS_ID' } });
  const old = env.spreadsheet.insertSheet('Absensi');
  old.appendRow(['id_absensi', 'id_pegawai', 'tanggal', 'jenis', 'mode_kerja', 'waktu_server',
    'lintang', 'bujur', 'akurasi', 'jarak_meter', 'sumber', 'id_bukti',
    'dibuat_pada', 'diubah_pada', 'diubah_oleh']);
  old.appendRow(['ABS-HIST-1', 'PEG-HIST-1', '2026-10-01', 'masuk', 'WFO',
    '2026-10-01T00:00:00.000Z', '', '', '', '', 'reguler', 'BKT-HIST-1',
    '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', 'PEG-HIST-1']);
  env.sandbox.initializeSheets();
  const prior = env.sandbox.readObjects_('Absensi')[0];
  eq('historical id', prior.id_absensi, 'ABS-HIST-1');
  eq('historical timestamp', prior.dibuat_pada, '2026-10-01T00:00:00.000Z');
  env.sandbox.appendObject_('Absensi', {
    id_absensi: 'ABS-NEW-1', id_pegawai: 'PEG-NEW-1', tanggal: '2026-10-24',
    jenis: 'pulang', status: 'TANPA_ABSEN_MASUK',
    uraian_pekerjaan: 'Uraian TEST', output_pekerjaan: 'Output TEST'
  });
  const rows = env.sandbox.readObjects_('Absensi');
  eq('legacy retained', rows.length, 2);
  eq('new status by header', rows[1].status, 'TANPA_ABSEN_MASUK');
  eq('new work field by header', rows[1].uraian_pekerjaan, 'Uraian TEST');
  return true;
});

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

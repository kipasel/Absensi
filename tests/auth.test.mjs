/*
 * Pengujian autentikasi — PHASE 2.
 * Jalankan: node tests/auth.test.mjs
 *
 * Mencakup: vektor PBKDF2-HMAC-SHA256 RFC 7914 §11, primitif PIN/token/lockout,
 * serta alur AuthService (login, sesi, logout, admin, dan reset PIN).
 */
import { createEnv, nodeHmac, seedAccount } from './harness.mjs';

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

/* ---------------- Vektor RFC 7914 §11 ---------------- */

function hexOf(sandbox, bytes) {
  return sandbox.bytesToHex_(bytes);
}

console.log('== PBKDF2-HMAC-SHA256: vektor RFC 7914 §11 ==');
check('P="passwd", S="salt", c=1, dkLen=64', () => {
  const { sandbox } = createEnv();
  const dk = sandbox.pbkdf2Sha256_(
    sandbox.utf8Bytes_('passwd'), sandbox.utf8Bytes_('salt'), 1, 64, nodeHmac);
  const expected = '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
    '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783';
  if (hexOf(sandbox, dk) !== expected) throw new Error('hasil tidak cocok');
  return true;
});

check('P="Password", S="NaCl", c=80000, dkLen=64', () => {
  const { sandbox } = createEnv();
  const dk = sandbox.pbkdf2Sha256_(
    sandbox.utf8Bytes_('Password'), sandbox.utf8Bytes_('NaCl'), 80000, 64, nodeHmac);
  const expected = '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56' +
    'a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d';
  if (hexOf(sandbox, dk) !== expected) throw new Error('hasil tidak cocok');
  return true;
});

/* ---------------- Primitif byte/encoding ---------------- */

console.log('== Primitif byte & encoding ==');
check('utf8Bytes_ ASCII', () => {
  const { sandbox } = createEnv();
  const b = sandbox.utf8Bytes_('abc');
  if (b.join(',') !== '97,98,99') throw new Error('hasil ' + b.join(','));
  return true;
});
check('utf8Bytes_ 2-byte (é U+00E9)', () => {
  const { sandbox } = createEnv();
  const b = sandbox.utf8Bytes_('\u00e9');
  if (b.join(',') !== '195,169') throw new Error('hasil ' + b.join(','));
  return true;
});
check('bytesToHex_', () => {
  const { sandbox } = createEnv();
  if (sandbox.bytesToHex_([0, 15, 255]) !== '000fff') throw new Error('salah');
  return true;
});
check('intTo4Bytes_ big-endian', () => {
  const { sandbox } = createEnv();
  if (sandbox.intTo4Bytes_(1).join(',') !== '0,0,0,1') throw new Error('salah');
  return true;
});
check('constantTimeEqualStr_ sama/berbeda', () => {
  const { sandbox } = createEnv();
  if (sandbox.constantTimeEqualStr_('abc', 'abc') !== true) throw new Error('harus sama');
  if (sandbox.constantTimeEqualStr_('abc', 'abd') !== false) throw new Error('harus beda');
  if (sandbox.constantTimeEqualStr_('abc', 'abcd') !== false) throw new Error('beda panjang');
  return true;
});
check('hmacSha256_ via Utilities = Node crypto', () => {
  const { sandbox } = createEnv();
  const a = sandbox.hmacSha256_(sandbox.utf8Bytes_('key'), sandbox.utf8Bytes_('msg'));
  const b = nodeHmac(sandbox.utf8Bytes_('key'), sandbox.utf8Bytes_('msg'));
  if (sandbox.bytesToHex_(a) !== sandbox.bytesToHex_(b)) throw new Error('tidak sama');
  return true;
});

/* ---------------- PIN ---------------- */

console.log('== PIN (make/verify) ==');
check('createPinRecord_ + verifyPin_ benar/salah', () => {
  const { sandbox } = createEnv();
  const rec = sandbox.createPinRecord_('123456', 1000);
  if (rec.algo !== 'pbkdf2-sha256') throw new Error('algo salah');
  if (rec.iterations !== 1000) throw new Error('iterasi salah');
  if (!rec.salt || !rec.hash) throw new Error('salt/hash kosong');
  if (sandbox.verifyPin_('123456', rec) !== true) throw new Error('PIN benar ditolak');
  if (sandbox.verifyPin_('654321', rec) !== false) throw new Error('PIN salah diterima');
  return true;
});
check('salt unik: PIN sama menghasilkan hash berbeda', () => {
  const { sandbox } = createEnv();
  const a = sandbox.createPinRecord_('000000', 500);
  const b = sandbox.createPinRecord_('000000', 500);
  if (a.salt === b.salt) throw new Error('salt sama');
  if (a.hash === b.hash) throw new Error('hash sama');
  return true;
});
check('verifyPin_ validasi iterasi dari record', () => {
  const { sandbox } = createEnv();
  const rec = sandbox.createPinRecord_('999999', 2000);
  if (sandbox.verifyPin_('999999', rec) !== true) throw new Error('gagal iterasi custom');
  return true;
});

/* ---------------- Token, lockout, sesi ---------------- */

console.log('== Token, lockout, validitas sesi ==');
check('hashToken_ deterministik & bukan token mentah', () => {
  const { sandbox } = createEnv();
  const t = 'contoh-token';
  const h1 = sandbox.hashToken_(t);
  const h2 = sandbox.hashToken_(t);
  if (h1 !== h2) throw new Error('tidak deterministik');
  if (h1 === t) throw new Error('hash sama dengan token');
  return true;
});
check('generateSessionToken_ format & keunikan', () => {
  const { sandbox } = createEnv();
  const t = sandbox.generateSessionToken_();
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Error('format salah: ' + t.length);
  if (t === sandbox.generateSessionToken_()) throw new Error('token kembar');
  return true;
});
check('nextLockState_ transisi', () => {
  const { sandbox } = createEnv();
  const p = { maxFailures: 5, lockMs: 1000 };
  let s = { failedCount: 0, lockUntilMs: null };
  for (let i = 1; i <= 4; i++) {
    s = sandbox.nextLockState_(s.failedCount, s.lockUntilMs, false, 0, p);
    if (s.failedCount !== i || s.lockUntilMs !== null) throw new Error('gagal pada ' + i);
  }
  s = sandbox.nextLockState_(s.failedCount, s.lockUntilMs, false, 100, p);
  if (s.failedCount !== 0 || s.lockUntilMs !== 1100) throw new Error('lock tidak aktif');
  const r = sandbox.nextLockState_(3, null, true, 0, p);
  if (r.failedCount !== 0 || r.lockUntilMs !== null) throw new Error('reset gagal');
  return true;
});
check('isSessionValid_', () => {
  const { sandbox } = createEnv();
  if (sandbox.isSessionValid_({ revokedAtMs: null, expiresAtMs: 2000 }, 1000) !== true) {
    throw new Error('valid ditolak');
  }
  if (sandbox.isSessionValid_({ revokedAtMs: 500, expiresAtMs: 2000 }, 1000) !== false) {
    throw new Error('revoked diterima');
  }
  if (sandbox.isSessionValid_({ revokedAtMs: null, expiresAtMs: 500 }, 1000) !== false) {
    throw new Error('kedaluwarsa diterima');
  }
  if (sandbox.isSessionValid_(null, 1000) !== false) throw new Error('null diterima');
  return true;
});

/* ---------------- AuthService (integrasi) ---------------- */

console.log('== AuthService: login & sesi ==');

function envWithAccount(opts = {}) {
  const env = createEnv({ props: {} });
  const seeded = seedAccount(env.sandbox, env.props, Object.assign({
    nip: '1111222233334444',
    pin: '246810',
    iterations: 1000
  }, opts));
  return { env, seeded };
}

check('login sukses mengembalikan token & peran', () => {
  const { env } = envWithAccount();
  const res = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810', agen: 'uji' }, 'POST');
  if (!res.ok || !res.token) throw new Error('login gagal');
  if (res.peran !== 'pegawai') throw new Error('peran salah');
  return true;
});

check('login gagal (PIN salah) & user tak ada → pesan identik', () => {
  const { env } = envWithAccount();
  const wrongPin = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '000000' }, 'POST');
  const noUser = env.sandbox.handleLogin_({ nip: '9999999999999999', pin: '000000' }, 'POST');
  if (wrongPin.error !== 'AUTH_FAILED') throw new Error('kode salah');
  if (wrongPin.error !== noUser.error) throw new Error('kode berbeda');
  if (wrongPin.message !== noUser.message) throw new Error('pesan berbeda (bocor info)');
  return true;
});

check('lockout setelah 5 kegagalan; PIN benar tetap ditolak', () => {
  const { env } = envWithAccount({ pin: '112233' });
  for (let i = 0; i < 5; i++) {
    env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '000000' }, 'POST');
  }
  const locked = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '112233' }, 'POST');
  if (locked.ok) throw new Error('login diterima saat terkunci');
  const akun = env.sandbox.findAkunByPegawaiId_('PEG-TEST-1');
  if (!akun.terkunci_sampai) throw new Error('terkunci_sampai kosong');
  return true;
});

check('session.check token valid & invalid', () => {
  const { env, seeded } = envWithAccount();
  const login = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  const good = env.sandbox.handleSessionCheck_({ token: login.token }, 'POST');
  if (!good.ok) throw new Error('sesi valid ditolak');
  let code = null;
  try {
    env.sandbox.handleSessionCheck_({ token: 'token-palsu' }, 'POST');
  } catch (err) {
    code = err.code;
  }
  if (code !== 'UNAUTHORIZED') throw new Error('token palsu: kode ' + code);
  if (seeded.akun.peran !== 'pegawai') throw new Error('data seed salah');
  return true;
});

check('logout mencabut sesi', () => {
  const { env } = envWithAccount();
  const login = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  env.sandbox.handleLogout_({ token: login.token }, 'POST');
  throwsCode('sesi setelah logout ditolak',
    () => env.sandbox.handleSessionCheck_({ token: login.token }, 'POST'),
    'UNAUTHORIZED');
  return true;
});

check('login akun nonaktif ditolak', () => {
  const { env } = envWithAccount({ aktif: false });
  const res = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  if (res.ok) throw new Error('akun nonaktif diterima');
  if (res.error !== 'AUTH_FAILED') throw new Error('kode ' + res.error);
  return true;
});

check('login tanpa NIP/PIN ditolak', () => {
  const { env } = envWithAccount();
  if (env.sandbox.handleLogin_({ nip: '', pin: '246810' }, 'POST').error !== 'AUTH_FAILED') {
    throw new Error('tanpa NIP tidak ditolak');
  }
  if (env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '' }, 'POST').error !== 'AUTH_FAILED') {
    throw new Error('tanpa PIN tidak ditolak');
  }
  return true;
});

check('peran palsu di body diabaikan (peran dari server)', () => {
  const { env } = envWithAccount();
  const res = env.sandbox.handleLogin_(
    { nip: '1111222233334444', pin: '246810', peran: 'admin' }, 'POST');
  if (!res.ok) throw new Error('login gagal');
  if (res.peran !== 'pegawai') throw new Error('peran palsu diterima: ' + res.peran);
  return true;
});

check('PIN/token mentah tidak muncul di log', () => {
  const { env } = envWithAccount({ pin: '778899' });
  const res = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '778899' }, 'POST');
  const joined = env.logs.join('\n');
  if (joined.indexOf('778899') !== -1) throw new Error('PIN muncul di log');
  if (res.token && joined.indexOf(res.token) !== -1) throw new Error('token muncul di log');
  return true;
});

check('login menolak metode GET', () => {
  const { env } = envWithAccount();
  throwsCode('GET ditolak',
    () => env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'GET'),
    'METHOD_NOT_ALLOWED');
  return true;
});

/* ---------------- Manajemen akun admin ---------------- */

console.log('== AuthService: admin & otorisasi ==');

function envWithAdmin() {
  const env = createEnv({ props: {} });
  seedAccount(env.sandbox, env.props, {
    nip: '9000111122223333', pin: '112233', iterations: 1000,
    peran: 'admin', idPegawai: 'PEG-ADM', idAkun: 'AKN-ADM', nama: 'Admin Uji'
  });
  seedAccount(env.sandbox, env.props, {
    nip: '1111222233334444', pin: '246810', iterations: 1000,
    idPegawai: 'PEG-USER', idAkun: 'AKN-USER', nama: 'Pegawai Uji'
  });
  return env;
}

check('admin dapat membuat akun baru + PIN 6 digit', () => {
  const env = envWithAdmin();
  const pegawai = {
    id_pegawai: 'PEG-NEW', nama: 'Baru', nip_nipk: '5555666677778888',
    jabatan: 'BELUM DITETAPKAN', unit_kerja: 'BELUM DITETAPKAN', status_aktif: true,
    dibuat_pada: env.sandbox.nowIso_(), dibuat_oleh: 'test',
    diubah_pada: env.sandbox.nowIso_(), diubah_oleh: 'test'
  };
  env.sandbox.appendObject_('Pegawai', pegawai);
  const login = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  const res = env.sandbox.handleAccountCreate_(
    { token: login.token, id_pegawai: 'PEG-NEW', pin: '135790' }, 'POST');
  if (!res.ok || !res.id_akun) throw new Error('gagal membuat akun');
  const akun = env.sandbox.findAkunByPegawaiId_('PEG-NEW');
  if (!akun.pin_hash || !akun.pin_salt) throw new Error('PIN belum disimpan (DEC-P22)');
  if (akun.pin_hash.indexOf('135790') !== -1) throw new Error('PIN tersimpan mentah');
  const loginBaru = env.sandbox.handleLogin_(
    { nip: '5555666677778888', pin: '135790' }, 'POST');
  if (!loginBaru.ok) throw new Error('login dengan PIN baru gagal');
  return true;
});

check('buat akun menolak PIN bukan 6 digit angka', () => {
  const env = envWithAdmin();
  const pegawai = {
    id_pegawai: 'PEG-PIN', nama: 'Uji PIN', nip_nipk: '5555666677779999',
    jabatan: 'BELUM DITETAPKAN', unit_kerja: 'BELUM DITETAPKAN', status_aktif: true,
    dibuat_pada: env.sandbox.nowIso_(), dibuat_oleh: 'test',
    diubah_pada: env.sandbox.nowIso_(), diubah_oleh: 'test'
  };
  env.sandbox.appendObject_('Pegawai', pegawai);
  const login = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  ['12345', '1234567', 'abcdef', '12 456', ''].forEach((pin) => {
    throwsCode('PIN "' + pin + '" ditolak',
      () => env.sandbox.handleAccountCreate_(
        { token: login.token, id_pegawai: 'PEG-PIN', pin }, 'POST'),
      'INVALID_INPUT');
  });
  return true;
});

check('buat akun untuk pegawai tak ada → NOT_FOUND', () => {
  const env = envWithAdmin();
  const login = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  throwsCode('NOT_FOUND',
    () => env.sandbox.handleAccountCreate_(
      { token: login.token, id_pegawai: 'TIDAK-ADA', pin: '654321' }, 'POST'),
    'NOT_FOUND');
  return true;
});

check('buat akun duplikat ditolak', () => {
  const env = envWithAdmin();
  const login = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  throwsCode('DUPLICATE',
    () => env.sandbox.handleAccountCreate_(
      { token: login.token, id_pegawai: 'PEG-USER', pin: '654321' }, 'POST'),
    'DUPLICATE');
  return true;
});

check('non-admin ditolak saat membuat akun', () => {
  const { env } = envWithAccount();
  const login = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  throwsCode('FORBIDDEN',
    () => env.sandbox.handleAccountCreate_(
      { token: login.token, id_pegawai: 'PEG-X', pin: '654321' }, 'POST'),
    'FORBIDDEN');
  return true;
});

check('setActive(false) mencabut sesi akun', () => {
  const env = envWithAdmin();
  const admin = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  const user = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  env.sandbox.handleAccountSetActive_(
    { token: admin.token, id_akun: 'AKN-USER', aktif: false }, 'POST');
  throwsCode('sesi user dicabut',
    () => env.sandbox.handleSessionCheck_({ token: user.token }, 'POST'),
    'UNAUTHORIZED');
  return true;
});

check('resetPin oleh admin: PIN baru berlaku, PIN lama ditolak', () => {
  const env = envWithAdmin();
  const admin = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  const res = env.sandbox.handleResetPin_(
    { token: admin.token, id_akun: 'AKN-USER', pin: '445566' }, 'POST');
  if (!res.ok) throw new Error('reset PIN gagal');
  const akun = env.sandbox.findAkunById_('AKN-USER');
  if (!akun.pin_hash || akun.pin_hash.indexOf('445566') !== -1) {
    throw new Error('hash PIN tidak diperbarui / tersimpan mentah');
  }
  if (env.sandbox.handleLogin_(
    { nip: '1111222233334444', pin: '246810' }, 'POST').ok) {
    throw new Error('PIN lama masih diterima');
  }
  if (!env.sandbox.handleLogin_(
    { nip: '1111222233334444', pin: '445566' }, 'POST').ok) {
    throw new Error('PIN baru tidak diterima');
  }
  return true;
});

check('resetPin membuka kunci akun setelah lockout', () => {
  const env = envWithAdmin();
  const admin = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  for (let i = 0; i < 5; i++) {
    env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '000000' }, 'POST');
  }
  const locked = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  if (locked.ok) throw new Error('akun tidak terkunci');
  env.sandbox.handleResetPin_(
    { token: admin.token, id_akun: 'AKN-USER', pin: '998877' }, 'POST');
  const akun = env.sandbox.findAkunById_('AKN-USER');
  if (String(akun.gagal_login) !== '0' || akun.terkunci_sampai) {
    throw new Error('lockout tidak direset');
  }
  if (!env.sandbox.handleLogin_(
    { nip: '1111222233334444', pin: '998877' }, 'POST').ok) {
    throw new Error('login setelah reset tetap ditolak');
  }
  return true;
});

check('resetPin: otorisasi, format PIN & akun tak ada', () => {
  const env = envWithAdmin();
  const admin = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  const user = env.sandbox.handleLogin_({ nip: '1111222233334444', pin: '246810' }, 'POST');
  throwsCode('non-admin ditolak',
    () => env.sandbox.handleResetPin_({ token: user.token, id_akun: 'AKN-USER', pin: '445566' }, 'POST'),
    'FORBIDDEN');
  throwsCode('tanpa token ditolak',
    () => env.sandbox.handleResetPin_({ id_akun: 'AKN-USER', pin: '445566' }, 'POST'),
    'UNAUTHORIZED');
  throwsCode('PIN bukan 6 digit ditolak',
    () => env.sandbox.handleResetPin_({ token: admin.token, id_akun: 'AKN-USER', pin: '12345' }, 'POST'),
    'INVALID_INPUT');
  throwsCode('tanpa PIN ditolak',
    () => env.sandbox.handleResetPin_({ token: admin.token, id_akun: 'AKN-USER' }, 'POST'),
    'INVALID_INPUT');
  throwsCode('akun tak ada → NOT_FOUND',
    () => env.sandbox.handleResetPin_({ token: admin.token, id_akun: 'AKN-X', pin: '445566' }, 'POST'),
    'NOT_FOUND');
  throwsCode('metode GET ditolak',
    () => env.sandbox.handleResetPin_({ token: admin.token, id_akun: 'AKN-USER', pin: '445566' }, 'GET'),
    'METHOD_NOT_ALLOWED');
  return true;
});

check('resetPin tidak meninggalkan PIN mentah di log', () => {
  const env = envWithAdmin();
  const admin = env.sandbox.handleLogin_({ nip: '9000111122223333', pin: '112233' }, 'POST');
  env.sandbox.handleResetPin_(
    { token: admin.token, id_akun: 'AKN-USER', pin: '135791' }, 'POST');
  if (env.logs.join('\n').indexOf('135791') !== -1) throw new Error('PIN muncul di log');
  return true;
});

/* ---------------- Router ---------------- */

console.log('== Router (Code.gs) ==');
check('route_ health ok & phase admin', () => {
  const { sandbox } = createEnv();
  const res = sandbox.route_('health', {}, 'GET');
  if (!res.ok) throw new Error('health gagal');
  if (res.phase !== 'report') throw new Error('phase salah: ' + res.phase);
  return true;
});
check('route_ aksi tak dikenal', () => {
  const { sandbox } = createEnv();
  if (sandbox.route_('tidak.ada', {}, 'POST').error !== 'UNKNOWN_ACTION') {
    throw new Error('kode salah');
  }
  return true;
});
check('doPost health mengembalikan JSON ok', () => {
  const { sandbox } = createEnv();
  const out = sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'health' }) } });
  const text = out.getContent();
  const parsed = JSON.parse(text);
  if (!parsed.ok) throw new Error('bukan ok: ' + text);
  return true;
});
check('doPost login tanpa kredensial memberi AUTH_FAILED, bukan INTERNAL_ERROR', () => {
  const { sandbox } = createEnv();
  const out = sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'login', data: { nip: '', pin: '' } }) }
  });
  const parsed = JSON.parse(out.getContent());
  if (parsed.error !== 'AUTH_FAILED') throw new Error('kode: ' + parsed.error);
  return true;
});
check('error internal disamarkan (tidak bocorkan detail)', () => {
  const { sandbox } = createEnv();
  // Ganti router dengan fungsi yang melempar error non-AppError.
  sandbox.route_ = function () { throw new Error('detail rahasia internal'); };
  const out = sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'health' }) }
  });
  const parsed = JSON.parse(out.getContent());
  if (parsed.error !== 'INTERNAL_ERROR') throw new Error('kode ' + parsed.error);
  if (/rahasia/.test(JSON.stringify(parsed))) throw new Error('membocorkan detail');
  return true;
});

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

/**
 * AuthService.gs — alur autentikasi & manajemen akun (PHASE 2).
 *
 * Keputusan:
 * - Login: NIP/NIPK + PIN (D0).
 * - Token sesi dikirim klien di body; disimpan sebagai hash (D1).
 * - PIN: PBKDF2-HMAC-SHA256 + salt unik (D2).
 * - Lockout: 5 gagal → 15 menit (D3).
 * - PIN awal & reset: admin mengetik PIN 6 digit (DEC-P22, menggantikan D5).
 *
 * Aturan: peran TIDAK pernah diambil dari klien; identitas dari sesi terverifikasi.
 */

function handleLogin_(payload, method) {
  requirePost_(method);
  payload = payload || {};
  var nip = payload.nip ? String(payload.nip).trim() : '';
  var pin = payload.pin ? String(payload.pin) : '';
  if (!nip || !pin) {
    return { ok: false, error: 'AUTH_FAILED', message: 'NIP atau PIN tidak sesuai.' };
  }

  return withLock_(function () {
    var now = nowMs_();
    var pegawai = findPegawaiByNip_(nip);
    var akun = pegawai ? findAkunByPegawaiId_(pegawai.id_pegawai) : null;

    var aktif = pegawai && akun &&
      isTruthy_(pegawai.status_aktif) && isTruthy_(akun.status_aktif);

    if (!aktif || !akun.pin_hash || !akun.pin_salt) {
      // Waktu disamakan agar keberadaan akun tidak mudah ditebak (timing).
      verifyPin_(pin, dummyPinRecord_());
      return { ok: false, error: 'AUTH_FAILED', message: 'NIP atau PIN tidak sesuai.' };
    }

    var lockUntil = parseTimeOrNull_(akun.terkunci_sampai);
    if (isLocked_(lockUntil, now)) {
      return { ok: false, error: 'AUTH_FAILED', message: 'NIP atau PIN tidak sesuai.' };
    }

    var valid = verifyPin_(pin, {
      salt: akun.pin_salt,
      hash: akun.pin_hash,
      iterations: Number(akun.pin_iterasi) || PIN_KDF_DEFAULT_ITERATIONS
    });

    if (!valid) {
      var st = nextLockState_(Number(akun.gagal_login) || 0, lockUntil, false, now, lockPolicy_());
      akun.gagal_login = st.failedCount;
      akun.terkunci_sampai = st.lockUntilMs ? new Date(st.lockUntilMs).toISOString() : '';
      storeAkun_(akun);
      logActivity_('login_failed', akun.id_akun, akun.peran, 'akun', '');
      return { ok: false, error: 'AUTH_FAILED', message: 'NIP atau PIN tidak sesuai.' };
    }

    // Sukses: reset penghitung, terbitkan sesi.
    akun.gagal_login = 0;
    akun.terkunci_sampai = '';
    storeAkun_(akun);

    var token = generateSessionToken_();
    var expiresAtMs = now + sessionTtlMs_();
    appendObject_('Sesi', {
      id_sesi: newId_('SES'),
      id_akun: akun.id_akun,
      token_hash: hashToken_(token),
      dibuat_pada: new Date(now).toISOString(),
      kedaluwarsa_pada: new Date(expiresAtMs).toISOString(),
      dicabut_pada: '',
      agen: safeAgen_(payload.agen)
    });
    logActivity_('login_success', akun.id_akun, akun.peran, 'akun', '');

    return {
      ok: true,
      token: token,
      peran: akun.peran,
      nama: pegawai.nama,
      kategori: normalizePegawaiCategory_(pegawai.kategori),
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  });
}

function handleLogout_(payload, method) {
  requirePost_(method);
  var token = payload && payload.token ? String(payload.token) : '';
  if (!token) return { ok: true };
  var now = nowMs_();
  withLock_(function () {
    var sesi = findSesiByTokenHash_(hashToken_(token));
    if (sesi && !sesi.dicabut_pada) {
      sesi.dicabut_pada = new Date(now).toISOString();
      updateObjectRow_('Sesi', sesi.__row, sesi);
      logActivity_('logout', sesi.id_akun, '', 'sesi', sesi.id_sesi);
    }
  });
  return { ok: true };
}

function handleSessionCheck_(payload, method) {
  requirePost_(method);
  var ctx = requireSession_(payload && payload.token);
  return {
    ok: true,
    peran: ctx.account.peran,
    nama: ctx.pegawai ? ctx.pegawai.nama : '',
    kategori: ctx.pegawai ? normalizePegawaiCategory_(ctx.pegawai.kategori) : 'REGULER',
    expiresAt: new Date(ctx.expiresAtMs).toISOString()
  };
}

/* ---------------- Otorisasi ---------------- */

function requireSession_(token) {
  if (!token) throw AppError_('UNAUTHORIZED', 'Sesi tidak valid.', true);
  var now = nowMs_();
  var sesi = findSesiByTokenHash_(hashToken_(String(token)));
  if (!sesi) throw AppError_('UNAUTHORIZED', 'Sesi tidak valid.', true);

  var valid = isSessionValid_({
    revokedAtMs: parseTimeOrNull_(sesi.dicabut_pada),
    expiresAtMs: parseTimeOrNull_(sesi.kedaluwarsa_pada)
  }, now);
  if (!valid) throw AppError_('UNAUTHORIZED', 'Sesi tidak valid.', true);

  var akun = findAkunById_(sesi.id_akun);
  if (!akun || !isTruthy_(akun.status_aktif)) {
    throw AppError_('UNAUTHORIZED', 'Sesi tidak valid.', true);
  }
  var pegawai = findPegawaiById_(akun.id_pegawai);
  if (!pegawai || !isTruthy_(pegawai.status_aktif)) {
    throw AppError_('UNAUTHORIZED', 'Sesi tidak valid.', true);
  }
  return {
    account: akun,
    pegawai: pegawai,
    session: sesi,
    expiresAtMs: parseTimeOrNull_(sesi.kedaluwarsa_pada)
  };
}

function requireAdmin_(token) {
  var ctx = requireSession_(token);
  if (ctx.account.peran !== 'admin') {
    throw AppError_('FORBIDDEN', 'Akses ditolak.', true);
  }
  return ctx;
}

/* ---------------- Manajemen akun (admin) ---------------- */

/**
 * Membuat akun untuk pegawai yang sudah terdaftar. PIN wajib diisi admin
 * (6 digit angka, DEC-P22).
 */
function handleAccountCreate_(payload, method) {
  requirePost_(method);
  var ctx = requireAdmin_(payload && payload.token);
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai) : '';
  var pin = payload.pin !== undefined && payload.pin !== null ? String(payload.pin) : '';
  if (!idPegawai) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);
  if (!isValidPin_(pin)) throw AppError_('INVALID_INPUT', 'PIN harus 6 digit angka.', true);

  return withLock_(function () {
    var pegawai = findPegawaiById_(idPegawai);
    if (!pegawai) throw AppError_('NOT_FOUND', 'Pegawai tidak ditemukan.', true);
    if (findAkunByPegawaiId_(idPegawai)) {
      throw AppError_('DUPLICATE', 'Akun untuk pegawai ini sudah ada.', true);
    }
    var rec = createPinRecord_(pin, pinKdfIterations_());
    var akun = {
      id_akun: newId_('AKN'),
      id_pegawai: idPegawai,
      pin_hash: rec.hash,
      pin_salt: rec.salt,
      pin_algo: rec.algo,
      pin_iterasi: rec.iterations,
      peran: 'pegawai',
      status_aktif: true,
      gagal_login: 0,
      terkunci_sampai: '',
      diubah_pada: nowIso_(),
      diubah_oleh: ctx.account.id_akun
    };
    appendObject_('Akun', akun);
    logActivity_('account_created', ctx.account.id_akun, ctx.account.peran, 'akun', akun.id_akun);
    return { ok: true, id_akun: akun.id_akun };
  });
}

/** Mengaktifkan/menonaktifkan akun. Nonaktif juga mencabut semua sesi aktif. */
function handleAccountSetActive_(payload, method) {
  requirePost_(method);
  var ctx = requireAdmin_(payload && payload.token);
  var idAkun = payload.id_akun ? String(payload.id_akun) : '';
  if (!idAkun) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);
  var aktif = isTruthy_(payload.aktif);

  return withLock_(function () {
    var akun = findAkunById_(idAkun);
    if (!akun) throw AppError_('NOT_FOUND', 'Akun tidak ditemukan.', true);
    akun.status_aktif = aktif;
    akun.diubah_pada = nowIso_();
    akun.diubah_oleh = ctx.account.id_akun;
    storeAkun_(akun);
    if (!aktif) {
      revokeSessionsForAccount_(idAkun, nowMs_());
    }
    logActivity_(aktif ? 'account_activated' : 'account_deactivated',
      ctx.account.id_akun, ctx.account.peran, 'akun', idAkun);
    return { ok: true, id_akun: idAkun, status_aktif: aktif };
  });
}

/**
 * Reset PIN oleh admin (DEC-P22): PIN baru 6 digit; menghapus penghitung gagal
 * & membuka kunci akun. Sesi yang sudah ada tidak dicabut.
 */
function handleResetPin_(payload, method) {
  requirePost_(method);
  var ctx = requireAdmin_(payload && payload.token);
  var idAkun = payload.id_akun ? String(payload.id_akun) : '';
  var pin = payload.pin !== undefined && payload.pin !== null ? String(payload.pin) : '';
  if (!idAkun) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);
  if (!isValidPin_(pin)) throw AppError_('INVALID_INPUT', 'PIN harus 6 digit angka.', true);

  return withLock_(function () {
    var akun = findAkunById_(idAkun);
    if (!akun) throw AppError_('NOT_FOUND', 'Akun tidak ditemukan.', true);
    var rec = createPinRecord_(pin, pinKdfIterations_());
    akun.pin_hash = rec.hash;
    akun.pin_salt = rec.salt;
    akun.pin_algo = rec.algo;
    akun.pin_iterasi = rec.iterations;
    akun.gagal_login = 0;
    akun.terkunci_sampai = '';
    akun.diubah_pada = nowIso_();
    akun.diubah_oleh = ctx.account.id_akun;
    storeAkun_(akun);
    logActivity_('pin_reset', ctx.account.id_akun, ctx.account.peran, 'akun', idAkun);
    return { ok: true, id_akun: idAkun };
  });
}

/* ---------------- Util internal ---------------- */

function requirePost_(method) {
  if (method !== 'POST') {
    throw AppError_('METHOD_NOT_ALLOWED', 'Metode tidak diizinkan.', true);
  }
}

function safeAgen_(agen) {
  if (!agen) return '';
  return String(agen).slice(0, 60);
}

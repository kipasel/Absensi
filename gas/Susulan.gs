/**
 * Susulan.gs — pengajuan absensi susulan oleh pegawai (REQUIREMENTS §8).
 *
 * Endpoint: action 'susulan.submit' (POST, token sesi wajib).
 *
 * Keputusan yang diterapkan:
 * - Tanggal diajukan: hari server (Asia/Jakarta) atau maksimal 3 hari sebelum
 *   hari berjalan; tanggal mendatang ditolak (DEC-P23).
 * - Jenis: masuk | pulang; mode kerja: WFO | WFH_WFA (enum mesin absensi).
 * - Alasan teks wajib (maks. 500 karakter) dan foto JPEG wajib (DEC-P24,
 *   batas ukuran memakai batas yang sama dengan absensi reguler).
 * - Waktu yang diklaim (waktu aktual saat kejadian) divalidasi format
 *   HH:MM/HH:MM:SS; JENDELA jam reguler TIDAK diperiksa di sini karena susulan
 *   justru untuk waktu di luar jendela — keabsahannya dinilai admin (DEC-P24).
 * - Keputusan admin (PHASE 4) TIDAK menulis baris Absensi; konversi menjadi
 *   catatan absensi memerlukan keputusan aturan tersendiri (belum ada).
 * - Duplikat: pengajuan sama (pegawai + tanggal + jenis) berstatus menunggu
 *   atau diterima menghalangi pengajuan baru; berstatus ditolak boleh diajukan
 *   ulang (aturan teknis anti-ganda, dicatat di docs/PROGRESS.md).
 * - Identitas pegawai dari SESI TERVERIFIKASI; payload klien tidak dipercaya.
 *
 * Urutan penyimpanan (dokumentasi kegagalan parsial):
 *   1. Validasi sesi, input, tanggal, waktu, alasan, foto (belum ada tulisan).
 *   2. Ambil script lock.
 *   3. Cek duplikat aktif (menunggu/diterima).
 *   4. Unggah foto ke Drive (folder Foto_Susulan).
 *   5. Tulis baris PengajuanSusulan.
 *   6. Log aktivitas; lepas lock.
 * Kegagalan langkah 5: file Drive hasil langkah 4 DIHAPUS sebagai kompensasi;
 * respons SUSULAN_NOT_STORED — BUKAN sukses. Bila penghapusan kompensasi gagal,
 * file tercatat sebagai orphan di LogAktivitas untuk rekonsiliasi admin.
 */

var SUSULAN_MAX_AGE_DAYS = 3;     // DEC-P23
var SUSULAN_MAX_ALASAN_LEN = 500; // batas alasan teks

/**
 * Menangani pengajuan susulan dari pegawai (atau admin yang sedang masuk).
 * @param {Object} payload berisi token, tanggal_absensi, jenis, mode_kerja,
 *   waktu_diklaim, alasan, foto_base64, foto_mime
 * @param {string} method
 * @return {{ok:boolean, id_pengajuan:string, tanggal_absensi:string,
 *           jenis:string, mode_kerja:string, status:string}}
 */
function handleSusulanSubmit_(payload, method) {
  requirePost_(method);
  payload = payload || {};

  var ctx = requireSession_(payload.token);

  var jenisRes = normalizeJenis_(payload.jenis);
  // Susulan tetap hanya untuk jenis reguler; lepas piket Jagat belum punya
  // aturan susulan (route juga nonaktif, DEC-P31).
  if (!jenisRes.ok || jenisRes.jenis === 'lepas_piket') {
    throw AppError_('INVALID_INPUT', 'Jenis absensi tidak valid.', true);
  }
  var jenis = jenisRes.jenis;

  var modeRes = normalizeModeKerja_(payload.mode_kerja);
  if (!modeRes.ok) {
    throw AppError_('INVALID_INPUT', 'Mode kerja tidak valid (WFO atau WFH_WFA).', true);
  }
  var mode = modeRes.mode;

  var nowMs = nowMs_();
  var civil = civilFromServerMs_(nowMs);
  if (!civil) {
    throw AppError_('INTERNAL_ERROR', 'Gagal membaca waktu server.', false);
  }
  var tanggalEval = evaluateSusulanTanggal_(payload.tanggal_absensi, civil.tanggal);
  if (!tanggalEval.ok) {
    throw AppError_(tanggalEval.code, tanggalEval.message, true);
  }
  var tanggal = tanggalEval.tanggal;

  var waktuEval = normalizeWaktuDiklaim_(payload.waktu_diklaim);
  if (!waktuEval.ok) {
    throw AppError_('INVALID_INPUT', waktuEval.message, true);
  }
  var waktuDiklaim = waktuEval.waktu;

  var alasan = payload.alasan === null || payload.alasan === undefined
    ? '' : String(payload.alasan).trim();
  if (!alasan) {
    throw AppError_('INVALID_INPUT', 'Alasan susulan wajib diisi.', true);
  }
  if (alasan.length > SUSULAN_MAX_ALASAN_LEN) {
    throw AppError_('INVALID_INPUT',
      'Alasan susulan maksimal ' + SUSULAN_MAX_ALASAN_LEN + ' karakter.', true);
  }

  var photoCheck = validatePhotoBlob_(payload.foto_base64, photoMaxBytes_());
  if (!photoCheck.ok) {
    throw AppError_(photoCheck.code, photoCheck.message, true);
  }
  var fotoBytes = photoCheck.bytes;

  return withLock_(function () {
    var idPegawai = ctx.pegawai.id_pegawai;

    var existing = findSusulanOpenByUniq_(idPegawai, tanggal, jenis);
    if (existing) {
      throw AppError_('DUPLICATE',
        'Pengajuan susulan ' + jenis + ' pada ' + tanggal + ' sudah berstatus ' +
        String(existing.status) + '.', true);
    }

    var idPengajuan = newId_('PJN');
    var saved;
    try {
      saved = saveSusulanPhoto_({
        idPengajuan: idPengajuan,
        idPegawai: idPegawai,
        tanggal: tanggal,
        jenis: jenis,
        bytes: fotoBytes
      });
    } catch (driveErr) {
      if (driveErr && driveErr.name === 'AppError') throw driveErr;
      logActivity_('susulan_drive_failed', idPegawai, ctx.account.peran, 'pengajuan', idPengajuan);
      throw AppError_('SUSULAN_NOT_STORED',
        'Foto bukti gagal disimpan. Pengajuan TIDAK dicatat — silakan coba lagi.', true);
    }

    var waktuServerIso = new Date(nowMs).toISOString();

    try {
      appendObject_('PengajuanSusulan', {
        id_pengajuan: idPengajuan,
        id_pegawai: idPegawai,
        tanggal_absensi: tanggal,
        jenis: jenis,
        mode_kerja: mode,
        waktu_diklaim: waktuDiklaim,
        waktu_pengajuan_server: waktuServerIso,
        alasan: alasan,
        bukti_file_id: saved.driveFileId,
        status: 'menunggu',
        id_admin: '',
        waktu_keputusan: '',
        catatan_keputusan: '',
        diubah_pada: waktuServerIso
      });
    } catch (writeErr) {
      var orphaned = tryDeleteDriveFile_(saved.driveFileId);
      if (!orphaned) {
        logActivity_('susulan_photo_orphan', idPegawai, ctx.account.peran, saved.driveFileId, idPengajuan);
      }
      if (writeErr && writeErr.name === 'AppError') throw writeErr;
      logActivity_('susulan_write_failed', idPegawai, ctx.account.peran, 'pengajuan', idPengajuan);
      throw AppError_('SUSULAN_NOT_STORED',
        'Pengajuan gagal disimpan — silakan coba lagi.', true);
    }

    logActivity_('susulan_submitted', idPegawai, ctx.account.peran, 'pengajuan', idPengajuan);

    return {
      ok: true,
      id_pengajuan: idPengajuan,
      tanggal_absensi: tanggal,
      jenis: jenis,
      mode_kerja: mode,
      status: 'menunggu'
    };
  });
}

/**
 * Menilai tanggal yang diajukan terhadap aturan DEC-P23 (fungsi murni):
 * valid kalender, bukan tanggal mendatang, maksimal SUSULAN_MAX_AGE_DAYS hari
 * sebelum hari server (rentang inklusif: hari-3 .. hari ini).
 * @param {*} raw nilai dari klien
 * @param {string} today tanggal server YYYY-MM-DD (Asia/Jakarta)
 * @return {{ok:boolean, code:(string|null), message:(string|null), tanggal:(string|null)}}
 */
function evaluateSusulanTanggal_(raw, today) {
  var fail = function (message) {
    return { ok: false, code: 'INVALID_INPUT', message: message, tanggal: null };
  };
  var s = raw === null || raw === undefined ? '' : String(raw).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fail('Tanggal absensi harus berformat YYYY-MM-DD.');
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10);
  var d = parseInt(m[3], 10);
  var probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 ||
      probe.getUTCDate() !== d) {
    return fail('Tanggal absensi tidak valid pada kalender.');
  }
  var tParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!tParts) return fail('Waktu server tidak valid.');
  var t = new Date(Date.UTC(
    parseInt(tParts[1], 10), parseInt(tParts[2], 10) - 1, parseInt(tParts[3], 10)));
  var diffDays = Math.round((t.getTime() - probe.getTime()) / 86400000);
  if (diffDays < 0) {
    return fail('Susulan hanya untuk hari berjalan atau lampau — tanggal mendatang tidak dapat diajukan.');
  }
  if (diffDays > SUSULAN_MAX_AGE_DAYS) {
    return fail('Susulan maksimal ' + SUSULAN_MAX_AGE_DAYS +
      ' hari sebelum hari berjalan.');
  }
  return { ok: true, code: null, message: null, tanggal: s };
}

/**
 * Memvalidasi & menormalkan waktu yang diklaim (fungsi murni):
 * menerima HH:MM atau HH:MM:SS, mengembalikan HH:MM:SS.
 * @param {*} raw nilai dari klien
 * @return {{ok:boolean, waktu:(string|null), message:(string|null)}}
 */
function normalizeWaktuDiklaim_(raw) {
  var s = raw === null || raw === undefined ? '' : String(raw).trim();
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) {
    return { ok: false, waktu: null, message: 'Waktu yang diklaim harus berformat HH:MM atau HH:MM:SS.' };
  }
  var sec = hmsToSecondsOfDay_(
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    m[3] === undefined ? 0 : parseInt(m[3], 10)
  );
  if (sec === null) {
    return { ok: false, waktu: null, message: 'Waktu yang diklaim tidak valid.' };
  }
  function pad2(n) { return ('0' + n).slice(-2); }
  return {
    ok: true,
    waktu: pad2(Math.floor(sec / 3600)) + ':' +
      pad2(Math.floor((sec % 3600) / 60)) + ':' + pad2(sec % 60),
    message: null
  };
}

/**
 * Mencari pengajuan susulan yang MASIH MENGHALANGI (menunggu/diterima) untuk
 * kombinasi pegawai + tanggal + jenis. Berstatus ditolak tidak menghalangi
 * pengajuan ulang.
 * @param {string} idPegawai
 * @param {string} tanggal
 * @param {string} jenis
 * @return {Object|null}
 */
function findSusulanOpenByUniq_(idPegawai, tanggal, jenis) {
  var rows = readObjects_('PengajuanSusulan');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.id_pegawai) !== String(idPegawai)) continue;
    if (String(r.tanggal_absensi) !== String(tanggal)) continue;
    if (String(r.jenis) !== String(jenis)) continue;
    var st = String(r.status);
    if (st === 'menunggu' || st === 'diterima') return r;
  }
  return null;
}

/**
 * Attendance.gs — mesin absensi reguler (PHASE 3).
 *
 * Endpoint: action 'attendance.submit' (POST, token sesi wajib).
 *
 * Keputusan yang diterapkan:
 * - Identitas pegawai diambil dari SESI TERVERIFIKASI server; id_pegawai,
 *   peran, tanggal, dan timestamp dari klien TIDAK PERNAH dipercaya.
 * - Waktu server Asia/Jakarta (DEC-002/003); jendela masuk 07:00.00–08:29.59,
 *   pulang 16:00.00–23.59.59; berlaku setiap hari (DEC-P18).
 * - Mode kerja: WFO | WFH_WFA, dipilih pegawai, divalidasi enum (DEC-006).
 * - GPS wajib hanya masuk WFO; radius inklusif <= 50 m (DEC-004); koordinat
 *   kantor wajib dikonfigurasi, jika tidak masuk WFO ditolak (AMB-07).
 * - Foto JPEG wajib; batas ukuran PHASE3_PHOTO_MAX_BYTES, default 1.000.000
 *   byte (DEC-P17); magic bytes diperiksa, tidak hanya MIME kiriman.
 * - Satu masuk + satu pulang per pegawai per tanggal bisnis; pulang
 *   mensyaratkan masuk tercatat (DEC-005).
 * - Idempotensi: klien mengirim id_absensi (UUID) sebagai kunci permintaan;
 *   retry dengan ID sama mengembalikan sukses yang sama tanpa duplikat.
 *
 * Urutan penyimpanan (dokumentasi kegagalan parsial — lihat docs/SECURITY.md):
 *   1. Validasi sesi, input, waktu, GPS, foto (belum ada tulisan).
 *   2. Ambil script lock.
 *   3. Cek duplikat + prasyarat pulang + bentrok ID.
 *   4. Unggah foto ke Drive.
 *   5. Tulis baris BuktiAbsensi.
 *   6. Tulis baris Absensi.
 *   7. Log aktivitas; lepas lock.
 * Kegagalan setelah langkah 4: baris BuktiAbsensi (bila sempat terbuat) dihapus
 * sebagai kompensasi; file Drive TIDAK dihapus (tetap sebagai bukti audit)
 * dan ID-nya dicatat di LogAktivitas untuk rekonsiliasi admin. Respons
 * ATTENDANCE_STORAGE_PARTIAL — BUKAN sukses.
 * Sheets bukan DB transaksional penuh; lock mengurangi tetapi tidak
 * menghilangkan seluruh risiko race (lihat docs/SECURITY.md T-08/T-12).
 */

function handleAttendanceSubmit_(payload, method) {
  requirePost_(method);
  payload = payload || {};

  var ctx = requireSession_(payload.token);

  // --- Validasi input (id_pegawai dari body diabaikan; identitas dari sesi) ---
  var jenisRes = normalizeJenis_(payload.jenis);
  if (!jenisRes.ok) {
    throw AppError_('INVALID_INPUT', 'Jenis absensi tidak valid.', true);
  }
  var jenis = jenisRes.jenis;

  var modeRes = normalizeModeKerja_(payload.mode_kerja);
  if (!modeRes.ok) {
    throw AppError_('INVALID_INPUT', 'Mode kerja tidak valid (WFO atau WFH_WFA).', true);
  }
  var mode = modeRes.mode;

  var idAbsensi = payload.id_absensi ? String(payload.id_absensi).trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(idAbsensi)) {
    throw AppError_('INVALID_INPUT', 'ID permintaan absensi tidak valid.', true);
  }

  var nowMs = nowMs_();
  var timeEval = evaluateAttendanceTime_(jenis, nowMs);
  if (!timeEval.ok) {
    throw AppError_(timeEval.code, timeEval.message, true);
  }
  var tanggal = timeEval.tanggal;

  // --- GPS (hanya masuk WFO) ---
  var lintang = '';
  var bujur = '';
  var akurasi = '';
  var jarakMeter = '';
  if (jenis === 'masuk' && mode === 'WFO') {
    var gpsEval = evaluateGpsForMasukWfo_(payload.gps || null, getOfficeLocation_());
    if (!gpsEval.ok) {
      throw AppError_(gpsEval.code, gpsEval.message, true);
    }
    lintang = gpsEval.lat;
    bujur = gpsEval.lng;
    akurasi = gpsEval.accuracy === null ? '' : gpsEval.accuracy;
    jarakMeter = gpsEval.jarakMeter;
  }

  // --- Validasi foto (decode + magic + ukuran) ---
  var photoCheck = validatePhotoBlob_(payload.foto_base64, photoMaxBytes_());
  if (!photoCheck.ok) {
    throw AppError_(photoCheck.code, photoCheck.message, true);
  }
  var fotoBytes = photoCheck.bytes;

  // --- Transaksi di bawah lock ---
  return withLock_(function () {
    var idPegawai = ctx.pegawai.id_pegawai;

    // Bentrok ID: id_absensi tidak boleh dipakai dua baris berbeda.
    var existingById = findAbsensiById_(idAbsensi);
    if (existingById) {
      if (String(existingById.id_pegawai) === idPegawai &&
          String(existingById.tanggal) === tanggal &&
          String(existingById.jenis) === jenis) {
        // Replay idempoten: permintaan sama (respons pertama hilang di jaringan).
        return attendanceSuccessResponse_(existingById);
      }
      throw AppError_('INVALID_INPUT', 'ID permintaan sudah dipakai.', true);
    }

    // Duplikat bisnis: satu masuk + satu pulang per pegawai per tanggal.
    var existing = findAbsensiByUniq_(idPegawai, tanggal, jenis);
    if (existing) {
      throw AppError_('DUPLICATE', 'Absensi ' + jenis + ' pada ' + tanggal + ' sudah tercatat.', true);
    }

    // Pulang mensyaratkan masuk tercatat (DEC-005).
    if (jenis === 'pulang') {
      var masuk = findAbsensiByUniq_(idPegawai, tanggal, 'masuk');
      if (!masuk) {
        throw AppError_('PRECONDITION', 'Absensi pulang memerlukan absensi masuk yang tercatat pada tanggal yang sama.', true);
      }
    }

    // Unggah foto ke Drive (masih di dalam lock agar tidak ada baris ganda).
    var saved;
    try {
      saved = saveAttendancePhoto_({
        idAbsensi: idAbsensi,
        idPegawai: idPegawai,
        idPegawaiNama: ctx.pegawai.nama,
        tanggal: tanggal,
        jenis: jenis,
        bytes: fotoBytes
      });
    } catch (driveErr) {
      if (driveErr && driveErr.name === 'AppError') throw driveErr;
      // Gagal unggah → tidak ada tulisan apa pun; absensi TIDAK dicatat.
      logActivity_('attendance_drive_failed', idPegawai, ctx.account.peran, 'absensi', idAbsensi);
      throw AppError_('ATTENDANCE_NOT_STORED',
        'Foto gagal disimpan. Absensi TIDAK dicatat — silakan coba lagi.', true);
    }

    var idBukti = newId_('BKT');
    var waktuServerIso = new Date(nowMs).toISOString();

    try {
      appendObject_('BuktiAbsensi', {
        id_bukti: idBukti,
        id_absensi: idAbsensi,
        drive_file_id: saved.driveFileId,
        path: saved.path,
        mime: saved.mime,
        ukuran: saved.ukuran,
        dibuat_pada: waktuServerIso
      });

      var statusAbsensi = jenis === 'masuk' ? getMasukStatus_(timeEval.detikHari) : '';
      var uraianPekerjaan = '';
      var outputPekerjaan = '';
      if (jenis === 'pulang') {
        uraianPekerjaan = payload.uraian_pekerjaan === null || payload.uraian_pekerjaan === undefined
          ? '' : String(payload.uraian_pekerjaan).trim();
        outputPekerjaan = payload.output_pekerjaan === null || payload.output_pekerjaan === undefined
          ? '' : String(payload.output_pekerjaan).trim();
        if (!uraianPekerjaan) {
          throw AppError_('INVALID_INPUT', 'Uraian Pekerjaan wajib diisi.', true);
        }
        if (!outputPekerjaan) {
          throw AppError_('INVALID_INPUT', 'Output Pekerjaan wajib diisi.', true);
        }
        if (uraianPekerjaan.length > 1000) {
          throw AppError_('INVALID_INPUT', 'Uraian Pekerjaan maksimal 1000 karakter.', true);
        }
        if (outputPekerjaan.length > 1000) {
          throw AppError_('INVALID_INPUT', 'Output Pekerjaan maksimal 1000 karakter.', true);
        }
      }
      appendObject_('Absensi', {
        id_absensi: idAbsensi,
        id_pegawai: idPegawai,
        tanggal: tanggal,
        jenis: jenis,
        mode_kerja: mode,
        waktu_server: waktuServerIso,
        lintang: lintang,
        bujur: bujur,
        akurasi: akurasi,
        jarak_meter: jarakMeter,
        sumber: 'reguler',
        id_bukti: idBukti,
        status: statusAbsensi,
        uraian_pekerjaan: uraianPekerjaan,
        output_pekerjaan: outputPekerjaan,
        dibuat_pada: waktuServerIso,
        diubah_pada: waktuServerIso,
        diubah_oleh: idPegawai
      });
    } catch (writeErr) {
      // Kompensasi: hapus baris BuktiAbsensi bila Absensi gagal; file Drive
      // tetap disimpan sebagai bukti & dicatat untuk rekonsiliasi.
      compensatePartialWrite_(idBukti, saved.driveFileId, idPegawai, idAbsensi);
      if (writeErr && writeErr.name === 'AppError') throw writeErr;
      throw AppError_('ATTENDANCE_STORAGE_PARTIAL',
        'Data absensi gagal disimpan. Foto tetap tersimpan sebagai bukti; ' +
        'silakan coba lagi — permintaan dengan ID sama tidak akan menghasilkan duplikat.', true);
    }

    logActivity_('attendance_recorded', idPegawai, ctx.account.peran, 'absensi', idAbsensi);

    var record = findAbsensiById_(idAbsensi);
    return attendanceSuccessResponse_(record || {
      id_absensi: idAbsensi,
      id_pegawai: idPegawai,
      tanggal: tanggal,
      jenis: jenis,
      mode_kerja: mode,
      waktu_server: waktuServerIso,
      jarak_meter: jarakMeter
    });
  });
}

/**
 * Kompensasi kegagalan parsial: hapus baris BuktiAbsensi yang sempat terbuat
 * (bukti tanpa absensi tidak berguna & membingungkan); file Drive TIDAK
 * dihapus — dicatat sebagai orphan untuk audit.
 */
function compensatePartialWrite_(idBukti, driveFileId, idPegawai, idAbsensi) {
  try {
    var rows = readObjects_('BuktiAbsensi');
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id_bukti) === String(idBukti)) {
        var sh = getSheet_('BuktiAbsensi');
        sh.deleteRow(rows[i].__row);
        break;
      }
    }
  } catch (e) {
    if (typeof Logger !== 'undefined') {
      Logger.log('compensatePartialWrite_: gagal hapus baris bukti ' + idBukti + ': ' + (e && e.message));
    }
  }
  logActivity_('attendance_storage_partial', idPegawai, 'pegawai', 'absensi',
    idAbsensi + ' | orphan_drive_file=' + driveFileId);
}

function attendanceSuccessResponse_(record) {
  return {
    ok: true,
    id_absensi: String(record.id_absensi),
    tanggal: String(record.tanggal),
    jenis: String(record.jenis),
    mode_kerja: String(record.mode_kerja),
    waktu_server: String(record.waktu_server),
    jarak_meter: (record.jarak_meter === '' || record.jarak_meter === undefined || record.jarak_meter === null)
      ? null : record.jarak_meter,
    status: 'tercatat'
  };
}

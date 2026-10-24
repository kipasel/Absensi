/**
 * AdminService.gs — endpoint panel admin (PHASE 4).
 *
 * Seluruh aksi di file ini: POST + token sesi + peran 'admin' diverifikasi di
 * backend (requireAdmin_). Peran TIDAK PERNAH diambil dari klien.
 *
 * Ruang lingkup (sesuai prioritas PHASE 4):
 * - Pengelolaan pegawai: daftar, detail, tambah, edit, aktif/nonaktif —
 *   kolom mengikuti docs/DATA_DICTIONARY.md §1 (disetujui DEC-P15).
 * - Daftar & detail absensi tanpa URL/ID Drive; endpoint foto terpisah
 *   mengembalikan blob hanya untuk admin terautentikasi (DEC-P25).
 * - Handler susulan tersimpan untuk kompatibilitas, tetapi route aktif
 *   dinonaktifkan oleh DEC-P31.
 * - Log audit (LogAktivitas, append-only).
 *
 * Sengaja TIDAK diimplementasikan (menunggu keputusan):
 * - Impor CSV/Excel (AMB-14) dan notifikasi (AMB-25) dikesampingkan.
 * - Konversi persetujuan susulan menjadi baris Absensi (belum ada aturan).
 */

/* ---------------- Util input ---------------- */

function adminRequire_(payload, method) {
  requirePost_(method);
  return requireAdmin_(payload && payload.token);
}

function cleanText_(value, maxLen) {
  if (value === undefined || value === null) return '';
  var s = String(value).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampListLimit_(raw, fallback) {
  var n = parseInt(raw, 10);
  if (!isFinite(n) || n < 1) return fallback;
  return n > 200 ? 200 : n;
}

function normalizePegawaiFilterStatus_(raw) {
  var s = cleanText_(raw, 20).toLowerCase();
  if (s === '' || s === 'semua') return '';
  if (s === 'aktif') return 'aktif';
  if (s === 'nonaktif') return 'nonaktif';
  throw AppError_('INVALID_INPUT', 'Filter status tidak valid.', true);
}

function requireTanggalFilter_(raw) {
  var s = cleanText_(raw, 10);
  if (s === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw AppError_('INVALID_INPUT', 'Format tanggal tidak valid (YYYY-MM-DD).', true);
  }
  return s;
}

function normalizeJenisFilter_(raw) {
  var s = cleanText_(raw, 10).toLowerCase();
  if (s === '') return '';
  if (s !== 'masuk' && s !== 'pulang') {
    throw AppError_('INVALID_INPUT', 'Jenis absensi tidak valid.', true);
  }
  return s;
}

function normalizeSusulanStatusFilter_(raw) {
  var s = cleanText_(raw, 20).toLowerCase();
  if (s === '' || s === 'semua') return '';
  if (s !== 'menunggu' && s !== 'diterima' && s !== 'ditolak') {
    throw AppError_('INVALID_INPUT', 'Status pengajuan tidak valid.', true);
  }
  return s;
}

function isTruthyAdmin_(value) {
  var s = cleanText_(value, 10).toLowerCase();
  if (s === 'true' || s === '1' || s === 'aktif') return true;
  if (s === 'false' || s === '0' || s === 'nonaktif') return false;
  return Boolean(isTruthy_(value));
}

/** Respons daftar standar: motong sesuai limit dengan total sebelum dipotong. */
function adminListResponse_(items, total) {
  return { ok: true, total: total, items: items };
}

function pegawaiListFields_(row) {
  return {
    id_pegawai: String(row.id_pegawai),
    nama: String(row.nama),
    nip_nipk: String(row.nip_nipk),
    jabatan: String(row.jabatan),
    unit_kerja: String(row.unit_kerja),
    status_aktif: isTruthy_(row.status_aktif),
    dibuat_pada: String(row.dibuat_pada || ''),
    diubah_pada: String(row.diubah_pada || '')
  };
}

function findNamaMap_() {
  var rows = readObjects_('Pegawai');
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[String(rows[i].id_pegawai)] = {
      nama: String(rows[i].nama),
      nip_nipk: String(rows[i].nip_nipk)
    };
  }
  return map;
}

/* ---------------- Pengelolaan pegawai ---------------- */

function handleAdminPegawaiList_(payload, method) {
  adminRequire_(payload, method);
  var q = cleanText_(payload.q, 60).toLowerCase();
  var statusFilter = normalizePegawaiFilterStatus_(payload.status);
  var limit = clampListLimit_(payload.limit, 100);

  var rows = readObjects_('Pegawai');
  var matched = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (statusFilter === 'aktif' && !isTruthy_(r.status_aktif)) continue;
    if (statusFilter === 'nonaktif' && isTruthy_(r.status_aktif)) continue;
    if (q) {
      var hay = (String(r.nama) + ' ' + String(r.nip_nipk)).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    matched.push(pegawaiListFields_(r));
  }
  return adminListResponse_(matched.slice(0, limit), matched.length);
}

function handleAdminPegawaiDetail_(payload, method) {
  adminRequire_(payload, method);
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai) : '';
  if (!idPegawai) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var pegawai = findPegawaiById_(idPegawai);
  if (!pegawai) throw AppError_('NOT_FOUND', 'Pegawai tidak ditemukan.', true);

  var akun = findAkunByPegawaiId_(idPegawai);
  var akunInfo = null;
  if (akun) {
    // pin_hash / pin_salt TIDAK PERNAH dikirim ke klien.
    akunInfo = {
      id_akun: String(akun.id_akun),
      peran: String(akun.peran),
      status_aktif: isTruthy_(akun.status_aktif),
      ada_pin: Boolean(akun.pin_hash),
      gagal_login: Number(akun.gagal_login) || 0,
      terkunci_sampai: String(akun.terkunci_sampai || ''),
      diubah_pada: String(akun.diubah_pada || '')
    };
  }
  return { ok: true, pegawai: pegawaiListFields_(pegawai), akun: akunInfo };
}

function findPegawaiByNipExcluding_(nip, exceptId) {
  var rows = readObjects_('Pegawai');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].nip_nipk).trim() === String(nip).trim() &&
        String(rows[i].id_pegawai) !== String(exceptId)) {
      return rows[i];
    }
  }
  return null;
}

function handleAdminPegawaiCreate_(payload, method) {
  var ctx = adminRequire_(payload, method);
  var nama = cleanText_(payload.nama, 120);
  var nip = cleanText_(payload.nip_nipk, 40);
  if (!nama || !nip) {
    throw AppError_('INVALID_INPUT', 'Nama dan NIP/NIPK wajib diisi.', true);
  }

  return withLock_(function () {
    if (findPegawaiByNip_(nip)) {
      throw AppError_('DUPLICATE', 'NIP/NIPK sudah terdaftar.', true);
    }
    var now = nowIso_();
    var idPegawai = newId_('PEG');
    appendObject_('Pegawai', {
      id_pegawai: idPegawai,
      nama: nama,
      nip_nipk: nip,
      jabatan: cleanText_(payload.jabatan, 120),
      unit_kerja: cleanText_(payload.unit_kerja, 120),
      status_aktif: payload.status_aktif === undefined ? true : isTruthy_(payload.status_aktif),
      dibuat_pada: now,
      dibuat_oleh: ctx.account.id_akun,
      diubah_pada: now,
      diubah_oleh: ctx.account.id_akun
    });
    logActivity_('pegawai_created', ctx.account.id_akun, ctx.account.peran, 'pegawai', idPegawai);
    return { ok: true, id_pegawai: idPegawai };
  });
}

function handleAdminPegawaiUpdate_(payload, method) {
  var ctx = adminRequire_(payload, method);
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai) : '';
  if (!idPegawai) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var hasNama = payload.nama !== undefined;
  var hasNip = payload.nip_nipk !== undefined;
  var hasJabatan = payload.jabatan !== undefined;
  var hasUnit = payload.unit_kerja !== undefined;
  if (!hasNama && !hasNip && !hasJabatan && !hasUnit) {
    throw AppError_('INVALID_INPUT', 'Tidak ada perubahan yang dikirim.', true);
  }

  return withLock_(function () {
    var pegawai = findPegawaiById_(idPegawai);
    if (!pegawai) throw AppError_('NOT_FOUND', 'Pegawai tidak ditemukan.', true);

    var changed = [];
    if (hasNama) {
      var nama = cleanText_(payload.nama, 120);
      if (!nama) throw AppError_('INVALID_INPUT', 'Nama tidak boleh kosong.', true);
      if (nama !== String(pegawai.nama)) { pegawai.nama = nama; changed.push('nama'); }
    }
    if (hasNip) {
      var nip = cleanText_(payload.nip_nipk, 40);
      if (!nip) throw AppError_('INVALID_INPUT', 'NIP/NIPK tidak boleh kosong.', true);
      if (nip !== String(pegawai.nip_nipk)) {
        if (findPegawaiByNipExcluding_(nip, idPegawai)) {
          throw AppError_('DUPLICATE', 'NIP/NIPK sudah dipakai pegawai lain.', true);
        }
        pegawai.nip_nipk = nip; changed.push('nip_nipk');
      }
    }
    if (hasJabatan) {
      var jabatan = cleanText_(payload.jabatan, 120);
      if (jabatan !== String(pegawai.jabatan)) { pegawai.jabatan = jabatan; changed.push('jabatan'); }
    }
    if (hasUnit) {
      var unit = cleanText_(payload.unit_kerja, 120);
      if (unit !== String(pegawai.unit_kerja)) { pegawai.unit_kerja = unit; changed.push('unit_kerja'); }
    }

    if (changed.length === 0) {
      return { ok: true, id_pegawai: idPegawai, changed: [] };
    }
    pegawai.diubah_pada = nowIso_();
    pegawai.diubah_oleh = ctx.account.id_akun;
    updateObjectRow_('Pegawai', pegawai.__row, pegawai);
    logActivity_('pegawai_updated', ctx.account.id_akun, ctx.account.peran, 'pegawai',
      idPegawai + ' | field=' + changed.join(','));
    return { ok: true, id_pegawai: idPegawai, changed: changed };
  });
}

function handleAdminPegawaiSetActive_(payload, method) {
  var ctx = adminRequire_(payload, method);
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai) : '';
  if (!idPegawai) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);
  var aktif = isTruthy_(payload.aktif);

  return withLock_(function () {
    var pegawai = findPegawaiById_(idPegawai);
    if (!pegawai) throw AppError_('NOT_FOUND', 'Pegawai tidak ditemukan.', true);

    pegawai.status_aktif = aktif;
    pegawai.diubah_pada = nowIso_();
    pegawai.diubah_oleh = ctx.account.id_akun;
    updateObjectRow_('Pegawai', pegawai.__row, pegawai);

    // Nonaktif → cabut sesi aktif pegawai. Riwayat absensi TIDAK dihapus.
    if (!aktif) {
      var akun = findAkunByPegawaiId_(idPegawai);
      if (akun) revokeSessionsForAccount_(akun.id_akun, nowMs_());
    }
    logActivity_(aktif ? 'pegawai_activated' : 'pegawai_deactivated',
      ctx.account.id_akun, ctx.account.peran, 'pegawai', idPegawai);
    return { ok: true, id_pegawai: idPegawai, status_aktif: aktif };
  });
}

/* ---------------- Absensi ---------------- */

function absensiListFields_(row, namaMap) {
  var info = namaMap[String(row.id_pegawai)] || { nama: '', nip_nipk: '' };
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
    ada_bukti: Boolean(row.id_bukti)
  };
}

function handleAdminAbsensiList_(payload, method) {
  adminRequire_(payload, method);
  var tanggal = requireTanggalFilter_(payload.tanggal);
  var idPegawai = payload.id_pegawai ? String(payload.id_pegawai) : '';
  var jenis = normalizeJenisFilter_(payload.jenis);
  var limit = clampListLimit_(payload.limit, 100);

  var namaMap = findNamaMap_();
  var rows = readObjects_('Absensi');
  var matched = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (tanggal && String(r.tanggal) !== tanggal) continue;
    if (idPegawai && String(r.id_pegawai) !== idPegawai) continue;
    if (jenis && String(r.jenis) !== jenis) continue;
    matched.push(absensiListFields_(r, namaMap));
  }
  matched.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return String(b.waktu_server).localeCompare(String(a.waktu_server));
  });
  return adminListResponse_(matched.slice(0, limit), matched.length);
}

function handleAdminAbsensiDetail_(payload, method) {
  adminRequire_(payload, method);
  var idAbsensi = payload.id_absensi ? String(payload.id_absensi) : '';
  if (!idAbsensi) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var row = findAbsensiById_(idAbsensi);
  if (!row) throw AppError_('NOT_FOUND', 'Absensi tidak ditemukan.', true);
  var pegawai = findPegawaiById_(row.id_pegawai);

  // Metadata bukti saja. drive_file_id/URL TIDAK dikirim (AMB-20).
  var bukti = { ada: false, id_bukti: '', mime: '', ukuran: null, path: '' };
  if (row.id_bukti) {
    var buktiRows = readObjects_('BuktiAbsensi');
    for (var i = 0; i < buktiRows.length; i++) {
      if (String(buktiRows[i].id_bukti) === String(row.id_bukti)) {
        bukti = {
          ada: true,
          id_bukti: String(buktiRows[i].id_bukti),
          mime: String(buktiRows[i].mime || ''),
          ukuran: (buktiRows[i].ukuran === '' || buktiRows[i].ukuran === null)
            ? null : Number(buktiRows[i].ukuran),
          path: String(buktiRows[i].path || '')
        };
        break;
      }
    }
  }

  return {
    ok: true,
    absensi: {
      id_absensi: String(row.id_absensi),
      id_pegawai: String(row.id_pegawai),
      tanggal: String(row.tanggal),
      jenis: String(row.jenis),
      mode_kerja: String(row.mode_kerja),
      waktu_server: String(row.waktu_server || ''),
      lintang: (row.lintang === '' || row.lintang === null || row.lintang === undefined) ? null : row.lintang,
      bujur: (row.bujur === '' || row.bujur === null || row.bujur === undefined) ? null : row.bujur,
      akurasi: (row.akurasi === '' || row.akurasi === null || row.akurasi === undefined) ? null : row.akurasi,
      jarak_meter: (row.jarak_meter === '' || row.jarak_meter === null || row.jarak_meter === undefined) ? null : row.jarak_meter,
      sumber: String(row.sumber || ''),
      dibuat_pada: String(row.dibuat_pada || ''),
      diubah_pada: String(row.diubah_pada || ''),
      diubah_oleh: String(row.diubah_oleh || '')
    },
    pegawai: pegawai
      ? { id_pegawai: String(pegawai.id_pegawai), nama: String(pegawai.nama), nip_nipk: String(pegawai.nip_nipk) }
      : null,
    bukti: bukti
  };
}

/**
 * Mengambil isi foto absensi sebagai blob ber-token (DEC-P25 / AMB-20).
 * Hanya admin; File ID tidak dikirim ke klien.
 */
function handleAdminAbsensiPhoto_(payload, method) {
  adminRequire_(payload, method);
  var idAbsensi = payload.id_absensi ? String(payload.id_absensi) : '';
  if (!idAbsensi) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var row = findAbsensiById_(idAbsensi);
  if (!row) throw AppError_('NOT_FOUND', 'Absensi tidak ditemukan.', true);

  var fileId = '';
  if (row.id_bukti) {
    var buktiRows = readObjects_('BuktiAbsensi');
    for (var i = 0; i < buktiRows.length; i++) {
      if (String(buktiRows[i].id_bukti) === String(row.id_bukti)) {
        fileId = String(buktiRows[i].drive_file_id || '');
        break;
      }
    }
  }
  if (!fileId) throw AppError_('NOT_FOUND', 'Foto tidak tersedia.', true);

  var photo = readAttendancePhoto_(fileId);
  return { ok: true, mime: photo.mime, ukuran: photo.ukuran, base64: photo.base64 };
}

/* ---------------- Absensi susulan ---------------- */

function susulanListFields_(row, namaMap) {
  var info = namaMap[String(row.id_pegawai)] || { nama: '', nip_nipk: '' };
  return {
    id_pengajuan: String(row.id_pengajuan),
    id_pegawai: String(row.id_pegawai),
    nama: info.nama,
    nip_nipk: info.nip_nipk,
    tanggal_absensi: String(row.tanggal_absensi),
    jenis: String(row.jenis),
    mode_kerja: String(row.mode_kerja),
    waktu_diklaim: String(row.waktu_diklaim || ''),
    waktu_pengajuan_server: String(row.waktu_pengajuan_server || ''),
    alasan: String(row.alasan || ''),
    status: String(row.status || ''),
    id_admin: String(row.id_admin || ''),
    waktu_keputusan: String(row.waktu_keputusan || ''),
    catatan_keputusan: String(row.catatan_keputusan || '')
  };
}

function handleAdminSusulanList_(payload, method) {
  adminRequire_(payload, method);
  var statusFilter = normalizeSusulanStatusFilter_(payload.status);
  var limit = clampListLimit_(payload.limit, 100);

  var namaMap = findNamaMap_();
  var rows = readObjects_('PengajuanSusulan');
  var matched = [];
  for (var i = 0; i < rows.length; i++) {
    if (statusFilter && String(rows[i].status) !== statusFilter) continue;
    matched.push(susulanListFields_(rows[i], namaMap));
  }
  matched.sort(function (a, b) {
    return String(b.waktu_pengajuan_server).localeCompare(String(a.waktu_pengajuan_server));
  });
  return adminListResponse_(matched.slice(0, limit), matched.length);
}

function handleAdminSusulanDetail_(payload, method) {
  adminRequire_(payload, method);
  var idPengajuan = payload.id_pengajuan ? String(payload.id_pengajuan) : '';
  if (!idPengajuan) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var row = findPengajuanById_(idPengajuan);
  if (!row) throw AppError_('NOT_FOUND', 'Pengajuan tidak ditemukan.', true);
  var pegawai = findPegawaiById_(row.id_pegawai);
  var namaMap = findNamaMap_();

  return {
    ok: true,
    pengajuan: susulanListFields_(row, namaMap),
    pegawai: pegawai
      ? { id_pegawai: String(pegawai.id_pegawai), nama: String(pegawai.nama), nip_nipk: String(pegawai.nip_nipk) }
      : null,
    ada_bukti: Boolean(row.bukti_file_id)
  };
}

/**
 * Mengambil isi foto bukti susulan sebagai blob ber-token (DEC-P25 / AMB-20).
 * Hanya admin; File ID tidak dikirim ke klien.
 */
function handleAdminSusulanPhoto_(payload, method) {
  adminRequire_(payload, method);
  var idPengajuan = payload.id_pengajuan ? String(payload.id_pengajuan) : '';
  if (!idPengajuan) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var row = findPengajuanById_(idPengajuan);
  if (!row) throw AppError_('NOT_FOUND', 'Pengajuan tidak ditemukan.', true);
  if (!row.bukti_file_id) throw AppError_('NOT_FOUND', 'Foto tidak tersedia.', true);

  var photo = readAttendancePhoto_(row.bukti_file_id);
  return { ok: true, mime: photo.mime, ukuran: photo.ukuran, base64: photo.base64 };
}

function handleAdminSusulanDecide_(payload, method) {
  var ctx = adminRequire_(payload, method);
  var idPengajuan = payload.id_pengajuan ? String(payload.id_pengajuan) : '';
  if (!idPengajuan) throw AppError_('INVALID_INPUT', 'Data tidak lengkap.', true);

  var keputusan = cleanText_(payload.keputusan, 10).toLowerCase();
  if (keputusan !== 'terima' && keputusan !== 'tolak') {
    throw AppError_('INVALID_INPUT', 'Keputusan tidak valid (terima atau tolak).', true);
  }
  var catatan = cleanText_(payload.catatan_keputusan, 500);
  var statusBaru = keputusan === 'terima' ? 'diterima' : 'ditolak';

  return withLock_(function () {
    var row = findPengajuanById_(idPengajuan);
    if (!row) throw AppError_('NOT_FOUND', 'Pengajuan tidak ditemukan.', true);
    if (String(row.status) !== 'menunggu') {
      throw AppError_('CONFLICT', 'Pengajuan sudah diputuskan sebelumnya.', true);
    }

    row.status = statusBaru;
    row.id_admin = ctx.account.id_akun;
    row.waktu_keputusan = nowIso_();
    row.catatan_keputusan = catatan;
    row.diubah_pada = nowIso_();
    updateObjectRow_('PengajuanSusulan', row.__row, row);

    logActivity_(keputusan === 'terima' ? 'susulan_approved' : 'susulan_rejected',
      ctx.account.id_akun, ctx.account.peran, 'pengajuan_susulan', idPengajuan);
    return { ok: true, id_pengajuan: idPengajuan, status: statusBaru };
  });
}

/* ---------------- Log audit ---------------- */

function handleAdminLogList_(payload, method) {
  adminRequire_(payload, method);
  var aksi = cleanText_(payload.aksi, 60);
  var limit = clampListLimit_(payload.limit, 100);

  var rows = readObjects_('LogAktivitas');
  var matched = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (aksi && String(r.aksi) !== aksi) continue;
    matched.push({
      id_log: String(r.id_log),
      waktu: String(r.waktu || ''),
      id_aktor: String(r.id_aktor || ''),
      peran_aktor: String(r.peran_aktor || ''),
      aksi: String(r.aksi),
      target: String(r.target || ''),
      detail: String(r.detail || '')
    });
  }
  matched.reverse();
  return adminListResponse_(matched.slice(0, limit), matched.length);
}

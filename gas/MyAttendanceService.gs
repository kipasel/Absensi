/**
 * Riwayat absensi pribadi pegawai. Identitas hanya berasal dari sesi terverifikasi.
 */
function handleMyAttendance_(payload, method) {
  requirePost_(method);
  var ctx = requireSession_(payload && payload.token);
  if (ctx.account.peran !== 'pegawai') {
    throw AppError_('FORBIDDEN', 'Akses ditolak.', true);
  }

  var today = Utilities.formatDate(new Date(), BIZ_TIMEZONE, 'yyyy-MM-dd');
  var month = payload && payload.bulan ? String(payload.bulan) : today.substring(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw AppError_('INVALID_INPUT', 'Bulan tidak valid (YYYY-MM).', true);
  }

  var idPegawai = String(ctx.pegawai.id_pegawai);
  var rows = readObjects_('Absensi');
  var items = [];
  var waktuMasukHariIni = '';
  var waktuPulangHariIni = '';
  var masuk = 0;
  var pulang = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row.id_pegawai) !== idPegawai) continue;
    var tanggal = String(row.tanggal || '');
    var jenis = String(row.jenis || '');
    var isJagat = String(row.kategori_pegawai || '') === 'JAGAT_SAKSANA';
    var status = jenis === 'masuk'
      ? (isJagat ? jagatMasukStatusFromServerIso_(row.waktu_server) : masukStatusFromServerIso_(row.waktu_server))
      : (jenis === 'pulang'
        ? (isJagat ? jagatPulangStatusFromServerIso_(row.waktu_server, row.tanggal) : pulangStatusFromServerIso_(row.waktu_server))
        : (jenis === 'lepas_piket'
          ? jagatLepasPiketStatusFromServerIso_(row.waktu_server, row.tanggal)
          : ''));
    if (tanggal === today && jenis === 'masuk' && status && !waktuMasukHariIni) {
      waktuMasukHariIni = String(row.waktu_server || '');
    }
    var civilToday = civilFromServerIso_(row.waktu_server);
    var penutupHariIni = jenis === 'pulang' || jenis === 'lepas_piket';
    if ((isJagat ? (civilToday && civilToday.tanggal === today) : tanggal === today) &&
        penutupHariIni && status && !waktuPulangHariIni) {
      waktuPulangHariIni = String(row.waktu_server || '');
    }
    if (tanggal.substring(0, 7) !== month) continue;
    if (jenis === 'masuk') masuk++;
    if (penutupHariIni) pulang++;
    items.push({
      tanggal: tanggal,
      jenis: jenis,
      waktu_server: String(row.waktu_server || ''),
      mode_kerja: String(row.mode_kerja || ''),
      status: status
    });
  }
  items.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return a.waktu_server < b.waktu_server ? 1 : (a.waktu_server > b.waktu_server ? -1 : 0);
  });
  return {
    ok: true,
    tanggal_server: today,
    sudah_masuk_hari_ini: Boolean(waktuMasukHariIni),
    waktu_masuk_hari_ini: waktuMasukHariIni || null,
    sudah_pulang_hari_ini: Boolean(waktuPulangHariIni),
    waktu_pulang_hari_ini: waktuPulangHariIni || null,
    bulan: month,
    ringkasan: { total: items.length, masuk: masuk, pulang: pulang },
    items: items
  };
}

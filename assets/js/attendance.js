/*
 * Antarmuka absensi — Sistem Absensi KPU Kabupaten Aceh Selatan (PHASE 3).
 *
 * Alur: pilih jenis & mode → kamera → (GPS bila masuk WFO) → ringkasan →
 * kirim → hasil sesuai respons backend.
 *
 * Prinsip keamanan:
 * - UI ini BUKAN pengaman. Backend memvalidasi ulang seluruh aturan; identitas
 *   dan waktu keputusan selalu dari server.
 * - Tidak ada unggahan galeri; foto hanya via kamera (canvas → JPEG, DEC-P17).
 * - Tidak ada antrean offline diam-diam; offline → blokir kirim + instruksi.
 * - Retry memakai id_absensi yang sama (idempoten, dicegah duplikat di backend).
 * - Tidak menampilkan sukses sebelum backend mengonfirmasi.
 */
(function () {
  'use strict';

  var api = window.AppApi;
  var camera = window.AppCamera;

  // Status alur internal (hanya di memori).
  var flow = null;

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function show(node) {
    if (node) node.hidden = false;
  }

  function hide(node) {
    if (node) node.hidden = true;
  }

  function resetFlow() {
    if (camera) camera.stop();
    flow = {
      idAbsensi: null,
      foto: null,          // {base64, bytes, width, height}
      gps: null,           // {lat, lng, accuracy}
      stage: 'select'      // select | camera | location | summary | sending | done
    };
  }

  function newIdAbsensi() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'ABS-' + window.crypto.randomUUID();
    }
    // Fallback untuk browser tanpa randomUUID.
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var hex = '';
    for (var j = 0; j < 16; j++) {
      hex += (bytes[j] + 0x100).toString(16).substring(1);
    }
    return 'ABS-' + hex;
  }

  function statusKindClass(kind) {
    return 'att-status' + (kind ? ' att-status--' + kind : '');
  }

  function setStatus(text, kind) {
    var node = el('att-status');
    if (!node) return;
    node.textContent = text || '';
    node.className = statusKindClass(kind);
    node.hidden = !text;
  }

  function showStage(name) {
    if (!flow) return;
    flow.stage = name;
    hide(el('att-step-select'));
    hide(el('att-step-camera'));
    hide(el('att-step-location'));
    hide(el('att-step-summary'));
    hide(el('att-result'));
    if (name === 'select') show(el('att-step-select'));
    if (name === 'camera') show(el('att-step-camera'));
    if (name === 'location') show(el('att-step-location'));
    if (name === 'summary') {
      show(el('att-step-summary'));
      // Pastikan tombol kirim aktif: state disabled bisa tersisa dari
      // percobaan gagal/sebelumnya dan memblokir pengiriman berikutnya.
      var submitBtn = el('att-submit');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function selectedValue(name) {
    var nodes = document.getElementsByName(name);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].checked) return nodes[i].value;
    }
    return '';
  }

  function updateTimeHint() {
    var node = el('att-time-hint');
    if (!node) return;
    var now = new Date();
    var hh = ('0' + now.getHours()).slice(-2);
    var mm = ('0' + now.getMinutes()).slice(-2);
    var ss = ('0' + now.getSeconds()).slice(-2);
    node.textContent = 'Jam perangkat saat ini ' + hh + '.' + mm + '.' + ss +
      ' (hanya indikasi; keputusan menggunakan waktu server).';
  }

  function needsGps() {
    return selectedValue('att-jenis') === 'masuk' && selectedValue('att-mode') === 'WFO';
  }

  /* ---------------- Kamera ---------------- */

  function openCamera() {
    if (!camera || !camera.isSupported()) {
      setStatus(
        (camera && camera.isSupported()) ? 'Kamera tidak tersedia.' : 'Perangkat/browser ini tidak mendukung API kamera.',
        'error');
      return;
    }
    setStatus('Menunggu izin kamera…', 'info');
    showStage('camera');
    hide(el('att-photo'));
    show(el('att-video'));
    hide(el('att-retake'));
    hide(el('att-use'));
    show(el('att-capture'));

    camera.start(el('att-video')).then(function () {
      setStatus('Kamera aktif. Ambil foto absensi.', 'info');
    }).catch(function (err) {
      setStatus((err && err.message) || 'Gagal membuka kamera.', 'error');
      camera.stop();
      showStage('select');
    });
  }

  function capturePhoto() {
    if (!camera) return;
    setStatus('Mengambil foto…', 'info');
    camera.capture(el('att-video'), camera.PHOTO_MAX_BYTES).then(function (photo) {
      flow.foto = photo;
      var img = el('att-photo');
      img.src = 'data:image/jpeg;base64,' + photo.base64;
      hide(el('att-video'));
      show(img);
      hide(el('att-capture'));
      show(el('att-retake'));
      show(el('att-use'));
      setStatus('Periksa foto. Ambil ulang bila perlu, atau gunakan foto ini.', 'info');
    }).catch(function (err) {
      setStatus((err && err.message) || 'Foto gagal diambil. Coba lagi.', 'error');
    });
  }

  function retakePhoto() {
    flow.foto = null;
    hide(el('att-photo'));
    show(el('att-video'));
    hide(el('att-retake'));
    hide(el('att-use'));
    show(el('att-capture'));
    setStatus('Kamera aktif. Ambil ulang foto.', 'info');
  }

  function cancelCamera() {
    camera.stop();
    resetFlow();
    showStage('select');
    setStatus('', '');
  }

  function usePhoto() {
    if (!flow.foto) return;
    camera.stop();
    if (needsGps()) {
      requestLocation();
    } else {
      flow.gps = null;
      showSummary();
    }
  }

  /* ---------------- GPS (hanya masuk WFO) ---------------- */

  function requestLocation() {
    showStage('location');
    setStatus('Meminta lokasi perangkat…', 'info');

    if (!navigator.geolocation) {
      setStatus('Perangkat ini tidak mendukung lokasi. Absensi masuk WFO memerlukan GPS.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      flow.gps = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: (typeof pos.coords.accuracy === 'number') ? pos.coords.accuracy : null
      };
      showSummary();
    }, function (err) {
      var msg = 'Lokasi GPS diperlukan untuk absensi masuk WFO.';
      if (err && err.code === 1) msg = 'Izin lokasi ditolak. Absensi masuk WFO memerlukan GPS.';
      else if (err && err.code === 2) msg = 'Lokasi perangkat tidak tersedia.';
      else if (err && err.code === 3) msg = 'Permintaan lokasi habis waktu. Coba lagi.';
      setStatus(msg, 'error');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  /* ---------------- Ringkasan & kirim ---------------- */

  function showSummary() {
    var jenis = selectedValue('att-jenis');
    var mode = selectedValue('att-mode');
    setText('sum-jenis', jenis === 'masuk' ? 'Masuk' : 'Pulang');
    setText('sum-mode', mode === 'WFO' ? 'WFO' : 'WFH/WFA');
    setText('sum-foto', flow.foto
      ? (flow.foto.width + '×' + flow.foto.height + ' px, ' + flow.foto.bytes + ' byte (JPEG)')
      : '-');
    if (jenis === 'masuk' && mode === 'WFO') {
      show(el('sum-gps-row'));
      setText('sum-gps', flow.gps
        ? ('Terambil' + (flow.gps.accuracy !== null ? (', akurasi ±' + Math.round(flow.gps.accuracy) + ' m') : ''))
        : '-');
    } else {
      hide(el('sum-gps-row'));
    }
    var pulangFields = el('att-pulang-fields');
    if (pulangFields) {
      if (jenis === 'pulang') {
        pulangFields.hidden = false;
      } else {
        pulangFields.hidden = true;
        var uraian = el('att-uraian');
        var output = el('att-output');
        if (uraian) uraian.value = '';
        if (output) output.value = '';
      }
    }
    if (!flow.idAbsensi) {
      flow.idAbsensi = newIdAbsensi();
    }
    setStatus('Periksa ringkasan, lalu kirim. Backend akan memvalidasi ulang.', 'info');
    showStage('summary');
  }

  function mapErrorToMessage(res) {
    if (!res) return 'Respons server tidak dikenali.';
    if (res.message) return res.message;
    var map = {
      UNAUTHORIZED: 'Sesi tidak valid atau kedaluwarsa. Silakan masuk ulang.',
      TIME_WINDOW: 'Di luar jendela jam absensi reguler.',
      DUPLICATE: 'Absensi sudah tercatat untuk jenis ini pada tanggal tersebut.',
      OFFICE_NOT_CONFIGURED: 'Validasi lokasi kantor belum dikonfigurasi.',
      ATTENDANCE_STORAGE_PARTIAL: 'Penyimpanan gagal sebagian. Absensi BELUM tercatat; silakan coba lagi.',
      NOT_CONFIGURED: 'Backend belum dikonfigurasi.',
      INTERNAL_ERROR: 'Terjadi kesalahan pada server.'
    };
    return map[res.error] || 'Permintaan ditolak.';
  }

  function submitAttendance() {
    if (!flow || !flow.foto) return;
    if (!navigator.onLine) {
      setStatus('Anda sedang luring. Absensi tidak dapat dikirim — coba lagi saat daring.', 'error');
      return;
    }
    if (!api || !api.hasBackend()) {
      setStatus('Backend belum dikonfigurasi.', 'error');
      return;
    }

    var jenis = selectedValue('att-jenis');
    var mode = selectedValue('att-mode');
    var data = {
      id_absensi: flow.idAbsensi,
      jenis: jenis,
      mode_kerja: mode,
      foto_base64: flow.foto.base64,
      foto_mime: camera.PHOTO_MIME
    };
    if (jenis === 'pulang') {
      var uraian = el('att-uraian');
      var output = el('att-output');
      var uraianVal = uraian && typeof uraian.value === 'string' ? uraian.value.trim() : '';
      var outputVal = output && typeof output.value === 'string' ? output.value.trim() : '';
      if (!uraianVal) {
        setStatus('Uraian Pekerjaan wajib diisi.', 'error');
        if (uraian) uraian.focus();
        return;
      }
      if (!outputVal) {
        setStatus('Output Pekerjaan wajib diisi.', 'error');
        if (output) output.focus();
        return;
      }
      data.uraian_pekerjaan = uraianVal;
      data.output_pekerjaan = outputVal;
    }
    if (jenis === 'masuk' && mode === 'WFO' && flow.gps) {
      data.gps = { lat: flow.gps.lat, lng: flow.gps.lng, accuracy: flow.gps.accuracy };
    }

    flow.stage = 'sending';
    var submitBtn = el('att-submit');
    if (submitBtn) submitBtn.disabled = true;
    setStatus('Mengirim absensi… (jangan tutup halaman)', 'info');

    api.call('attendance.submit', data).then(function (res) {
      if (res && res.ok) {
        finishSuccess(res);
      } else {
        handleSubmitFailure(res);
      }
    }).catch(function () {
      setStatus(
        'Koneksi gagal — absensi BELUM dikonfirmasi. Periksa jaringan lalu tekan ' +
        '"Kirim absensi" lagi; permintaan ulang dengan ID yang sama tidak akan ' +
        'menghasilkan absensi ganda.', 'error');
    }).then(function () {
      // Pulihkan status DULU baru aktifkan tombol: pada jalur gagal stage masih
      // 'sending' sehingga urutan lama mematikan tombol kirim secara permanen
      // (perbaikan bug PHASE 6 — retry setelah kegagalan harus tetap bisa).
      if (flow.stage === 'sending') flow.stage = 'summary';
      if (submitBtn && flow.stage === 'summary') submitBtn.disabled = false;
    });
  }

  function handleSubmitFailure(res) {
    var code = res && res.error;
    if (code === 'UNAUTHORIZED' || code === 'AUTH_FAILED') {
      document.dispatchEvent(new CustomEvent('auth:session-lost'));
      setStatus('Sesi tidak valid. Silakan masuk ulang.', 'error');
      return;
    }
    if (code === 'ATTENDANCE_STORAGE_PARTIAL') {
      setStatus(mapErrorToMessage(res), 'error');
      return;
    }
    if (code === 'DUPLICATE') {
      var dupMsg = (res && res.message)
        ? res.message
        : 'Absensi sudah tercatat untuk jenis ini pada tanggal tersebut.';
      setStatus('Sudah pernah absen — ' + dupMsg + ' Periksa jenis (masuk/pulang) atau kembali ke menu Beranda.', 'info');
      return;
    }
    setStatus(mapErrorToMessage(res), 'error');
  }

  function finishSuccess(res) {
    camera.stop();
    flow.stage = 'done';
    setText('att-result-title', 'Absensi tercatat');
    setText('att-result-detail',
      (res.jenis === 'masuk' ? 'Masuk' : 'Pulang') + ' (' +
      (res.mode_kerja === 'WFO' ? 'WFO' : 'WFH/WFA') + ') pada ' + res.tanggal +
      ' pukul ' + formatServerTime(res.waktu_server) + ' WIB.' +
      (res.status_absensi === 'TANPA_ABSEN_MASUK'
        ? ' Catatan absensi masuk pada tanggal ini tidak tersedia.' : ''));
    show(el('att-result'));
    hide(el('att-step-summary'));
    setStatus('', '');
  }

  function formatServerTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    // Konversi UTC → WIB untuk tampilan (keputusan tetap dari server).
    var wib = new Date(d.getTime() + 7 * 3600 * 1000);
    var hh = ('0' + wib.getUTCHours()).slice(-2);
    var mm = ('0' + wib.getUTCMinutes()).slice(-2);
    var ss = ('0' + wib.getUTCSeconds()).slice(-2);
    return hh + '.' + mm + '.' + ss;
  }

  function restartFlow() {
    resetFlow();
    setStatus('', '');
    showStage('select');
    updateTimeHint();
  }

  /* ---------------- Lifecycle ---------------- */

  function renderVisible(visible) {
    var view = el('attendance-view');
    if (visible) {
      show(view);
      restartFlow();
    } else {
      hide(view);
      resetFlow();
    }
  }

  function bind() {
    var captureBtn = el('att-capture');
    if (captureBtn) captureBtn.addEventListener('click', capturePhoto);
    var retakeBtn = el('att-retake');
    if (retakeBtn) retakeBtn.addEventListener('click', retakePhoto);
    var useBtn = el('att-use');
    if (useBtn) useBtn.addEventListener('click', usePhoto);
    var cancelBtn = el('att-cancel-camera');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelCamera);
    var openBtn = el('att-open-camera');
    if (openBtn) openBtn.addEventListener('click', openCamera);
    var submitBtn = el('att-submit');
    if (submitBtn) submitBtn.addEventListener('click', submitAttendance);
    var restartBtn = el('att-restart');
    if (restartBtn) restartBtn.addEventListener('click', restartFlow);
    var resultClose = el('att-result-close');
    if (resultClose) resultClose.addEventListener('click', restartFlow);

    document.addEventListener('auth:login', function () { renderVisible(true); });
    document.addEventListener('auth:logout', function () { renderVisible(false); });
    document.addEventListener('auth:session-lost', function () { renderVisible(false); });
  }

  function init() {
    resetFlow();
    bind();
    hide(el('attendance-view'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

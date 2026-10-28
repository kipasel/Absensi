/*
 * Antarmuka pengajuan absensi susulan — Sistem Absensi KPU Kabupaten
 * Aceh Selatan (REQUIREMENTS §8; keputusan DEC-P23/P24).
 *
 * Alur: isi form (tanggal, jenis, mode, waktu diklaim, alasan) → pilih foto
 * bukti (dikonversi canvas → JPEG) → kirim 'susulan.submit' → hasil sesuai
 * respons backend.
 *
 * Prinsip keamanan:
 * - UI ini BUKAN pengaman. Backend memvalidasi ulang seluruh aturan (rentang
 *   tanggal, format, alasan, foto); identitas dari sesi server.
 * - Foto dikonversi ke JPEG di kanvas (sama seperti absensi reguler, DEC-P17);
 *   batas byte & dimensi ditekan klien, keputusan tetap backend.
 * - Tidak ada antrean offline diam-diam; offline → blokir kirim.
 * - Tidak menampilkan sukses sebelum backend mengonfirmasi.
 * - Pengajuan yang dikirim belum menjadi absensi; menunggu keputusan admin.
 */
(function () {
  'use strict';

  var api = window.AppApi;

  var MAX_ALASAN_LEN = 500;
  var MAX_AGE_DAYS = 3;          // DEC-P23 — harus sinkron dengan backend
  var MAX_PHOTO_BYTES = 1000000; // batas default backend; klien menekan lebih dulu
  var MAX_DIM = 1280;

  function el(id) {
    return document.getElementById(id);
  }

  function showMessage(text, kind) {
    var node = el('susulan-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'form-message' + (kind ? ' form-message--' + kind : '');
    node.hidden = !text;
  }

  function pad2(n) {
    return ('0' + n).slice(-2);
  }

  function isoLocalDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function setTanggalBounds() {
    var input = el('susulan-tanggal');
    if (!input) return;
    var now = new Date();
    var min = new Date(now.getTime());
    min.setDate(min.getDate() - MAX_AGE_DAYS);
    input.min = isoLocalDate(min);
    input.max = isoLocalDate(now);
  }

  /**
   * Mengonversi berkas foto pilihan pengguna menjadi JPEG tervalidasi.
   * @param {File} file
   * @return {Promise<{base64:string, bytes:number}>}
   */
  function fileToJpeg(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('Foto bukti wajib dipilih.'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx2d = canvas.getContext('2d');
        if (!ctx2d) {
          reject(new Error('Kanvas tidak tersedia pada peramban ini.'));
          return;
        }
        ctx2d.drawImage(img, 0, 0, w, h);

        var qualities = [0.85, 0.7, 0.55, 0.4];
        function encode(quality) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error('Gagal memproses foto.'));
              return;
            }
            var idx = qualities.indexOf(quality);
            if (blob.size > MAX_PHOTO_BYTES && idx + 1 < qualities.length) {
              encode(qualities[idx + 1]);
              return;
            }
            if (blob.size > MAX_PHOTO_BYTES) {
              reject(new Error('Foto masih terlalu besar setelah kompresi.'));
              return;
            }
            var reader = new FileReader();
            reader.onloadend = function () {
              var dataUrl = String(reader.result || '');
              var comma = dataUrl.indexOf(',');
              var base64 = comma === -1 ? '' : dataUrl.substring(comma + 1);
              if (!base64) {
                reject(new Error('Hasil foto tidak dapat dibaca.'));
                return;
              }
              resolve({ base64: base64, bytes: blob.size });
            };
            reader.onerror = function () {
              reject(new Error('Hasil foto tidak dapat dibaca.'));
            };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', quality);
        }
        encode(qualities[0]);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Berkas foto tidak dapat dibaca.'));
      };
      img.src = url;
    });
  }

  function validateLocal(form) {
    var tanggal = (form.elements.tanggal.value || '').trim();
    var waktu = (form.elements.waktu.value || '').trim();
    var alasan = (form.elements.alasan.value || '').trim();
    var fileInput = form.elements.foto;
    var file = fileInput && fileInput.files && fileInput.files[0];

    if (!api.getToken()) return 'Sesi berakhir — silakan masuk kembali.';
    if (!navigator.onLine) return 'Perangkat sedang offline — pengajuan tidak dapat dikirim.';
    if (!tanggal) return 'Tanggal absensi wajib diisi.';
    if (!waktu) return 'Waktu yang diklaim wajib diisi.';
    if (!alasan) return 'Alasan susulan wajib diisi.';
    if (alasan.length > MAX_ALASAN_LEN) {
      return 'Alasan maksimal ' + MAX_ALASAN_LEN + ' karakter.';
    }
    if (!file) return 'Foto bukti wajib dipilih.';
    return null;
  }

  function submitSusulan(e) {
    e.preventDefault();
    var form = el('susulan-form');
    if (!form) return;
    var btn = el('susulan-submit');

    var localError = validateLocal(form);
    if (localError) {
      showMessage(localError, 'error');
      return;
    }

    var tanggal = (form.elements.tanggal.value || '').trim();
    var jenis = form.elements.jenis.value;
    var mode = form.elements.mode_kerja.value;
    var waktu = (form.elements.waktu.value || '').trim();
    var alasan = (form.elements.alasan.value || '').trim();
    var file = form.elements.foto.files[0];

    if (btn) btn.disabled = true;
    showMessage('Memproses foto…', 'info');

    fileToJpeg(file).then(function (foto) {
      return api.call('susulan.submit', {
        tanggal_absensi: tanggal,
        jenis: jenis,
        mode_kerja: mode,
        waktu_diklaim: waktu,
        alasan: alasan,
        foto_base64: foto.base64,
        foto_mime: 'image/jpeg'
      });
    }).then(function (res) {
      if (res && res.ok) {
        form.reset();
        setTanggalBounds();
        var dateTime = window.AppDateTime;
        var tanggalTampil = dateTime
          ? (dateTime.formatDate(res.tanggal_absensi) || res.tanggal_absensi)
          : res.tanggal_absensi;
        showMessage(
          'Pengajuan susulan tercatat (' + res.id_pengajuan + ') untuk ' +
          tanggalTampil + '. Status: menunggu persetujuan admin.',
          'info'
        );
      } else {
        showMessage((res && res.message) || 'Pengajuan gagal.', 'error');
      }
    }).catch(function (err) {
      showMessage((err && err.message) || 'Terjadi kesalahan.', 'error');
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  }

  function bind() {
    var form = el('susulan-form');
    if (form) form.addEventListener('submit', submitSusulan);
  }

  function init() {
    setTanggalBounds();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

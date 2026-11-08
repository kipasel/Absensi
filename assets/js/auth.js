/*
 * Autentikasi antarmuka — Sistem Absensi KPU Kabupaten Aceh Selatan (PHASE 2).
 *
 * - Login: NIP/NIPK + PIN (keputusan D0).
 * - Sesi di memori; bila "Ingat saya" dicentang, token juga disimpan di
 *   localStorage agar tidak perlu login ulang tiap muat halaman (DEC-P30,
 *   mengubah DEC-P09). Cookie tidak mungkin pada stack ini.
 * - Otorisasi sebenarnya ada di backend; UI ini hanya membantu, bukan pengaman.
 */
(function () {
  'use strict';

  var api = window.AppApi;

  // Info pengguna aktif: hanya di memori.
  var current = null;

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var node = el(id);
    if (node) {
      node.textContent = text;
    }
  }

  function show(node) {
    if (node) {
      node.hidden = false;
    }
  }

  function hide(node) {
    if (node) {
      node.hidden = true;
    }
  }

  function setMessage(id, text, kind) {
    var node = el(id);
    if (!node) {
      return;
    }
    node.textContent = text || '';
    node.className = 'form-message' + (kind ? ' form-message--' + kind : '');
    node.hidden = !text;
  }

  function renderLoggedOut() {
    current = null;
    show(el('login-view'));
    hide(el('session-view'));
    setMessage('login-message', '', '');
    document.dispatchEvent(new CustomEvent('auth:logout'));
  }

  function renderLoggedIn(user) {
    current = user;
    hide(el('login-view'));
    show(el('session-view'));
    setText('session-name', user.nama || '-');
    setText('session-role', user.peran === 'admin' ? 'Administrator' : 'Pegawai');
    setMessage('login-message', '', '');
    document.dispatchEvent(new CustomEvent('auth:login', { detail: {
      nama: user.nama, peran: user.peran, kategori: user.kategori || 'REGULER'
    } }));
  }

  function onSubmit(event) {
    event.preventDefault();

    var nipEl = el('nip');
    var pinEl = el('pin');
    var rememberEl = el('remember');
    var submitBtn = el('login-submit');

    var nip = nipEl ? nipEl.value.trim() : '';
    var pin = pinEl ? pinEl.value : '';
    var remember = Boolean(rememberEl && rememberEl.checked);
    // Jangan simpan PIN: kosongkan kolom segera setelah dibaca.
    if (pinEl) {
      pinEl.value = '';
    }

    if (!nip || !pin) {
      setMessage('login-message', 'NIP dan PIN wajib diisi.', 'error');
      return;
    }

    if (!api || !api.hasBackend()) {
      setMessage('login-message', 'Backend belum dikonfigurasi.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }
    setMessage('login-message', 'Memproses…', 'info');

    api.call('login', { nip: nip, pin: pin, agen: navigator.userAgent })
      .then(function (res) {
        if (res && res.ok && res.token) {
          api.setToken(res.token, remember);
          renderLoggedIn({ nama: res.nama, peran: res.peran, kategori: res.kategori });
        } else {
          setMessage('login-message',
            (res && res.message) || 'NIP atau PIN tidak sesuai.', 'error');
        }
      })
      .catch(function () {
        setMessage('login-message', 'Tidak dapat menghubungi server.', 'error');
      })
      .then(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      });
  }

  function onLogout() {
    api.call('logout', {}).catch(function () {
      // Tetap bersihkan sesi lokal walau permintaan gagal.
    }).then(function () {
      api.clearToken();
      renderLoggedOut();
    });
  }

  /**
   * Memulihkan sesi dari token persisten (DEC-P30). Hanya melihat apakah ada
   * token tersimpan, lalu membuktikan validitasnya ke server lewat
   * `session.check`. Bila gagal/kedaluwarsa, token lokal dibersihkan.
   */
  function restoreSession() {
    if (!api.hasStoredToken()) {
      renderLoggedOut();
      return;
    }
    api.restoreToken();
    api.call('session.check', {})
      .then(function (res) {
        if (res && res.ok) {
          renderLoggedIn({ nama: res.nama, peran: res.peran, kategori: res.kategori });
        } else {
          api.clearToken();
          renderLoggedOut();
        }
      })
      .catch(function () {
        // Tidak dapat menghubungi server: jangan klaim sesi valid.
        api.clearToken();
        renderLoggedOut();
      });
  }

  function init() {
    if (!api) {
      return;
    }
    var form = el('login-form');
    if (form) {
      form.addEventListener('submit', onSubmit);
    }
    var logoutBtn = el('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', onLogout);
    }
    // Backend menolak sesi (kedaluwarsa/dicabut): bersihkan sesi lokal
    // agar UI tidak tetap menampilkan status "masuk" yang sudah tidak valid.
    document.addEventListener('auth:session-lost', function () {
      api.clearToken();
      renderLoggedOut();
    });
    restoreSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

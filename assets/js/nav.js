/*
 * Navigasi antarmuka (app shell + bottom nav) — Sistem Absensi KPU Kabupaten
 * Aceh Selatan.
 *
 * Mengelola perpindahan antar tampilan (Beranda/Absensi/Admin/Profil), visibilitas
 * bilah navigasi bawah, dan item khusus admin. Modul ini TIDAK mengubah logika
 * bisnis: ia hanya menampilkan/menyembunyikan bagian yang sudah ada
 * (attendance-view, admin-view, session-view) dan tidak menyentuh otorisasi
 * (otorisasi tetap di backend).
 */
(function () {
  'use strict';

  var VIEWS = {
    home: 'home-view',
    attendance: 'attendance-view',
    admin: 'admin-view',
    session: 'session-view'
  };

  var DEFAULT_TAB = 'home';
  var currentUser = null;
  var activeTab = null;

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var node = el(id);
    if (node) {
      node.textContent = text;
    }
  }

  function isAdmin() {
    return Boolean(currentUser && currentUser.peran === 'admin');
  }

  function canShow(tab) {
    return tab !== 'admin' || isAdmin();
  }

  function hideAllViews() {
    Object.keys(VIEWS).forEach(function (key) {
      var node = el(VIEWS[key]);
      if (node) {
        node.hidden = true;
      }
    });
  }

  function renderNav() {
    var nav = el('app-nav');
    if (!nav) {
      return;
    }
    var loggedIn = Boolean(currentUser);
    nav.hidden = !loggedIn;

    var items = nav.querySelectorAll('[data-nav]');
    for (var i = 0; i < items.length; i++) {
      var role = items[i].getAttribute('data-role');
      var allowed = !role || (role === 'admin' && isAdmin());
      items[i].hidden = !loggedIn || !allowed;
    }
  }

  function applyActive() {
    var items = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < items.length; i++) {
      var active = items[i].getAttribute('data-nav') === activeTab;
      if (active) {
        items[i].classList.add('is-active');
        items[i].setAttribute('aria-current', 'page');
      } else {
        items[i].classList.remove('is-active');
        items[i].removeAttribute('aria-current');
      }
    }
  }

  function selectTab(tab) {
    if (!canShow(tab)) {
      tab = DEFAULT_TAB;
    }
    activeTab = tab;
    Object.keys(VIEWS).forEach(function (key) {
      var node = el(VIEWS[key]);
      if (node) {
        node.hidden = key !== tab;
      }
    });
    applyActive();
  }

  function setUser(user) {
    currentUser = user || null;

    var chip = el('nav-user');
    var logout = el('nav-logout');
    if (currentUser) {
      if (chip) {
        chip.textContent = currentUser.nama || 'Pengguna';
        chip.hidden = false;
      }
      if (logout) {
        logout.hidden = false;
      }
      setText('home-greeting', 'Halo, ' + (currentUser.nama || 'Pengguna'));
    } else {
      if (chip) {
        chip.textContent = '-';
        chip.hidden = true;
      }
      if (logout) {
        logout.hidden = true;
      }
      setText('home-greeting', 'Sistem Absensi Pegawai');
    }
  }

  function bind() {
    var items = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('click', function () {
          var attendanceKind = item.getAttribute('data-attendance-kind');
          if (attendanceKind) {
            var choice = document.querySelector(
              'input[name="att-jenis"][value="' + attendanceKind + '"]'
            );
            if (choice) {
              choice.checked = true;
            }
          }
          selectTab(item.getAttribute('data-nav'));
        });
      })(items[i]);
    }

    var logout = el('nav-logout');
    if (logout) {
      logout.addEventListener('click', function () {
        // Pakai ulang tombol keluar yang sudah tertangani modul autentikasi.
        var fallback = el('logout-btn');
        if (fallback) {
          fallback.click();
        }
      });
    }

    document.addEventListener('auth:login', function (event) {
      var detail = (event && event.detail) || {};
      setUser({ nama: detail.nama, peran: detail.peran });
      renderNav();
      selectTab(DEFAULT_TAB);
    });

    document.addEventListener('auth:logout', function () {
      setUser(null);
      renderNav();
      hideAllViews();
      activeTab = null;
      applyActive();
    });
  }

  function init() {
    // Keadaan awal (sebelum login): semua tampilan aplikasi tersembunyi.
    hideAllViews();
    renderNav();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

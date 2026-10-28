/* Riwayat absensi pribadi pegawai; server menentukan identitas dan tanggal. */
(function () {
  'use strict';
  var api = window.AppApi;
  var dateTime = window.AppDateTime;
  var el = function (id) { return document.getElementById(id); };
  var currentMonth = '';
  var busy = false;

  function set(id, value) {
    var node = el(id);
    if (node) node.textContent = value;
  }
  function time(iso) {
    if (!dateTime) return '—';
    return dateTime.formatTime(iso) || '—';
  }
  function dateLabel(value) {
    if (!dateTime) return value;
    return dateTime.formatDate(value) || value;
  }
  function addItem(container, item) {
    var card = document.createElement('article');
    card.className = 'history-item';
    var main = document.createElement('div');
    var heading = document.createElement('h3');
    heading.textContent = item.jenis === 'masuk' ? 'Absen masuk' : 'Absen pulang';
    var date = document.createElement('p');
    date.textContent = dateLabel(item.tanggal);
    main.appendChild(heading);
    main.appendChild(date);
    var detail = document.createElement('div');
    detail.className = 'history-item__detail';
    var clock = document.createElement('strong');
    clock.textContent = time(item.waktu_server);
    var mode = document.createElement('span');
    mode.textContent = item.mode_kerja === 'WFO' ? 'WFO' : 'WFH/WFA';
    var status = document.createElement('span');
    status.textContent = item.status || 'Tercatat';
    detail.appendChild(clock);
    detail.appendChild(mode);
    detail.appendChild(status);
    card.appendChild(main);
    card.appendChild(detail);
    container.appendChild(card);
  }
  function refresh(month) {
    if (busy || !api) return;
    busy = true;
    var message = el('my-attendance-message');
    if (message) message.textContent = 'Memuat riwayat…';
    api.call('attendance.mine', { bulan: month || '' }).then(function (res) {
      if (!res || !res.ok) {
        if (message) message.textContent = (res && res.error === 'UNKNOWN_ACTION')
          ? 'Layanan riwayat belum diperbarui. Hubungi administrator.'
          : ((res && res.message) || 'Riwayat belum dapat dimuat. Coba lagi.');
        return;
      }
      currentMonth = res.bulan;
      var picker = el('my-attendance-month');
      if (picker && picker.value !== res.bulan) picker.value = res.bulan;
      set('my-attendance-today-status', res.sudah_masuk_hari_ini
        ? 'Sudah absen masuk hari ini.' : 'Belum ada catatan absen masuk hari ini.');
      set('my-attendance-today-time', res.sudah_masuk_hari_ini ? time(res.waktu_masuk_hari_ini) : '');
      var summary = res.ringkasan || {};
      set('my-attendance-total', String(summary.total || 0));
      set('my-attendance-masuk', String(summary.masuk || 0));
      set('my-attendance-pulang', String(summary.pulang || 0));
      var list = el('my-attendance-list');
      if (list) {
        list.textContent = '';
        if (!res.items || !res.items.length) {
          var empty = document.createElement('p');
          empty.className = 'history-empty';
          empty.textContent = 'Belum ada catatan absensi pada bulan ini.';
          list.appendChild(empty);
        } else {
          res.items.forEach(function (item) { addItem(list, item); });
        }
      }
      if (message) message.textContent = 'Data bulan ' + res.bulan + ' diperbarui.';
    }).catch(function () {
      if (message) message.textContent = 'Koneksi gagal. Riwayat belum dapat dimuat.';
    }).then(function () { busy = false; });
  }
  function init() {
    var picker = el('my-attendance-month');
    if (picker) picker.addEventListener('change', function () { refresh(picker.value); });
    document.addEventListener('auth:login', function (event) {
      var detail = event && event.detail;
      if (detail && detail.peran === 'pegawai') refresh('');
    });
    document.addEventListener('auth:logout', function () {
      set('my-attendance-today-status', 'Masuk untuk melihat status absensi.');
      set('my-attendance-today-time', '');
      set('my-attendance-list', '');
    });
    document.addEventListener('auth:session-lost', function () {
      set('my-attendance-today-status', 'Sesi berakhir. Masuk kembali untuk melihat status.');
    });
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('[data-nav="history"]')) {
        refresh((el('my-attendance-month') || {}).value || currentMonth);
      }
    });
    document.addEventListener('attendance:recorded', function () { refresh(currentMonth); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/*
 * Halaman laporan admin — Sistem Absensi KPU Kabupaten Aceh Selatan (PHASE 5).
 *
 * Prinsip keamanan (mengikuti admin.js):
 * - UI ini BUKAN pengaman: seluruh endpoint laporan diverifikasi peran 'admin'
 *   di backend; peran diambil dari sesi server (bukan dari klien).
 * - Data dirender dengan textContent (tanpa innerHTML) — anti XSS.
 * - Tidak ada URL/tautan foto; ekspor CSV tidak memuat referensi foto.
 * - Tidak ada penyimpanan token/PIN; sesi hanya di memori (D1).
 * - Kegagalan API ditampilkan sebagai error — BUKAN sebagai laporan kosong.
 */
(function () {
  'use strict';

  var api = window.AppApi;
  var isAdmin = false;
  var pageOffset = 0;
  var pageSize = 50;
  var lastTotal = 0;
  var pegawaiOptionsLoaded = false;

  var CSV_FILENAME_RE = /^laporan-absensi_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/;

  function el(id) {
    return document.getElementById(id);
  }

  function show(node) {
    if (node) node.hidden = false;
  }

  function hide(node) {
    if (node) node.hidden = true;
  }

  function setText(node, text) {
    if (node) node.textContent = text === undefined || text === null ? '' : String(text);
  }

  function clearNode(node) {
    if (node) node.textContent = '';
  }

  function setStatus(text, kind) {
    var node = el('report-status');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'att-status' + (kind ? ' att-status--' + kind : '');
    node.hidden = !text;
  }

  function cell(row, text) {
    var td = document.createElement('td');
    setText(td, text);
    row.appendChild(td);
    return td;
  }

  /* ---------------- Filter ---------------- */

  function readFilters() {
    var dari = (el('report-dari') && el('report-dari').value) || '';
    var sampai = (el('report-sampai') && el('report-sampai').value) || '';
    if (!dari || !sampai) {
      setStatus('Tanggal awal dan tanggal akhir wajib diisi.', 'error');
      return null;
    }
    if (dari > sampai) {
      setStatus('Tanggal awal melewati tanggal akhir.', 'error');
      return null;
    }
    return {
      tanggal_dari: dari,
      tanggal_sampai: sampai,
      id_pegawai: (el('report-pegawai') && el('report-pegawai').value) || '',
      jenis: (el('report-jenis') && el('report-jenis').value) || '',
      mode_kerja: (el('report-mode') && el('report-mode').value) || '',
      sumber: (el('report-sumber') && el('report-sumber').value) || '',
      status_pegawai: (el('report-status-pegawai') && el('report-status-pegawai').value) || ''
    };
  }

  /* ---------------- Daftar pegawai (select) ---------------- */

  function loadPegawaiOptions() {
    if (pegawaiOptionsLoaded || !isAdmin) return;
    api.call('admin.pegawai.list', { limit: 200 }).then(function (res) {
      if (!res || !res.ok) return;
      var select = el('report-pegawai');
      if (!select) return;
      clearNode(select);
      var all = document.createElement('option');
      all.value = '';
      all.textContent = 'Semua pegawai';
      select.appendChild(all);
      res.items.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id_pegawai;
        opt.textContent = item.nama + ' (' + item.nip_nipk + ')';
        select.appendChild(opt);
      });
      pegawaiOptionsLoaded = true;
    }).catch(function () { /* daftar opsional; filter tetap dapat tanpanya */ });
  }

  /* ---------------- Rekapitulasi ---------------- */

  function setRekapText(id, value) {
    setText(el(id), value === undefined || value === null ? '-' : String(value));
  }

  function renderHarian(harian) {
    var table = el('report-harian-table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    clearNode(tbody);
    (harian || []).forEach(function (item) {
      var tr = document.createElement('tr');
      cell(tr, item.tanggal);
      cell(tr, item.catatan_masuk);
      cell(tr, item.catatan_pulang);
      cell(tr, item.pulang_tanpa_masuk || 0);
      tbody.appendChild(tr);
    });
  }

  function loadRekap(filters) {
    setStatus('Memuat rekapitulasi…', 'info');
    return api.call('report.rekap', filters).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.message) || 'Gagal memuat rekapitulasi.');
      }
      setRekapText('rekap-total', res.catatan.total);
      setRekapText('rekap-masuk', res.catatan.masuk);
      setRekapText('rekap-pulang', res.catatan.pulang);
      setRekapText('rekap-pegawai-unik', res.pegawai_unik);
      setRekapText('rekap-wfo', res.mode_kerja.WFO);
      setRekapText('rekap-wfh', res.mode_kerja.WFH_WFA);
      setRekapText('rekap-reguler', res.sumber.reguler);
      setRekapText('rekap-susulan-record', 0);
      setRekapText('rekap-susulan-menunggu', 0);
      setRekapText('rekap-susulan-diterima', 0);
      setRekapText('rekap-susulan-ditolak', 0);
      renderHarian(res.harian);
      show(el('report-rekap'));
      return res;
    });
  }

  /* ---------------- Tabel detail ---------------- */

  function renderDetail(items) {
    var table = el('report-table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    clearNode(tbody);
    (items || []).forEach(function (item) {
      var tr = document.createElement('tr');
      cell(tr, item.tanggal);
      cell(tr, item.nama || item.id_pegawai);
      cell(tr, item.nip_nipk);
      cell(tr, item.jenis);
      cell(tr, item.mode_kerja);
      cell(tr, item.waktu_server);
      cell(tr, item.status || '-');
      cell(tr, item.kondisi_harian || '-');
      cell(tr, item.waktu_masuk || '-');
      cell(tr, item.waktu_pulang || '-');
      cell(tr, item.sumber);
      cell(tr, item.jarak_meter === null ? '-' : String(item.jarak_meter));
      cell(tr, item.ada_bukti ? 'Ada' : 'Tidak ada');
      cell(tr, item.uraian_pekerjaan || '-');
      cell(tr, item.output_pekerjaan || '-');
      tbody.appendChild(tr);
    });
  }

  function updatePagination(total) {
    lastTotal = total;
    var from = total === 0 ? 0 : pageOffset + 1;
    var to = Math.min(pageOffset + pageSize, total);
    setText(el('report-page-info'), 'Baris ' + from + '–' + to + ' dari ' + total);
    var prev = el('report-prev');
    var next = el('report-next');
    if (prev) prev.disabled = pageOffset <= 0;
    if (next) next.disabled = to >= total;
    var wrap = el('report-pagination');
    if (wrap) wrap.hidden = total === 0;
  }

  function loadDetail(filters) {
    setStatus('Memuat rincian absensi…', 'info');
    var data = {};
    Object.keys(filters).forEach(function (key) { data[key] = filters[key]; });
    data.limit = pageSize;
    data.offset = pageOffset;
    return api.call('report.absensi.list', data).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.message) || 'Gagal memuat rincian absensi.');
      }
      renderDetail(res.items);
      updatePagination(res.total);
      show(el('report-detail'));
      return res;
    });
  }

  function runReport() {
    var filters = readFilters();
    if (!filters) return;
    pageOffset = 0;
    Promise.all([loadRekap(filters), loadDetail(filters)])
      .then(function () {
        setStatus('Laporan dimuat.', 'success');
      })
      .catch(function (err) {
        setStatus((err && err.message) || 'Tidak dapat menghubungi server.', 'error');
      });
  }

  function goPage(delta) {
    var filters = readFilters();
    if (!filters) return;
    var next = pageOffset + delta * pageSize;
    if (next < 0 || next >= lastTotal) return;
    pageOffset = next;
    loadDetail(filters).then(function () {
      setStatus('Halaman diperbarui.', 'info');
    }).catch(function (err) {
      setStatus((err && err.message) || 'Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Ekspor CSV ---------------- */

  function downloadCsv(res) {
    var filename = res.filename;
    if (!CSV_FILENAME_RE.test(filename || '')) {
      throw new Error('Nama berkas ekspor tidak valid.');
    }
    var blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportCsv() {
    var filters = readFilters();
    if (!filters) return;
    setStatus('Menyiapkan ekspor CSV…', 'info');
    api.call('report.absensi.exportCsv', filters).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.message) || 'Ekspor gagal.');
      }
      downloadCsv(res);
      setStatus('Ekspor CSV diunduh (' + res.rows + ' baris).', 'success');
    }).catch(function (err) {
      setStatus((err && err.message) || 'Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Visibilitas tab ---------------- */

  function activateReportPanel() {
    var panels = document.querySelectorAll('.admin-tab-panel');
    for (var i = 0; i < panels.length; i++) hide(panels[i]);
    var buttons = document.querySelectorAll('[data-admin-tab]');
    for (var j = 0; j < buttons.length; j++) {
      var active = buttons[j].getAttribute('data-admin-tab') === 'laporan';
      buttons[j].className = 'btn admin-tab' + (active ? ' admin-tab--active' : '');
    }
    show(el('report-panel'));
    loadPegawaiOptions();
  }

  function hideReportPanel() {
    hide(el('report-panel'));
  }

  function renderVisible(visible) {
    isAdmin = Boolean(visible);
    if (!isAdmin) {
      hideReportPanel();
      setStatus('', '');
      pegawaiOptionsLoaded = false;
    } else {
      loadPegawaiOptions();
    }
  }

  /* ---------------- Inisialisasi ---------------- */

  function init() {
    if (!api) return;

    document.addEventListener('auth:login', function (event) {
      var detail = (event && event.detail) || {};
      renderVisible(detail.peran === 'admin');
    });
    document.addEventListener('auth:logout', function () { renderVisible(false); });
    document.addEventListener('auth:session-lost', function () { renderVisible(false); });

    var buttons = document.querySelectorAll('[data-admin-tab]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (btn.getAttribute('data-admin-tab') === 'laporan') {
            activateReportPanel();
          } else {
            hideReportPanel();
          }
        });
      })(buttons[i]);
    }

    var run = el('report-run');
    if (run) run.addEventListener('click', runReport);
    var exp = el('report-export');
    if (exp) exp.addEventListener('click', exportCsv);
    var prev = el('report-prev');
    if (prev) prev.addEventListener('click', function () { goPage(-1); });
    var next = el('report-next');
    if (next) next.addEventListener('click', function () { goPage(1); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

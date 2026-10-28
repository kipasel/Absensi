/*
 * Halaman laporan admin — Sistem Absensi KPU Kabupaten Aceh Selatan (PHASE 5).
 *
 * Prinsip keamanan (mengikuti admin.js):
 * - UI ini BUKAN pengaman: seluruh endpoint laporan diverifikasi peran 'admin'
 *   di backend; peran diambil dari sesi server (bukan dari klien).
 * - Data dirender dengan textContent (tanpa innerHTML) — anti XSS.
 * - Tidak ada URL/tautan foto pada ekspor CSV maupun Excel.
 * - Tidak ada penyimpanan token/PIN; sesi hanya di memori (D1).
 * - Kegagalan API ditampilkan sebagai error — BUKAN sebagai laporan kosong.
 */
(function () {
  'use strict';

  var api = window.AppApi;
  var dateTime = window.AppDateTime;
  var isAdmin = false;
  var pageOffset = 0;
  var pageSize = 50;
  var lastTotal = 0;
  var pegawaiOptionsLoaded = false;
  var searchQuery = '';
  var sortKey = '';
  var sortOrder = 'asc';
  var searchTimer = null;

  var CSV_FILENAME_RE = /^laporan-absensi_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/;
  var XLSX_FILENAME_RE = /^laporan-absensi_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/;

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

  function fmtDate(value) {
    return dateTime ? dateTime.formatDate(value) : (value || '');
  }

  function fmtTime(value) {
    return dateTime ? dateTime.formatTime(value) : (value || '');
  }

  /* ---------------- Filter ---------------- */

  function readPageSize() {
    var select = el('report-page-size');
    var n = select ? parseInt(select.value, 10) : 0;
    return (n === 10 || n === 20 || n === 30 || n === 50) ? n : 50;
  }

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
      cell(tr, fmtDate(item.tanggal));
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

  function renderMonthlyRecap(res) {
    var panel = el('report-monthly-recap');
    var table = el('report-monthly-recap-table');
    if (!panel || !table) return;
    var period = el('report-monthly-recap-period');
    var parts = String(res.bulan || '').split('-');
    var monthText = parts.length === 2
      ? new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1)))
      : String(res.bulan || '');
    setText(period, monthText);
    var tbody = table.querySelector('tbody');
    clearNode(tbody);
    (res.pegawai || []).forEach(function (pegawai) {
      var tr = document.createElement('tr');
      cell(tr, pegawai.nama || pegawai.nip_nipk || pegawai.id_pegawai);
      cell(tr, pegawai.WFO.masuk_tepat_waktu);
      cell(tr, pegawai.WFO.masuk_terlambat);
      cell(tr, pegawai.WFO.pulang);
      cell(tr, pegawai.WFH_WFA.masuk_tepat_waktu);
      cell(tr, pegawai.WFH_WFA.masuk_terlambat);
      cell(tr, pegawai.WFH_WFA.pulang);
      tbody.appendChild(tr);
    });
    show(panel);
  }

  function loadMonthlyRecap() {
    var filters = readFilters();
    if (!filters) return;
    setStatus('Menghitung rekap bulanan…', 'info');
    api.call('report.rekap.monthly', filters).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.message) || 'Gagal memuat rekap bulanan.');
      renderMonthlyRecap(res);
      setStatus('Rekap absensi bulanan dimuat.', 'success');
    }).catch(function (err) {
      hide(el('report-monthly-recap'));
      setStatus((err && err.message) || 'Tidak dapat menghubungi server.', 'error');
    });
  }

  function printMonthlyRecap() {
    var panel = el('report-monthly-recap');
    if (!panel || panel.hidden) {
      setStatus('Tampilkan rekap bulanan terlebih dahulu.', 'error');
      return;
    }
    document.body.classList.add('print-monthly-recap');
    window.print();
    document.body.classList.remove('print-monthly-recap');
  }

  /* ---------------- Tabel detail ---------------- */

  function renderDetail(items) {
    var table = el('report-table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    clearNode(tbody);
    (items || []).forEach(function (item) {
      var tr = document.createElement('tr');
      cell(tr, fmtDate(item.tanggal));
      cell(tr, item.nama || item.id_pegawai);
      cell(tr, item.nip_nipk);
      cell(tr, item.jenis);
      cell(tr, item.mode_kerja);
      cell(tr, fmtTime(item.waktu_server) || '-');
      cell(tr, item.status_masuk || '-');
      cell(tr, item.status_pulang || '-');
      cell(tr, item.kondisi_harian || '-');
      cell(tr, fmtTime(item.waktu_masuk) || '-');
      cell(tr, fmtTime(item.waktu_pulang) || '-');
      cell(tr, item.sumber);
      cell(tr, item.jarak_meter === null ? '-' : String(item.jarak_meter));
      cell(tr, item.ada_bukti ? 'Ada' : 'Tidak ada');
      cell(tr, item.uraian_pekerjaan || '-');
      cell(tr, item.output_pekerjaan || '-');
      tbody.appendChild(tr);
    });
    updateTableScrollButtons();
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

  function updateTableScrollButtons() {
    var wrap = el('report-table-wrap');
    var left = el('report-scroll-left');
    var right = el('report-scroll-right');
    if (!wrap || !left || !right) return;
    var maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    var canScroll = maxScroll > 1;
    left.hidden = !canScroll;
    right.hidden = !canScroll;
    left.disabled = !canScroll || wrap.scrollLeft <= 1;
    right.disabled = !canScroll || wrap.scrollLeft >= maxScroll - 1;
  }

  function scrollReportTable(direction) {
    var wrap = el('report-table-wrap');
    if (!wrap) return;
    var distance = Math.max(160, Math.floor(wrap.clientWidth * 0.75));
    wrap.scrollBy({ left: direction * distance, behavior: 'smooth' });
    window.setTimeout(updateTableScrollButtons, 250);
    window.setTimeout(updateTableScrollButtons, 500);
  }

  function loadDetail(filters) {
    setStatus('Memuat rincian absensi…', 'info');
    var data = {};
    Object.keys(filters).forEach(function (key) { data[key] = filters[key]; });
    data.limit = pageSize;
    data.offset = pageOffset;
    data.q = searchQuery;
    data.sort = sortKey;
    data.order = sortOrder;
    return api.call('report.absensi.list', data).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.message) || 'Gagal memuat rincian absensi.');
      }
      renderDetail(res.items);
      updatePagination(res.total);
      show(el('report-detail'));
      updateTableScrollButtons();
      return res;
    });
  }

  function reloadDetail(message) {
    var detail = el('report-detail');
    if (!detail || detail.hidden) return;
    var filters = readFilters();
    if (!filters) return;
    loadDetail(filters).then(function () {
      if (message) setStatus(message, 'info');
    }).catch(function (err) {
      setStatus((err && err.message) || 'Tidak dapat menghubungi server.', 'error');
    });
  }

  function updateSortIndicators() {
    var headers = document.querySelectorAll('#report-table th[data-sort]');
    for (var i = 0; i < headers.length; i++) {
      var active = sortKey && headers[i].getAttribute('data-sort') === sortKey;
      headers[i].setAttribute('aria-sort', active
        ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none');
    }
  }

  function toggleSort(header) {
    var key = header.getAttribute('data-sort');
    if (sortKey === key) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortOrder = 'asc';
    }
    pageOffset = 0;
    updateSortIndicators();
    reloadDetail('Diurutkan berdasarkan ' + header.textContent.trim() + '.');
  }

  function runReport() {
    var filters = readFilters();
    if (!filters) return;
    pageSize = readPageSize();
    pageOffset = 0;
    searchQuery = '';
    sortKey = '';
    sortOrder = 'asc';
    var searchInput = el('report-search');
    if (searchInput) searchInput.value = '';
    updateSortIndicators();
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

  function parseCsv(csv) {
    var text = String(csv || '').replace(/^\uFEFF/, '');
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"' && text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' || ch === '\n') {
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function columnName(index) {
    var name = '';
    while (index > 0) {
      var remainder = (index - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  function makeWorksheetXml(rows) {
    var sheetRows = rows.map(function (values, rowIndex) {
      var cells = values.map(function (value, colIndex) {
        var ref = columnName(colIndex + 1) + (rowIndex + 1);
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
          xmlEscape(value) + '</t></is></c>';
      }).join('');
      return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + sheetRows + '</sheetData></worksheet>';
  }

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = crc ^ bytes[i];
      for (var bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    var encoder = new TextEncoder();
    var locals = [], centrals = [], offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = encoder.encode(file.content);
      var checksum = crc32(data);
      var local = new Uint8Array(30 + name.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034B50, true); lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true);
      lv.setUint32(14, checksum, true); lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true); local.set(name, 30);
      locals.push(local, data);

      var central = new Uint8Array(46 + name.length);
      var cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014B50, true); cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x0021, true); cv.setUint32(16, checksum, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true); cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true); cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true); central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    });
    var centralSize = centrals.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true); ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true); ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    return new Blob(locals.concat(centrals, [end]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function buildXlsx(csv) {
    var rows = parseCsv(csv);
    var files = [
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Laporan Absensi" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', content: makeWorksheetXml(rows) }
    ];
    return zipStore(files);
  }

  function downloadXlsx(res) {
    var filename = String(res.filename || '').replace(/\.csv$/, '.xlsx');
    if (!XLSX_FILENAME_RE.test(filename)) throw new Error('Nama berkas ekspor tidak valid.');
    var blob = buildXlsx(res.csv);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportXlsx() {
    var filters = readFilters();
    if (!filters) return;
    setStatus('Menyiapkan berkas Excel…', 'info');
    api.call('report.absensi.exportCsv', filters).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.message) || 'Ekspor Excel gagal.');
      downloadXlsx(res);
      setStatus('Berkas Excel diunduh (' + res.rows + ' baris).', 'success');
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
    var monthlyRun = el('report-monthly-recap-run');
    if (monthlyRun) monthlyRun.addEventListener('click', loadMonthlyRecap);
    var monthlyPrint = el('report-monthly-recap-print');
    if (monthlyPrint) monthlyPrint.addEventListener('click', printMonthlyRecap);
    var exp = el('report-export');
    if (exp) exp.addEventListener('click', exportCsv);
    var expXlsx = el('report-export-xlsx');
    if (expXlsx) expXlsx.addEventListener('click', exportXlsx);
    var prev = el('report-prev');
    if (prev) prev.addEventListener('click', function () { goPage(-1); });
    var next = el('report-next');
    if (next) next.addEventListener('click', function () { goPage(1); });
    var tableWrap = el('report-table-wrap');
    if (tableWrap) tableWrap.addEventListener('scroll', updateTableScrollButtons);
    var scrollLeft = el('report-scroll-left');
    if (scrollLeft) scrollLeft.addEventListener('click', function () { scrollReportTable(-1); });
    var scrollRight = el('report-scroll-right');
    if (scrollRight) scrollRight.addEventListener('click', function () { scrollReportTable(1); });
    window.addEventListener('resize', updateTableScrollButtons);
    var size = el('report-page-size');
    if (size) {
      pageSize = readPageSize();
      size.addEventListener('change', function () {
        pageSize = readPageSize();
        pageOffset = 0;
        reloadDetail('Menampilkan ' + pageSize + ' data per halaman.');
      });
    }
    var search = el('report-search');
    if (search) {
      search.addEventListener('input', function () {
        searchQuery = search.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          pageOffset = 0;
          reloadDetail('Pencarian diterapkan.');
        }, 300);
      });
    }
    var headers = document.querySelectorAll('#report-table th[data-sort]');
    for (var h = 0; h < headers.length; h++) {
      (function (header) {
        header.tabIndex = 0;
        header.classList.add('report-th--sortable');
        header.addEventListener('click', function () { toggleSort(header); });
        header.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleSort(header);
          }
        });
      })(headers[h]);
    }
    updateSortIndicators();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

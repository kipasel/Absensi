/*
 * Panel admin — Sistem Absensi KPU Kabupaten Aceh Selatan (PHASE 4).
 *
 * Prinsip keamanan:
 * - UI ini BUKAN pengaman: seluruh endpoint admin diverifikasi peran 'admin'
 *   di backend; peran diambil dari sesi server (bukan dari klien).
 * - Data dari server dirender dengan textContent (tanpa innerHTML) — anti XSS.
 * - Foto ditampilkan inline via endpoint blob ber-token (DEC-P25); tanpa
 *   tautan/URL publik & tanpa drive_file_id di data panel.
 * - Tidak ada penyimpanan token/PIN; sesi hanya di memori (D1).
 */
(function () {
  'use strict';

  var api = window.AppApi;
  var isAdmin = false;
  var currentTab = 'pegawai';
  var editingId = null;
  var decidedId = null;

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
    var node = el('admin-status');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'att-status' + (kind ? ' att-status--' + kind : '');
    node.hidden = !text;
  }

  function setFormMessage(id, text, kind) {
    var node = el(id);
    if (!node) return;
    node.textContent = text || '';
    node.className = 'form-message' + (kind ? ' form-message--' + kind : '');
    node.hidden = !text;
  }

  function cell(row, text) {
    var td = document.createElement('td');
    setText(td, text);
    row.appendChild(td);
    return td;
  }

  function actionButton(label, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--small';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function fillTable(tableId, headers, makeRow) {
    var table = el(tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    clearNode(tbody);
    if (!headers) return;
    headers.forEach(function (item) {
      var tr = document.createElement('tr');
      makeRow(tr, item);
      tbody.appendChild(tr);
    });
  }

  function handleFailed(res, fallback) {
    setStatus((res && res.message) || fallback || 'Permintaan gagal.', 'error');
  }

  /* ---------------- Navigasi tab ---------------- */

  var TAB_IDS = ['pegawai', 'absensi', 'log'];

  function switchTab(tab) {
    if (TAB_IDS.indexOf(tab) === -1) return;
    currentTab = tab;
    TAB_IDS.forEach(function (name) {
      var panel = el('admin-tab-' + name);
      if (panel) panel.hidden = name !== tab;
    });
    var buttons = document.querySelectorAll('[data-admin-tab]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute('data-admin-tab') === tab;
      buttons[i].className = 'btn admin-tab' + (active ? ' admin-tab--active' : '');
    }
    if (tab === 'pegawai') loadPegawai();
    else if (tab === 'absensi') loadAbsensi();
    else if (tab === 'susulan') return;
    else if (tab === 'log') loadLog();
  }

  /* ---------------- Pegawai ---------------- */

  function loadPegawai() {
    if (!isAdmin) return;
    setStatus('Memuat data pegawai…', 'info');
    api.call('admin.pegawai.list', {
      q: (el('pegawai-q') && el('pegawai-q').value) || '',
      status: (el('pegawai-status-filter') && el('pegawai-status-filter').value) || '',
      limit: 200
    }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat pegawai.');
        fillTable('pegawai-table', [], function () {});
        return;
      }
      setStatus(res.total + ' pegawai ditemukan.', 'info');
      fillTable('pegawai-table', res.items, function (tr, item) {
        cell(tr, item.nama);
        cell(tr, item.nip_nipk);
        cell(tr, item.jabatan);
        cell(tr, item.unit_kerja);
        cell(tr, item.status_aktif ? 'Aktif' : 'Nonaktif');
        var td = document.createElement('td');
        td.className = 'admin-actions';
        td.appendChild(actionButton('Detail', function () { showPegawaiDetail(item.id_pegawai); }));
        td.appendChild(actionButton('Ubah', function () { startEdit(item); }));
        td.appendChild(actionButton(item.status_aktif ? 'Nonaktifkan' : 'Aktifkan', function () {
          setPegawaiActive(item, !item.status_aktif);
        }));
        tr.appendChild(td);
      });
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  function showPegawaiDetail(idPegawai) {
    api.call('admin.pegawai.detail', { id_pegawai: idPegawai }).then(function (res) {
      var box = el('pegawai-detail');
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat detail pegawai.');
        return;
      }
      clearNode(box);
      var dl = document.createElement('dl');
      dl.className = 'session-info';
      function row(dt, dd) {
        var wrap = document.createElement('div');
        wrap.className = 'session-info__row';
        var dtEl = document.createElement('dt');
        dtEl.textContent = dt;
        var ddEl = document.createElement('dd');
        ddEl.textContent = dd;
        wrap.appendChild(dtEl);
        wrap.appendChild(ddEl);
        dl.appendChild(wrap);
      }
      row('ID pegawai', res.pegawai.id_pegawai);
      row('Nama', res.pegawai.nama);
      row('NIP/NIPK', res.pegawai.nip_nipk);
      row('Jabatan', res.pegawai.jabatan);
      row('Unit kerja', res.pegawai.unit_kerja);
      row('Status pegawai', res.pegawai.status_aktif ? 'Aktif' : 'Nonaktif');
      if (res.akun) {
        row('Peran akun', res.akun.peran);
        row('Status akun', res.akun.status_aktif ? 'Aktif' : 'Nonaktif');
        row('PIN terdaftar', res.akun.ada_pin ? 'Ya' : 'Belum');
        row('Percobaan gagal', String(res.akun.gagal_login));
        row('Terkunci sampai', res.akun.terkunci_sampai || '-');
      } else {
        row('Akun', 'Belum ada akun untuk pegawai ini');
      }
      box.appendChild(dl);
      box.appendChild(buildPinForm(res.pegawai, res.akun));
      show(box);
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  function buildPinForm(pegawai, akun) {
    var form = document.createElement('form');
    form.className = 'admin-form';
    form.id = 'pegawai-pin-form';
    var field = document.createElement('div');
    field.className = 'form-field';
    var label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', 'pegawai-pin');
    label.textContent = akun ? 'PIN baru (reset)' : 'PIN awal akun';
    var input = document.createElement('input');
    input.className = 'form-input';
    input.id = 'pegawai-pin';
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'new-password';
    input.maxLength = 6;
    input.pattern = '[0-9]{6}';
    input.placeholder = '6 digit angka';
    var hint = document.createElement('p');
    hint.className = 'card__hint';
    hint.textContent = 'PIN diisi admin dan disampaikan langsung ke pegawai. ' +
      'PIN tidak disimpan di perangkat ini.';
    field.appendChild(label);
    field.appendChild(input);
    field.appendChild(hint);
    form.appendChild(field);
    var actions = document.createElement('div');
    actions.className = 'att-actions';
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'btn btn--primary';
    btn.textContent = akun ? 'Reset PIN' : 'Buat akun pegawai';
    actions.appendChild(btn);
    form.appendChild(actions);
    var msg = document.createElement('p');
    msg.className = 'form-message';
    msg.id = 'pegawai-pin-message';
    msg.setAttribute('role', 'status');
    msg.hidden = true;
    form.appendChild(msg);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var pin = input.value;
      if (!/^[0-9]{6}$/.test(pin)) {
        setFormMessage('pegawai-pin-message', 'PIN harus 6 digit angka.', 'error');
        return;
      }
      var action = akun ? 'admin.account.resetPin' : 'admin.account.create';
      var data = akun ? { id_akun: akun.id_akun, pin: pin } : { id_pegawai: pegawai.id_pegawai, pin: pin };
      btn.disabled = true;
      api.call(action, data).then(function (res) {
        btn.disabled = false;
        input.value = '';
        if (!res || !res.ok) {
          setFormMessage('pegawai-pin-message',
            (res && res.message) || 'Gagal menyimpan PIN.', 'error');
          return;
        }
        setFormMessage('pegawai-pin-message',
          akun ? 'PIN berhasil direset.' : 'Akun berhasil dibuat.', 'success');
        showPegawaiDetail(pegawai.id_pegawai);
        loadPegawai();
      }).catch(function () {
        btn.disabled = false;
        input.value = '';
        setFormMessage('pegawai-pin-message', 'Tidak dapat menghubungi server.', 'error');
      });
    });
    return form;
  }

  function resetPegawaiForm() {
    editingId = null;
    ['pegawai-nama', 'pegawai-nip', 'pegawai-jabatan', 'pegawai-unit'].forEach(function (id) {
      var input = el(id);
      if (input) input.value = '';
    });
    setText(el('pegawai-form-title'), 'Tambah pegawai');
    hide(el('pegawai-cancel'));
    setFormMessage('pegawai-message', '', '');
  }

  function startEdit(item) {
    editingId = item.id_pegawai;
    setText(el('pegawai-form-title'), 'Ubah pegawai: ' + item.nama);
    el('pegawai-nama').value = item.nama;
    el('pegawai-nip').value = item.nip_nipk;
    el('pegawai-jabatan').value = item.jabatan;
    el('pegawai-unit').value = item.unit_kerja;
    show(el('pegawai-cancel'));
    setFormMessage('pegawai-message', '', '');
    el('pegawai-nama').focus();
  }

  function setPegawaiActive(item, aktif) {
    var konfirmasi = window.confirm(
      (aktif ? 'Aktifkan kembali' : 'Nonaktifkan') + ' pegawai "' + item.nama + '"?' +
      (aktif ? '' : ' Sesi pegawai akan dicabut; riwayat absensi tetap tersimpan.')
    );
    if (!konfirmasi) return;
    api.call('admin.pegawai.setActive', { id_pegawai: item.id_pegawai, aktif: aktif })
      .then(function (res) {
        if (!res || !res.ok) {
          handleFailed(res, 'Gagal mengubah status pegawai.');
          return;
        }
        setStatus('Status pegawai diperbarui.', 'success');
        loadPegawai();
      })
      .catch(function () {
        setStatus('Tidak dapat menghubungi server.', 'error');
      });
  }

  function onPegawaiSubmit(event) {
    event.preventDefault();
    var nama = el('pegawai-nama').value.trim();
    var nip = el('pegawai-nip').value.trim();
    if (!nama || !nip) {
      setFormMessage('pegawai-message', 'Nama dan NIP/NIPK wajib diisi.', 'error');
      return;
    }
    var data = {
      nama: nama,
      nip_nipk: nip,
      jabatan: el('pegawai-jabatan').value.trim(),
      unit_kerja: el('pegawai-unit').value.trim()
    };
    var action = 'admin.pegawai.create';
    if (editingId) {
      action = 'admin.pegawai.update';
      data.id_pegawai = editingId;
    }
    api.call(action, data).then(function (res) {
      if (!res || !res.ok) {
        setFormMessage('pegawai-message', (res && res.message) || 'Gagal menyimpan pegawai.', 'error');
        return;
      }
      setFormMessage('pegawai-message', 'Data pegawai tersimpan.', 'success');
      resetPegawaiForm();
      loadPegawai();
    }).catch(function () {
      setFormMessage('pegawai-message', 'Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Absensi ---------------- */

  function loadAbsensi() {
    if (!isAdmin) return;
    setStatus('Memuat data absensi…', 'info');
    api.call('admin.absensi.list', {
      tanggal: (el('absensi-tanggal') && el('absensi-tanggal').value) || '',
      jenis: (el('absensi-jenis') && el('absensi-jenis').value) || '',
      limit: 200
    }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat absensi.');
        fillTable('absensi-table', [], function () {});
        return;
      }
      setStatus(res.total + ' absensi ditemukan.', 'info');
      fillTable('absensi-table', res.items, function (tr, item) {
        cell(tr, item.tanggal);
        cell(tr, item.nama || item.id_pegawai);
        cell(tr, item.jenis);
        cell(tr, item.mode_kerja);
        cell(tr, item.sumber);
        cell(tr, item.ada_bukti ? 'Ada' : 'Tidak ada');
        var td = document.createElement('td');
        td.className = 'admin-actions';
        td.appendChild(actionButton('Detail', function () { showAbsensiDetail(item.id_absensi); }));
        tr.appendChild(td);
      });
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  function appendInfoRows(dl, pairs) {
    pairs.forEach(function (pair) {
      var wrap = document.createElement('div');
      wrap.className = 'session-info__row';
      var dtEl = document.createElement('dt');
      dtEl.textContent = pair[0];
      var ddEl = document.createElement('dd');
      ddEl.textContent = pair[1];
      wrap.appendChild(dtEl);
      wrap.appendChild(ddEl);
      dl.appendChild(wrap);
    });
  }

  /**
   * Menambahkan tombol tampil foto (AMB-20/DEC-P25): mengambil isi foto lewat
   * endpoint ber-token, lalu menampilkannya sebagai data URI (tanpa tautan publik).
   */
  function appendPhotoViewer(box, action, params, msgId) {
    var wrap = document.createElement('div');
    wrap.className = 'att-actions';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--small';
    btn.textContent = 'Tampilkan foto';
    var msg = document.createElement('p');
    msg.className = 'form-message';
    msg.id = msgId;
    msg.setAttribute('role', 'status');
    msg.hidden = true;
    var holder = document.createElement('div');
    holder.className = 'admin-photo';
    var oldImg = null;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      msg.hidden = true;
      api.call(action, params).then(function (res) {
        btn.disabled = false;
        if (!res || !res.ok) {
          setText(msg, (res && res.message) || 'Gagal memuat foto.');
          msg.className = 'form-message form-message--error';
          msg.hidden = false;
          return;
        }
        if (!res.base64 || String(res.mime).indexOf('image/') !== 0) {
          setText(msg, 'Data foto tidak valid.');
          msg.className = 'form-message form-message--error';
          msg.hidden = false;
          return;
        }
        if (oldImg && oldImg.parentNode) oldImg.parentNode.removeChild(oldImg);
        var img = document.createElement('img');
        img.alt = 'Foto bukti (privat)';
        img.src = 'data:' + res.mime + ';base64,' + res.base64;
        holder.appendChild(img);
        oldImg = img;
      }).catch(function () {
        btn.disabled = false;
        setText(msg, 'Tidak dapat menghubungi server.');
        msg.className = 'form-message form-message--error';
        msg.hidden = false;
      });
    });
    wrap.appendChild(btn);
    box.appendChild(wrap);
    box.appendChild(holder);
    box.appendChild(msg);
  }

  function showAbsensiDetail(idAbsensi) {
    api.call('admin.absensi.detail', { id_absensi: idAbsensi }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat detail absensi.');
        return;
      }
      var box = el('absensi-detail');
      clearNode(box);
      var h = document.createElement('h3');
      h.className = 'att-step__subtitle';
      h.textContent = 'Detail absensi ' + res.absensi.id_absensi;
      box.appendChild(h);
      var dl = document.createElement('dl');
      dl.className = 'session-info';
      appendInfoRows(dl, [
        ['Pegawai', res.pegawai ? res.pegawai.nama + ' (' + res.pegawai.nip_nipk + ')' : res.absensi.id_pegawai],
        ['Tanggal', res.absensi.tanggal],
        ['Jenis', res.absensi.jenis],
        ['Mode kerja', res.absensi.mode_kerja],
        ['Waktu server', res.absensi.waktu_server],
        ['Sumber', res.absensi.sumber],
        ['Jarak (m)', res.absensi.jarak_meter === null ? '-' : String(res.absensi.jarak_meter)],
        ['GPS lintang', res.absensi.lintang === null ? '-' : String(res.absensi.lintang)],
        ['GPS bujur', res.absensi.bujur === null ? '-' : String(res.absensi.bujur)],
        ['Akurasi GPS', res.absensi.akurasi === null ? '-' : String(res.absensi.akurasi)],
        ['Bukti foto', res.bukti.ada
          ? 'Tersimpan privat (' + res.bukti.mime + ', ' + res.bukti.ukuran + ' byte)'
          : 'Tidak ada']
      ]);
      box.appendChild(dl);
      var hint = document.createElement('p');
      hint.className = 'card__hint';
      hint.textContent = 'Bukti foto tersimpan di Drive privat; ditampilkan lewat ' +
        'endpoint ber-token (tanpa tautan publik).';
      box.appendChild(hint);
      if (res.bukti && res.bukti.ada) {
        appendPhotoViewer(box, 'admin.absensi.photo',
          { id_absensi: res.absensi.id_absensi }, 'absensi-photo-message');
      }
      show(box);
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Susulan ---------------- */

  function loadSusulan() {
    if (!isAdmin) return;
    setStatus('Memuat pengajuan susulan…', 'info');
    api.call('admin.susulan.list', {
      status: (el('susulan-status-filter') && el('susulan-status-filter').value) || '',
      limit: 200
    }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat pengajuan susulan.');
        fillTable('susulan-table', [], function () {});
        return;
      }
      setStatus(res.total + ' pengajuan ditemukan.', 'info');
      fillTable('susulan-table', res.items, function (tr, item) {
        cell(tr, item.tanggal_absensi);
        cell(tr, item.nama || item.id_pegawai);
        cell(tr, item.jenis);
        cell(tr, item.status);
        cell(tr, item.waktu_pengajuan_server);
        var td = document.createElement('td');
        td.className = 'admin-actions';
        td.appendChild(actionButton('Detail', function () { showSusulanDetail(item.id_pengajuan); }));
        tr.appendChild(td);
      });
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  function decideSusulan(keputusan) {
    var catatanEl = el('susulan-catatan');
    var catatan = catatanEl ? catatanEl.value.trim() : '';
    if (keputusan === 'tolak' && !catatan) {
      setFormMessage('susulan-message', 'Catatan wajib diisi untuk penolakan.', 'error');
      return;
    }
    api.call('admin.susulan.decide', {
      id_pengajuan: decidedId,
      keputusan: keputusan,
      catatan_keputusan: catatan
    }).then(function (res) {
      if (!res || !res.ok) {
        setFormMessage('susulan-message', (res && res.message) || 'Gagal memutuskan pengajuan.', 'error');
        return;
      }
      setFormMessage('susulan-message', 'Pengajuan ' + res.status + '.', 'success');
      loadSusulan();
      setTimeout(function () { showSusulanDetail(res.id_pengajuan); }, 300);
    }).catch(function () {
      setFormMessage('susulan-message', 'Tidak dapat menghubungi server.', 'error');
    });
  }

  function showSusulanDetail(idPengajuan) {
    decidedId = idPengajuan;
    api.call('admin.susulan.detail', { id_pengajuan: idPengajuan }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat detail pengajuan.');
        return;
      }
      var box = el('susulan-detail');
      clearNode(box);
      var item = res.pengajuan;
      var h = document.createElement('h3');
      h.className = 'att-step__subtitle';
      h.textContent = 'Detail pengajuan ' + item.id_pengajuan;
      box.appendChild(h);
      var dl = document.createElement('dl');
      dl.className = 'session-info';
      appendInfoRows(dl, [
        ['Pegawai', item.nama ? item.nama + ' (' + item.nip_nipk + ')' : item.id_pegawai],
        ['Tanggal absensi', item.tanggal_absensi],
        ['Jenis', item.jenis],
        ['Mode kerja (diklaim)', item.mode_kerja],
        ['Waktu aktual (diklaim)', item.waktu_diklaim || '-'],
        ['Pengajuan diterima server', item.waktu_pengajuan_server || '-'],
        ['Alasan', item.alasan || '-'],
        ['Bukti dilampirkan', res.ada_bukti ? 'Ya' : 'Tidak'],
        ['Status', item.status],
        ['Keputusan admin', item.waktu_keputusan
          ? item.status + ' oleh ' + item.id_admin + ' pada ' + item.waktu_keputusan
          : 'Belum diputuskan'],
        ['Catatan keputusan', item.catatan_keputusan || '-']
      ]);
      box.appendChild(dl);
      if (res.ada_bukti) {
        appendPhotoViewer(box, 'admin.susulan.photo',
          { id_pengajuan: item.id_pengajuan }, 'susulan-photo-message');
      }

      if (item.status === 'menunggu') {
        var form = document.createElement('form');
        form.className = 'admin-form';
        form.id = 'susulan-decide-form';
        var field = document.createElement('div');
        field.className = 'form-field';
        var label = document.createElement('label');
        label.className = 'form-label';
        label.setAttribute('for', 'susulan-catatan');
        label.textContent = 'Catatan keputusan';
        var textarea = document.createElement('textarea');
        textarea.className = 'form-input';
        textarea.id = 'susulan-catatan';
        textarea.rows = 3;
        textarea.maxLength = 500;
        field.appendChild(label);
        field.appendChild(textarea);
        form.appendChild(field);
        var actions = document.createElement('div');
        actions.className = 'att-actions';
        var btnTerima = actionButton('Setujui', function () { decideSusulan('terima'); });
        btnTerima.className = 'btn btn--primary';
        var btnTolak = actionButton('Tolak', function () { decideSusulan('tolak'); });
        actions.appendChild(btnTerima);
        actions.appendChild(btnTolak);
        form.appendChild(actions);
        var msg = document.createElement('p');
        msg.className = 'form-message';
        msg.id = 'susulan-message';
        msg.setAttribute('role', 'status');
        msg.hidden = true;
        form.appendChild(msg);
        box.appendChild(form);
      }
      show(box);
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Log audit ---------------- */

  function loadLog() {
    if (!isAdmin) return;
    setStatus('Memuat log audit…', 'info');
    api.call('admin.log.list', {
      aksi: (el('log-aksi') && el('log-aksi').value) || '',
      limit: 200
    }).then(function (res) {
      if (!res || !res.ok) {
        handleFailed(res, 'Gagal memuat log.');
        fillTable('log-table', [], function () {});
        return;
      }
      setStatus(res.total + ' entri log.', 'info');
      fillTable('log-table', res.items, function (tr, item) {
        cell(tr, item.waktu);
        cell(tr, item.aksi);
        cell(tr, item.id_aktor);
        cell(tr, item.peran_aktor);
        cell(tr, item.target);
        cell(tr, item.detail);
      });
    }).catch(function () {
      setStatus('Tidak dapat menghubungi server.', 'error');
    });
  }

  /* ---------------- Visibilitas & inisialisasi ---------------- */

  function renderVisible(visible) {
    isAdmin = Boolean(visible);
    if (isAdmin) {
      show(el('admin-view'));
      resetPegawaiForm();
      switchTab('pegawai');
    } else {
      hide(el('admin-view'));
      hide(el('pegawai-detail'));
      hide(el('absensi-detail'));
      hide(el('susulan-detail'));
      setStatus('', '');
      resetPegawaiForm();
    }
  }

  function init() {
    if (!api) return;

    document.addEventListener('auth:login', function (event) {
      var detail = (event && event.detail) || {};
      renderVisible(detail.peran === 'admin');
    });
    document.addEventListener('auth:logout', function () { renderVisible(false); });
    document.addEventListener('auth:session-lost', function () { renderVisible(false); });

    var tabs = document.querySelectorAll('[data-admin-tab]');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          switchTab(btn.getAttribute('data-admin-tab'));
        });
      })(tabs[i]);
    }

    var pegawaiForm = el('pegawai-form');
    if (pegawaiForm) pegawaiForm.addEventListener('submit', onPegawaiSubmit);
    var pegawaiCancel = el('pegawai-cancel');
    if (pegawaiCancel) pegawaiCancel.addEventListener('click', resetPegawaiForm);
    var pegawaiReload = el('pegawai-reload');
    if (pegawaiReload) pegawaiReload.addEventListener('click', loadPegawai);

    var absensiReload = el('absensi-reload');
    if (absensiReload) absensiReload.addEventListener('click', loadAbsensi);
    var logReload = el('log-reload');
    if (logReload) logReload.addEventListener('click', loadLog);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

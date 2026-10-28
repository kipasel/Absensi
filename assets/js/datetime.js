/*
 * Pemformatan tanggal & waktu tampilan — Sistem Absensi KPU Kabupaten
 * Aceh Selatan.
 *
 * Standar (DEC-002/AMB-17):
 * - Zona tampilan: Asia/Jakarta (WIB, UTC+7), tidak bergantung zona perangkat.
 * - Tanggal: dd/MM/yyyy; jam: HH:mm:ss; label zona: WIB.
 * - Sumber timestamp adalah ISO-8601 UTC dari server. Nilai tanggal bisnis
 *   `YYYY-MM-DD` sudah merupakan tanggal Asia/Jakarta sehingga tidak digeser.
 *
 * JANGAN menambahkan/mengurangi 7 jam secara manual; Intl.DateTimeFormat
 * melakukan konversi dari instant UTC ke zona Asia/Jakarta satu kali.
 */
(function (root) {
  'use strict';

  var TIME_ZONE = 'Asia/Jakarta';
  var LOCALE = 'id-ID';
  var ZONE_LABEL = 'WIB';
  var INVALID = '—';

  var formatter = null;

  function getFormatter() {
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(LOCALE, {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    }
    return formatter;
  }

  function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return isNaN(value.getTime()) ? null : value;
    }
    var s = String(value).trim();
    if (!s) return null;
    // Tanggal bisnis tanpa jam: perlakukan sebagai tengah malam WIB.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00+07:00';
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function partsOf(date) {
    var out = {};
    var parts = getFormatter().formatToParts(date);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'literal') out[parts[i].type] = parts[i].value;
    }
    return out;
  }

  function formatDate(value) {
    if (value === null || value === undefined || value === '') return '';
    // Tanggal bisnis YYYY-MM-DD dibaca apa adanya (tanpa konversi instant).
    var s = String(value).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = toDate(value);
    if (!d) return INVALID;
    var p = partsOf(d);
    return p.day + '/' + p.month + '/' + p.year;
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === '') return '';
    var d = toDate(value);
    if (!d) return INVALID;
    var p = partsOf(d);
    return p.hour + ':' + p.minute + ':' + p.second + ' ' + ZONE_LABEL;
  }

  function formatDateTime(value) {
    if (value === null || value === undefined || value === '') return '';
    var d = toDate(value);
    if (!d) return INVALID;
    var p = partsOf(d);
    return p.day + '/' + p.month + '/' + p.year + ' ' +
      p.hour + ':' + p.minute + ':' + p.second + ' ' + ZONE_LABEL;
  }

  var api = {
    timeZone: TIME_ZONE,
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime
  };

  if (typeof window !== 'undefined') window.AppDateTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

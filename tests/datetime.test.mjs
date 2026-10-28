/*
 * Pengujian formatter tanggal/waktu tampilan (Asia/Jakarta).
 * Jalankan: node tests/datetime.test.mjs
 *
 * Menguji assets/js/datetime.js secara langsung (bukan browser nyata).
 * Fokus: konversi ISO UTC → WIB sekali saja, pergantian tanggal saat
 * melewati tengah malam, dan tanggal bisnis YYYY-MM-DD tidak bergeser.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dt = require('../assets/js/datetime.js');

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log('  PASS  ' + name);
}
function bad(name, detail) {
  failed++;
  console.log('  FAIL  ' + name + (detail ? '  ->  ' + detail : ''));
}
function eq(name, actual, expected) {
  try {
    if (actual !== expected) {
      bad(name, 'aktual ' + JSON.stringify(actual) + ' != harapan ' + JSON.stringify(expected));
    } else {
      ok(name);
    }
  } catch (err) {
    bad(name, err.message);
  }
}

console.log('== Konversi UTC → WIB ==');
eq('03:00Z → 10:00:00 WIB', dt.formatTime('2026-10-28T03:00:00Z'), '10:00:00 WIB');
eq('16:30Z → 23:30:00 WIB', dt.formatTime('2026-10-28T16:30:00Z'), '23:30:00 WIB');
eq('17:30Z → 00:30:00 WIB', dt.formatTime('2026-10-28T17:30:00Z'), '00:30:00 WIB');
eq('17:30Z tanggal berganti → 29/10/2026', dt.formatDate('2026-10-28T17:30:00Z'), '29/10/2026');
eq('17:30Z tanggal+waktu', dt.formatDateTime('2026-10-28T17:30:00Z'), '29/10/2026 00:30:00 WIB');
eq('tidak menambah 7 jam dua kali (03:00Z bukan 17:00)', dt.formatTime('2026-10-28T03:00:00Z'), '10:00:00 WIB');
eq('tanggal tetap sama (03:00Z)', dt.formatDate('2026-10-28T03:00:00Z'), '28/10/2026');
eq('format umum 10:43:25', dt.formatTime('2026-10-28T03:43:25Z'), '10:43:25 WIB');

console.log('== Tanggal bisnis & nilai kosong ==');
eq('tanggal bisnis YYYY-MM-DD tidak bergeser', dt.formatDate('2026-10-28'), '28/10/2026');
eq('tanggal bisnis 01/01/2027', dt.formatDate('2027-01-01'), '01/01/2027');
eq('kosong → string kosong (waktu)', dt.formatTime(''), '');
eq('kosong → string kosong (tanggal)', dt.formatDate(null), '');
eq('tidak valid → penanda', dt.formatTime('bukan-timestamp'), '—');
eq('objek Date didukung', dt.formatTime(new Date('2026-10-28T03:00:00Z')), '10:00:00 WIB');

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

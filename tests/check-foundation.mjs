/*
 * Pemeriksaan fondasi otomatis — PHASE 1.
 * Jalankan: node tests/check-foundation.mjs
 *
 * Memverifikasi hal-hal yang dapat diperiksa tanpa browser:
 * struktur berkas, sintaks JS/GS, validitas JSON, ikon PNG, konsistensi path,
 * serta tidak adanya rahasia/dummy pada berkas frontend.
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log('  PASS  ' + name);
}
function bad(name, detail) {
  failed++;
  console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
}
function check(name, fn) {
  try {
    const res = fn();
    if (res === false) bad(name);
    else ok(name);
  } catch (err) {
    bad(name, err.message);
  }
}
function abs(p) {
  return join(ROOT, p);
}

console.log('== Struktur berkas ==');
[
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'assets/css/styles.css',
  'assets/js/config.js',
  'assets/js/api.js',
  'assets/js/app.js',
  'assets/js/auth.js',
  'assets/js/camera.js',
  'assets/js/attendance.js',
  'assets/js/susulan.js',
  'assets/js/admin.js',
  'assets/js/report.js',
  'assets/js/my-attendance.js',
  'assets/js/nav.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  '.gitignore',
  'gas/Code.gs',
  'gas/Config.gs',
  'gas/Auth.gs',
  'gas/Repo.gs',
  'gas/AuthService.gs',
  'gas/Bootstrap.gs',
  'gas/TimeRule.gs',
  'gas/Geo.gs',
  'gas/Drive.gs',
  'gas/Attendance.gs',
  'gas/Susulan.gs',
  'gas/AdminService.gs',
  'gas/ReportService.gs',
  'gas/MyAttendanceService.gs',
  'gas/appsscript.json',
  'gas/README.md'
].forEach((f) => check('ada: ' + f, () => existsSync(abs(f))));

console.log('== Sintaks JavaScript frontend ==');
['assets/js/config.js', 'assets/js/api.js', 'assets/js/app.js', 'assets/js/auth.js', 'assets/js/admin.js', 'assets/js/report.js', 'assets/js/my-attendance.js', 'assets/js/nav.js', 'assets/js/susulan.js', 'service-worker.js'].forEach((f) => {
  check('sintaks: ' + f, () => {
    execFileSync(process.execPath, ['--check', abs(f)]);
    return true;
  });
});

console.log('== Sintaks Apps Script (.gs) ==');
['gas/Code.gs', 'gas/Config.gs', 'gas/Auth.gs', 'gas/Repo.gs', 'gas/AuthService.gs', 'gas/AdminService.gs', 'gas/ReportService.gs', 'gas/MyAttendanceService.gs', 'gas/Bootstrap.gs', 'gas/Susulan.gs'].forEach((f) => {
  check('sintaks: ' + f, () => {
    const tmp = join(tmpdir(), 'check-' + f.replace(/[\\/]/g, '_') + '.js');
    copyFileSync(abs(f), tmp);
    execFileSync(process.execPath, ['--check', tmp]);
    return true;
  });
});

console.log('== Validitas JSON ==');
['manifest.webmanifest', 'gas/appsscript.json'].forEach((f) => {
  check('JSON valid: ' + f, () => JSON.parse(readFileSync(abs(f), 'utf8')));
});
check('appsscript.json: scope Spreadsheet & Drive penuh (akses folder operator)', () => {
  const scopes = JSON.parse(readFileSync(abs('gas/appsscript.json'), 'utf8')).oauthScopes || [];
  if (!scopes.includes('https://www.googleapis.com/auth/spreadsheets')) {
    throw new Error('scope spreadsheets tidak ada');
  }
  if (!scopes.includes('https://www.googleapis.com/auth/drive')) {
    throw new Error('scope drive penuh tidak ada (drive.file tidak cukup untuk folder manual)');
  }
});

console.log('== Ikon PNG ==');
[192, 512].forEach((size) => {
  check('PNG ' + size + 'x' + size + ' valid', () => {
    const b = readFileSync(abs(`assets/icons/icon-${size}.png`));
    const sig = b.subarray(0, 8).toString('hex');
    if (sig !== '89504e470d0a1a0a') throw new Error('signature bukan PNG');
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w !== size || h !== size) throw new Error(`dimensi ${w}x${h}, harusnya ${size}x${size}`);
    return true;
  });
});

console.log('== Manifest: ikon & start_url ==');
check('ikon manifest ada di disk', () => {
  const m = JSON.parse(readFileSync(abs('manifest.webmanifest'), 'utf8'));
  if (!Array.isArray(m.icons) || m.icons.length === 0) throw new Error('tanpa ikon');
  m.icons.forEach((ic) => {
    const rel = ic.src.replace(/^\.\//, '');
    if (!existsSync(abs(rel))) throw new Error('ikon hilang: ' + ic.src);
  });
  if (m.start_url !== './') throw new Error('start_url harus relatif "./"');
  if (m.scope !== './') throw new Error('scope harus relatif "./"');
  return true;
});

console.log('== Konsistensi path aset di index.html ==');
check('semua referensi lokal index.html ada', () => {
  const html = readFileSync(abs('index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  if (refs.length === 0) throw new Error('tidak ada referensi relatif ditemukan');
  refs.forEach((r) => {
    const rel = r.replace(/^\.\//, '');
    if (!existsSync(abs(rel))) throw new Error('hilang: ' + r);
  });
  return true;
});

console.log('== Konten frontend: tanpa rahasia / dummy ==');
const frontendFiles = [
  'index.html',
  'assets/js/config.js',
  'assets/js/api.js',
  'assets/js/app.js',
  'assets/js/auth.js',
  'assets/js/admin.js',
  'assets/js/report.js',
  'assets/js/nav.js',
  'service-worker.js'
];
const secretPatterns = [
  { re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/, label: 'private key' },
  { re: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { re: /AIza[0-9A-Za-z_\-]{35}/, label: 'Google API key' },
  { re: /client_secret\s*[:=]/, label: 'client_secret' },
  { re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/, label: 'bearer token' },
  { re: /["'](?:pin|password|passwd|secret)["']\s*[:=]\s*["'][^"']+["']/i, label: 'nilai pin/password literal' }
];
frontendFiles.forEach((f) => {
  check('tanpa rahasia: ' + f, () => {
    const text = readFileSync(abs(f), 'utf8');
    secretPatterns.forEach((p) => {
      if (p.re.test(text)) throw new Error('pola ' + p.label);
    });
    return true;
  });
});

check('API_BASE_URL = URL Web App Apps Script yang valid (dikonfirmasi pengguna)', () => {
  const text = readFileSync(abs('assets/js/config.js'), 'utf8');
  const m = text.match(/API_BASE_URL\s*:\s*['"]([^'\"]+)['"]/);
  if (!m) throw new Error('API_BASE_URL tidak ditemukan atau kosong');
  const v = m[1];
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(v)) {
    throw new Error('format bukan URL Web App Apps Script (harus https://script.google.com/macros/s/<ID>/exec)');
  }
  return true;
});

check('tidak ada NIP/data pegawai fiktif di frontend', () => {
  const joined = frontendFiles.map((f) => readFileSync(abs(f), 'utf8')).join('\n');
  const nipLike = /\b\d{18}\b/; // NIP PNS umumnya 18 digit
  if (nipLike.test(joined)) throw new Error('ditemukan angka mirip NIP');
  return true;
});

console.log('== Regresi perbaikan PHASE 6 ==');
check('attendance.js: stage dipulihkan sebelum menonaktifkan ulang tombol kirim', () => {
  const src = readFileSync(abs('assets/js/attendance.js'), 'utf8');
  const restore = src.indexOf("if (flow.stage === 'sending') flow.stage = 'summary';");
  const enable = src.indexOf("if (submitBtn && flow.stage === 'summary') submitBtn.disabled = false;");
  if (restore === -1 || enable === -1) throw new Error('pola pemulihan tidak ditemukan');
  if (restore > enable) throw new Error('urutan terbalik: tombol dinonaktifkan sebelum stage dipulihkan');
  return true;
});
check('attendance.js: showStage(summary) menonaktifkan-aktifkan kembali att-submit', () => {
  const src = readFileSync(abs('assets/js/attendance.js'), 'utf8');
  const m = src.match(/if \(name === 'summary'\) \{[\s\S]{0,300}?att-submit[\s\S]{0,120}?disabled = false;/);
  if (!m) throw new Error('pola aktifkan-att-submit di showStage tidak ditemukan');
  return true;
});
check('auth.js: menangani auth:session-lost (bersihkan token & sesi lokal)', () => {
  const src = readFileSync(abs('assets/js/auth.js'), 'utf8');
  if (!/addEventListener\('auth:session-lost'/.test(src)) throw new Error('listener auth:session-lost tidak ada');
  if (!/api\.clearToken\(\)/.test(src)) throw new Error('panggilan clearToken tidak ada');
  return true;
});
check('auth.js: memulihkan sesi persisten & membuktikannya lewat session.check', () => {
  const src = readFileSync(abs('assets/js/auth.js'), 'utf8');
  if (!/hasStoredToken\(\)/.test(src)) throw new Error('hasStoredToken tidak dipakai');
  if (!/restoreToken\(\)/.test(src)) throw new Error('restoreToken tidak dipanggil');
  if (!/call\('session\.check'/.test(src)) throw new Error('session.check tidak dipanggil saat memulihkan sesi');
  return true;
});
check('api.js: token persisten hanya via localStorage terenkapsulasi (bukan cookie)', () => {
  const src = readFileSync(abs('assets/js/api.js'), 'utf8');
  if (!/localStorage/.test(src)) throw new Error('localStorage tidak dipakai');
  if (/\bdocument\.cookie\b/.test(src)) throw new Error('cookie tidak boleh dipakai (tak didukung Apps Script)');
  if (!/function restoreToken\(\)/.test(src)) throw new Error('restoreToken tidak ada');
  return true;
});
check('index.html: ada centang "Ingat saya" (id=remember) di formulir login', () => {
  const src = readFileSync(abs('index.html'), 'utf8');
  if (!/id="remember"/.test(src)) throw new Error('input #remember tidak ada');
  return true;
});
check('versi config.js == CACHE_VERSION service-worker.js', () => {
  const cfg = readFileSync(abs('assets/js/config.js'), 'utf8');
  const sw = readFileSync(abs('service-worker.js'), 'utf8');
  const v = (cfg.match(/VERSION:\s*'([^']+)'/) || [])[1];
  const c = (sw.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
  if (!v || !c) throw new Error('versi tidak ditemukan');
  if (c !== 'app-v' + v) throw new Error('config VERSION=' + v + ' tapi SW CACHE_VERSION=' + c);
  return true;
});

console.log('\n== Ringkasan: ' + passed + ' lulus, ' + failed + ' gagal ==');
process.exit(failed === 0 ? 0 : 1);

/*
 * Service worker — Sistem Absensi KPU Kabupaten Aceh Selatan
 * PHASE 2 (autentikasi). Hanya meng-cache aset statis aplikasi.
 *
 * Batasan yang disengaja (lihat docs/REQUIREMENTS.md bagian PWA & Keamanan):
 * - Tidak meng-cache respons API.
 * - Tidak meng-cache PIN, sesi, token, foto, atau data absensi.
 * - Tidak membuat antrean absensi offline.
 */

// Strategi pembaruan cache: naikkan CACHE_VERSION setiap kali aset statis berubah.
// Versi ini harus diselaraskan dengan APP_CONFIG.VERSION di assets/js/config.js.
const CACHE_VERSION = 'app-v0.6.7';
const STATIC_CACHE = `absensi-static-${CACHE_VERSION}`;

// Daftar aset statis yang aman di-cache. Tidak ada data privat di sini.
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/config.js',
  './assets/js/api.js',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/camera.js',
  './assets/js/attendance.js',
  './assets/js/susulan.js',
  './assets/js/admin.js',
  './assets/js/report.js',
  './assets/js/nav.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Aset fondasi ini tidak mengandung data privat, aman untuk langsung diaktifkan.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('absensi-static-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Hanya tangani GET.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Hanya tangani permintaan same-origin (aset statis).
  // Permintaan lintas-origin (mis. backend Apps Script) diteruskan ke jaringan
  // dan tidak pernah di-cache.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigasi halaman: coba jaringan, fallback ke app shell yang di-cache saat offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Aset statis lain: cache-first, lalu jaringan.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

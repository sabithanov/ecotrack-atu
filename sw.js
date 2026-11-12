/* Service worker: офлайн-работа PWA (кэш приложения и библиотек). */
var CACHE = 'ecotrack-v5';
var ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './assets/icon.svg',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
  './js/config.js', './js/sync.js', './js/voice.js', './js/i18n.js', './js/i18n-en.js', './js/sha256.js', './js/seed.js', './js/api.js', './js/ui.js', './js/export.js',
  './js/views-form.js', './js/views-reports.js', './js/views-analytics.js', './js/views-admin.js', './js/app.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () { }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // network-first: свежая версия при наличии сети, кэш — офлайн
    e.respondWith(fetch(e.request).then(function (r) {
      var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); }); }));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (resp) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return resp; });
    }));
  }
});

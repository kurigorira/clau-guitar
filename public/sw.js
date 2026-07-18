// アプリ本体（シェル）をキャッシュしてオフラインでも開けるようにする。
// 楽譜データやアップロードファイル(/api/)はキャッシュせず常に最新を取得する。
const CACHE = 'clau-guitar-v1';
const SHELL = [
  '/', '/index.html', '/css/style.css',
  '/js/app.js', '/js/api.js', '/js/chordpro.js', '/js/chords.js',
  '/manifest.webmanifest', '/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // APIは常にネットワーク優先（データの鮮度を保つ）
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // 静的アセットはキャッシュ優先
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('/')))
  );
});

// オフラインでも開けるようにキャッシュするが、オンライン時は常に最新を優先する
// （ネットワーク優先）。これによりアプリを更新したら必ず反映される。
// 楽譜データやアップロードファイル(/api/)も常にネットワーク優先。
const CACHE = 'clau-guitar-v2';
const SHELL = [
  '/', '/index.html', '/css/style.css',
  '/js/app.js', '/js/api.js', '/js/chordpro.js', '/js/chords.js', '/js/transpose.js',
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

  // ネットワーク優先：まず最新を取りに行き、失敗（オフライン）したらキャッシュへ。
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 同一オリジンかつAPI以外の成功レスポンスはオフライン用に控えておく
        if (url.origin === location.origin && !url.pathname.startsWith('/api/') && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
  );
});

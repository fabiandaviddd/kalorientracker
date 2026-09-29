// Service Worker: legt die App-Dateien im iPhone ab, damit sie auch ohne Internet startet.
// Strategie „erst Netz, dann Zwischenspeicher“: Online kommt immer die neueste Version, offline die zuletzt geladene.
const CACHE = 'kalorientracker-v2';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'fonts/archivo-latin.woff2', 'fonts/archivo-latin-ext.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Nur eigene Dateien; Anfragen an Claude und das SDK gehen unverändert ins Netz
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        // offline: genau diese Datei, sonst dieselbe ohne ?v=…, bei Seitenaufrufen die Startseite
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(request)) ||
          (await cache.match(request, { ignoreSearch: true })) ||
          (request.mode === 'navigate' ? await cache.match('./') : undefined) ||
          Response.error()
        );
      })
  );
});

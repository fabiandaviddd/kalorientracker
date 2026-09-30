// Service Worker: legt die App-Dateien im iPhone ab, damit sie auch ohne Internet startet.
// Strategie „erst Netz, dann Zwischenspeicher“: Online kommt immer die neueste Version. Antwortet das Netz nicht
// innerhalb von 3 Sekunden (schlechter Empfang) oder gar nicht (offline), kommt die zuletzt geladene.
const PREFIX = 'kalorientracker-';
const CACHE = PREFIX + 'v3';
const NETWORK_TIMEOUT_MS = 3000;
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'fonts/archivo-latin.woff2', 'fonts/archivo-latin-ext.woff2'];

// Pro Datei nur eine Fassung ablegen: „?v=…“ gehört nicht zum Schlüssel, sonst sammelt sich jede Version an
function keyFor(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Nur eigene, ältere Zwischenspeicher löschen – andere Apps unter derselben Adresse (z. B. am-pass) behalten ihre
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Nur eigene Dateien; Anfragen an Claude gehen unverändert ins Netz
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(keyFor(request), response.clone());
    }
    return response;
  });
  // Den Zwischenspeicher auch dann auffrischen, wenn wegen langsamen Netzes schon die alte Fassung angezeigt wird
  event.waitUntil(network.catch(() => {}));
  event.respondWith(fromNetworkOrCache(request, network));
});

async function fromNetworkOrCache(request, network) {
  const cache = await caches.open(CACHE);
  // Seitenaufrufe (auch mit ?…) bekommen notfalls die Startseite
  const cached = async () =>
    (await cache.match(keyFor(request))) ?? (request.mode === 'navigate' ? await cache.match(self.registration.scope) : undefined);
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'langsam'));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== 'langsam') return first;
    return (await cached()) ?? (await network); // nichts abgelegt: weiter auf das Netz warten
  } catch {
    return (await cached()) ?? Response.error(); // offline
  }
}

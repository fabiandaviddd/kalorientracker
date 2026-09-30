// Service Worker: legt die App-Dateien im iPhone ab, damit sie auch ohne Internet startet.
// – Startseite: erst Netz; antwortet es nicht innerhalb von 3 Sekunden (schlechter Empfang), gar nicht (offline) oder
//   mit einem Fehler, kommt die zuletzt geladene.
// – Dateien mit „?v=…“ (und Schriften, SDK – Version steht im Namen) ändern sich nie: sie kommen genau in der Fassung
//   aus dem Zwischenspeicher, die die Startseite verlangt.
// – Eine Startseite wird erst abgelegt, wenn alle ihre ?v=-Dateien abgelegt sind. So passen Seite und Skripte auch
//   offline immer zusammen.
// – Alles andere: erst Netz, offline die zuletzt geladene Fassung.
// Wechselt das SDK oder die Schrift (neuer Dateiname), CACHE hochzählen – sonst bleibt die alte Datei liegen.
const PREFIX = 'kalorientracker-';
const CACHE = PREFIX + 'v4';
const NETWORK_TIMEOUT_MS = 3000;
const EXTRA = ['manifest.webmanifest', 'fonts/archivo-latin.woff2', 'fonts/archivo-latin-ext.woff2'];
const FIXED_NAME = /\/(fonts|vendor)\//; // Version steckt im Dateinamen

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        EXTRA.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok) throw new Error(`${url} nicht erreichbar`);
          await cache.put(url, response);
        })
      );
      // Startseite frisch holen (am Browser-Zwischenspeicher vorbei) und samt ihrer Dateien ablegen
      const page = await fetch('./', { cache: 'reload' });
      if (!page.ok) throw new Error('Startseite nicht erreichbar');
      await saveStartPage(cache, self.registration.scope, page);
      await self.skipWaiting();
    })()
  );
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
  const url = new URL(request.url);
  // Nur eigene Dateien; Anfragen an Claude gehen unverändert ins Netz
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(startPage(event));
  else if (url.searchParams.has('v') || FIXED_NAME.test(url.pathname)) event.respondWith(fixedFile(event, url));
  else event.respondWith(latestFile(event));
});

// ---------- Ablegen und Nachschlagen ----------

// Pro Seite nur eine Fassung: „?t=…“ o. Ä. beim Aufruf gehört nicht zum Schlüssel
function withoutQuery(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.href;
}

// Nur im eigenen Zwischenspeicher suchen; ein Fehler dabei zählt als „nicht gefunden“
async function fromCache(request, options) {
  try {
    return await (await caches.open(CACHE)).match(request, options);
  } catch {
    return undefined;
  }
}

// Hintergrundarbeit, die die Antwort nie verdirbt (Fehler, z. B. Speicher voll, werden verschluckt)
function inBackground(event, work) {
  const done = work().catch(() => {});
  try {
    event.waitUntil(done);
  } catch {
    // Ereignis schon abgeschlossen – die Arbeit läuft trotzdem weiter
  }
}

// Legt eine Startseite samt aller Dateien ab, die sie mit ?v= anfordert – die Seite selbst zuletzt
async function saveStartPage(cache, key, page) {
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => new URL(m[1], page.url || key).href);
  for (const url of assets) {
    if (await cache.match(url)) continue;
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`${url} nicht erreichbar`); // dann bleibt die bisherige Seite liegen
    await cache.put(url, response);
  }
  await cache.put(key, page);
}

// Ältere Fassungen einer ?v=-Datei löschen, sobald eine Seite die neue verlangt (je Datei bleibt eine)
async function removeOlderVersions(url) {
  const cache = await caches.open(CACHE);
  for (const old of await cache.keys()) {
    const oldUrl = new URL(old.url);
    if (oldUrl.pathname === url.pathname && oldUrl.search !== url.search) await cache.delete(old);
  }
}

// ---------- Die drei Arten von Anfragen ----------

async function startPage(event) {
  const key = withoutQuery(event.request);
  const network = fetch(event.request).then((response) => {
    if (response.status === 200) {
      const copy = response.clone();
      inBackground(event, async () => saveStartPage(await caches.open(CACHE), key, copy));
    }
    return response;
  });
  inBackground(event, () => network); // auch nach dem Zeitlimit fertig laden – der nächste Start ist dann aktuell
  const cached = async () => (await fromCache(key)) ?? (await fromCache(self.registration.scope));
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'langsam'));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== 'langsam') return first.ok ? first : (await cached()) ?? first; // Fehlerseite nur, wenn nichts gespeichert ist
    return (await cached()) ?? (await network); // noch nichts abgelegt: weiter auf das Netz warten
  } catch {
    return (await cached()) ?? Response.error(); // offline
  }
}

async function fixedFile(event, url) {
  const hit = await fromCache(event.request);
  if (hit) {
    if (url.searchParams.has('v')) inBackground(event, () => removeOlderVersions(url));
    return hit;
  }
  try {
    const response = await fetch(event.request);
    if (response.status === 200) {
      const copy = response.clone();
      inBackground(event, async () => {
        await (await caches.open(CACHE)).put(event.request, copy);
        if (url.searchParams.has('v')) await removeOlderVersions(url);
      });
    }
    return response;
  } catch {
    // offline und genau diese Fassung fehlt (sollte dank saveStartPage nicht vorkommen): notfalls eine andere Fassung
    return (await fromCache(event.request, { ignoreSearch: true })) ?? Response.error();
  }
}

async function latestFile(event) {
  const key = withoutQuery(event.request);
  try {
    const response = await fetch(event.request);
    if (response.status === 200) {
      const copy = response.clone();
      inBackground(event, async () => (await caches.open(CACHE)).put(key, copy));
    }
    return response;
  } catch {
    return (await fromCache(key)) ?? Response.error();
  }
}

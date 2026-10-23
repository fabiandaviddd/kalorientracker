// Service Worker: legt die App-Dateien im iPhone ab, damit sie auch ohne Internet startet.
// – Startseite: erst Netz; antwortet es nicht innerhalb von 3 Sekunden (schlechter Empfang), gar nicht (offline) oder
//   mit einem Fehler, kommt die zuletzt geladene.
// – Dateien mit „?v=…“ (und Schriften, SDK – Version steht im Namen) ändern sich nie: sie kommen genau in der Fassung
//   aus dem Zwischenspeicher, die die Startseite verlangt.
// – Eine Startseite wird erst abgelegt, wenn alle ihre ?v=-Dateien abgelegt sind. So passen Seite und Skripte auch
//   offline immer zusammen.
// – Alles andere: erst Netz, offline die zuletzt geladene Fassung.
// – Alte ?v=-Dateien werden nur gelöscht, wenn die abgelegte Startseite sie nicht mehr braucht, und eine abgelegte Startseite
//   wird nur gezeigt, wenn alle ihre Dateien da sind (sonst Netz abwarten): 20./22.10. kam bei schlechtem Empfang eine alte
//   Startseite (v=64) ohne ihre Dateien, das Netz lieferte unter der alten Adresse die neue app.js → Absturz beim Start.
// – Abgelegt wird die Startseite nur frisch: bei der Installation und wenn die App nach erfolgreichem Start
//   „startseite-ablegen“ meldet (nie die Navigationsantwort, die bis 10 min alt sein kann). Stürzt die App beim Aufbau ab,
//   bittet sie um „startseite-erneuern“ (nur mit Netz; ohne Netz bleibt die bisherige Seite liegen) und lädt dann einmal neu.
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

// Alle Dateien, die eine Startseite mit ?v= anfordert (als volle Adressen)
const pageAssets = (html, base) => [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => new URL(m[1], base).href);

// Legt eine Startseite samt aller Dateien ab, die sie mit ?v= anfordert – die Seite selbst zuletzt
async function saveStartPage(cache, key, page) {
  const html = await page.clone().text();
  // gleichzeitig laden: iOS beendet den Service Worker oft wenige Sekunden nach dem Öffnen
  await Promise.all(
    pageAssets(html, page.url || key).map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`${url} nicht erreichbar`); // dann bleibt die bisherige Seite liegen
      await cache.put(url, response);
    })
  );
  await cache.put(key, page);
}

// Die abgelegte Startseite und welche ihrer Dateien fehlen (null = keine Seite abgelegt)
async function storedStartPage(cache) {
  const page = (await cache.match(self.registration.scope)) ?? null;
  if (!page) return null;
  const assets = pageAssets(await page.clone().text(), self.registration.scope);
  const missing = [];
  for (const url of assets) if (!(await cache.match(url))) missing.push(url);
  return { page, assets, missing };
}

// Ältere Fassungen einer ?v=-Datei löschen, sobald eine Seite die neue verlangt (je Datei bleibt eine) –
// aber nie eine, die die abgelegte Startseite noch braucht, sonst passt sie offline nicht mehr zu ihren Dateien
async function removeOlderVersions(url) {
  const cache = await caches.open(CACHE);
  const needed = new Set((await storedStartPage(cache))?.assets ?? []);
  for (const old of await cache.keys()) {
    const oldUrl = new URL(old.url);
    if (oldUrl.pathname === url.pathname && oldUrl.search !== url.search && !needed.has(old.url)) await cache.delete(old);
  }
}

// Nach erfolgreichem Start meldet die App sich: dann die aktuelle Startseite sicher ablegen (falls nicht schon geschehen)
// Holt die Startseite frisch (am Browser-Zwischenspeicher vorbei) und legt sie samt Dateien ab; ohne Netz bleibt die alte
async function renewStartPage() {
  const page = await fetch(self.registration.scope, { cache: 'no-cache' });
  if (page.status !== 200) throw new Error('Startseite nicht erreichbar');
  const cache = await caches.open(CACHE);
  await saveStartPage(cache, self.registration.scope, page);
  return cache;
}

self.addEventListener('message', (event) => {
  if (event.data === 'startseite-erneuern') {
    // Die App ist beim Aufbau abgestürzt: Seite frisch ablegen (nur wenn das Netz antwortet), dann Bescheid geben
    const reply = event.ports?.[0];
    event.waitUntil(
      renewStartPage()
        .then(() => reply?.postMessage('erneuert'))
        .catch(() => reply?.postMessage('nicht erneuert'))
    );
    return;
  }
  if (event.data !== 'startseite-ablegen') return;
  event.waitUntil(
    (async () => {
      const cache = await renewStartPage();
      // Jetzt ältere Fassungen der Seiten-Dateien aufräumen (gleicher Pfad, andere ?v=); Icons aus dem Manifest bleiben
      const needed = (await storedStartPage(cache))?.assets ?? [];
      const neededPaths = new Set(needed.map((u) => new URL(u).pathname));
      for (const old of await cache.keys()) {
        const oldUrl = new URL(old.url);
        if (oldUrl.searchParams.has('v') && neededPaths.has(oldUrl.pathname) && !needed.includes(old.url)) await cache.delete(old);
      }
    })().catch(() => {})
  );
});

// ---------- Die drei Arten von Anfragen ----------

async function startPage(event) {
  const key = withoutQuery(event.request);
  // Die Antwort wird hier nicht abgelegt: sie kann bis zu 10 min alt aus dem Browser-Zwischenspeicher kommen, während
  // saveStartPage die Dateien frisch holen würde (GitHub Pages ignoriert ?v=) – abgelegt wird nach dem Start („startseite-ablegen“)
  const network = fetch(event.request);
  inBackground(event, () => network); // auch nach dem Zeitlimit fertig laden – der nächste Start ist dann aktuell
  const cached = async () => (await fromCache(key)) ?? (await fromCache(self.registration.scope));
  // Bei langsamem Netz nur eine vollständige abgelegte Seite zeigen – fehlt eine ihrer Dateien, lieber aufs Netz warten
  const cachedComplete = async () => {
    try {
      const stored = await storedStartPage(await caches.open(CACHE));
      return stored && stored.missing.length === 0 ? stored.page : undefined;
    } catch {
      return undefined;
    }
  };
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'langsam'));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== 'langsam') return first.ok ? first : (await cached()) ?? first; // Fehlerseite nur, wenn nichts gespeichert ist
    return (await cachedComplete()) ?? (await network); // langsam: vollständige abgelegte Seite, sonst weiter aufs Netz warten
  } catch {
    return (await cached()) ?? Response.error(); // offline: das Beste, was da ist
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

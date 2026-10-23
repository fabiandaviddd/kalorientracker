// Kalorientracker – Protokoll: was in der App passiert (Anfragen an Claude, Meldungen, Fehler).
// Liegt nur auf diesem iPhone (in der Datenbank, so sicher wie die Mahlzeiten) und reist mit der Sicherungsdatei mit,
// damit sich Probleme am Mac nachvollziehen lassen.
// Nie im Protokoll: API-Schlüssel und Fotos. Wird nach logic.js und vor app.js geladen, damit es auch Ladefehler sieht.

const LOG_STORAGE = 'kt.log'; // Ersatzablage, falls die Datenbank nicht schreibt (bis v=61 lag hier das ganze Protokoll)
// Kennung dieses App-Starts in jedem Eintrag: so ist zu sehen, ob zwei Fenster der App gleichzeitig liefen
const LOG_SESSION = Math.random().toString(36).slice(2, 6);

let logSink = null; // schreibt in die Datenbank – app.js schließt sie an

// Bevor app.js geladen ist (oder falls es nie lädt), landet alles sofort in der Ersatzablage
function logEvent(type, data) {
  try {
    const entry = logEntry(type, { ...data, s: LOG_SESSION });
    if (logSink) logSink(entry);
    else writeFallbackLog([entry]);
  } catch {
    // Das Protokoll darf die App nie stören
  }
}

function connectLog(sink) {
  logSink = sink;
}

function readFallbackLog() {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_STORAGE) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeFallbackLog(entries) {
  try {
    localStorage.setItem(LOG_STORAGE, JSON.stringify(trimLog([...readFallbackLog(), ...entries]).slice(-500))); // klein halten
  } catch {
    // dann geht dieser Eintrag verloren
  }
}

// Unerwartete Fehler im Code, nicht ladbare Dateien, von der Schutzregel (CSP) blockierte Inhalte
const shortSource = (url) => String(url ?? '').replace(location.origin, '').replace(/^.*\/(?=[^/]+$)/, '');
addEventListener(
  'error',
  (event) => {
    if (event.target && event.target !== window) {
      logEvent('ladefehler', { datei: shortSource(event.target.src || event.target.href) });
    } else {
      logEvent('codefehler', { text: event.message, ort: `${shortSource(event.filename)}:${event.lineno}:${event.colno}`, stapel: event.error?.stack });
      if (!window.__appReady) recoverFromStartCrash();
    }
  },
  true
);

// Absturz beim Aufbau (20./22.10.: alte Startseite mit neuem Programm): die abgelegte Startseite frisch ersetzen lassen und
// einmal neu laden, statt kaputt stehen zu bleiben. Nur mit Netz (sonst würde es nichts bessern) und höchstens einmal pro
// Sitzung, damit es nie zur Schleife wird. Neu geladen wird erst, wenn der Service Worker fertig ist (spätestens nach 5 s).
function recoverFromStartCrash() {
  if (!navigator.onLine) return;
  try {
    if (sessionStorage.getItem('kt.neuGeladen')) return;
    sessionStorage.setItem('kt.neuGeladen', '1');
  } catch {
    return;
  }
  logEvent('neu geladen nach absturz', {});
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  };
  try {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return void setTimeout(reload, 300);
    const channel = new MessageChannel();
    channel.port1.onmessage = reload;
    worker.postMessage('startseite-erneuern', [channel.port2]);
    setTimeout(reload, 5000);
  } catch {
    setTimeout(reload, 300);
  }
}
addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  logEvent('codefehler', { text: reason?.message ?? String(reason), art: reason?.name, stapel: reason?.stack });
});
addEventListener('securitypolicyviolation', (event) => {
  logEvent('schutzregel', { regel: event.effectiveDirective, adresse: event.blockedURI });
});

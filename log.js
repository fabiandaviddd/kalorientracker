// Kalorientracker – Protokoll: was in der App passiert (Anfragen an Claude, Meldungen, Fehler).
// Liegt nur auf diesem iPhone und reist mit der Sicherungsdatei mit, damit sich Probleme am Mac nachvollziehen lassen.
// Nie im Protokoll: API-Schlüssel und Fotos. Wird nach logic.js und vor app.js geladen, damit es auch Ladefehler sieht.

const LOG_STORAGE = 'kt.log';

function readLog() {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_STORAGE) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Schreibt sofort (übersteht also auch einen Absturz); ist der Speicher voll, fliegt die ältere Hälfte raus
function logEvent(type, data) {
  try {
    const list = trimLog([...readLog(), logEntry(type, data)]);
    try {
      localStorage.setItem(LOG_STORAGE, JSON.stringify(list));
    } catch {
      localStorage.setItem(LOG_STORAGE, JSON.stringify(list.slice(Math.floor(list.length / 2))));
    }
  } catch {
    // Das Protokoll darf die App nie stören
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
    }
  },
  true
);
addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  logEvent('codefehler', { text: reason?.message ?? String(reason), art: reason?.name, stapel: reason?.stack });
});
addEventListener('securitypolicyviolation', (event) => {
  logEvent('schutzregel', { regel: event.effectiveDirective, adresse: event.blockedURI });
});

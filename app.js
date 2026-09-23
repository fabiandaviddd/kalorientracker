// Kalorientracker – Verhalten der App

const $ = (id) => document.getElementById(id);

// ---------- Anzeige ----------

function formatNumber(n) {
  return Math.round(n).toLocaleString('de-DE');
}

function renderToday() {
  $('today-date').textContent = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Noch keine gespeicherten Mahlzeiten – kommt in Schritt 8
  const meals = [];
  const totals = meals.reduce(
    (sum, m) => ({
      kcal: sum.kcal + m.kcal,
      protein: sum.protein + m.protein,
      carbs: sum.carbs + m.carbs,
      fat: sum.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  $('total-kcal').textContent = formatNumber(totals.kcal);
  $('total-protein').textContent = formatNumber(totals.protein) + ' g';
  $('total-carbs').textContent = formatNumber(totals.carbs) + ' g';
  $('total-fat').textContent = formatNumber(totals.fat) + ' g';
}

// ---------- Claude-API ----------

// Offizielles Anthropic-SDK, direkt aus dem Netz geladen (feste Version)
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
const MODEL = 'claude-opus-5';
const KEY_STORAGE = 'kt.apiKey';

let sdkPromise;
function loadSdk() {
  // Erst laden, wenn gebraucht – so startet die App auch ohne Internet
  sdkPromise ??= import(SDK_URL).then((m) => m.default).catch((err) => {
    sdkPromise = undefined;
    throw err;
  });
  return sdkPromise;
}

async function createClient(apiKey) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // gewollt: nur ich nutze die App, der Schlüssel liegt nur auf meinem iPhone
    maxRetries: 0,
    timeout: 20_000,
  });
  return { Anthropic, client };
}

// Prüft den Schlüssel, ohne Kosten zu verursachen (nur Modell-Infos abrufen)
async function testKey(apiKey) {
  let Anthropic;
  try {
    const created = await createClient(apiKey);
    Anthropic = created.Anthropic;
    await created.client.models.retrieve(MODEL);
    return { ok: true, message: 'Verbindung klappt. Der Schlüssel funktioniert.' };
  } catch (err) {
    return { ok: false, message: describeError(err, Anthropic) };
  }
}

function describeError(err, Anthropic) {
  if (!Anthropic) {
    return 'Keine Internetverbindung. Bitte später nochmal versuchen.';
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Der Schlüssel ist ungültig. Bitte prüfe, ob du ihn vollständig kopiert hast.';
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'Der Schlüssel hat keine Berechtigung. Prüfe ihn in der Anthropic Console.';
  }
  if (err instanceof Anthropic.NotFoundError) {
    return 'Der Schlüssel funktioniert, aber das Claude-Modell ist für dein Konto nicht verfügbar.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Zu viele Anfragen oder Ausgabenlimit erreicht. Bitte kurz warten.';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Keine Verbindung zu Claude. Bist du online?';
  }
  if (err instanceof Anthropic.APIError) {
    return `Claude meldet einen Fehler (${err.status ?? 'unbekannt'}). Bitte später nochmal versuchen.`;
  }
  return 'Unerwarteter Fehler. Bitte später nochmal versuchen.';
}

// ---------- Schlüssel speichern ----------

function getStoredKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function setStoredKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

function maskKey(key) {
  return '●●●●' + key.slice(-4);
}

function showKeyStatus(kind, text) {
  const status = $('key-status');
  status.className = 'status ' + kind;
  status.textContent = text;
  status.hidden = false;
}

function hideKeyStatus() {
  $('key-status').hidden = true;
}

function renderKeySection({ editing = false } = {}) {
  const key = getStoredKey();
  const showForm = editing || !key;
  $('key-form').hidden = !showForm;
  $('key-saved').hidden = showForm;
  $('key-cancel').hidden = !(showForm && key);
  $('key-masked').textContent = key ? maskKey(key) : '';
  if (showForm) $('key-input').value = '';
}

async function onSaveKey(event) {
  event.preventDefault();
  const key = $('key-input').value.trim();
  if (!key) {
    showKeyStatus('error', 'Bitte zuerst einen Schlüssel einfügen.');
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    showKeyStatus('error', 'Das sieht nicht wie ein Claude-API-Schlüssel aus. Er beginnt mit „sk-ant-“.');
    return;
  }

  $('key-save').disabled = true;
  showKeyStatus('pending', 'Prüfe den Schlüssel …');
  const result = await testKey(key);
  $('key-save').disabled = false;

  if (!result.ok) {
    showKeyStatus('error', result.message + ' Der Schlüssel wurde nicht gespeichert.');
    return;
  }
  if (!setStoredKey(key)) {
    showKeyStatus('error', 'Der Schlüssel funktioniert, konnte aber nicht gespeichert werden.');
    return;
  }
  renderKeySection();
  showKeyStatus('ok', 'Gespeichert. ' + result.message);
}

async function onTestKey() {
  $('key-test').disabled = true;
  showKeyStatus('pending', 'Teste die Verbindung …');
  const result = await testKey(getStoredKey());
  $('key-test').disabled = false;
  showKeyStatus(result.ok ? 'ok' : 'error', result.message);
}

function onRemoveKey() {
  if (!confirm('Schlüssel wirklich von diesem iPhone entfernen?')) return;
  setStoredKey('');
  renderKeySection();
  showKeyStatus('ok', 'Schlüssel entfernt.');
}

// ---------- Navigation zwischen Ansichten ----------

function showView(name) {
  $('view-today').hidden = name !== 'today';
  $('view-settings').hidden = name !== 'settings';
  window.scrollTo(0, 0);
}

let toastTimer;
function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2000);
}

// ---------- Start ----------

$('open-settings').addEventListener('click', () => {
  hideKeyStatus();
  renderKeySection();
  showView('settings');
});
$('close-settings').addEventListener('click', () => showView('today'));
$('key-form').addEventListener('submit', onSaveKey);
$('key-test').addEventListener('click', onTestKey);
$('key-change').addEventListener('click', () => {
  hideKeyStatus();
  renderKeySection({ editing: true });
  $('key-input').focus();
});
$('key-cancel').addEventListener('click', () => {
  hideKeyStatus();
  renderKeySection();
});
$('key-remove').addEventListener('click', onRemoveKey);
$('add-meal').addEventListener('click', () => showToast('Foto aufnehmen kommt in Schritt 5'));

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderToday();
});

renderToday();

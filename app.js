// Kalorientracker – Verhalten der App

const $ = (id) => document.getElementById(id);

// ---------- Anzeige ----------

function formatNumber(n) {
  return Math.round(n).toLocaleString('de-DE');
}

async function renderToday() {
  $('today-date').textContent = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let meals = [];
  try {
    meals = await getMealsForDay(dayKey(new Date()));
  } catch {
    showToast('Mahlzeiten konnten nicht geladen werden');
  }
  renderTotals('total', sumNutrients(meals));
  renderMealList(meals);
}

function renderMealList(meals) {
  const list = $('meal-list');
  if (meals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.append('Noch keine Mahlzeiten.', document.createElement('br'), 'Tippe auf ');
    const plus = document.createElement('strong');
    plus.textContent = '+';
    empty.append(plus, ', um ein Foto aufzunehmen.');
    list.replaceChildren(empty);
    return;
  }

  const card = document.createElement('div');
  card.className = 'card meal-card';
  for (const meal of meals) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'meal-row';
    row.addEventListener('click', () => openMeal(meal.id));

    const img = document.createElement('img');
    img.className = 'meal-thumb';
    img.alt = '';
    if (meal.thumb) img.src = meal.thumb;

    const text = document.createElement('div');
    text.className = 'meal-text';

    const top = document.createElement('div');
    top.className = 'meal-top';
    const name = document.createElement('span');
    name.className = 'meal-name';
    name.textContent = meal.name;
    const kcal = document.createElement('span');
    kcal.className = 'meal-kcal';
    kcal.textContent = formatNumber(meal.kcal) + ' kcal';
    top.append(name, kcal);

    const details = document.createElement('span');
    details.className = 'meal-details';
    const time = new Date(meal.eatenAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    details.textContent =
      `${time} Uhr · P ${formatNumber(meal.protein)} g · K ${formatNumber(meal.carbs)} g · F ${formatNumber(meal.fat)} g`;
    text.append(top, details);

    row.append(img, text);
    card.append(row);
  }
  list.replaceChildren(card);
}

// ---------- Mahlzeiten speichern (Datenbank im Browser) ----------

const DB_NAME = 'kalorientracker';
const DB_VERSION = 1;
const MEAL_STORE = 'meals';

let dbPromise;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(MEAL_STORE, { keyPath: 'id' });
      store.createIndex('day', 'day');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error);
    };
  });
  return dbPromise;
}

// Führt eine Aktion auf der Mahlzeiten-Tabelle aus und wartet, bis sie sicher gespeichert ist
async function withMeals(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEAL_STORE, mode);
    const request = action(tx.objectStore(MEAL_STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function addMeal(meal) {
  return withMeals('readwrite', (store) => store.add(meal));
}

function putMeal(meal) {
  return withMeals('readwrite', (store) => store.put(meal));
}

function deleteMeal(id) {
  return withMeals('readwrite', (store) => store.delete(id));
}

function getMeal(id) {
  return withMeals('readonly', (store) => store.get(id));
}

async function getMealsForDay(day) {
  const meals = await withMeals('readonly', (store) => store.index('day').getAll(day));
  return meals.sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
}

// Kalendertag in Ortszeit, z. B. „2026-09-23“
function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Bittet den Browser, die Daten nicht von selbst zu löschen
navigator.storage?.persist?.().catch(() => {});

// Addiert kcal, Protein, Kohlenhydrate und Fett einer Liste
function sumNutrients(list) {
  return list.reduce(
    (sum, x) => ({
      kcal: sum.kcal + x.kcal,
      protein: sum.protein + x.protein,
      carbs: sum.carbs + x.carbs,
      fat: sum.fat + x.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// Schreibt Summen in die Felder <prefix>-kcal, <prefix>-protein, …
function renderTotals(prefix, totals) {
  $(prefix + '-kcal').textContent = formatNumber(totals.kcal);
  $(prefix + '-protein').textContent = formatNumber(totals.protein) + ' g';
  $(prefix + '-carbs').textContent = formatNumber(totals.carbs) + ' g';
  $(prefix + '-fat').textContent = formatNumber(totals.fat) + ' g';
}

// ---------- Claude-API ----------

// Offizielles Anthropic-SDK, direkt aus dem Netz geladen (feste Version)
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
const MODEL = 'claude-opus-5-5';
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

async function createClient(apiKey, { timeout = 20_000, maxRetries = 0 } = {}) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // gewollt: nur ich nutze die App, der Schlüssel liegt nur auf meinem iPhone
    maxRetries,
    timeout,
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
  if (err instanceof Anthropic.BadRequestError) {
    // Sollte nicht vorkommen – genaue Meldung zeigen, damit der Fehler behoben werden kann
    return `Claude hat die Anfrage abgelehnt (400): ${err.error?.error?.message ?? err.message}`;
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

// ---------- Kalorien schätzen ----------

// Preise Claude Opus 5.5 in US-Dollar pro 1 Mio. Tokens (Stand 2026)
const PRICE_INPUT = 4;
const PRICE_OUTPUT = 20;
const PHOTO_MAX_SIDE = 1024; // größer bringt kaum Genauigkeit, kostet aber mehr
const THUMB_SIZE = 180; // Vorschaubild in der Liste, scharf auch auf Retina-Displays

const ESTIMATE_SYSTEM = `Du bist ein erfahrener Ernährungsberater. Der Nutzer führt ein Kalorientagebuch und schickt dir ein Foto seiner Mahlzeit, manchmal mit einer kurzen Beschreibung. Schätze, was er isst, so realistisch wie möglich.

Was zählt:
- Zähle nur, was der Nutzer selbst isst: den Teller oder die Schüssel im Vordergrund bzw. in der Bildmitte, meist am nächsten zur Kamera, oft mit seiner Hand oder seinem Besteck.
- Speisen und Getränke auf anderen Tellern, im Hintergrund oder am Bildrand zählst du nicht mit – außer die Beschreibung nennt sie (z. B. „dazu O-Saft“).
- Die Beschreibung des Nutzers hat immer Vorrang vor dem, was du auf dem Foto siehst (Anzahl, Mengen, Zubereitung, Marken).

Wie du schätzt:
- Nutze Bezugsgrößen im Bild: Ein üblicher Essteller hat ca. 26–28 cm, eine Gabel ca. 19 cm, dazu Hand, Brotscheiben und Verpackungen.
- Gib für jeden Bestandteil die angenommene Menge so an, wie man sie sich vorstellt, mit Gramm oder Milliliter, z. B. „2 Scheiben, ca. 110 g“, „ca. 50 g“, „0,2 l“, „1 mittelgroßer, ca. 150 g“.
- Rechne mit typischen Nährwerten für genau diese Menge. Ist eine Nährwerttabelle oder Marke erkennbar, nutze deren Werte.
- Schätze realistische Alltagsportionen, nicht großzügig. Nimm bei Unsicherheit den wahrscheinlichsten Wert, nicht den höchsten.
- Öl, Butter und Soßen rechnest du nur in der Menge ein, die sichtbar ist oder für die Zubereitung üblich ist – nicht pauschal obendrauf.

Annahmen und Unsicherheiten (2 bis 4 kurze Punkte):
- Nenne die Annahmen, die das Ergebnis am stärksten beeinflussen, und wenn möglich die Auswirkung, z. B. „Waren es zwei ganze Scheiben, kämen etwa +65 kcal dazu.“
- Nenne ausdrücklich, was du auf dem Foto gesehen, aber nicht gezählt hast, z. B. „Den Tee und den Pfirsich im Hintergrund habe ich nicht gezählt.“

Korrekturen:
- Schickt der Nutzer eine Korrektur, übernimm sie genau so und gib die vollständige, aktualisierte Schätzung zurück: alle Bestandteile, nicht nur die geänderten. Passe die Annahmen an die Korrektur an.

Schreibe alles auf Deutsch, knapp und in ganzen Sätzen. Ist auf dem Foto weder Essen noch ein Getränk zu erkennen, setze is_food auf false und lasse items leer.`;

const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean', description: 'Ist Essen oder ein Getränk zu sehen?' },
    meal_name: { type: 'string', description: 'Kurzer Name der ganzen Mahlzeit, z. B. „Spaghetti Bolognese“' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Bestandteil, z. B. „Bauernbrot“' },
          portion: { type: 'string', description: 'Angenommene Menge, z. B. „2 Scheiben, ca. 110 g“' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: ['name', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        additionalProperties: false,
      },
    },
    assumptions: {
      type: 'array',
      description: 'Annahmen und Unsicherheiten, 2 bis 4 kurze Sätze',
      items: { type: 'string' },
    },
  },
  required: ['is_food', 'meal_name', 'items', 'assumptions'],
  additionalProperties: false,
};

// Verkleinert das Foto und liefert JPEG als Base64 (ohne „data:“-Vorspann)
async function preparePhoto(file) {
  const dataUrl = await drawPhoto(file, PHOTO_MAX_SIDE, false, 0.85);
  return dataUrl.split(',')[1];
}

// Kleines quadratisches Vorschaubild für die Tagesliste (als data:-URL)
function createThumbnail(file) {
  return drawPhoto(file, THUMB_SIZE, true, 0.7);
}

// Zeichnet das Foto verkleinert (optional quadratisch zugeschnitten) und liefert eine JPEG-data:-URL
async function drawPhoto(file, maxSide, square, quality) {
  const url = URL.createObjectURL(file);
  try {
    // Auf das Laden warten (zuverlässiger als img.decode(), das in Hintergrund-Tabs hängen kann)
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (square) {
      // Mittleres Quadrat ausschneiden
      const side = Math.min(w, h);
      canvas.width = canvas.height = Math.min(maxSide, side);
      ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    } else {
      const scale = Math.min(1, maxSide / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

class EstimateError extends Error {}

// Erste Schätzung: Foto + Beschreibung
async function estimateMeal(file, note, signal) {
  if (!getStoredKey()) {
    throw new EstimateError('Bitte trage zuerst in den Einstellungen (Zahnrad) deinen API-Schlüssel ein.');
  }

  let photo;
  try {
    photo = await preparePhoto(file);
  } catch {
    throw new EstimateError('Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto wählen.');
  }

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } },
        { type: 'text', text: note ? `Beschreibung vom Nutzer: ${note}` : 'Keine Beschreibung vom Nutzer.' },
      ],
    },
  ];
  return askClaude(messages, signal, { costCents: 0, corrections: 0 });
}

// Korrektur: bisheriges Gespräch + neue Nachricht, Claude rechnet alles neu
async function correctEstimate(estimate, correction, signal) {
  const messages = [
    ...estimate.messages,
    {
      role: 'user',
      content: `Korrektur vom Nutzer: ${correction}\nBitte gib die vollständige, aktualisierte Schätzung zurück.`,
    },
  ];
  return askClaude(messages, signal, {
    costCents: estimate.costCents,
    corrections: estimate.corrections + 1,
  });
}

// Schickt das Gespräch an Claude und liefert die Schätzung samt fortgeführtem Gespräch
async function askClaude(messages, signal, previous) {
  const apiKey = getStoredKey();
  if (!apiKey) {
    throw new EstimateError('Bitte trage zuerst in den Einstellungen (Zahnrad) deinen API-Schlüssel ein.');
  }

  let Anthropic, response;
  try {
    const created = await createClient(apiKey, { timeout: 90_000, maxRetries: 1 });
    Anthropic = created.Anthropic;
    response = await created.client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // lehnt Opus 5.5 ab, springt automatisch ein Ersatzmodell ein
        output_config: {
          effort: 'medium', // gründlicher als 'low' für realistischere Portionen, aber günstiger als 'high'
          format: { type: 'json_schema', schema: ESTIMATE_SCHEMA },
        },
        system: ESTIMATE_SYSTEM,
        messages,
      },
      { signal }
    );
  } catch (err) {
    if (Anthropic && err instanceof Anthropic.APIUserAbortError) throw err;
    throw new EstimateError(describeError(err, Anthropic));
  }

  if (response.stop_reason === 'refusal') {
    throw new EstimateError('Claude hat die Anfrage abgelehnt. Bitte anders formulieren oder ein anderes Foto versuchen.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new EstimateError('Die Antwort war unvollständig. Bitte nochmal versuchen.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  let data;
  try {
    data = JSON.parse(textBlock.text);
  } catch {
    throw new EstimateError('Die Antwort von Claude war nicht lesbar. Bitte nochmal versuchen.');
  }

  const usage = response.usage;
  const costCents =
    ((usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)) * PRICE_INPUT +
      usage.output_tokens * PRICE_OUTPUT) /
    1_000_000 *
    100;

  return {
    isFood: data.is_food && data.items.length > 0,
    name: data.meal_name,
    assumptions: data.assumptions,
    items: data.items.map((i) => ({
      name: i.name,
      portion: i.portion,
      kcal: Math.max(0, i.kcal),
      protein: Math.max(0, i.protein_g),
      carbs: Math.max(0, i.carbs_g),
      fat: Math.max(0, i.fat_g),
    })),
    // Antwort unverändert anhängen, damit Claude bei einer Korrektur den ganzen Verlauf kennt
    messages: [...messages, { role: 'assistant', content: response.content }],
    costCents: previous.costCents + costCents,
    corrections: previous.corrections,
  };
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

const VIEWS = ['today', 'settings', 'capture', 'review', 'meal'];

function showView(name) {
  for (const view of VIEWS) {
    $('view-' + view).hidden = view !== name;
  }
  window.scrollTo(0, 0);
}

// ---------- Neue Mahlzeit: Foto + Text ----------

let currentPhoto = null; // die gewählte Bilddatei
let previewUrl = null;

function choosePhoto() {
  const input = $('photo-input');
  input.value = ''; // damit dasselbe Foto erneut gewählt werden kann
  input.click();
}

function onPhotoChosen() {
  const file = $('photo-input').files[0];
  if (!file) return; // Auswahl abgebrochen – nichts tun
  if (!file.type.startsWith('image/')) {
    showToast('Bitte ein Foto auswählen');
    return;
  }

  const firstPhoto = !currentPhoto;
  currentPhoto = file;
  $('capture-status').hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('photo-preview').src = previewUrl;

  if (firstPhoto) {
    $('meal-note').value = '';
    showView('capture');
  }
}

function cancelCapture() {
  currentPhoto = null;
  currentEstimate = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('photo-preview').removeAttribute('src');
  $('review-photo').removeAttribute('src');
  $('meal-note').value = '';
  $('capture-status').hidden = true;
  showView('today');
}

// ---------- Schätzen & Prüfen ----------

let currentEstimate = null;
let estimateAbort = null;

async function onEstimate() {
  if (!currentPhoto) return;
  $('capture-status').hidden = true;
  showLoading('Claude schätzt …');
  estimateAbort = new AbortController();

  try {
    const result = await estimateMeal(currentPhoto, $('meal-note').value.trim(), estimateAbort.signal);
    if (!result.isFood) {
      showCaptureError('Kein Essen erkannt. Bitte ein Foto von deiner Mahlzeit machen.');
      return;
    }
    currentEstimate = result;
    $('correction-input').value = '';
    $('review-status').hidden = true;
    renderReview();
    showView('review');
  } catch (err) {
    if (err instanceof EstimateError) showCaptureError(err.message);
    else if (!estimateAbort.signal.aborted) showCaptureError('Unerwarteter Fehler. Bitte nochmal versuchen.');
  } finally {
    $('loading').hidden = true;
    estimateAbort = null;
  }
}

async function onCorrect() {
  const correction = $('correction-input').value.trim();
  if (!correction) {
    showError('review-status', 'Bitte zuerst schreiben, was Claude ändern soll.');
    return;
  }
  $('correction-input').blur(); // Tastatur schließen
  $('review-status').hidden = true;
  showLoading('Claude rechnet neu …');
  estimateAbort = new AbortController();

  try {
    const result = await correctEstimate(currentEstimate, correction, estimateAbort.signal);
    if (!result.isFood) {
      showError('review-status', 'Nach der Korrektur ist kein Essen mehr übrig. Bitte anders formulieren.');
      return;
    }
    currentEstimate = result;
    $('correction-input').value = '';
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Neu berechnet');
  } catch (err) {
    if (err instanceof EstimateError) showError('review-status', err.message);
    else if (!estimateAbort.signal.aborted) showError('review-status', 'Unerwarteter Fehler. Bitte nochmal versuchen.');
  } finally {
    $('loading').hidden = true;
    estimateAbort = null;
  }
}

async function onSaveMeal() {
  const est = currentEstimate;
  if (!est) return;
  $('review-save').disabled = true;

  try {
    let thumb = null;
    try {
      thumb = await createThumbnail(currentPhoto);
    } catch {
      // Ohne Vorschaubild speichern ist besser als gar nicht
    }
    const now = new Date();
    await addMeal({
      id: crypto.randomUUID(),
      eatenAt: now.toISOString(),
      day: dayKey(now),
      name: est.name,
      note: $('meal-note').value.trim(),
      items: est.items,
      assumptions: est.assumptions,
      ...sumNutrients(est.items),
      thumb,
      costCents: est.costCents,
      corrections: est.corrections,
    });
  } catch {
    showError('review-status', 'Speichern hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  } finally {
    $('review-save').disabled = false;
  }

  cancelCapture(); // Foto und Eingaben zurücksetzen, zurück zu „Heute“
  await renderToday();
  showToast('Gespeichert');
}

// ---------- Gespeicherte Mahlzeit: ansehen, Zeit ändern, korrigieren, löschen ----------

let openMealData = null;

async function openMeal(id) {
  let meal;
  try {
    meal = await getMeal(id);
  } catch {
    meal = null;
  }
  if (!meal) {
    showToast('Mahlzeit nicht gefunden');
    return;
  }
  openMealData = meal;
  $('meal-correction-input').value = '';
  $('meal-status').hidden = true;
  renderMeal();
  showView('meal');
}

function renderMeal() {
  const meal = openMealData;
  if (meal.thumb) $('meal-photo').src = meal.thumb;
  else $('meal-photo').removeAttribute('src');
  renderEstimate('meal', meal);
  $('meal-time').value = toTimeInputValue(new Date(meal.eatenAt));
  $('meal-note-text').textContent = meal.note || '';
  $('meal-note-section').hidden = !meal.note;
}

// Format für das Datum-und-Uhrzeit-Feld, z. B. „2026-09-23T12:30“
function toTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function onMealTimeChange() {
  const value = $('meal-time').value;
  const date = new Date(value); // ohne Zeitzone = Ortszeit
  if (!value || isNaN(date)) {
    renderMeal(); // ungültige Eingabe verwerfen
    return;
  }
  const updated = { ...openMealData, eatenAt: date.toISOString(), day: dayKey(date) };
  try {
    await putMeal(updated);
    openMealData = updated;
    showToast('Zeit geändert');
  } catch {
    showError('meal-status', 'Die neue Zeit konnte nicht gespeichert werden.');
    renderMeal();
  }
}

// Korrektur ohne Foto: Claude bekommt die gespeicherte Liste und rechnet neu
function correctSavedMeal(meal, correction, signal) {
  const saved = {
    meal_name: meal.name,
    items: meal.items.map((i) => ({
      name: i.name,
      portion: i.portion,
      kcal: i.kcal,
      protein_g: i.protein,
      carbs_g: i.carbs,
      fat_g: i.fat,
    })),
    assumptions: meal.assumptions,
  };
  const text =
    'Hier ist eine gespeicherte Schätzung einer Mahlzeit. Das Foto liegt nicht mehr vor, rechne deshalb auf Basis dieser Liste.\n\n' +
    (meal.note ? `Ursprüngliche Beschreibung vom Nutzer: ${meal.note}\n\n` : '') +
    `Gespeicherte Schätzung:\n${JSON.stringify(saved, null, 2)}\n\n` +
    `Korrektur vom Nutzer: ${correction}\nBitte gib die vollständige, aktualisierte Schätzung zurück.`;
  return askClaude([{ role: 'user', content: text }], signal, {
    costCents: meal.costCents ?? 0,
    corrections: (meal.corrections ?? 0) + 1,
  });
}

async function onMealCorrect() {
  const correction = $('meal-correction-input').value.trim();
  if (!correction) {
    showError('meal-status', 'Bitte zuerst schreiben, was Claude ändern soll.');
    return;
  }
  $('meal-correction-input').blur();
  $('meal-status').hidden = true;
  showLoading('Claude rechnet neu …');
  estimateAbort = new AbortController();

  try {
    const result = await correctSavedMeal(openMealData, correction, estimateAbort.signal);
    if (!result.isFood) {
      showError('meal-status', 'Nach der Korrektur ist kein Essen mehr übrig. Bitte anders formulieren.');
      return;
    }
    const updated = {
      ...openMealData,
      name: result.name,
      items: result.items,
      assumptions: result.assumptions,
      ...sumNutrients(result.items),
      costCents: result.costCents,
      corrections: result.corrections,
    };
    await putMeal(updated);
    openMealData = updated;
    $('meal-correction-input').value = '';
    renderMeal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Neu berechnet und gespeichert');
  } catch (err) {
    if (err instanceof EstimateError) showError('meal-status', err.message);
    else if (!estimateAbort.signal.aborted) showError('meal-status', 'Das hat nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    $('loading').hidden = true;
    estimateAbort = null;
  }
}

async function onMealDelete() {
  if (!confirm('Diese Mahlzeit wirklich löschen?')) return;
  try {
    await deleteMeal(openMealData.id);
  } catch {
    showError('meal-status', 'Löschen hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  openMealData = null;
  showView('today');
  await renderToday();
  showToast('Gelöscht');
}

async function closeMeal() {
  openMealData = null;
  showView('today');
  await renderToday();
}

function showLoading(text) {
  $('loading-text').textContent = text;
  $('loading').hidden = false;
}

function showError(statusId, text) {
  const status = $(statusId);
  status.className = 'status error';
  status.textContent = text;
  status.hidden = false;
  status.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showCaptureError(text) {
  showError('capture-status', text);
}

function renderReview() {
  $('review-photo').src = previewUrl;
  renderEstimate('review', currentEstimate);
}

// Zeigt Name, Einzelposten, Summe, Annahmen und Kosten in den Feldern <prefix>-…
function renderEstimate(prefix, est) {
  $(prefix + '-name').textContent = est.name;

  const assumptions = $(prefix + '-assumptions');
  assumptions.replaceChildren(
    ...est.assumptions.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    })
  );
  $(prefix + '-assumptions-section').hidden = est.assumptions.length === 0;

  const list = $(prefix + '-items');
  list.replaceChildren();
  for (const item of est.items) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const top = document.createElement('div');
    top.className = 'item-top';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    const kcal = document.createElement('span');
    kcal.className = 'item-kcal';
    kcal.textContent = formatNumber(item.kcal) + ' kcal';
    top.append(name, kcal);

    const details = document.createElement('div');
    details.className = 'item-details';
    details.textContent =
      `${item.portion} · P ${formatNumber(item.protein)} g · K ${formatNumber(item.carbs)} g · F ${formatNumber(item.fat)} g`;

    row.append(top, details);
    list.append(row);
  }

  renderTotals(prefix, sumNutrients(est.items));

  const cost = (est.costCents ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const corrections = est.corrections ?? 0;
  $(prefix + '-cost').textContent =
    corrections === 0
      ? `Kosten dieser Schätzung: ca. ${cost} US-Cent`
      : `Kosten bisher: ca. ${cost} US-Cent (Schätzung + ${corrections} ${corrections === 1 ? 'Korrektur' : 'Korrekturen'})`;
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
$('add-meal').addEventListener('click', choosePhoto);
$('photo-retake').addEventListener('click', choosePhoto);
$('photo-input').addEventListener('change', onPhotoChosen);
$('capture-cancel').addEventListener('click', cancelCapture);
$('estimate').addEventListener('click', onEstimate);
$('loading-cancel').addEventListener('click', () => estimateAbort?.abort());
$('review-back').addEventListener('click', () => showView('capture'));
$('correction-send').addEventListener('click', onCorrect);
$('review-save').addEventListener('click', onSaveMeal);
$('meal-done').addEventListener('click', closeMeal);
$('meal-time').addEventListener('change', onMealTimeChange);
$('meal-correction-send').addEventListener('click', onMealCorrect);
$('meal-delete').addEventListener('click', onMealDelete);

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderToday();
});

renderToday();

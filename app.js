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
  renderTotals('total', sumNutrients(meals));
}

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
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

class EstimateError extends Error {}

async function estimateMeal(file, note, signal) {
  const apiKey = getStoredKey();
  if (!apiKey) {
    throw new EstimateError('Bitte trage zuerst in den Einstellungen (Zahnrad) deinen API-Schlüssel ein.');
  }

  let photo;
  try {
    photo = await preparePhoto(file);
  } catch {
    throw new EstimateError('Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto wählen.');
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
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } },
              {
                type: 'text',
                text: note ? `Beschreibung vom Nutzer: ${note}` : 'Keine Beschreibung vom Nutzer.',
              },
            ],
          },
        ],
      },
      { signal }
    );
  } catch (err) {
    if (Anthropic && err instanceof Anthropic.APIUserAbortError) throw err;
    throw new EstimateError(describeError(err, Anthropic));
  }

  if (response.stop_reason === 'refusal') {
    throw new EstimateError('Claude hat dieses Foto abgelehnt. Bitte ein anderes Foto versuchen.');
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
    costCents,
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

const VIEWS = ['today', 'settings', 'capture', 'review'];

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
  $('loading').hidden = false;
  estimateAbort = new AbortController();

  try {
    const result = await estimateMeal(currentPhoto, $('meal-note').value.trim(), estimateAbort.signal);
    if (!result.isFood) {
      showCaptureError('Kein Essen erkannt. Bitte ein Foto von deiner Mahlzeit machen.');
      return;
    }
    currentEstimate = result;
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

function showCaptureError(text) {
  const status = $('capture-status');
  status.className = 'status error';
  status.textContent = text;
  status.hidden = false;
  status.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderReview() {
  const est = currentEstimate;
  $('review-photo').src = previewUrl;
  $('review-name').textContent = est.name;

  const assumptions = $('review-assumptions');
  assumptions.replaceChildren(
    ...est.assumptions.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    })
  );
  $('review-assumptions-section').hidden = est.assumptions.length === 0;

  const list = $('review-items');
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

  renderTotals('review', sumNutrients(est.items));
  $('review-cost').textContent =
    `Kosten dieser Schätzung: ca. ${est.costCents.toLocaleString('de-DE', { maximumFractionDigits: 1 })} US-Cent`;
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
$('review-save').addEventListener('click', () => showToast('Speichern kommt in Schritt 8'));

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderToday();
});

renderToday();

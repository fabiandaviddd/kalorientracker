// Kalorientracker – Verhalten der App

const $ = (id) => document.getElementById(id);

// ---------- Anzeige ----------

function formatNumber(n) {
  return Math.round(n).toLocaleString('de-DE');
}

// Angezeigter Tag: null = immer der aktuelle Tag (springt nach Mitternacht mit)
let selectedDay = null;

function shownDay() {
  return selectedDay ?? new Date();
}

function isShowingToday() {
  return selectedDay === null;
}

function changeDay(delta) {
  exitSelectMode();
  const day = new Date(shownDay());
  day.setDate(day.getDate() + delta);
  selectedDay = dayKey(day) >= dayKey(new Date()) ? null : day; // nicht in die Zukunft
  renderToday();
}

// Zeigt den gewählten Tag (heißt aus historischen Gründen „renderToday“)
async function renderToday() {
  const day = shownDay();
  $('day-title').textContent = dayTitle(day);
  $('today-date').textContent = day.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: day.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
  $('day-next').disabled = isShowingToday();
  $('day-today').hidden = isShowingToday();

  let meals = [];
  try {
    meals = await getMealsForDay(dayKey(day));
  } catch {
    showToast('Mahlzeiten konnten nicht geladen werden');
  }
  // Während des Ladens könnte schon ein anderer Tag gewählt worden sein
  if (dayKey(day) !== dayKey(shownDay())) return;
  if (shownMeals.map((m) => m.id).join() !== meals.map((m) => m.id).join()) exitSelectMode(false);
  shownMeals = meals;
  $('day-copy').hidden = selectMode || meals.length === 0;
  renderTotals('total', sumNutrients(meals));
  renderMealList(meals);
  renderBackupBanner();
}

// Mahlzeiten des angezeigten Tages (für „Für Bevel kopieren“ ohne erneutes Laden)
let shownMeals = [];

// ---------- Für Bevel kopieren ----------

// Format wie im Chat: Name, darunter „535 kcal | P 18 g | KH 69 g | F 22 g“, Leerzeile dazwischen.
// Ganze Zahlen ohne Tausenderpunkt („1200“ statt „1.200“), damit Bevel sie sicher liest.
function bevelText(meals) {
  const r = Math.round;
  return meals
    .map((m) => `${m.name}\n${r(m.kcal)} kcal | P ${r(m.protein)} g | KH ${r(m.carbs)} g | F ${r(m.fat)} g`)
    .join('\n\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ersatzweg für ältere Browser
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

// Mehrere Mahlzeiten als ein Block: Namen mit „+“ verbunden, Werte addiert
function combinedForBevel(meals) {
  if (meals.length === 1) return meals[0];
  return { name: meals.map((m) => m.name).join(' + '), ...sumNutrients(meals) };
}

// ---------- Auswahl für Bevel ----------

let selectMode = false;
const selectedIds = new Set();

function enterSelectMode() {
  selectMode = true;
  selectedIds.clear();
  renderSelectState();
}

function exitSelectMode(render = true) {
  selectMode = false;
  selectedIds.clear();
  if (render) renderSelectState();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderSelectState();
}

function renderSelectState() {
  $('meal-list').classList.toggle('selecting', selectMode);
  for (const row of document.querySelectorAll('.meal-row')) {
    row.classList.toggle('selected', selectedIds.has(row.dataset.id));
    row.setAttribute('aria-pressed', selectMode ? String(selectedIds.has(row.dataset.id)) : 'false');
  }
  $('select-bar').hidden = !selectMode;
  $('add-meal').hidden = selectMode;
  const count = selectedIds.size;
  $('select-copy').textContent = count === 0 ? 'Kopieren' : `Kopieren (${count})`;
  $('select-copy').disabled = count === 0;
  const allSelected = count === shownMeals.length && count > 0;
  $('day-copy').hidden = selectMode || shownMeals.length === 0;
  $('select-all').hidden = !selectMode;
  $('select-all').textContent = allSelected ? 'Keine' : 'Alle';
  $('select-hint').hidden = !selectMode;
}

function onSelectAll() {
  if (selectedIds.size === shownMeals.length) selectedIds.clear();
  else shownMeals.forEach((m) => selectedIds.add(m.id));
  renderSelectState();
}

async function copySelected() {
  const meals = shownMeals.filter((m) => selectedIds.has(m.id)); // in zeitlicher Reihenfolge
  if (meals.length === 0) return;
  const ok = await copyText(bevelText([combinedForBevel(meals)]));
  if (!ok) {
    showToast('Kopieren hat nicht geklappt');
    return;
  }
  exitSelectMode();
  showToast(meals.length === 1 ? 'Für Bevel kopiert' : `${meals.length} Mahlzeiten als eine Summe kopiert`);
}

async function copyForBevel(meals) {
  if (meals.length === 0) return;
  const ok = await copyText(bevelText(meals));
  showToast(ok ? (meals.length === 1 ? 'Für Bevel kopiert' : `${meals.length} Mahlzeiten für Bevel kopiert`) : 'Kopieren hat nicht geklappt');
}

// „Heute“, „Gestern“, „Vorgestern“ oder z. B. „Mo., 21. Sep.“
function dayTitle(day) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((startOf(new Date()) - startOf(day)) / 86_400_000);
  if (daysAgo === 0) return 'Heute';
  if (daysAgo === 1) return 'Gestern';
  if (daysAgo === 2) return 'Vorgestern';
  return day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderMealList(meals) {
  const list = $('meal-list');
  if (meals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    if (isShowingToday()) {
      empty.append('Noch keine Mahlzeiten.', document.createElement('br'), 'Tippe auf ');
    } else {
      empty.append('An diesem Tag keine Mahlzeiten.', document.createElement('br'), 'Zum Nachtragen tippe auf ');
    }
    const plus = document.createElement('strong');
    plus.textContent = '+';
    empty.append(plus, isShowingToday() ? ', um ein Foto aufzunehmen.' : '.');
    list.replaceChildren(empty);
    return;
  }

  const groups = groupMeals(meals);
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'meal-group';

    const head = document.createElement('div');
    head.className = 'group-head';
    const title = document.createElement('span');
    title.className = 'group-title';
    title.textContent = group.label;
    const meta = document.createElement('span');
    meta.className = 'group-meta';
    meta.textContent = `${formatTime(group.start)} Uhr · ${formatNumber(group.kcal)} kcal`;
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'icon-button group-share';
    share.setAttribute('aria-label', `${group.label} für Bevel kopieren`);
    share.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
    share.addEventListener('click', () => copyGroup(group));
    head.append(title, meta, share);

    const card = document.createElement('div');
    card.className = 'card meal-card';
    for (const meal of group.meals) card.append(mealRow(meal));
    section.append(head, card);
    fragment.append(section);
  }
  list.replaceChildren(fragment);
}

// Eine Zeile der Mahlzeitenliste
function mealRow(meal) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'meal-row';
  row.dataset.id = meal.id;
  row.classList.toggle('selected', selectedIds.has(meal.id));
  row.addEventListener('click', () => (selectMode ? toggleSelected(meal.id) : openMeal(meal.id)));

  const check = document.createElement('span');
  check.className = 'meal-check';
  check.setAttribute('aria-hidden', 'true');

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

  row.append(check, img, text);
  return row;
}

// ---------- Mahlzeit-Gruppen (Frühstück, Mittagessen …) ----------

function formatTime(date) {
  return new Date(date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Name der Mahlzeit nach Uhrzeit des ersten Eintrags
function mealLabel(date) {
  const d = new Date(date);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'Frühstück';
  if (minutes >= 11 * 60 && minutes < 15 * 60) return 'Mittagessen';
  if (minutes >= 17 * 60 + 30 && minutes < 22 * 60) return 'Abendessen';
  return 'Snack';
}

function groupIdOf(meal) {
  return meal.groupId ?? meal.id;
}

// Fasst die Einträge eines Tages zu Gruppen zusammen, in zeitlicher Reihenfolge
function groupMeals(meals) {
  const byId = new Map();
  for (const meal of meals) {
    const id = groupIdOf(meal);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(meal);
  }
  const groups = [...byId.entries()].map(([id, list]) => {
    list.sort((a, b) => a.eatenAt.localeCompare(b.eatenAt) || (a.savedAt ?? 0) - (b.savedAt ?? 0));
    return { id, meals: list, start: list[0].eatenAt, label: mealLabel(list[0].eatenAt), ...sumNutrients(list) };
  });
  groups.sort((a, b) => a.start.localeCompare(b.start));
  // Frühstück, Mittag- und Abendessen gibt es nur einmal – weitere Mahlzeiten im selben Zeitraum sind Snacks
  const used = new Set();
  for (const group of groups) {
    if (used.has(group.label)) group.label = 'Snack';
    else used.add(group.label);
  }
  return groups;
}

async function copyGroup(group) {
  const meal =
    group.meals.length === 1
      ? group.meals[0]
      : { name: `${group.label} – ${group.meals.map((m) => m.name).join(', ')}`, ...sumNutrients(group.meals) };
  const ok = await copyText(bevelText([meal]));
  showToast(ok ? `${group.label} für Bevel kopiert` : 'Kopieren hat nicht geklappt');
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

function getAllMeals() {
  return withMeals('readonly', (store) => store.getAll());
}

function getAllMealIds() {
  return withMeals('readonly', (store) => store.getAllKeys());
}

// Speichert viele Mahlzeiten in einem Rutsch (vorhandene mit gleicher Kennung werden ersetzt)
function putMeals(meals) {
  return withMeals('readwrite', (store) => {
    for (const meal of meals) store.put(meal);
  });
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

Mehrere Fotos:
- Der Nutzer kann mehrere Fotos derselben Mahlzeit schicken, z. B. aus verschiedenen Blickwinkeln, jedes Brot einzeln oder dazu die Verpackung. Alle Fotos zusammen sind eine Mahlzeit.
- Zähle nichts doppelt: Was auf mehreren Fotos zu sehen ist, kommt nur einmal in die Liste – außer die Fotos zeigen erkennbar verschiedene Portionen (z. B. zwei unterschiedliche Brote).
- Zeigt ein Foto eine Nährwerttabelle oder Verpackung, lies die Werte ab (meist pro 100 g) und ordne sie dem passenden Bestandteil zu. Rechne sie auf die angenommene Menge um und nenne das kurz in den Annahmen, z. B. „Cheddar: Werte von der Packung (404 kcal/100 g)“.
- Eine Verpackung allein ist kein eigener Bestandteil – sie liefert nur die Werte.

Wie du schätzt:
- Nutze Bezugsgrößen im Bild: Ein üblicher Essteller hat ca. 26–28 cm, eine Gabel ca. 19 cm, dazu Hand, Brotscheiben und Verpackungen.
- Gib für jeden Bestandteil die angenommene Menge so an, wie man sie sich vorstellt, mit Gramm oder Milliliter, z. B. „2 Scheiben, ca. 110 g“, „ca. 50 g“, „0,2 l“, „1 mittelgroßer, ca. 150 g“.
- Rechne mit typischen Nährwerten für genau diese Menge. Ist eine Nährwerttabelle oder Marke erkennbar, nutze deren Werte.
- Schätze realistische Alltagsportionen, nicht großzügig. Nimm bei Unsicherheit den wahrscheinlichsten Wert, nicht den höchsten.
- Öl, Butter und Soßen rechnest du nur in der Menge ein, die sichtbar ist oder für die Zubereitung üblich ist – nicht pauschal obendrauf.

Annahmen und Unsicherheiten (höchstens 3 Punkte, jeder ein kurzer Satz):
- Nur die Annahmen, die das Ergebnis am stärksten beeinflussen, wenn möglich mit Auswirkung, z. B. „Waren es zwei ganze Scheiben, kämen etwa +65 kcal dazu.“
- Was du gesehen, aber nicht gezählt hast, in einem Satz, z. B. „Tee und Pfirsich im Hintergrund nicht gezählt.“
- Nichts wiederholen, was schon in den Bestandteilen steht, und nichts dazu schreiben, ob das Essen zur vorherigen Mahlzeit gehört.

Kurz zuvor gespeicherte Mahlzeit:
- Nennt dir die Nachricht eine Mahlzeit, die gerade eben gespeichert wurde, beurteile in same_meal, ob das neue Essen zur selben Mahlzeit gehört: „ja“ bei Fortsetzung (zweites Brot, Nachschlag, Beilage, Getränk oder Obst dazu), „nein“ bei einer erkennbar eigenen Mahlzeit (z. B. Kaffee und Kuchen nach dem Mittagessen), sonst „unsicher“.
- Die Liste items enthält trotzdem nur das neue Essen, nicht die bereits gespeicherte Mahlzeit.
- combined_meal_name wird nicht mehr gebraucht: gib immer eine leere Zeichenkette zurück.
- Ohne solche Angabe: same_meal „nein“ und combined_meal_name leer.

Korrekturen und nachgereichte Fotos:
- Schickt der Nutzer eine Korrektur, übernimm sie genau so und gib die vollständige, aktualisierte Schätzung zurück: alle Bestandteile, nicht nur die geänderten. Passe die Annahmen an die Korrektur an.
- Reicht der Nutzer ein Foto nach (meist Nährwerttabelle oder Verpackung), ordne die Werte dem passenden vorhandenen Bestandteil zu und rechne ihn neu – füge keinen neuen Bestandteil hinzu, außer das Foto zeigt erkennbar zusätzliches Essen. Nenne in den Annahmen, welche Werte von der Packung stammen.

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
      description: 'Annahmen und Unsicherheiten, höchstens 3 kurze Sätze',
      items: { type: 'string' },
    },
    same_meal: {
      type: 'string',
      enum: ['ja', 'unsicher', 'nein'],
      description: 'Gehört das Essen zur kurz zuvor gespeicherten Mahlzeit? Ohne solche Angabe: „nein“.',
    },
    combined_meal_name: {
      type: 'string',
      description: 'Kurzer Name für beide Mahlzeiten zusammen; leer, wenn same_meal „nein“ ist oder keine frühere Mahlzeit genannt wurde',
    },
  },
  required: ['is_food', 'meal_name', 'items', 'assumptions', 'same_meal', 'combined_meal_name'],
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

// Erste Schätzung: ein oder mehrere Fotos + Beschreibung
async function estimateMeal(files, note, signal, recentMeal = null) {
  if (!getStoredKey()) {
    throw new EstimateError('Bitte trage zuerst in den Einstellungen (Zahnrad) deinen API-Schlüssel ein.');
  }

  let photos;
  try {
    photos = await Promise.all(files.map(preparePhoto));
  } catch {
    throw new EstimateError('Ein Foto konnte nicht gelesen werden. Bitte entfernen und neu hinzufügen.');
  }

  const content = [];
  photos.forEach((data, index) => {
    if (photos.length > 1) content.push({ type: 'text', text: `Foto ${index + 1} von ${photos.length}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  });
  content.push({ type: 'text', text: note ? `Beschreibung vom Nutzer: ${note}` : 'Keine Beschreibung vom Nutzer.' });
  if (recentMeal) {
    const minutes = Math.max(1, Math.round((mealTimeFor(new Date()) - lastActivity(recentMeal)) / 60_000));
    content.push({
      type: 'text',
      text:
        `Vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} wurde bereits gespeichert: „${recentMeal.name}“ ` +
        `(${recentMeal.items.map((i) => i.name).join(', ')}). Gehört das neue Essen zur selben Mahlzeit?`,
    });
  }

  return askClaude([{ role: 'user', content }], signal, { costCents: 0, corrections: 0 });
}

// Korrektur: bisheriges Gespräch + neue Nachricht, Claude rechnet alles neu
async function correctEstimate(estimate, correction, signal, files = []) {
  const request = correctionRequest(correction, files.length);
  const content = files.length
    ? [...(await extraPhotoBlocks(files)), { type: 'text', text: request }]
    : request;
  const messages = [...estimate.messages, { role: 'user', content }];
  return askClaude(messages, signal, {
    costCents: estimate.costCents,
    corrections: estimate.corrections + 1,
  });
}

// Text der Nachricht an Claude bei Korrektur und/oder nachgereichten Fotos
function correctionRequest(correction, photoCount) {
  const parts = [];
  if (photoCount) {
    parts.push(
      photoCount === 1
        ? 'Ich reiche ein Foto zu derselben Mahlzeit nach (z. B. Nährwerttabelle oder Verpackung).'
        : `Ich reiche ${photoCount} Fotos zu derselben Mahlzeit nach (z. B. Nährwerttabelle oder Verpackung).`
    );
  }
  if (correction) parts.push(`Korrektur vom Nutzer: ${correction}`);
  parts.push('Bitte gib die vollständige, aktualisierte Schätzung zurück.');
  return parts.join('\n');
}

// Nachgereichte Fotos als Bild-Bausteine für Claude, nummeriert
async function extraPhotoBlocks(files) {
  let photos;
  try {
    photos = await Promise.all(files.map(preparePhoto));
  } catch {
    throw new EstimateError('Ein Foto konnte nicht gelesen werden. Bitte ein anderes wählen.');
  }
  const blocks = [];
  photos.forEach((data, index) => {
    blocks.push({ type: 'text', text: `Nachgereichtes Foto ${index + 1} von ${photos.length}:` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  });
  return blocks;
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
    sameMeal: data.same_meal ?? 'nein',
    combinedName: data.combined_meal_name ?? '',
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
  $('key-summary-text').textContent = key ? `Eingerichtet · ${maskKey(key)}` : 'Nicht eingerichtet';
  // Ohne Schlüssel oder beim Ändern aufgeklappt, sonst eingeklappt
  if (editing || !key) $('key-details').open = true;
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

// ---------- Datensicherung: Export & Import ----------

const BACKUP_APP = 'kalorientracker';
const BACKUP_VERSION = 1;
const LAST_BACKUP_STORAGE = 'kt.lastBackup';
const BACKUP_DUE_DAYS = 5; // danach wird an die Sicherung erinnert

let preparedBackup = null; // vorbereitete Datei, damit das Teilen-Menü sofort aufgeht

async function buildBackupFile() {
  const meals = await getAllMeals();
  meals.sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    meals,
  };
  const name = `kalorientracker-sicherung-${dayKey(new Date())}.json`;
  return {
    file: new File([JSON.stringify(backup)], name, { type: 'application/json' }),
    count: meals.length,
  };
}

async function renderBackupInfo() {
  let count = 0;
  try {
    count = (await getAllMealIds()).length;
    preparedBackup = await buildBackupFile();
  } catch {
    preparedBackup = null;
  }

  let last = null;
  try {
    last = localStorage.getItem(LAST_BACKUP_STORAGE);
  } catch {
    // ohne Datum weiter
  }
  const info = $('backup-info');
  const mealsText = `${count} ${count === 1 ? 'Mahlzeit' : 'Mahlzeiten'} gespeichert.`;
  if (last) {
    const date = new Date(last).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    info.textContent = `${mealsText} Letzte Sicherung: ${date}.`;
    info.classList.toggle('warn', Date.now() - new Date(last) > BACKUP_DUE_DAYS * 86_400_000 && count > 0);
  } else {
    info.textContent = `${mealsText} Noch keine Sicherung.`;
    info.classList.toggle('warn', count > 0);
  }
}

function showBackupStatus(kind, text) {
  const status = $('backup-status');
  status.className = 'status ' + kind;
  status.textContent = text;
  status.hidden = false;
}

function rememberBackup() {
  try {
    localStorage.setItem(LAST_BACKUP_STORAGE, new Date().toISOString());
  } catch {
    // nicht schlimm
  }
}

// report(kind, text) meldet das Ergebnis: in den Einstellungen als Statuszeile, beim Banner als Kurzmeldung
async function onExport(report = showBackupStatus) {
  let backup = preparedBackup;
  try {
    backup ??= await buildBackupFile();
  } catch {
    report('error', 'Die Sicherung konnte nicht erstellt werden.');
    return;
  }
  if (backup.count === 0) {
    report('error', 'Es gibt noch keine Mahlzeiten zum Sichern.');
    return;
  }

  // iPhone: Teilen-Menü mit „In Dateien sichern“
  if (navigator.canShare?.({ files: [backup.file] })) {
    try {
      await navigator.share({ files: [backup.file] });
    } catch (err) {
      if (err.name === 'AbortError') return; // im Teilen-Menü abgebrochen
      if (err.name === 'NotAllowedError') {
        preparedBackup = backup; // beim nächsten Tippen sofort bereit
        report('error', 'Bitte nochmal tippen, um die Sicherung zu teilen.');
        return;
      }
      report('error', 'Das Teilen hat nicht geklappt. Bitte nochmal versuchen.');
      return;
    }
    backupDone(report, `Sicherung mit ${backup.count} Mahlzeiten erstellt.`);
    return;
  }

  // Sonst (z. B. am Computer): als Datei herunterladen
  const url = URL.createObjectURL(backup.file);
  const link = document.createElement('a');
  link.href = url;
  link.download = backup.file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  backupDone(report, `Sicherung mit ${backup.count} Mahlzeiten heruntergeladen.`);
}

function backupDone(report, text) {
  rememberBackup();
  report('ok', text);
  renderBackupInfo();
  renderBackupBanner();
}

// ---------- Hinweis-Banner: Sicherung fällig ----------

let bannerDismissed = false; // „×“ blendet den Hinweis bis zum nächsten Öffnen der App aus

function lastBackupDate() {
  try {
    const value = localStorage.getItem(LAST_BACKUP_STORAGE);
    return value ? new Date(value) : null;
  } catch {
    return null;
  }
}

async function renderBackupBanner() {
  const banner = $('backup-banner');
  const last = lastBackupDate();
  const daysSince = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
  const due = daysSince === null || daysSince >= BACKUP_DUE_DAYS;

  let count = 0;
  if (due && !bannerDismissed) {
    try {
      count = (await getAllMealIds()).length;
    } catch {
      count = 0;
    }
  }
  if (!due || bannerDismissed || count === 0) {
    banner.hidden = true;
    return;
  }

  $('backup-banner-text').textContent =
    daysSince === null
      ? 'Deine Mahlzeiten sind noch nicht gesichert.'
      : `Deine letzte Sicherung ist ${daysSince} Tage her.`;
  banner.hidden = false;

  // Datei schon vorbereiten, damit das Teilen-Menü beim Tippen sofort aufgeht
  try {
    preparedBackup = await buildBackupFile();
  } catch {
    preparedBackup = null;
  }
}

// Prüft eine Mahlzeit aus der Datei und bringt sie in eine saubere Form
function cleanImportedMeal(m) {
  const num = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string') return null;
  const eaten = new Date(m.eatenAt);
  if (isNaN(eaten)) return null;
  const items = Array.isArray(m.items)
    ? m.items
        .filter((i) => i && typeof i.name === 'string')
        .map((i) => ({
          name: i.name,
          portion: typeof i.portion === 'string' ? i.portion : '',
          kcal: num(i.kcal),
          protein: num(i.protein),
          carbs: num(i.carbs),
          fat: num(i.fat),
        }))
    : [];
  const totals = items.length
    ? sumNutrients(items)
    : { kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat) };
  return {
    id: m.id,
    eatenAt: eaten.toISOString(),
    day: dayKey(eaten),
    name: m.name,
    note: typeof m.note === 'string' ? m.note : '',
    items,
    assumptions: Array.isArray(m.assumptions) ? m.assumptions.filter((a) => typeof a === 'string') : [],
    ...totals,
    thumb: typeof m.thumb === 'string' && m.thumb.startsWith('data:image/') ? m.thumb : null,
    costCents: num(m.costCents),
    corrections: num(m.corrections),
    ...(isNaN(new Date(m.lastAddedAt)) ? {} : { lastAddedAt: new Date(m.lastAddedAt).toISOString() }),
    ...(typeof m.groupId === 'string' ? { groupId: m.groupId } : {}),
    ...(Number.isFinite(m.savedAt) ? { savedAt: m.savedAt } : {}),
  };
}

async function onImportFileChosen() {
  const file = $('backup-file').files[0];
  $('backup-file').value = '';
  if (!file) return;
  $('backup-status').hidden = true;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showBackupStatus('error', 'Diese Datei ist keine gültige Sicherung.');
    return;
  }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.meals)) {
    showBackupStatus('error', 'Diese Datei ist keine Sicherung aus dem Kalorientracker.');
    return;
  }

  const meals = data.meals.map(cleanImportedMeal).filter(Boolean);
  if (meals.length === 0) {
    showBackupStatus('error', 'In dieser Sicherung sind keine Mahlzeiten.');
    return;
  }

  let existing;
  try {
    existing = new Set(await getAllMealIds());
  } catch {
    showBackupStatus('error', 'Import hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  const added = meals.filter((m) => !existing.has(m.id)).length;
  const replaced = meals.length - added;
  const date = new Date(data.exportedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const question =
    `Sicherung vom ${date} mit ${meals.length} Mahlzeiten importieren?\n\n` +
    `${added} neu` +
    (replaced ? `, ${replaced} bereits vorhanden (werden durch den Stand der Sicherung ersetzt)` : '') +
    '.\nAndere Mahlzeiten bleiben unverändert.';
  if (!confirm(question)) return;

  try {
    await putMeals(meals);
  } catch {
    showBackupStatus('error', 'Import hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  showBackupStatus('ok', `Import fertig: ${added} neu, ${replaced} ersetzt.`);
  renderBackupInfo();
  renderToday();
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

const MAX_PHOTOS = 5; // jedes Foto kostet etwa 0,5 Cent mehr
let currentPhotos = []; // gewählte Fotos: { file, url }

function choosePhoto() {
  if (currentPhotos.length >= MAX_PHOTOS) {
    showToast(`Höchstens ${MAX_PHOTOS} Fotos pro Mahlzeit`);
    return;
  }
  const input = $('photo-input');
  input.value = ''; // damit dasselbe Foto erneut gewählt werden kann
  input.click();
}

function onPhotoChosen() {
  const files = [...$('photo-input').files].filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return; // Auswahl abgebrochen – nichts tun

  const firstPhoto = currentPhotos.length === 0;
  const room = MAX_PHOTOS - currentPhotos.length;
  for (const file of files.slice(0, room)) {
    currentPhotos.push({ file, url: URL.createObjectURL(file) });
  }
  if (files.length > room) showToast(`Höchstens ${MAX_PHOTOS} Fotos – ${files.length - room} nicht übernommen`);

  $('capture-status').hidden = true;
  renderPhotoGrid();
  if (firstPhoto) {
    $('meal-note').value = '';
    showView('capture');
  }
}

function removePhoto(index) {
  const [removed] = currentPhotos.splice(index, 1);
  URL.revokeObjectURL(removed.url);
  if (currentPhotos.length === 0) {
    cancelCapture();
    return;
  }
  renderPhotoGrid();
}

function renderPhotoGrid() {
  const grid = $('photo-grid');
  grid.replaceChildren();
  currentPhotos.forEach((photo, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = `Foto ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.setAttribute('aria-label', `Foto ${index + 1} entfernen`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removePhoto(index));
    tile.append(img, remove);
    grid.append(tile);
  });
  if (currentPhotos.length < MAX_PHOTOS) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'photo-add';
    add.innerHTML = '<span aria-hidden="true">+</span>Foto';
    add.setAttribute('aria-label', 'Weiteres Foto hinzufügen');
    add.addEventListener('click', choosePhoto);
    grid.append(add);
  }
  $('photo-hint').textContent =
    currentPhotos.length === 1
      ? '1 Foto · Tipp: Auch die Nährwerttabelle fotografieren – Claude ordnet die Werte zu.'
      : `${currentPhotos.length} Fotos`;
}

function cancelCapture() {
  for (const photo of currentPhotos) URL.revokeObjectURL(photo.url);
  currentPhotos = [];
  currentEstimate = null;
  mergeTarget = null;
  mergeChoice = null;
  mergeGroupInfo = null;
  $('photo-grid').replaceChildren();
  $('review-photo').removeAttribute('src');
  $('meal-note').value = '';
  $('capture-status').hidden = true;
  showView('today');
}

// ---------- Schätzen & Prüfen ----------

let currentEstimate = null;
let estimateAbort = null;

async function onEstimate() {
  if (currentPhotos.length === 0) return;
  $('capture-status').hidden = true;
  showLoading('Claude schätzt …');
  estimateAbort = new AbortController();

  try {
    const recent = await findRecentMeal();
    const result = await estimateMeal(
      currentPhotos.map((p) => p.file),
      $('meal-note').value.trim(),
      estimateAbort.signal,
      recent
    );
    if (!result.isFood) {
      showCaptureError('Kein Essen erkannt. Bitte ein Foto von deiner Mahlzeit machen.');
      return;
    }
    currentEstimate = result;
    setFixOpen('review', false);
    mergeTarget = recent;
    mergeChoice = recent && result.sameMeal === 'ja' ? 'merge' : null; // sicher → automatisch, sonst nachfragen
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

async function onCorrect(files = []) {
  const correction = $('correction-input').value.trim();
  if (!correction && files.length === 0) {
    showError('review-status', 'Schreib zuerst, was Claude ändern soll, oder reich ein Foto nach.');
    return;
  }
  $('correction-input').blur(); // Tastatur schließen
  $('review-status').hidden = true;
  showLoading(files.length ? 'Claude wertet das Foto aus …' : 'Claude rechnet neu …');
  estimateAbort = new AbortController();

  try {
    const result = await correctEstimate(currentEstimate, correction, estimateAbort.signal, files);
    if (!result.isFood) {
      showError('review-status', 'Nach der Korrektur ist kein Essen mehr übrig. Bitte anders formulieren.');
      return;
    }
    currentEstimate = result;
    if (mergeTarget && mergeChoice === null && result.sameMeal === 'ja') mergeChoice = 'merge';
    // Nachgereichte Fotos auch in die Fotoreihe übernehmen (falls Platz), damit „Zurück“ sie zeigt
    for (const file of files) {
      if (currentPhotos.length < MAX_PHOTOS) currentPhotos.push({ file, url: URL.createObjectURL(file) });
    }
    renderPhotoGrid();
    $('correction-input').value = '';
    setFixOpen('review', false);
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(files.length ? 'Foto ausgewertet' : 'Neu berechnet');
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
  if (mergeTarget && mergeChoice === null) {
    $('merge-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Bitte wähle „Dazu“ oder „Eigene Mahlzeit“');
    return;
  }
  $('review-save').disabled = true;
  const joinGroup = mergeTarget && mergeChoice === 'merge' ? mergeTarget : null;

  try {
    let thumb = null;
    try {
      thumb = await createThumbnail(currentPhotos[0].file);
    } catch {
      // Ohne Vorschaubild speichern ist besser als gar nicht
    }
    // Auf dem angezeigten Tag speichern (früherer Tag = nachtragen), mit aktueller Uhrzeit
    const now = mealTimeFor(new Date());
    // Ältere Einträge ohne Gruppe bekommen ihre eigene Kennung als Gruppe, damit der neue dazukommen kann
    if (joinGroup && !joinGroup.groupId) await putMeal({ ...(await getMeal(joinGroup.id)), groupId: joinGroup.id });
    const id = crypto.randomUUID();
    await addMeal({
      id,
      savedAt: Date.now(), // Reihenfolge bei gleicher Uhrzeit
      groupId: joinGroup ? groupIdOf(joinGroup) : id,
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

  const joinedLabel = joinGroup ? mergeGroupInfo?.label ?? 'Essen' : null; // vor dem Zurücksetzen merken
  cancelCapture(); // Foto und Eingaben zurücksetzen, zurück zur Tagesansicht
  await renderToday();
  if (joinedLabel) {
    showToast(`Zum ${joinedLabel} hinzugefügt`);
    return;
  }
  showToast(isShowingToday() ? 'Gespeichert' : `Gespeichert für ${dayTitle(shownDay())}`);
}

// ---------- Mahlzeiten zusammenfassen ----------

const MERGE_WINDOW_MIN = 60; // bis zu so vielen Minuten nach der letzten Mahlzeit wird Zusammenfassen angeboten

let mergeTarget = null; // kurz zuvor gespeicherte Mahlzeit, zu der das neue Essen gehören könnte
let mergeChoice = null; // 'merge', 'separate' oder null (= noch nicht entschieden)

// Zeitpunkt, zu dem eine neue Mahlzeit gespeichert wird: angezeigter Tag + aktuelle Uhrzeit
function mealTimeFor(clock) {
  const time = new Date(shownDay());
  time.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), 0);
  return time;
}

// Zuletzt an der Mahlzeit etwas dazugekommen (bei zusammengefassten: die letzte Ergänzung)
function lastActivity(meal) {
  return new Date(meal.lastAddedAt ?? meal.eatenAt);
}

async function findRecentMeal() {
  const now = mealTimeFor(new Date());
  let meals = [];
  try {
    meals = await getMealsForDay(dayKey(now));
  } catch {
    return null;
  }
  const candidates = meals.filter((m) => {
    const minutes = (now - lastActivity(m)) / 60_000;
    return minutes >= 0 && minutes <= MERGE_WINDOW_MIN;
  });
  candidates.sort((a, b) => lastActivity(b) - lastActivity(a));
  const recent = candidates[0] ?? null;
  mergeGroupInfo = recent ? groupMeals(meals).find((g) => g.id === groupIdOf(recent)) : null;
  return recent;
}

let mergeGroupInfo = null; // Gruppe der letzten Mahlzeit: Name, Startzeit, kcal

function renderMergeCard() {
  const card = $('merge-card');
  if (!mergeTarget || !currentEstimate) {
    card.hidden = true;
    return;
  }
  const group = mergeGroupInfo ?? { label: mealLabel(mergeTarget.eatenAt), start: mergeTarget.eatenAt, kcal: mergeTarget.kcal };
  const time = formatTime(group.start);
  const total = formatNumber(group.kcal + sumNutrients(currentEstimate.items).kcal);
  const text = $('merge-text');
  const yes = $('merge-yes');
  const no = $('merge-no');
  card.classList.toggle('ask', mergeChoice === null);
  if (mergeChoice === 'merge') {
    text.textContent = `Kommt zum ${group.label} von ${time} Uhr – dort dann ${total} kcal.`;
    yes.hidden = true;
    no.hidden = false;
    no.textContent = 'Eigene Mahlzeit';
  } else if (mergeChoice === 'separate') {
    text.textContent = `Wird eine eigene Mahlzeit (nicht zum ${group.label} von ${time} Uhr).`;
    yes.hidden = false;
    no.hidden = true;
    yes.textContent = `Doch zum ${group.label}`;
  } else {
    const doubt = currentEstimate.sameMeal === 'nein' ? 'Claude meint eher nicht.' : 'Claude ist sich nicht sicher.';
    text.textContent = `Gehört das zum ${group.label} von ${time} Uhr? ${doubt}`;
    yes.hidden = false;
    no.hidden = false;
    yes.textContent = 'Dazu';
    no.textContent = 'Eigene Mahlzeit';
  }
  card.hidden = false;
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
  setFixOpen('meal', false);
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
async function correctSavedMeal(meal, correction, signal, files = []) {
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
  const context =
    'Hier ist eine gespeicherte Schätzung einer Mahlzeit. Die ursprünglichen Fotos liegen nicht mehr vor, rechne deshalb auf Basis dieser Liste.\n\n' +
    (meal.note ? `Ursprüngliche Beschreibung vom Nutzer: ${meal.note}\n\n` : '') +
    `Gespeicherte Schätzung:\n${JSON.stringify(saved, null, 2)}`;
  const request = correctionRequest(correction, files.length);
  const content = files.length
    ? [{ type: 'text', text: context }, ...(await extraPhotoBlocks(files)), { type: 'text', text: request }]
    : `${context}\n\n${request}`;
  return askClaude([{ role: 'user', content }], signal, {
    costCents: meal.costCents ?? 0,
    corrections: (meal.corrections ?? 0) + 1,
  });
}

async function onMealCorrect(files = []) {
  const correction = $('meal-correction-input').value.trim();
  if (!correction && files.length === 0) {
    showError('meal-status', 'Schreib zuerst, was Claude ändern soll, oder reich ein Foto nach.');
    return;
  }
  $('meal-correction-input').blur();
  $('meal-status').hidden = true;
  showLoading(files.length ? 'Claude wertet das Foto aus …' : 'Claude rechnet neu …');
  estimateAbort = new AbortController();

  try {
    const result = await correctSavedMeal(openMealData, correction, estimateAbort.signal, files);
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
    setFixOpen('meal', false);
    renderMeal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(files.length ? 'Foto ausgewertet und gespeichert' : 'Neu berechnet und gespeichert');
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

// ---------- Korrektur auf- und zuklappen ----------

function setFixOpen(prefix, open) {
  $(prefix + '-fix').hidden = !open;
  $(prefix + '-fix-toggle').hidden = open;
}

// ---------- Foto nachreichen ----------

let extraPhotoTarget = 'review'; // 'review' = Prüfen-Bildschirm, 'meal' = gespeicherte Mahlzeit

function chooseExtraPhoto(target) {
  extraPhotoTarget = target;
  const input = $('extra-photo-input');
  input.value = '';
  input.click();
}

function onExtraPhotoChosen() {
  const files = [...$('extra-photo-input').files].filter((f) => f.type.startsWith('image/')).slice(0, MAX_PHOTOS);
  if (files.length === 0) return; // Auswahl abgebrochen
  if (extraPhotoTarget === 'meal') onMealCorrect(files);
  else onCorrect(files);
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
  renderMergeCard();
  $('review-photo').src = currentPhotos[0].url;
  renderEstimate('review', currentEstimate);
}

const MAX_VISIBLE_ASSUMPTIONS = 3; // mehr Annahmen nur auf Wunsch

// Zeigt Name, Einzelposten, Summe, Annahmen und Kosten in den Feldern <prefix>-…
function renderEstimate(prefix, est) {
  $(prefix + '-name').textContent = est.name;

  const assumptions = $(prefix + '-assumptions');
  const unique = [...new Set(est.assumptions)];
  assumptions.replaceChildren(
    ...unique.map((text, index) => {
      const li = document.createElement('li');
      li.textContent = text;
      li.hidden = index >= MAX_VISIBLE_ASSUMPTIONS;
      return li;
    })
  );
  if (unique.length > MAX_VISIBLE_ASSUMPTIONS) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'text-button more-button';
    more.textContent = `Alle ${unique.length} anzeigen`;
    more.addEventListener('click', () => {
      assumptions.querySelectorAll('li').forEach((li) => (li.hidden = false));
      more.remove();
    });
    const wrapper = document.createElement('li');
    wrapper.className = 'more-item';
    wrapper.append(more);
    assumptions.append(wrapper);
  }
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
    details.textContent = [
      item.portion,
      `P ${formatNumber(item.protein)} g`,
      `K ${formatNumber(item.carbs)} g`,
      `F ${formatNumber(item.fat)} g`,
    ]
      .filter(Boolean)
      .join(' · ');

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
  $('key-details').open = false;
  renderKeySection();
  $('backup-status').hidden = true;
  $('backup-info').textContent = '';
  renderBackupInfo();
  showView('settings');
});
$('backup-export').addEventListener('click', () => {
  $('backup-status').hidden = true;
  onExport();
});
$('banner-backup').addEventListener('click', () => onExport((kind, text) => showToast(text)));
$('banner-close').addEventListener('click', () => {
  bannerDismissed = true;
  $('backup-banner').hidden = true;
});
$('backup-import').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', onImportFileChosen);
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
$('photo-input').addEventListener('change', onPhotoChosen);
$('capture-cancel').addEventListener('click', cancelCapture);
$('estimate').addEventListener('click', onEstimate);
$('loading-cancel').addEventListener('click', () => estimateAbort?.abort());
$('review-back').addEventListener('click', () => showView('capture'));
$('review-discard').addEventListener('click', () => {
  if (confirm('Diese Schätzung verwerfen? Fotos und Ergebnis gehen verloren.')) cancelCapture();
});
$('review-fix-toggle').addEventListener('click', () => setFixOpen('review', true));
$('meal-fix-toggle').addEventListener('click', () => setFixOpen('meal', true));
$('correction-send').addEventListener('click', () => onCorrect());
$('correction-photo').addEventListener('click', () => chooseExtraPhoto('review'));
$('merge-yes').addEventListener('click', () => {
  mergeChoice = 'merge';
  renderMergeCard();
});
$('merge-no').addEventListener('click', () => {
  mergeChoice = 'separate';
  renderMergeCard();
});
$('meal-correction-photo').addEventListener('click', () => chooseExtraPhoto('meal'));
$('extra-photo-input').addEventListener('change', onExtraPhotoChosen);
$('review-save').addEventListener('click', onSaveMeal);
$('meal-done').addEventListener('click', closeMeal);
$('day-copy').addEventListener('click', enterSelectMode);
$('select-all').addEventListener('click', onSelectAll);
$('select-cancel').addEventListener('click', () => exitSelectMode());
$('select-copy').addEventListener('click', copySelected);
$('meal-copy').addEventListener('click', () => copyForBevel([openMealData]));
$('day-prev').addEventListener('click', () => changeDay(-1));
$('day-next').addEventListener('click', () => changeDay(1));
$('day-today').addEventListener('click', () => {
  selectedDay = null;
  renderToday();
});
$('meal-time').addEventListener('change', onMealTimeChange);
$('meal-correction-send').addEventListener('click', () => onMealCorrect());
$('meal-delete').addEventListener('click', onMealDelete);

// Wischen nach links/rechts wechselt den Tag (nicht in die Zukunft, nicht während der Auswahl)
let swipeStart = null;
$('view-today').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  swipeStart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
$('view-today').addEventListener('touchend', (e) => {
  if (!swipeStart || selectMode) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeStart.x;
  const dy = t.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // eher gescrollt als gewischt
  if (dx > 0) changeDay(-1);
  else if (!isShowingToday()) changeDay(1);
}, { passive: true });

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderToday();
});

renderToday();

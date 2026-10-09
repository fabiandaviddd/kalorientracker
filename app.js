// Kalorientracker – Verhalten der App

const $ = (id) => document.getElementById(id);

// Versionsnummer aus index.html (app.js?v=…), fürs Protokoll
const APP_VERSION = new URL(document.currentScript?.src ?? location.href).searchParams.get('v');

const TOUCH_SLOP = 10; // ab so vielen Pixeln Bewegung ist es kein Tippen mehr, und die Wischrichtung steht fest
const HOME_ZONE = 34; // unterster Streifen gehört iOS (App wechseln, Home) – dort beginnt kein Wischen der App

const inHomeZone = (touch) => touch.clientY > window.innerHeight - HOME_ZONE;

// ---------- Anzeige ----------

// Symbole, die app.js mehrfach einsetzt (wie in index.html)
const copyIcon = (size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2.25"/><path d="M16 8V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h1" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>`;
const closeIcon = (stroke) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/></svg>`;

// Angezeigter Tag: null = immer der aktuelle Tag (springt nach Mitternacht mit)
let selectedDay = null;
// Mahlzeiten des angezeigten Tages (für „Für Bevel kopieren“ ohne erneutes Laden)
let shownMeals = [];

function shownDay() {
  return selectedDay ?? new Date();
}

function isShowingToday() {
  return selectedDay === null;
}

// Zeigt den Tag, zu dem ein Zeitpunkt gehört (heute = mitlaufend); danach renderDay() aufrufen
function showDayOf(date) {
  if (dayKey(date) !== dayKey(shownDay())) selectedDay = dayKey(date) === dayKey(new Date()) ? null : date;
}

function changeDay(delta) {
  exitSelectMode();
  const day = new Date(shownDay());
  day.setDate(day.getDate() + delta);
  selectedDay = dayKey(day) >= dayKey(new Date()) ? null : day; // nicht in die Zukunft
  return renderDay();
}

// ---------- Tageswechsel mit Bewegung ----------

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setDayOffset(x, animate) {
  const el = $('day-content');
  el.style.transition = animate ? 'transform 0.2s ease' : 'none';
  el.style.transform = x ? `translateX(${x}px)` : '';
}

// Pfeile: neuer Tag gleitet von der passenden Seite herein (schnelles Tippen bleibt möglich)
async function stepDay(delta) {
  await changeDay(delta);
  if (reduceMotion()) return;
  setDayOffset(delta < 0 ? -60 : 60, false);
  void $('day-content').offsetWidth; // Startposition übernehmen, dann losgleiten
  setDayOffset(0, true);
}

// Wischen: alter Tag gleitet hinaus, neuer herein
let daySliding = false;
async function swipeToDay(delta) {
  if (reduceMotion()) {
    setDayOffset(0, false);
    await changeDay(delta);
    return;
  }
  daySliding = true;
  const out = delta < 0 ? window.innerWidth : -window.innerWidth;
  setDayOffset(out, true);
  await pause(180);
  await changeDay(delta);
  setDayOffset(-out * 0.35, false);
  void $('day-content').offsetWidth;
  setDayOffset(0, true);
  daySliding = false;
}

// Zeigt den gewählten Tag: Titel, Nährwerttabelle, Mahlzeiten, Hinweise
async function renderDay() {
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
  // Überschrift der Tabelle passend zum Tag („Nährwerte heute“, „Nährwerte gestern“, „Nährwerte Fr., 25. Sept.“)
  const title = dayTitle(day);
  document.querySelector('.totals').dataset.label = 'Nährwerte ' + (/^[A-ZÄÖÜ][a-zäöü]+$/.test(title) ? title.toLowerCase() : title);
  renderMealList(meals);
  renderBackupBanner();
  $('key-banner').hidden = Boolean(getStoredKey()); // ohne Schlüssel kann die App nicht schätzen
}

// ---------- Für Bevel kopieren ----------

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
  $('fab-row').hidden = selectMode;
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

function renderMealList(meals) {
  const list = $('meal-list');
  swipedRow = null; // Zeilen werden neu gebaut
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
    share.innerHTML = copyIcon(20);
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
  row.addEventListener('click', () => {
    if (row.dataset.swiped) return;
    if (swipedRow) return closeSwipedRow(); // erst zuklappen, nicht gleich öffnen
    if (selectMode) toggleSelected(meal.id);
    else openMeal(meal.id);
  });

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
  const time = formatTime(meal.eatenAt);
  details.textContent =
    `${time} Uhr · P ${formatNumber(meal.protein)} g · KH ${formatNumber(meal.carbs)} g · F ${formatNumber(meal.fat)} g`;
  details.setAttribute('aria-label', `${time} Uhr, ${spokenNutrients(meal)}`);
  text.append(top, details);

  const chevron = document.createElement('span');
  chevron.className = 'meal-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';

  row.append(check, img, text, chevron);

  // Nach links wischen legt „Bevel“ und „Löschen“ frei (wie in iPhone-Listen)
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrap';
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'swipe-action copy';
  copy.innerHTML = `${copyIcon(22)}<span>Bevel</span>`;
  copy.addEventListener('click', () => {
    closeSwipedRow();
    copyForBevel([meal]);
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'swipe-action delete';
  del.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg><span>Löschen</span>`;
  del.addEventListener('click', () => deleteFromList(meal));
  actions.append(copy, del);
  wrap.append(actions, row);
  return wrap;
}

async function deleteFromList(meal) {
  swipedRow = null;
  await deleteWithUndo(meal);
}

// Löscht sofort und bietet ein paar Sekunden lang „Rückgängig“ an (statt vorher nachzufragen)
async function deleteWithUndo(meal) {
  try {
    await deleteMeal(meal.id);
  } catch {
    showToast('Löschen hat nicht geklappt. Bitte nochmal versuchen.');
    return false;
  }
  await renderDay();
  undoToast(
    `„${shortName(meal.name)}“ gelöscht`,
    async () => {
      await putMeal(meal);
      await renderDay();
    },
    { done: 'Wiederhergestellt', failed: 'Wiederherstellen hat nicht geklappt' }
  );
  return true;
}

// ---------- Wischen auf einer Mahlzeit ----------

// Entscheidet beim ersten Bewegen: waagerecht gewischt (true), senkrecht gescrollt (false) oder noch unklar (null).
// rightOnly: nur Wischen nach rechts zählt (Zurück vom linken Rand)
function swipeDirection(dx, dy, rightOnly = false) {
  const along = rightOnly ? dx : Math.abs(dx);
  if (Math.abs(dy) > TOUCH_SLOP && Math.abs(dy) > along) return false;
  return along < TOUCH_SLOP ? null : true;
}

const SWIPE_OPEN = 164; // Breite der beiden Aktionen: 2 × .swipe-action (82 px, styles.css)
let swipedRow = null; // gerade geöffnete Zeile
let rowSwipe = null;

function setRowOffset(row, x, animate) {
  row.style.transition = animate ? 'transform 0.25s ease' : 'none';
  row.style.transform = x ? `translateX(${x}px)` : '';
  // Aktionen nur zeigen, solange die Zeile verschoben ist (nach dem Zuklappen erst am Ende der Bewegung ausblenden)
  const wrap = row.parentElement;
  clearTimeout(wrap.hideTimer);
  if (x) wrap.classList.add('reveal');
  else wrap.hideTimer = setTimeout(() => wrap.classList.remove('reveal'), animate ? 260 : 0);
}

function closeSwipedRow() {
  if (swipedRow) setRowOffset(swipedRow, 0, true);
  swipedRow = null;
}

// Tippen außerhalb der geöffneten Zeile klappt sie wieder zu
document.addEventListener('touchstart', (e) => {
  if (swipedRow && !swipedRow.parentElement.contains(e.target)) closeSwipedRow();
}, { passive: true });

$('meal-list').addEventListener('touchstart', (e) => {
  const row = e.target.closest('.meal-row');
  const t = e.touches[0];
  if (!row || selectMode || e.touches.length !== 1 || inHomeZone(t)) return (rowSwipe = null);
  rowSwipe = { row, x: t.clientX, y: t.clientY, base: row === swipedRow ? -SWIPE_OPEN : 0, dx: 0, active: false };
}, { passive: true });

$('meal-list').addEventListener('touchmove', (e) => {
  if (!rowSwipe) return;
  const t = e.touches[0];
  const dx = t.clientX - rowSwipe.x;
  const dy = t.clientY - rowSwipe.y;
  if (!rowSwipe.active) {
    const direction = swipeDirection(dx, dy);
    if (direction === false) return (rowSwipe = null); // scrollt
    if (direction === null) return;
    rowSwipe.active = true;
    if (swipedRow && swipedRow !== rowSwipe.row) closeSwipedRow();
  }
  e.preventDefault();
  rowSwipe.dx = dx;
  let x = rowSwipe.base + dx;
  if (x > 0) x = 0;
  if (x < -SWIPE_OPEN) x = -SWIPE_OPEN + (x + SWIPE_OPEN) / 3; // gummiartig über das Ende hinaus
  setRowOffset(rowSwipe.row, x, false);
}, { passive: false });

$('meal-list').addEventListener('touchend', () => {
  if (!rowSwipe?.active) return (rowSwipe = null);
  const { row, base, dx } = rowSwipe;
  rowSwipe = null;
  const open = base + dx < -SWIPE_OPEN / 2;
  setRowOffset(row, open ? -SWIPE_OPEN : 0, true);
  swipedRow = open ? row : null;
  // den Klick, der nach dem Wischen kommt, nicht als „Öffnen“ werten
  row.dataset.swiped = '1';
  setTimeout(() => delete row.dataset.swiped, 400);
});

// iOS übernimmt die Geste (z. B. App wechseln): Zeile dorthin zurück, wo sie vorher war
function cancelRowSwipe() {
  if (rowSwipe?.active) {
    logEvent('geste abgebrochen', { art: 'zeile' });
    setRowOffset(rowSwipe.row, rowSwipe.base, true);
    swipedRow = rowSwipe.base ? rowSwipe.row : null;
  }
  rowSwipe = null;
}
$('meal-list').addEventListener('touchcancel', cancelRowSwipe);

// ---------- Mahlzeit-Gruppen (Frühstück, Mittagessen …) ----------

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
const DB_VERSION = 2;
const MEAL_STORE = 'meals';
const DRAFT_STORE = 'draft'; // nicht gespeicherte Mahlzeit, damit sie das Beenden der App übersteht

let dbPromise;
function openDb() {
  if (dbPromise) return dbPromise;
  const opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        const store = db.createObjectStore(MEAL_STORE, { keyPath: 'id' });
        store.createIndex('day', 'day');
      }
      if (event.oldVersion < 2) db.createObjectStore(DRAFT_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Verbindung weg (z. B. von iOS im Hintergrund geschlossen): beim nächsten Zugriff neu öffnen
      db.onclose = () => forgetDb(opening);
      db.onversionchange = () => {
        db.close();
        forgetDb(opening);
      };
      resolve(db);
    };
    request.onerror = () => {
      forgetDb(opening);
      reject(request.error);
    };
  });
  dbPromise = opening;
  return opening;
}

// Vergisst eine Verbindung – aber nur, wenn inzwischen keine neuere geöffnet wurde
function forgetDb(opening) {
  if (dbPromise === opening) dbPromise = undefined;
}

// Steigt bei jeder Änderung an Mahlzeiten oder Favoriten – so weiß die Sicherung, ob sie noch aktuell ist
let dataVersion = 0;

// Führt eine Aktion auf einer Tabelle aus und wartet, bis sie sicher gespeichert ist
async function withStore(name, mode, action, retry = true) {
  const opening = openDb();
  const db = await opening;
  let tx;
  try {
    tx = db.transaction(name, mode);
  } catch (err) {
    // Verbindung wurde inzwischen geschlossen: einmal neu verbinden (es wurde noch nichts geschrieben)
    if (!retry) throw err;
    forgetDb(opening);
    return withStore(name, mode, action, false);
  }
  return new Promise((resolve, reject) => {
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => {
      if (mode === 'readwrite' && name === MEAL_STORE) dataVersion++;
      resolve(request?.result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const withMeals = (mode, action) => withStore(MEAL_STORE, mode, action);
const withDraft = (mode, action) => withStore(DRAFT_STORE, mode, action);

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

// Nur die Anzahl – ohne alle Mahlzeiten zu laden
function countMeals() {
  return withMeals('readonly', (store) => store.count());
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

// Bittet den Browser, die Daten nicht von selbst zu löschen
navigator.storage?.persist?.().catch(() => {});

// Schreibt Summen in die Felder <prefix>-kcal, <prefix>-protein, …
function renderTotals(prefix, totals) {
  $(prefix + '-kcal').textContent = formatNumber(totals.kcal);
  $(prefix + '-protein').textContent = formatNumber(totals.protein) + ' g';
  $(prefix + '-carbs').textContent = formatNumber(totals.carbs) + ' g';
  $(prefix + '-fat').textContent = formatNumber(totals.fat) + ' g';
}

// ---------- Claude-API ----------

// Offizielles Anthropic-SDK, fest in der App mitgeliefert (vendor/, gebündelt – s. vendor/LIZENZEN.txt):
// kein fremder Server kann Code nachschieben, und die Schutzregel (CSP) erlaubt nur eigene Skripte
const SDK_URL = './vendor/anthropic-sdk-0.128.0.mjs';
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
const THUMB_SIZE = 180; // Vorschaubild in der Liste: 3 × 60 px (.meal-thumb), scharf auf Retina-Displays
const VIEW_PHOTO_SIZE = 720; // größeres Foto für die Seite „Mahlzeit“ (ca. 50 KB)

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

Ohne Foto:
- Manchmal gibt es kein Foto, nur eine Beschreibung – z. B. ein selbst gemixter Shake. Schätze dann allein anhand der Beschreibung, mit typischen Nährwerten für die genannten Mengen und Marken.
- Fehlt eine Menge, nimm eine übliche Portion an und nenne das in den Annahmen.

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
- Ohne solche Angabe: same_meal „nein“.

Meine Lebensmittel (gespeicherte Packungswerte):
- Die Nachricht kann eine Liste „Meine Lebensmittel“ enthalten: Produkte, die der Nutzer oft isst, mit Werten je 100 g bzw. 100 ml und oft einer Portionsangabe (z. B. „1 Scheibe ≈ 10 g“).
- Nimm diese Werte, wenn klar dasselbe Produkt gemeint ist: Packung oder Marke ist zu sehen, die Beschreibung nennt es, oder es ist eindeutig erkennbar dasselbe (z. B. dieselbe Käse- oder Aufschnittsorte auf dem Brot). Nutze die Portionsangabe als Anhalt für die Menge und trage die Kennung (z. B. „L3“) in used_saved_foods ein.
- Im Zweifel schätze mit typischen Werten und nenne in einer Annahme, welches gespeicherte Produkt es sein könnte.
- Steht ein Produkt auf einem Foto mit lesbarer Nährwerttabelle, gelten die Werte vom Foto.

Packungswerte merken (package_foods):
- Liest du Nährwerte von einer Packung oder Nährwerttabelle ab oder nennt der Nutzer ausdrücklich Werte je 100 g bzw. 100 ml, trage das Produkt in package_foods ein: Name zum Wiedererkennen (Sorte und Marke, falls lesbar, z. B. „Räucherschmelzkäse natur (Milbona)“), Einheit, Werte je 100 g bzw. 100 ml, dazu kurz, was die Packung über Portionen sagt (z. B. „Packung 80 g, 8 Scheiben, 1 Scheibe ≈ 10 g“) – sonst leer lassen.
- Entspricht es einem gespeicherten Lebensmittel, verwende genau dessen Namen.
- Geschätzte oder typische Werte gehören nicht hinein, nur abgelesene oder vom Nutzer genannte. Sonst bleibt package_foods leer.
- Bei einer Korrektur gib package_foods vollständig zurück: alle in diesem Gespräch abgelesenen Produkte, die nach der Korrektur noch stimmen (mit berichtigten Werten). Was sich als falsch herausgestellt hat, lässt du weg.

Korrekturen und nachgereichte Fotos:
- Schickt der Nutzer eine Korrektur, übernimm sie genau so und gib die vollständige, aktualisierte Schätzung zurück: alle Bestandteile, nicht nur die geänderten. Passe die Annahmen an die Korrektur an.
- Reicht der Nutzer ein Foto nach (meist Nährwerttabelle oder Verpackung), ordne die Werte dem passenden vorhandenen Bestandteil zu und rechne ihn neu – füge keinen neuen Bestandteil hinzu, außer das Foto zeigt erkennbar zusätzliches Essen. Nenne in den Annahmen, welche Werte von der Packung stammen.

Schreibe alles auf Deutsch, knapp und in ganzen Sätzen. Ist auf dem Foto weder Essen noch ein Getränk zu erkennen, setze is_food auf false und lasse items leer.`;

// Abgelesene Packungswerte (auch für „Packung fotografieren“)
const PACKAGE_FOODS_SCHEMA = {
  type: 'array',
  description: 'Produkte, deren Nährwerte du von einer Packung abgelesen hast oder die der Nutzer je 100 g/ml nennt',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Sorte und Marke, z. B. „Räucherschmelzkäse natur (Milbona)“' },
      unit: { type: 'string', enum: ['g', 'ml'] },
      kcal_100: { type: 'number' },
      protein_100_g: { type: 'number' },
      carbs_100_g: { type: 'number' },
      fat_100_g: { type: 'number' },
      portion_note: { type: 'string', description: 'Was die Packung über Portionen sagt, z. B. „Packung 80 g, 8 Scheiben“ – sonst leer' },
    },
    required: ['name', 'unit', 'kcal_100', 'protein_100_g', 'carbs_100_g', 'fat_100_g', 'portion_note'],
    additionalProperties: false,
  },
};

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
    used_saved_foods: {
      type: 'array',
      description: 'Kennungen (z. B. „L3“) der gespeicherten Lebensmittel, deren Werte du genutzt hast',
      items: { type: 'string' },
    },
    package_foods: PACKAGE_FOODS_SCHEMA,
  },
  required: ['is_food', 'meal_name', 'items', 'assumptions', 'same_meal', 'used_saved_foods', 'package_foods'],
  additionalProperties: false,
};

// Verkleinert die Fotos für Claude, eines nach dem anderen (mehrere volle Kamerafotos gleichzeitig
// im Speicher bringen ältere iPhones ins Schwitzen); liefert JPEG als Base64 ohne „data:“-Vorspann
async function preparePhotos(files) {
  const photos = [];
  for (const file of files) photos.push(await withImage(file, (img) => drawPhoto(img, PHOTO_MAX_SIDE, false, 0.85).split(',')[1]));
  return photos;
}

// Vorschaubild (klein, quadratisch) und größeres Foto für die Seite „Mahlzeit“ – das Foto wird dafür nur einmal gelesen
function savedPhotos(file) {
  return withImage(file, (img) => ({ thumb: drawPhoto(img, THUMB_SIZE, true, 0.7), photo: drawPhoto(img, VIEW_PHOTO_SIZE, false, 0.6) }));
}

// Liest ein Foto ein und reicht es an draw weiter (wartet auf onload – zuverlässiger als img.decode(), das in Hintergrund-Tabs hängen kann)
async function withImage(file, draw) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    return draw(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Zeichnet das Foto verkleinert (optional quadratisch zugeschnitten) und liefert eine JPEG-data:-URL
function drawPhoto(img, maxSide, square, quality) {
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
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  canvas.width = canvas.height = 0; // Speicher der Zeichenfläche sofort freigeben (iOS hält ihn sonst lange)
  return dataUrl;
}

class EstimateError extends Error {}

// Erste Schätzung: ein oder mehrere Fotos + Beschreibung
async function estimateMeal(files, note, signal, recentMeal = null) {
  if (!getStoredKey()) {
    throw new EstimateError('Bitte trage zuerst in den Einstellungen (Zahnrad) deinen API-Schlüssel ein.');
  }

  let photos;
  try {
    photos = await preparePhotos(files);
  } catch {
    throw new EstimateError('Ein Foto konnte nicht gelesen werden. Bitte entfernen und neu hinzufügen.');
  }

  const foods = foodsForClaude(getFoods());
  const content = foods.text ? [{ type: 'text', text: foods.text }] : [];
  photos.forEach((data, index) => {
    if (photos.length > 1) content.push({ type: 'text', text: `Foto ${index + 1} von ${photos.length}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  });
  if (photos.length === 0) content.push({ type: 'text', text: 'Kein Foto – schätze nur anhand der Beschreibung.' });
  content.push({ type: 'text', text: note ? `Beschreibung vom Nutzer: ${note}` : 'Keine Beschreibung vom Nutzer.' });
  if (recentMeal) {
    const minutes = Math.max(1, Math.round((captureMoment() - lastActivity(recentMeal)) / MINUTE_MS));
    content.push({
      type: 'text',
      text:
        `Vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} wurde bereits gespeichert: „${recentMeal.name}“ ` +
        `(${recentMeal.items.map((i) => i.name).join(', ')}). Gehört das neue Essen zur selben Mahlzeit?`,
    });
  }

  return askClaude([{ role: 'user', content }], signal, { costCents: 0, corrections: 0, foodKeys: foods.keys }, {
    art: 'schätzen',
    fotos: photos.length,
    text: note,
    letzteMahlzeit: recentMeal ? 'ja' : 'nein',
  });
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
    foodKeys: estimate.foodKeys,
  }, { art: files.length ? 'foto nachreichen' : 'korrektur', fotos: files.length, text: correction, nr: estimate.corrections + 1 });
}

// Nachgereichte Fotos als Bild-Bausteine für Claude, nummeriert
async function extraPhotoBlocks(files) {
  let photos;
  try {
    photos = await preparePhotos(files);
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

// Eine Anfrage an Claude mit Protokolleintrag: info (Art, Fotos, Text) plus Dauer, Modell, Kosten und Ergebnis.
// run(entry) stellt die Anfrage, describe(result) ergänzt den Eintrag um das Ergebnis.
async function loggedClaude(info, signal, run, describe) {
  const entry = { ...info };
  const started = Date.now();
  try {
    const result = await run(entry);
    Object.assign(entry, describe(result));
    return result;
  } catch (err) {
    entry.ergebnis = signal?.aborted ? 'abgebrochen' : err.message;
    throw err;
  } finally {
    entry.ms = Date.now() - started;
    logEvent('claude', entry);
  }
}

// Schickt eine Anfrage mit fester Antwortform (schema) und liefert die gelesene Antwort samt Kosten
async function requestClaude({ system, schema, messages }, signal, entry) {
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
          format: { type: 'json_schema', schema },
        },
        system,
        messages,
      },
      { signal }
    );
  } catch (err) {
    if (Anthropic && err instanceof Anthropic.APIUserAbortError) throw err;
    entry.fehler = `${err.name}${err.status ? ' ' + err.status : ''}: ${err.message}`;
    throw new EstimateError(describeError(err, Anthropic));
  }

  const usage = response.usage;
  const costCents =
    ((usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)) * PRICE_INPUT +
      usage.output_tokens * PRICE_OUTPUT) /
    1_000_000 *
    100;
  Object.assign(entry, { modell: response.model, stopp: response.stop_reason, tokensRein: usage.input_tokens, tokensRaus: usage.output_tokens, cent: costCents });

  if (response.stop_reason === 'refusal') {
    throw new EstimateError('Claude hat die Anfrage abgelehnt. Bitte anders formulieren oder ein anderes Foto versuchen.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new EstimateError('Die Antwort war unvollständig. Bitte nochmal versuchen.');
  }

  let data;
  try {
    data = JSON.parse(response.content.find((b) => b.type === 'text').text);
  } catch {
    throw new EstimateError('Die Antwort von Claude war nicht lesbar. Bitte nochmal versuchen.');
  }
  // Antwort prüfen, statt ihr blind zu vertrauen (ein Ersatzmodell kann vom Schema abweichen)
  if (!data || typeof data !== 'object') {
    throw new EstimateError('Die Antwort von Claude war nicht lesbar. Bitte nochmal versuchen.');
  }
  return { data, response, costCents };
}

// Schickt das Gespräch an Claude und liefert die Schätzung samt fortgeführtem Gespräch
function askClaude(messages, signal, previous, info) {
  return loggedClaude(info, signal, (entry) => askClaudeOnce(messages, signal, previous, entry), (result) => ({
    ergebnis: result.isFood ? 'ok' : 'kein Essen',
    kcal: sumNutrients(result.items).kcal,
    zusammen: result.sameMeal,
  }));
}

async function askClaudeOnce(messages, signal, previous, entry) {
  const { data, response, costCents } = await requestClaude({ system: ESTIMATE_SYSTEM, schema: ESTIMATE_SCHEMA, messages }, signal, entry);
  const items = (Array.isArray(data.items) ? data.items : [])
    .filter((i) => i && typeof i.name === 'string' && i.name.trim())
    .map((i) => ({
      name: i.name.trim(),
      portion: typeof i.portion === 'string' ? i.portion : '',
      kcal: safeNumber(i.kcal),
      protein: safeNumber(i.protein_g),
      carbs: safeNumber(i.carbs_g),
      fat: safeNumber(i.fat_g),
    }));
  const name = typeof data.meal_name === 'string' && data.meal_name.trim() ? data.meal_name.trim() : items[0]?.name ?? 'Mahlzeit';
  // Abgelesene Packungswerte: jede Antwort liefert die vollständige, aktuelle Liste (eine Korrektur kann Falsches streichen);
  // gemerkt werden sie erst beim Speichern
  const read = (Array.isArray(data.package_foods) ? data.package_foods : []).map((f) => cleanFood(f)).filter(Boolean);
  const packageFoods = mergeFoods([], read, { newId: () => null }).list;
  const foodKeys = previous.foodKeys ?? {};
  const usedFoods = [...new Set((Array.isArray(data.used_saved_foods) ? data.used_saved_foods : []).map((k) => foodKeys[k]).filter(Boolean))];
  Object.assign(entry, { gelesen: read.map((f) => f.name).join(', '), genutzt: usedFoods.join(', ') });

  return {
    isFood: data.is_food === true && items.length > 0,
    name,
    sameMeal: ['ja', 'unsicher', 'nein'].includes(data.same_meal) ? data.same_meal : 'nein',
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.filter((a) => typeof a === 'string') : [],
    items,
    // Antwort unverändert anhängen, damit Claude bei einer Korrektur den ganzen Verlauf kennt
    messages: [...messages, { role: 'assistant', content: response.content }],
    costCents: previous.costCents + costCents,
    corrections: previous.corrections,
    packageFoods,
    usedFoods,
    foodKeys,
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
  logEvent(kind === 'error' ? 'fehler' : 'meldung', { wo: 'schlüssel', text });
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

async function onRemoveKey() {
  if (!(await askSheet('Schlüssel von diesem iPhone entfernen? Danach kann die App nicht mehr schätzen.', 'Schlüssel entfernen'))) return;
  setStoredKey('');
  renderKeySection();
  showKeyStatus('ok', 'Schlüssel entfernt.');
}

// ---------- Datensicherung: Export & Import ----------

const BACKUP_APP = 'kalorientracker';
const BACKUP_VERSION = 1;
const LAST_BACKUP_STORAGE = 'kt.lastBackup';
const BACKUP_DUE_DAYS = 5; // danach wird an die Sicherung erinnert

let preparedBackup = null; // fertige, aktuelle Datei, damit das Teilen-Menü sofort aufgeht
let backupBuild = null; // laufender oder fertiger Aufbau: { key, promise }

// Eine Sicherung bleibt gültig, solange sich nichts geändert hat und es derselbe Tag ist (Datum steht in der Datei)
function backupKey() {
  return `${dataVersion}/${dayKey(new Date())}`;
}

// Baut die Sicherung nur, wenn sich seit dem letzten Aufbau etwas geändert hat (sonst wird der vorhandene wiederverwendet)
function prepareBackup() {
  if (backupBuild?.key !== backupKey()) {
    const key = backupKey();
    const promise = buildBackupFile().then((backup) => {
      const result = { ...backup, key };
      if (key === backupKey()) preparedBackup = result;
      return result;
    });
    promise.catch(() => {
      if (backupBuild?.promise === promise) backupBuild = null;
    });
    backupBuild = { key, promise };
  }
  return backupBuild.promise;
}

// Die vorbereitete Datei – nur, wenn sie noch alle aktuellen Mahlzeiten enthält und von heute ist
function currentBackup() {
  return preparedBackup?.key === backupKey() ? preparedBackup : null;
}

async function buildBackupFile() {
  const meals = await getAllMeals();
  meals.sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    meals,
    favorites: getFavorites(),
    foods: getFoods(),
    log: readLog(), // nur zum Nachvollziehen am Mac – der Import übernimmt es nicht
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
    count = await countMeals();
  } catch {
    // ohne Anzahl weiter
  }
  if (count > 0) prepareBackup().catch(() => {}); // im Hintergrund, damit „Exportieren“ sofort teilen kann

  const last = lastBackupDate();
  const info = $('backup-info');
  const mealsText = `${mealCount(count)} gespeichert.`;
  if (last) {
    const date = last.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    const due = Date.now() - last > BACKUP_DUE_DAYS * DAY_MS && count > 0;
    info.textContent = `${mealsText} Letzte Sicherung: ${date}.` + (due ? ' Bitte bald sichern.' : '');
    info.classList.toggle('warn', due);
  } else {
    info.textContent = `${mealsText} Noch keine Sicherung.` + (count > 0 ? ' Bitte bald sichern.' : '');
    info.classList.toggle('warn', count > 0);
  }
}

// Ob iOS die Daten dauerhaft behält oder bei knappem Speicherplatz selbst löschen darf
async function renderStorageInfo() {
  const info = $('storage-info');
  let persisted;
  try {
    persisted = await navigator.storage?.persisted?.();
  } catch {
    persisted = undefined;
  }
  info.hidden = typeof persisted !== 'boolean';
  info.textContent = persisted
    ? 'Speicher geschützt: iOS löscht die Mahlzeiten nicht von selbst.'
    : 'Speicher nicht geschützt: iOS darf die Mahlzeiten bei knappem Speicherplatz löschen – deshalb regelmäßig sichern.';
}

function showBackupStatus(kind, text) {
  logEvent(kind === 'error' ? 'fehler' : 'meldung', { wo: 'sicherung', text });
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
  let backup = currentBackup();
  try {
    backup ??= await prepareBackup();
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
        report('error', 'Bitte nochmal tippen, um die Sicherung zu teilen.');
        return;
      }
      report('error', 'Das Teilen hat nicht geklappt. Bitte nochmal versuchen.');
      return;
    }
    backupDone(report, `Sicherung mit ${mealCount(backup.count)} erstellt.`);
    return;
  }

  // Sonst (z. B. am Computer): als Datei herunterladen
  const url = URL.createObjectURL(backup.file);
  const link = document.createElement('a');
  link.href = url;
  link.download = backup.file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  backupDone(report, `Sicherung mit ${mealCount(backup.count)} heruntergeladen.`);
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
  const daysSince = last ? Math.floor((Date.now() - last) / DAY_MS) : null;
  const due = daysSince === null || daysSince >= BACKUP_DUE_DAYS;

  let count = 0;
  if (due && !bannerDismissed) {
    try {
      count = await countMeals();
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

  // Datei schon vorbereiten, damit das Teilen-Menü beim Tippen sofort aufgeht (nur neu, wenn sich etwas geändert hat)
  prepareBackup().catch(() => {});
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
  if (Number.isFinite(data.version) && data.version > BACKUP_VERSION) {
    showBackupStatus('error', 'Diese Sicherung stammt aus einer neueren Version der App. Bitte die App zuerst aktualisieren (schließen und neu öffnen).');
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
  const exported = new Date(data.exportedAt);
  const from = isNaN(exported) ? 'Sicherung' : `Sicherung vom ${exported.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const question =
    `${from} mit ${mealCount(meals.length)} importieren?\n\n` +
    `${added} neu` +
    (replaced ? `, ${replaced} bereits vorhanden (werden durch den Stand der Sicherung ersetzt)` : '') +
    '.\nAndere Mahlzeiten bleiben unverändert.';
  if (!(await askSheet(question, 'Importieren', { danger: false }))) return;

  try {
    await putMeals(meals);
  } catch {
    showBackupStatus('error', 'Import hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  // Lebensmittel aus der Sicherung ergänzen (vorhandene behalten ihre Werte)
  const foods = Array.isArray(data.foods) ? data.foods.map((f) => cleanFood(f)).filter(Boolean) : [];
  const merged = mergeFoods(getFoods(), foods, { keepExisting: true });
  const foodsAdded = merged.added.length && setFoods(merged.list) ? merged.added.length : 0;
  // Favoriten aus der Sicherung ergänzen (vorhandene bleiben)
  const done = `Import fertig: ${added} neu, ${replaced} ersetzt.` + (foodsAdded ? ` ${foodsAdded} Lebensmittel übernommen.` : '');
  const known = new Set(getFavorites().map((f) => f.id));
  const incoming = Array.isArray(data.favorites) ? data.favorites.map(cleanFavorite).filter((f) => f && !known.has(f.id)) : [];
  if (incoming.length === 0) showBackupStatus('ok', done);
  else if (setFavorites([...getFavorites(), ...incoming])) showBackupStatus('ok', `${done} ${incoming.length} ${incoming.length === 1 ? 'Favorit' : 'Favoriten'} übernommen.`);
  else showBackupStatus('error', `${done} Die Favoriten konnten nicht übernommen werden – bitte nochmal importieren.`);
  renderBackupInfo();
  renderFoodsLink();
  renderDay();
}

// ---------- Navigation zwischen Ansichten ----------

const VIEWS = ['today', 'settings', 'foods', 'capture', 'review', 'meal'];

function showView(name) {
  for (const view of VIEWS) {
    $('view-' + view).hidden = view !== name;
  }
  $('view-' + name).scrollTop = 0; // jede Ansicht scrollt für sich (nicht die ganze Seite)
}

// ---------- Neue Mahlzeit: Foto + Text ----------

const MAX_PHOTOS = 5; // jedes Foto kostet etwa 0,5 Cent mehr

// Die Mahlzeit, die gerade erfasst wird (Neue Mahlzeit → Prüfen → Speichern)
const capture = {
  photos: [], // gewählte Fotos: { file, url }
  estimate: null, // Claudes Schätzung
  time: null, // Tag + Uhrzeit, zu der die Erfassung begann – dort wird die Mahlzeit gespeichert
  mergeTarget: null, // kurz zuvor gespeicherte Mahlzeit, zu der das neue Essen gehören könnte
  mergeChoice: null, // 'merge', 'separate' oder null (= noch nicht entschieden)
  mergeGroup: null, // Gruppe dieser Mahlzeit: Name, Startzeit, kcal
};

// Vergisst alles zur Erfassung (Fotos werden freigegeben)
function resetCapture() {
  for (const photo of capture.photos) URL.revokeObjectURL(photo.url);
  capture.photos = [];
  capture.estimate = null;
  capture.time = null;
  capture.mergeTarget = null;
  capture.mergeChoice = null;
  capture.mergeGroup = null;
}

// Zeitpunkt der Mahlzeit, die gerade erfasst wird (auch nach Mitternacht oder Neustart derselbe)
function captureMoment() {
  return capture.time ?? mealTimeFor(new Date());
}

// Hält den Zeitpunkt aktuell: leer geräumt = vergessen, erster neuer Inhalt = jetzt
// (z. B. altes Foto am nächsten Morgen entfernt und neu fotografiert → heutige Mahlzeit)
function updateCaptureTime() {
  const empty = capture.photos.length === 0 && !capture.estimate && !$('meal-note').value.trim();
  if (empty) capture.time = null;
  else capture.time ??= mealTimeFor(new Date());
}

// source: 'camera' öffnet direkt die Kamera, 'library' die Mediathek (dort zeigt iOS sein Auswahlmenü)
function choosePhoto(source) {
  if (capture.photos.length >= MAX_PHOTOS) {
    showToast(`Höchstens ${MAX_PHOTOS} Fotos pro Mahlzeit`);
    return;
  }
  const input = $(source === 'library' ? 'library-input' : 'photo-input');
  input.value = ''; // damit dasselbe Foto erneut gewählt werden kann
  input.click();
}

function onPhotoChosen(e) {
  const files = [...e.target.files].filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return; // Auswahl abgebrochen – nichts tun

  if (currentView() !== 'capture') capture.time = null; // neue Mahlzeit von der Startseite aus
  const room = MAX_PHOTOS - capture.photos.length;
  for (const file of files.slice(0, room)) {
    capture.photos.push({ file, url: URL.createObjectURL(file) });
  }
  if (files.length > room) showToast(`Höchstens ${MAX_PHOTOS} Fotos – ${files.length - room} nicht übernommen`);

  $('capture-status').hidden = true;
  $('capture-key').hidden = true;
  renderPhotoGrid();
  if (currentView() !== 'capture') {
    // neue Mahlzeit von der Startseite aus (auf „Neue Mahlzeit“ selbst bleibt die Beschreibung stehen)
    $('meal-note').value = '';
    $('review-fav').checked = false;
    showView('capture');
  }
  updateCaptureTime();
  saveDraft();
}

function removePhoto(index) {
  const [removed] = capture.photos.splice(index, 1);
  URL.revokeObjectURL(removed.url);
  renderPhotoGrid(); // auch ohne Foto bleibt die Seite offen – Beschreibung und Schätzung gehen nicht verloren
  updateCaptureTime();
  saveDraft();
}

function renderPhotoGrid() {
  const grid = $('photo-grid');
  grid.replaceChildren();
  capture.photos.forEach((photo, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = `Foto ${index + 1}`;
    img.addEventListener('click', () => openViewer(capture.photos.map((p) => p.url), index));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.setAttribute('aria-label', `Foto ${index + 1} entfernen`);
    remove.innerHTML = closeIcon(2.75);
    remove.addEventListener('click', () => removePhoto(index));
    tile.append(img, remove);
    grid.append(tile);
  });
  if (capture.photos.length < MAX_PHOTOS) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'photo-add';
    add.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>Foto';
    add.setAttribute('aria-label', 'Weiteres Foto aufnehmen');
    add.addEventListener('click', () => choosePhoto('camera'));
    const library = document.createElement('button');
    library.type = 'button';
    library.className = 'photo-add';
    library.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2.25"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 18l5-5 3 3 3-3 5 5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linejoin="round"/></svg>Mediathek';
    library.setAttribute('aria-label', 'Foto aus der Mediathek');
    library.addEventListener('click', () => choosePhoto('library'));
    grid.append(add, library);
  }
  $('photo-hint').textContent =
    capture.photos.length === 0
      ? 'Kein Foto? Geht auch: beschreib die Mahlzeit unten mit Mengen, z. B. „300 ml Hafermilch, 30 g Whey, 1 Banane“.'
      : capture.photos.length === 1
      ? '1 Foto · Tipp: Auch die Nährwerttabelle fotografieren – Claude ordnet die Werte zu.'
      : `${capture.photos.length} Fotos`;
}

// Gibt es etwas, das beim Abbrechen verloren ginge?
function captureHasWork() {
  return Boolean(capture.estimate) || $('meal-note').value.trim() !== '' || capture.photos.length > 1;
}

async function requestCancelCapture() {
  if (captureHasWork() && !(await askSheet('Mahlzeit verwerfen? Fotos, Beschreibung und Schätzung gehen verloren.', 'Verwerfen'))) return;
  logDiscard();
  cancelCapture();
}

// Verworfene Schätzungen haben trotzdem gekostet – das soll im Protokoll sichtbar sein
function logDiscard() {
  if (capture.estimate || capture.photos.length) {
    logEvent('verworfen', { fotos: capture.photos.length, cent: capture.estimate?.costCents, korrekturen: capture.estimate?.corrections });
  }
}

function cancelCapture() {
  clearDraft();
  resetCapture();
  $('photo-grid').replaceChildren();
  $('review-photo').removeAttribute('src');
  $('meal-note').value = '';
  $('capture-status').hidden = true;
  $('capture-key').hidden = true;
  $('review-fav').checked = false;
  showView('today');
}

// ---------- Schätzen & Prüfen ----------

let estimateAbort = null;

// Gemeinsamer Ablauf jeder Anfrage an Claude: Ladeanzeige mit Abbrechen, Fehlermeldung in statusId
async function runClaudeTask({ text, photo, statusId, unexpected = 'Unerwarteter Fehler. Bitte nochmal versuchen.' }, task) {
  showLoading(text, photo);
  estimateAbort = new AbortController();
  const { signal } = estimateAbort;
  try {
    await task(signal);
  } catch (err) {
    if (err instanceof EstimateError) showError(statusId, err.message);
    else if (!signal.aborted) showError(statusId, unexpected); // abgebrochen: keine Meldung
  } finally {
    hideLoading();
    estimateAbort = null;
  }
}

const correctingText = (files) => (files.length ? 'Claude wertet das Foto aus …' : 'Claude rechnet neu …');
const correctedText = (files, before, after) => `${files.length ? 'Foto ausgewertet' : 'Neu berechnet'}: ${formatNumber(before)} → ${formatNumber(after)} kcal`;

async function onEstimate() {
  $('capture-status').hidden = true;
  $('capture-key').hidden = true;
  if (capture.photos.length === 0 && !$('meal-note').value.trim()) {
    showCaptureError('Füg ein Foto hinzu oder beschreib die Mahlzeit.');
    return;
  }
  if (!getStoredKey()) {
    showCaptureError('Zum Schätzen braucht die App deinen Claude-API-Schlüssel.');
    $('capture-key').hidden = false;
    return;
  }
  await runClaudeTask({ text: 'Claude schätzt …', photo: capture.photos[0]?.url, statusId: 'capture-status' }, async (signal) => {
    const recent = await findRecentMeal();
    const result = await estimateMeal(capture.photos.map((p) => p.file), $('meal-note').value.trim(), signal, recent?.meal);
    if (!result.isFood) {
      showCaptureError(capture.photos.length ? 'Kein Essen erkannt. Bitte ein Foto von deiner Mahlzeit machen.' : 'Aus der Beschreibung ließ sich kein Essen erkennen. Bitte genauer beschreiben.');
      return;
    }
    capture.estimate = result;
    capture.mergeTarget = recent?.meal ?? null;
    capture.mergeGroup = recent?.group ?? null;
    capture.mergeChoice = recent && result.sameMeal === 'ja' ? 'merge' : null; // sicher → automatisch, sonst nachfragen
    setFixOpen('review', false);
    $('correction-input').value = '';
    $('review-status').hidden = true;
    renderReview();
    showView('review');
    saveDraft();
  });
}

async function onCorrect(files = []) {
  const correction = $('correction-input').value.trim();
  if (!correction && files.length === 0) {
    showError('review-status', 'Schreib zuerst, was Claude ändern soll, oder reich ein Foto nach.');
    return;
  }
  $('correction-input').blur(); // Tastatur schließen
  $('review-status').hidden = true;
  const previous = capture.estimate;
  const photoCount = capture.photos.length;
  await runClaudeTask({ text: correctingText(files), photo: capture.photos[0]?.url, statusId: 'review-status' }, async (signal) => {
    const result = await correctEstimate(previous, correction, signal, files);
    if (!result.isFood) {
      showError('review-status', 'Nach der Korrektur ist kein Essen mehr übrig. Bitte anders formulieren.');
      return;
    }
    capture.estimate = result;
    if (capture.mergeTarget && capture.mergeChoice === null && result.sameMeal === 'ja') capture.mergeChoice = 'merge';
    // Nachgereichte Fotos auch in die Fotoreihe übernehmen (falls Platz), damit „Zurück“ sie zeigt
    for (const file of files) {
      if (capture.photos.length < MAX_PHOTOS) capture.photos.push({ file, url: URL.createObjectURL(file) });
    }
    renderPhotoGrid();
    $('correction-input').value = '';
    setFixOpen('review', false);
    renderReview();
    $('view-' + currentView()).scrollTo({ top: 0, behavior: 'smooth' });
    saveDraft();
    const kcal = (est) => sumNutrients(est.items).kcal;
    undoToast(
      correctedText(files, kcal(previous), kcal(result)),
      () => {
        if (capture.estimate !== result) return false; // inzwischen gespeichert, verworfen oder weiter korrigiert
        for (const photo of capture.photos.splice(photoCount)) URL.revokeObjectURL(photo.url);
        capture.estimate = previous;
        renderPhotoGrid();
        renderReview();
        saveDraft();
      },
      { done: 'Vorherige Schätzung wiederhergestellt' }
    );
  });
}

async function onSaveMeal() {
  const est = capture.estimate;
  if (!est) return;
  if (capture.mergeTarget && capture.mergeChoice === null) {
    $('merge-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Bitte wähle „Dazu“ oder „Eigene Mahlzeit“');
    return;
  }
  $('review-save').disabled = true;
  hideToast(); // ein „Rückgängig“ der letzten Korrektur darf nicht mitten ins Speichern fallen
  let joinGroup = capture.mergeTarget && capture.mergeChoice === 'merge' ? capture.mergeTarget : null;
  let savedMeal = null;

  try {
    let thumb = null;
    let photo = null;
    try {
      if (capture.photos.length) {
        ({ thumb, photo } = await savedPhotos(capture.photos[0].file));
      }
    } catch {
      // Ohne Vorschaubild speichern ist besser als gar nicht
    }
    // Tag und Uhrzeit vom Beginn der Erfassung (früherer Tag = nachtragen)
    const now = captureMoment();
    if (joinGroup) {
      // Ziel-Mahlzeit inzwischen gelöscht oder auf einen anderen Tag verschoben: eigene Mahlzeit
      joinGroup = (await getMeal(joinGroup.id)) ?? null;
      if (joinGroup && joinGroup.day !== dayKey(now)) joinGroup = null;
      // Ältere Einträge ohne Gruppe bekommen ihre eigene Kennung als Gruppe, damit der neue dazukommen kann
      if (joinGroup && !joinGroup.groupId) await putMeal({ ...joinGroup, groupId: joinGroup.id });
    }
    const id = crypto.randomUUID();
    savedMeal = {
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
      ...(photo ? { photo } : {}),
      costCents: est.costCents,
      corrections: est.corrections,
    };
    await addMeal(savedMeal);
    logEvent('gespeichert', {
      kcal: savedMeal.kcal,
      korrekturen: savedMeal.corrections,
      cent: savedMeal.costCents,
      fotos: capture.photos.length,
      gruppe: joinGroup ? 'dazu' : capture.mergeTarget ? 'eigene' : '',
      tag: dayKey(now) === dayKey(new Date()) ? '' : savedMeal.day,
    });
  } catch (err) {
    logEvent('speicherfehler', { text: err?.message, art: err?.name });
    showError('review-status', 'Speichern hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  } finally {
    $('review-save').disabled = false;
  }

  const joinedLabel = joinGroup ? capture.mergeGroup?.label ?? 'Essen' : null; // vor dem Zurücksetzen merken
  const asFavorite = $('review-fav').checked;
  const learned = rememberFoods(est.packageFoods) ?? 'Packungswerte nicht gemerkt';
  const withLearned = (text) => (learned ? `${text} · ${learned}` : text);
  cancelCapture(); // Foto und Eingaben zurücksetzen, zurück zur Tagesansicht (der Tag bleibt, wie er war)
  await renderDay();
  if (asFavorite) {
    showToast(
      withLearned(
        addFavorite(savedMeal)
          ? 'Gespeichert und als Favorit gemerkt – lange auf „+ Mahlzeit“ drücken zum Eintragen'
          : 'Gespeichert – als Favorit merken hat nicht geklappt'
      )
    );
    return;
  }
  if (joinedLabel) {
    showToast(withLearned(`Zum ${joinedLabel} hinzugefügt`));
    return;
  }
  // Nennt den Tag, wenn es nicht heute ist (nachgetragen, vor Mitternacht begonnen, Entwurf von gestern)
  const savedDay = new Date(savedMeal.eatenAt);
  showToast(withLearned(dayKey(savedDay) === dayKey(new Date()) ? 'Gespeichert' : `Gespeichert für ${dayTitle(savedDay)}`));
}

// ---------- Mahlzeiten zusammenfassen ----------

const MERGE_WINDOW_MIN = 60; // bis zu so vielen Minuten nach der letzten Mahlzeit wird Zusammenfassen angeboten

// Zeitpunkt, zu dem eine neue Mahlzeit gespeichert wird: angezeigter Tag + aktuelle Uhrzeit
function mealTimeFor(clock) {
  const time = new Date(shownDay());
  time.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), 0);
  return time;
}

// Zuletzt an der Mahlzeit etwas dazugekommen – lastAddedAt haben nur alte, vor V2-6 verschmolzene Mahlzeiten
function lastActivity(meal) {
  return new Date(meal.lastAddedAt ?? meal.eatenAt);
}

// Mahlzeit, die höchstens 60 Minuten vor dieser gespeichert wurde, samt ihrer Gruppe – oder null
async function findRecentMeal() {
  const now = captureMoment();
  let meals = [];
  try {
    meals = await getMealsForDay(dayKey(now));
  } catch {
    return null;
  }
  const candidates = meals.filter((m) => {
    const minutes = (now - lastActivity(m)) / MINUTE_MS;
    return minutes >= 0 && minutes <= MERGE_WINDOW_MIN;
  });
  candidates.sort((a, b) => lastActivity(b) - lastActivity(a));
  const meal = candidates[0];
  return meal ? { meal, group: groupMeals(meals).find((g) => g.id === groupIdOf(meal)) } : null;
}

function renderMergeCard() {
  const card = $('merge-card');
  if (!capture.mergeTarget || !capture.estimate) {
    card.hidden = true;
    return;
  }
  const group = capture.mergeGroup ?? { label: mealLabel(capture.mergeTarget.eatenAt), start: capture.mergeTarget.eatenAt, kcal: capture.mergeTarget.kcal };
  const time = formatTime(group.start);
  const total = formatNumber(group.kcal + sumNutrients(capture.estimate.items).kcal);
  const text = $('merge-text');
  const yes = $('merge-yes');
  const no = $('merge-no');
  card.classList.toggle('ask', capture.mergeChoice === null);
  if (capture.mergeChoice === 'merge') {
    text.textContent = `Kommt zum ${group.label} von ${time} Uhr – dort dann ${total} kcal.`;
    yes.hidden = true;
    no.hidden = false;
    no.textContent = 'Eigene Mahlzeit';
  } else if (capture.mergeChoice === 'separate') {
    text.textContent = `Wird eine eigene Mahlzeit (nicht zum ${group.label} von ${time} Uhr).`;
    yes.hidden = false;
    no.hidden = true;
    yes.textContent = `Doch zum ${group.label}`;
  } else {
    const doubt = capture.estimate.sameMeal === 'nein' ? 'Claude meint eher nicht.' : 'Claude ist sich nicht sicher.';
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
  // Neuere Mahlzeiten haben ein größeres Foto, ältere nur das kleine Vorschaubild
  const photo = meal.photo || meal.thumb;
  if (photo) $('meal-photo').src = photo;
  else $('meal-photo').removeAttribute('src');
  $('meal-photo').classList.toggle('small', !meal.photo);
  $('meal-photo-open').hidden = !photo;
  renderMealFavorite();
  renderEstimate('meal', meal);
  $('meal-time').value = toTimeInputValue(new Date(meal.eatenAt));
  $('meal-time').max = toTimeInputValue(new Date()); // nicht in die Zukunft
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
  if (date > new Date()) {
    showError('meal-status', 'Die Zeit darf nicht in der Zukunft liegen.');
    renderMeal();
    return;
  }
  $('meal-status').hidden = true;
  const movedDay = dayKey(date) !== openMealData.day;
  const updated = { ...openMealData, eatenAt: date.toISOString(), day: dayKey(date) };
  try {
    await putMeal(updated);
    openMealData = updated;
    showToast(movedDay ? `Verschoben auf ${dayTitle(date)}, ${formatTime(date)} Uhr` : 'Zeit geändert');
  } catch {
    showError('meal-status', 'Die neue Zeit konnte nicht gespeichert werden.');
    renderMeal();
  }
}

// Korrektur ohne die Originalfotos: Claude bekommt die gespeicherte Liste (und ggf. nachgereichte Fotos) und rechnet neu
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
  const foods = foodsForClaude(getFoods());
  const context =
    (foods.text ? `${foods.text}\n\n` : '') +
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
    foodKeys: foods.keys,
  }, {
    art: files.length ? 'foto nachreichen (gespeichert)' : 'korrektur (gespeichert)',
    fotos: files.length,
    text: correction,
    nr: (meal.corrections ?? 0) + 1,
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
  const task = { text: correctingText(files), photo: openMealData.photo || openMealData.thumb, statusId: 'meal-status', unexpected: 'Das hat nicht geklappt. Bitte nochmal versuchen.' };
  await runClaudeTask(task, async (signal) => {
    const result = await correctSavedMeal(openMealData, correction, signal, files);
    if (!result.isFood) {
      showError('meal-status', 'Nach der Korrektur ist kein Essen mehr übrig. Bitte anders formulieren.');
      return;
    }
    const previous = openMealData;
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
    syncFavoriteFromMeal(updated);
    const learned = rememberFoods(result.packageFoods) ?? 'Packungswerte nicht gemerkt';
    $('meal-correction-input').value = '';
    setFixOpen('meal', false);
    renderMeal();
    $('view-' + currentView()).scrollTo({ top: 0, behavior: 'smooth' });
    undoToast(
      correctedText(files, previous.kcal, updated.kcal) + (learned ? ` · ${learned}` : ''),
      async () => {
        await putMeal(previous);
        syncFavoriteFromMeal(previous);
        if (openMealData?.id === previous.id) {
          openMealData = previous;
          renderMeal();
        }
        if (!$('view-today').hidden) await renderDay();
      },
      { done: 'Vorherige Werte wiederhergestellt', failed: 'Wiederherstellen hat nicht geklappt' }
    );
  });
}

async function onMealDelete() {
  const meal = openMealData;
  showView('today');
  if (await deleteWithUndo(meal)) openMealData = null;
  else showView('meal');
}

async function closeMeal() {
  // Wurde die Mahlzeit auf einen anderen Tag verschoben, dorthin wechseln, damit man sie wiederfindet
  if (openMealData) showDayOf(new Date(openMealData.eatenAt));
  openMealData = null;
  showView('today');
  await renderDay();
}

// ---------- Korrektur auf- und zuklappen ----------

function setFixOpen(prefix, open) {
  $(prefix + '-fix').hidden = !open;
  $(prefix + '-fix-toggle').hidden = open;
}

// Aufklappen per Knopf: gleich lostippen können
function openFix(prefix) {
  setFixOpen(prefix, true);
  const input = $(prefix === 'review' ? 'correction-input' : 'meal-correction-input');
  input.focus({ preventScroll: true });
  $(prefix + '-fix').scrollIntoView({ behavior: 'smooth', block: 'center' });
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

let loadingTimer;

// Ladeanzeige mit Foto; nach 30 s ehrlicher Hinweis; Bildschirme dahinter gesperrt (auch für VoiceOver)
function showLoading(text, photoUrl) {
  $('loading-text').textContent = text;
  $('loading-hint').textContent = 'Das dauert meist 10–30 Sekunden.';
  const photo = $('loading-photo');
  photo.hidden = !photoUrl;
  if (photoUrl) photo.src = photoUrl;
  for (const view of VIEWS) $('view-' + view).inert = true;
  $('loading').hidden = false;
  $('loading-cancel').focus({ preventScroll: true });
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    $('loading-hint').textContent = 'Dauert gerade länger als sonst. Du kannst abbrechen und es gleich nochmal versuchen.';
  }, 30_000);
}

function hideLoading() {
  clearTimeout(loadingTimer);
  for (const view of VIEWS) $('view-' + view).inert = false;
  $('loading').hidden = true;
}

function showError(statusId, text) {
  logEvent('fehler', { wo: statusId, text });
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
  renderFoodsNote(capture.estimate);
  $('review-photo-open').hidden = capture.photos.length === 0;
  if (capture.photos.length) $('review-photo').src = capture.photos[0].url;
  $('review-photo-count').hidden = capture.photos.length < 2;
  $('review-photo-count').textContent = `1 von ${capture.photos.length}`;
  renderEstimate('review', capture.estimate);
}

const MAX_VISIBLE_ASSUMPTIONS = 3; // mehr Annahmen nur auf Wunsch

// Zeigt Name, Einzelposten, Summe, Annahmen und Kosten in den Feldern <prefix>-…
// Prüfen: welche gespeicherten Lebensmittel Claude genommen hat und welche Packungswerte neu gemerkt werden
function renderFoodsNote(est) {
  const known = new Set(getFoods().map((f) => foodKey(f.name)));
  const used = est?.usedFoods ?? [];
  const fresh = (est?.packageFoods ?? []).filter((f) => !used.includes(f.name));
  const parts = [];
  const line = (label, text) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label;
    p.append(strong, ' ' + text);
    parts.push(p);
  };
  if (used.length) line('Aus deinen Lebensmitteln:', used.join(' · '));
  if (fresh.length) {
    const label = fresh.every((f) => known.has(foodKey(f.name))) ? 'Wird beim Speichern aktualisiert:' : 'Wird beim Speichern gemerkt:';
    line(label, fresh.map((f) => `${f.name} (${formatNumber(f.kcal)} kcal/100 ${f.unit})`).join(' · '));
  }
  $('review-foods').replaceChildren(...parts);
  $('review-foods').hidden = parts.length === 0;
}

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
      `KH ${formatNumber(item.carbs)} g`,
      `F ${formatNumber(item.fat)} g`,
    ]
      .filter(Boolean)
      .join(' · ');
    details.setAttribute('aria-label', [item.portion, spokenNutrients(item)].filter(Boolean).join(', '));

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
let toastAction = null;
// Kurze Meldung unten; optional mit Knopf (z. B. „Rückgängig“), dann etwas länger sichtbar
function showToast(text, { action, onAction } = {}) {
  logEvent('meldung', { text });
  $('toast-text').textContent = text;
  const button = $('toast-action');
  button.hidden = !action;
  button.textContent = action ?? '';
  toastAction = onAction ?? null;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 3500);
}

// Meldung mit „Rückgängig“: undo() nimmt die Änderung zurück (false = gibt nichts mehr zurückzunehmen);
// danach kommt die Meldung „done“, bei einem Fehler „failed“
function undoToast(text, undo, { done, failed = 'Rückgängig hat nicht geklappt' } = {}) {
  showToast(text, {
    action: 'Rückgängig',
    onAction: async () => {
      try {
        if ((await undo()) === false) return;
      } catch {
        showToast(failed);
        return;
      }
      if (done) showToast(done);
    },
  });
}

// Lange Namen für Meldungen kürzen
function shortName(name) {
  return name.length > 28 ? name.slice(0, 26) + '…' : name;
}

function hideToast() {
  $('toast').classList.remove('show');
  $('toast-action').hidden = true;
  toastAction = null;
}

// ---------- Favoriten: Mahlzeiten, die (fast) immer gleich sind, mit einem Tipp eintragen ----------

const FAV_STORAGE = 'kt.favorites';
const LONG_PRESS_MS = 450;

function getFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_STORAGE) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setFavorites(list) {
  try {
    localStorage.setItem(FAV_STORAGE, JSON.stringify(list));
    dataVersion++; // Favoriten gehören mit in die Sicherung
    return true;
  } catch {
    showToast('Favorit konnte nicht gespeichert werden');
    return false;
  }
}

// Vorlage aus einer gespeicherten Mahlzeit (ohne großes Foto, das Vorschaubild reicht)
function favoriteFromMeal(meal, id = crypto.randomUUID()) {
  return {
    id,
    sourceId: meal.id,
    name: meal.name,
    note: meal.note || '',
    items: meal.items,
    assumptions: meal.assumptions,
    thumb: meal.thumb ?? null,
  };
}

// true, wenn der Favorit gespeichert wurde
function addFavorite(meal) {
  return setFavorites([...getFavorites(), favoriteFromMeal(meal)]);
}

// Wird die Vorlage-Mahlzeit korrigiert, zieht der Favorit mit
function syncFavoriteFromMeal(meal) {
  const list = getFavorites();
  const index = list.findIndex((f) => f.sourceId === meal.id);
  if (index < 0) return;
  list[index] = favoriteFromMeal(meal, list[index].id);
  setFavorites(list);
}

function openFavorites() {
  renderFavorites();
  $('fav-sheet').hidden = false;
}

function closeFavorites() {
  $('fav-sheet').hidden = true;
}

function renderFavorites() {
  const list = getFavorites();
  $('fav-empty').hidden = list.length > 0;
  $('fav-list').replaceChildren(
    ...list.map((fav) => {
      const row = document.createElement('div');
      row.className = 'fav-row';
      const log = document.createElement('button');
      log.type = 'button';
      log.className = 'fav-log';
      const name = document.createElement('span');
      name.className = 'fav-name';
      name.textContent = fav.name;
      const kcal = document.createElement('span');
      kcal.className = 'fav-kcal';
      kcal.textContent = formatNumber(sumNutrients(fav.items).kcal) + ' kcal';
      log.append(name, kcal);
      log.addEventListener('click', () => logFavorite(fav));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fav-remove';
      remove.setAttribute('aria-label', `${fav.name} aus den Favoriten entfernen`);
      remove.innerHTML = closeIcon(2.5);
      remove.addEventListener('click', () => removeFavorite(fav));
      row.append(log, remove);
      return row;
    })
  );
}

// Ein Tipp: sofort mit aktueller Uhrzeit eintragen – ohne Claude, also kostenlos
async function logFavorite(fav) {
  closeFavorites();
  const now = mealTimeFor(new Date());
  const id = crypto.randomUUID();
  const meal = {
    id,
    savedAt: Date.now(),
    groupId: id,
    eatenAt: now.toISOString(),
    day: dayKey(now),
    name: fav.name,
    note: fav.note,
    items: fav.items,
    assumptions: fav.assumptions,
    ...sumNutrients(fav.items),
    thumb: fav.thumb,
    costCents: 0,
    corrections: 0,
    fromFavorite: fav.id,
  };
  try {
    await addMeal(meal);
  } catch {
    showToast('Eintragen hat nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  await renderDay();
  undoToast(
    `„${shortName(fav.name)}“ eingetragen`,
    async () => {
      await deleteMeal(meal.id);
      await renderDay();
    },
    { done: 'Nicht eingetragen' }
  );
}

function removeFavorite(fav) {
  const before = getFavorites();
  if (!setFavorites(before.filter((f) => f.id !== fav.id))) return;
  renderFavorites();
  undoToast(`„${fav.name}“ ist kein Favorit mehr`, () => {
    if (!setFavorites(before)) return false; // setFavorites meldet den Fehler selbst
    if (!$('fav-sheet').hidden) renderFavorites();
    if (!$('view-meal').hidden) renderMealFavorite();
  });
}

// „Neu beschreiben“: Neue Mahlzeit ohne Foto, Häkchen „Als Favorit merken“ schon gesetzt
function startDescribedMeal() {
  closeFavorites();
  resetCapture();
  $('meal-note').value = '';
  $('capture-status').hidden = true;
  $('capture-key').hidden = true;
  $('review-fav').checked = true;
  capture.time = mealTimeFor(new Date());
  renderPhotoGrid();
  showView('capture');
  $('meal-note').focus({ preventScroll: true });
}

// Mahlzeit-Seite: „Als Favorit merken“ bzw. „Aus Favoriten entfernen“
function renderMealFavorite() {
  const meal = openMealData;
  if (!meal) return;
  const favorites = getFavorites();
  const row = $('meal-fav');
  // Aus einem Favoriten eingetragen und der Favorit gibt es noch: nichts anbieten (sonst doppelt)
  row.hidden = Boolean(meal.fromFavorite && favorites.some((f) => f.id === meal.fromFavorite));
  const isFavorite = favorites.some((f) => f.sourceId === meal.id);
  $('meal-fav-text').textContent = isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit merken';
  row.classList.toggle('danger', isFavorite);
}

function toggleMealFavorite() {
  const meal = openMealData;
  const fav = getFavorites().find((f) => f.sourceId === meal.id);
  if (fav) {
    removeFavorite(fav);
  } else if (addFavorite(meal)) {
    showToast('Als Favorit gemerkt – lange auf „+ Mahlzeit“ drücken zum Eintragen');
  }
  renderMealFavorite();
}

// ---------- Meine Lebensmittel: Packungswerte, die Claude sich merkt und wiederverwendet ----------

const FOOD_STORAGE = 'kt.foods';

function getFoods() {
  try {
    const list = JSON.parse(localStorage.getItem(FOOD_STORAGE) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setFoods(list) {
  try {
    localStorage.setItem(FOOD_STORAGE, JSON.stringify(list));
    dataVersion++; // Lebensmittel gehören mit in die Sicherung
    return true;
  } catch {
    showToast('Lebensmittel konnten nicht gespeichert werden');
    return false;
  }
}

// Merkt abgelesene Packungswerte; liefert den Zusatz für die Meldung („„Räucherkäse“ gemerkt“),
// '' wenn es nichts Neues gab, null wenn das Speichern nicht geklappt hat
function rememberFoods(foods) {
  if (!foods?.length) return '';
  const { list, added, updated } = mergeFoods(getFoods(), foods);
  if (!added.length && !updated.length) return '';
  if (!setFoods(list)) return null;
  logEvent('lebensmittel gemerkt', { neu: added.join(', '), aktualisiert: updated.join(', ') });
  const names = [...added, ...updated];
  return names.length === 1 ? `„${shortName(names[0])}“ gemerkt` : `${names.length} Lebensmittel gemerkt`;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'de');

function openFoods() {
  $('food-status').hidden = true;
  renderFoods();
  showView('foods');
}

function closeFoods() {
  showView('settings');
  renderFoodsLink();
  renderBackupInfo(); // Lebensmittel geändert → Sicherung neu vorbereiten, damit „Exportieren“ sofort teilen kann
}

function renderFoodsLink() {
  const count = getFoods().length;
  $('foods-count').textContent = count ? `${formatNumber(count)} ${count === 1 ? 'Produkt' : 'Produkte'} gespeichert` : 'Noch keine gespeichert';
}

function renderFoods() {
  const list = getFoods().sort(byName);
  $('foods-empty').hidden = list.length > 0;
  $('food-list').hidden = list.length === 0;
  $('food-list').replaceChildren(
    ...list.map((food) => {
      const row = document.createElement('div');
      row.className = 'item-row food-row';
      const text = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'item-name';
      name.textContent = food.name;
      const values = document.createElement('p');
      values.className = 'item-details';
      values.textContent = foodValues(food);
      text.append(name, values);
      if (food.portion) {
        const portion = document.createElement('p');
        portion.className = 'item-details';
        portion.textContent = food.portion;
        text.append(portion);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fav-remove food-remove';
      remove.setAttribute('aria-label', `${food.name} löschen`);
      remove.innerHTML = closeIcon(2.5);
      remove.addEventListener('click', () => removeFood(food));
      row.append(text, remove);
      return row;
    })
  );
}

function removeFood(food) {
  const before = getFoods();
  if (!setFoods(before.filter((f) => f.id !== food.id))) return;
  renderFoods();
  undoToast(`„${shortName(food.name)}“ gelöscht`, () => {
    if (!setFoods(before)) return false;
    if (!$('view-foods').hidden) renderFoods();
  }, { done: 'Wiederhergestellt' });
}

const PACKAGE_SYSTEM = `Der Nutzer fotografiert die Verpackung eines Lebensmittels, das er oft isst, meist mit Nährwerttabelle. Lies die Werte genau ab und trage das Produkt in foods ein: Name zum Wiedererkennen (Sorte und Marke, falls lesbar, z. B. „Vegane Schinkenwurst (Rügenwalder Mühle)“), Einheit (g oder ml), Werte je 100 g bzw. 100 ml und kurz, was die Packung über Portionen sagt (z. B. „Packung 80 g, 8 Scheiben, 1 Scheibe ≈ 10 g“ – sonst leer).
- Mehrere Fotos zeigen dasselbe Produkt (z. B. Vorderseite mit Marke, Rückseite mit Tabelle) – trage es nur einmal ein. Sind erkennbar verschiedene Produkte zu sehen, trage jedes ein.
- Entspricht das Produkt einem Eintrag aus „Meine Lebensmittel“, verwende genau dessen Namen.
- Nur abgelesene Werte, nichts schätzen. Ist keine Nährwerttabelle lesbar, bleibt foods leer.
Schreibe auf Deutsch.`;

const PACKAGE_SCHEMA = {
  type: 'object',
  properties: { foods: PACKAGE_FOODS_SCHEMA },
  required: ['foods'],
  additionalProperties: false,
};

// „Packung fotografieren“: Claude liest nur die Nährwerttabelle ab
async function readPackage(files, signal) {
  let photos;
  try {
    photos = await preparePhotos(files);
  } catch {
    throw new EstimateError('Ein Foto konnte nicht gelesen werden. Bitte nochmal versuchen.');
  }
  const foods = foodsForClaude(getFoods());
  const content = foods.text ? [{ type: 'text', text: foods.text }] : [];
  for (const data of photos) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  content.push({ type: 'text', text: 'Bitte lies die Nährwerte dieser Packung ab.' });
  return loggedClaude(
    { art: 'packung', fotos: photos.length },
    signal,
    async (entry) => {
      const { data } = await requestClaude({ system: PACKAGE_SYSTEM, schema: PACKAGE_SCHEMA, messages: [{ role: 'user', content }] }, signal, entry);
      return (Array.isArray(data.foods) ? data.foods : []).map((f) => cleanFood(f)).filter(Boolean);
    },
    (read) => ({ ergebnis: read.length ? 'ok' : 'keine Tabelle', gelesen: read.map((f) => f.name).join(', ') })
  );
}

function choosePackagePhoto(source) {
  $('food-status').hidden = true;
  $(source === 'camera' ? 'food-photo-input' : 'food-library-input').click();
}

async function onPackagePhotoChosen(e) {
  const input = e.target;
  const files = [...input.files].slice(0, MAX_PHOTOS);
  input.value = '';
  if (!files.length) return;
  if (!getStoredKey()) {
    showError('food-status', 'Zum Ablesen braucht die App deinen Claude-API-Schlüssel (Einstellungen).');
    return;
  }
  const url = URL.createObjectURL(files[0]);
  await runClaudeTask({ text: 'Claude liest die Packung …', photo: url, statusId: 'food-status' }, async (signal) => {
    const read = await readPackage(files, signal);
    if (!read.length) {
      showError('food-status', 'Keine Nährwerttabelle erkannt. Bitte die Tabelle gerade und scharf fotografieren.');
      return;
    }
    const before = getFoods();
    const note = rememberFoods(read);
    renderFoods();
    if (note === null) return; // setFoods hat den Fehler schon gemeldet
    if (!note) {
      showToast('Schon gespeichert – die Werte sind gleich');
      return;
    }
    undoToast(note, () => {
      if (!setFoods(before)) return false;
      if (!$('view-foods').hidden) renderFoods();
    }, { done: 'Nicht gemerkt' });
  });
  URL.revokeObjectURL(url);
}

// ---------- Fotos im Vollbild ----------

function openViewer(urls, start = 0) {
  if (!urls.length) return;
  const track = $('viewer-track');
  track.replaceChildren(
    ...urls.map((url, i) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Foto ${i + 1} von ${urls.length}`;
      img.className = 'viewer-photo';
      return img;
    })
  );
  $('viewer').hidden = false;
  track.scrollLeft = start * track.clientWidth;
  updateViewerCount();
  $('viewer-close').focus({ preventScroll: true });
}

function updateViewerCount() {
  const track = $('viewer-track');
  const count = track.children.length;
  const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  $('viewer-count').textContent = count > 1 ? `${index + 1} von ${count}` : '';
}

function closeViewer() {
  $('viewer').hidden = true;
  $('viewer-track').replaceChildren();
}

// ---------- Rückfrage als Aktionsblatt ----------

let sheetResolve = null;

// Zeigt eine Frage mit einem Aktionsknopf (rot bei zerstörenden Aktionen) und „Abbrechen“; liefert true/false
function askSheet(title, actionLabel, { danger = true } = {}) {
  sheetResolve?.(false);
  $('sheet-title').textContent = title;
  const action = $('sheet-action');
  action.textContent = actionLabel;
  action.classList.toggle('danger', danger);
  $('sheet').hidden = false;
  return new Promise((resolve) => (sheetResolve = resolve));
}

function closeSheet(result) {
  $('sheet').hidden = true;
  const resolve = sheetResolve;
  sheetResolve = null;
  resolve?.(result);
}

// ---------- Entwurf: nicht gespeicherte Mahlzeit übersteht das Beenden der App ----------

const DRAFT_MAX_AGE = DAY_MS; // ältere Entwürfe werden verworfen
let draftTimer;

function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, 400);
}

async function writeDraft() {
  clearTimeout(draftTimer);
  try {
    if (capture.photos.length === 0 && !capture.estimate && !$('meal-note').value.trim()) {
      await withDraft('readwrite', (store) => store.delete('current'));
      return;
    }
    const draft = {
      photos: capture.photos.map((p) => p.file),
      note: $('meal-note').value,
      estimate: capture.estimate,
      mergeTarget: capture.mergeTarget,
      mergeChoice: capture.mergeChoice,
      mergeGroupInfo: capture.mergeGroup,
      capturedAt: capture.time ? capture.time.toISOString() : null,
      view: currentView() === 'review' ? 'review' : 'capture',
      favorite: $('review-fav').checked,
      savedAt: Date.now(),
    };
    await withDraft('readwrite', (store) => store.put(draft, 'current'));
  } catch {
    // Der Entwurf ist nur eine Absicherung – ohne ihn geht alles andere weiter
  }
}

function clearDraft() {
  clearTimeout(draftTimer);
  withDraft('readwrite', (store) => store.delete('current')).catch(() => {});
}

async function restoreDraft() {
  let draft;
  try {
    draft = await withDraft('readonly', (store) => store.get('current'));
  } catch {
    return;
  }
  if (!draft) return;
  if (Date.now() - draft.savedAt > DRAFT_MAX_AGE) {
    clearDraft();
    return;
  }
  capture.photos = draft.photos.map((file) => ({ file, url: URL.createObjectURL(file) }));
  $('meal-note').value = draft.note ?? '';
  capture.estimate = draft.estimate ?? null;
  capture.mergeTarget = draft.mergeTarget ?? null;
  capture.mergeChoice = draft.mergeChoice ?? null;
  capture.mergeGroup = draft.mergeGroupInfo ?? null;
  $('review-fav').checked = Boolean(draft.favorite);
  // Die Mahlzeit behält ihren Tag (abends fotografiert, morgens gespeichert = Vortag); die Ansicht bleibt bei heute
  capture.time = draft.capturedAt ? new Date(draft.capturedAt) : null;
  renderPhotoGrid();
  if (capture.estimate && draft.view === 'review') {
    setFixOpen('review', false);
    renderReview();
    showView('review');
  } else {
    showView('capture');
  }
  const day = captureMoment();
  showToast(dayKey(day) === dayKey(new Date()) ? 'Nicht gespeicherte Mahlzeit wiederhergestellt' : `Nicht gespeicherte Mahlzeit wiederhergestellt – für ${dayTitle(day)}`);
}

// ---------- Einstellungen öffnen ----------

let settingsReturnView = 'today';

function openSettings({ key = false } = {}) {
  settingsReturnView = currentView() ?? 'today';
  hideKeyStatus();
  $('key-details').open = false;
  renderKeySection();
  $('backup-status').hidden = true;
  $('backup-info').textContent = '';
  renderBackupInfo();
  renderStorageInfo();
  renderFoodsLink();
  showView('settings');
  if (key) {
    $('key-details').open = true;
    requestAnimationFrame(() => $('key-details').scrollIntoView({ block: 'center' }));
  }
}

function closeSettings() {
  const back = settingsReturnView === 'settings' ? 'today' : settingsReturnView;
  if (back === 'capture' && getStoredKey()) {
    $('capture-status').hidden = true;
    $('capture-key').hidden = true;
  }
  showView(back);
  if (back === 'today') renderDay();
}

// ---------- Start ----------

$('open-settings').addEventListener('click', () => openSettings());
$('review-photo-open').addEventListener('click', () => openViewer(capture.photos.map((p) => p.url)));
$('meal-photo-open').addEventListener('click', () => {
  const url = openMealData?.photo || openMealData?.thumb;
  if (url) openViewer([url]);
});
$('viewer-close').addEventListener('click', closeViewer);
$('viewer-track').addEventListener('scroll', updateViewerCount, { passive: true });
// Nach unten wischen schließt das Vollbild
let viewerSwipe = null;
$('viewer').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  viewerSwipe = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
$('viewer').addEventListener('touchend', (e) => {
  if (!viewerSwipe) return;
  const t = e.changedTouches[0];
  const dy = t.clientY - viewerSwipe.y;
  const dx = t.clientX - viewerSwipe.x;
  viewerSwipe = null;
  if (dy > 90 && dy > Math.abs(dx) * 1.5) closeViewer();
});
$('key-banner-button').addEventListener('click', () => openSettings({ key: true }));
$('capture-key').addEventListener('click', () => openSettings({ key: true }));
$('toast-action').addEventListener('click', () => {
  logEvent('tipp', { knopf: $('toast-action').textContent });
  const run = toastAction;
  hideToast();
  run?.();
});
$('sheet-action').addEventListener('click', () => closeSheet(true));
$('sheet-cancel').addEventListener('click', () => closeSheet(false));
$('sheet').addEventListener('click', (e) => {
  if (e.target === $('sheet')) closeSheet(false); // Tippen daneben = Abbrechen
});
$('meal-note').addEventListener('input', () => {
  updateCaptureTime();
  saveDraft();
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
$('close-settings').addEventListener('click', closeSettings);
$('open-foods').addEventListener('click', openFoods);
$('close-foods').addEventListener('click', closeFoods);
$('food-camera').addEventListener('click', () => choosePackagePhoto('camera'));
$('food-library').addEventListener('click', () => choosePackagePhoto('library'));
$('food-photo-input').addEventListener('change', onPackagePhotoChosen);
$('food-library-input').addEventListener('change', onPackagePhotoChosen);
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
// Kurz tippen = Kamera, lange drücken = Favoriten
let addPress = null;
$('add-meal').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  clearTimeout(addPress?.timer);
  addPress = { x: t.clientX, y: t.clientY, long: false };
  addPress.timer = setTimeout(() => {
    addPress.long = true;
    openFavorites();
  }, LONG_PRESS_MS);
}, { passive: true });
$('add-meal').addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (addPress && Math.hypot(t.clientX - addPress.x, t.clientY - addPress.y) > TOUCH_SLOP) clearTimeout(addPress.timer);
}, { passive: true });
for (const type of ['touchend', 'touchcancel']) {
  $('add-meal').addEventListener(type, () => clearTimeout(addPress?.timer), { passive: true });
}
$('add-meal').addEventListener('contextmenu', (e) => e.preventDefault());
$('add-meal').addEventListener('click', () => {
  if (addPress?.long) {
    addPress = null; // der Klick nach dem langen Drücken öffnet keine Kamera
    return;
  }
  choosePhoto('camera');
});
$('fav-cancel').addEventListener('click', closeFavorites);
$('fav-sheet').addEventListener('click', (e) => {
  if (e.target === $('fav-sheet')) closeFavorites();
});
$('fav-new').addEventListener('click', startDescribedMeal);
$('meal-fav').addEventListener('click', toggleMealFavorite);
$('add-from-library').addEventListener('click', () => choosePhoto('library'));
$('photo-input').addEventListener('change', onPhotoChosen);
$('library-input').addEventListener('change', onPhotoChosen);
$('capture-cancel').addEventListener('click', requestCancelCapture);
$('estimate').addEventListener('click', onEstimate);
$('loading-cancel').addEventListener('click', () => estimateAbort?.abort());
$('review-back').addEventListener('click', () => {
  showView('capture');
  saveDraft();
});
$('review-discard').addEventListener('click', async () => {
  if (await askSheet('Diese Schätzung verwerfen? Fotos und Ergebnis gehen verloren.', 'Schätzung verwerfen')) {
    logDiscard();
    cancelCapture();
  }
});
$('review-fix-toggle').addEventListener('click', () => openFix('review'));
$('meal-fix-toggle').addEventListener('click', () => openFix('meal'));
$('review-fix-close').addEventListener('click', () => setFixOpen('review', false));
$('meal-fix-close').addEventListener('click', () => setFixOpen('meal', false));
$('correction-send').addEventListener('click', () => onCorrect());
$('correction-photo').addEventListener('click', () => chooseExtraPhoto('review'));
$('merge-yes').addEventListener('click', () => {
  capture.mergeChoice = 'merge';
  renderMergeCard();
  saveDraft();
});
$('merge-no').addEventListener('click', () => {
  capture.mergeChoice = 'separate';
  renderMergeCard();
  saveDraft();
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
$('day-prev').addEventListener('click', () => stepDay(-1));
$('day-next').addEventListener('click', () => stepDay(1));
$('day-today').addEventListener('click', () => {
  selectedDay = null;
  renderDay();
});
$('meal-time').addEventListener('change', onMealTimeChange);
$('meal-correction-send').addEventListener('click', () => onMealCorrect());
$('meal-delete').addEventListener('click', onMealDelete);

// Wischen nach links/rechts wechselt den Tag (nicht in die Zukunft, nicht während der Auswahl, nicht auf einer Mahlzeit)
// Der Inhalt folgt dem Finger; bei „Heute“ nach links nur gebremst, dann federt er zurück
let daySwipe = null;
$('view-today').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  // Auf einer Mahlzeit gehört das Wischen der Zeile (Bevel/Löschen), nicht dem Tageswechsel
  const onRow = e.target.closest('.swipe-wrap');
  daySwipe = e.touches.length === 1 && !onRow && !selectMode && !daySliding && !inHomeZone(t) ? { x: t.clientX, y: t.clientY, dx: 0, active: false } : null;
}, { passive: true });
$('view-today').addEventListener('touchmove', (e) => {
  if (!daySwipe) return;
  const t = e.touches[0];
  const dx = t.clientX - daySwipe.x;
  const dy = t.clientY - daySwipe.y;
  if (!daySwipe.active) {
    const direction = swipeDirection(dx, dy);
    if (direction === false) return (daySwipe = null); // scrollt
    if (direction === null) return;
    daySwipe.active = true;
  }
  e.preventDefault();
  daySwipe.dx = dx;
  setDayOffset(dx < 0 && isShowingToday() ? dx / 4 : dx, false);
}, { passive: false });
$('view-today').addEventListener('touchend', () => {
  if (!daySwipe?.active) return (daySwipe = null);
  const { dx } = daySwipe;
  daySwipe = null;
  if (Math.abs(dx) < 70 || (dx < 0 && isShowingToday())) return setDayOffset(0, true); // zurückfedern
  swipeToDay(dx > 0 ? -1 : 1);
});
// iOS übernimmt die Geste: Inhalt zurückfedern lassen (sonst bleibt er verschoben stehen)
function cancelDaySwipe(animate = true) {
  if (daySwipe?.active) logEvent('geste abgebrochen', { art: 'tag' });
  daySwipe = null;
  if (!daySliding) setDayOffset(0, animate);
}
$('view-today').addEventListener('touchcancel', () => cancelDaySwipe());

// Vom linken Rand nach rechts wischen = Zurück (wie in iPhone-Apps)
const EDGE = 28; // so nah am Rand muss der Finger aufsetzen
const BACK_ACTIONS = { settings: 'close-settings', foods: 'close-foods', capture: 'capture-cancel', review: 'review-back', meal: 'meal-done' };
let edgeSwipe = null;

function currentView() {
  return VIEWS.find((v) => !$('view-' + v).hidden);
}

function setViewOffset(view, x, animate) {
  // Kinder einzeln verschieben: ein verschobenes <main> würde die feste Knopfleiste unten mitverrutschen
  for (const child of $('view-' + view).children) {
    child.style.transition = animate ? 'transform 0.22s ease' : 'none';
    child.style.transform = x ? `translateX(${x}px)` : '';
  }
}

document.addEventListener('touchstart', (e) => {
  const view = currentView();
  const t = e.touches[0];
  edgeSwipe =
    BACK_ACTIONS[view] && e.touches.length === 1 && t.clientX <= EDGE && !inHomeZone(t) && $('loading').hidden && $('sheet').hidden && $('viewer').hidden && $('fav-sheet').hidden
      ? { view, x: t.clientX, y: t.clientY, dx: 0, active: false }
      : null;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!edgeSwipe) return;
  const t = e.touches[0];
  const dx = t.clientX - edgeSwipe.x;
  const dy = t.clientY - edgeSwipe.y;
  if (!edgeSwipe.active) {
    const direction = swipeDirection(dx, dy, true);
    if (direction === false) return (edgeSwipe = null); // scrollt
    if (direction === null) return;
    edgeSwipe.active = true;
  }
  e.preventDefault();
  edgeSwipe.dx = Math.max(0, dx);
  setViewOffset(edgeSwipe.view, edgeSwipe.dx, false);
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!edgeSwipe?.active) return (edgeSwipe = null);
  const { view, dx } = edgeSwipe;
  edgeSwipe = null;
  if (dx < window.innerWidth * 0.3) return setViewOffset(view, 0, true); // nicht weit genug: zurückfedern
  if (view === 'capture' && captureHasWork()) {
    setViewOffset(view, 0, true); // erst nachfragen, nichts ungefragt verwerfen
    requestCancelCapture();
    return;
  }
  setViewOffset(view, window.innerWidth, true);
  setTimeout(() => {
    $(BACK_ACTIONS[view]).click();
    setViewOffset(view, 0, false);
  }, 200);
});

function cancelEdgeSwipe(animate = true) {
  if (edgeSwipe?.active) {
    logEvent('geste abgebrochen', { art: 'zurück' });
    setViewOffset(edgeSwipe.view, 0, animate);
  }
  edgeSwipe = null;
}
document.addEventListener('touchcancel', () => cancelEdgeSwipe());

// Kein Zoomen per Doppeltipp: iOS zoomt bei zwei schnellen Tipps trotz touch-action manchmal hinein.
// Den zweiten schnellen Tipp fängt die App deshalb ab und löst den Knopf selbst aus (mit zwei Fingern zoomen geht weiter).
let lastTap = { time: 0 };
let tapStart = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  tapStart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  const isTap = tapStart && e.touches.length === 0 && Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) < TOUCH_SLOP;
  const now = Date.now();
  const quick = now - lastTap.time < 350;
  lastTap = { time: isTap ? now : 0 };
  if (!isTap || !quick) return;
  // in Textfeldern bleibt Doppeltippen zum Markieren eines Wortes erhalten
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  const target = e.target.closest('button, a, label, summary');
  if (target && !target.disabled) target.click();
}, { passive: false });

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  // Falls iOS beim App-Wechsel kein „Geste abgebrochen“ schickt: nichts darf verschoben stehen bleiben
  cancelDaySwipe(false);
  cancelEdgeSwipe(false);
  cancelRowSwipe();
  if (document.hidden) {
    // iOS kann die App im Hintergrund beenden – auch eine reine Beschreibung sofort sichern
    if (capture.photos.length || capture.estimate || $('meal-note').value.trim()) writeDraft();
  } else {
    renderDay();
  }
});

renderDay()
  .then(async () => {
    let geschuetzt;
    try {
      geschuetzt = await navigator.storage?.persisted?.();
    } catch {
      // unbekannt
    }
    logEvent('start', {
      version: APP_VERSION,
      ms: performance.now(),
      homescreen: navigator.standalone === true,
      online: navigator.onLine,
      ios: navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replaceAll('_', '.'),
      geschützt: geschuetzt,
    });
  })
  .then(restoreDraft);
// Aufbau-Animation nur beim Start
setTimeout(() => document.body.classList.remove('intro'), 1500);

// Ohne Internet starten können (Service Worker legt die App-Dateien im iPhone ab)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

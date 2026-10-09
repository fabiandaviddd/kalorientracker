// Kalorientracker – Rechnen und Prüfen ohne Bildschirm (kein DOM, kein Speicher).
// Wird vor app.js geladen; tests.html prüft diese Funktionen automatisch.

// ---------- Zahlen und Summen ----------

// Zeitspannen in Millisekunden
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function formatNumber(n) {
  return Math.round(n).toLocaleString('de-DE');
}

// „1 Mahlzeit“, „3 Mahlzeiten“
function mealCount(n) {
  return `${formatNumber(n)} ${n === 1 ? 'Mahlzeit' : 'Mahlzeiten'}`;
}

// Zahl aus fremden Daten (Claude, Sicherungsdatei): nur endliche Werte ab 0, sonst 0
function safeNumber(x) {
  return Number.isFinite(x) && x >= 0 ? x : 0;
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

// Für VoiceOver ausgeschrieben statt „P 8 g · KH 30 g“
function spokenNutrients(n) {
  return `Protein ${formatNumber(n.protein)} Gramm, Kohlenhydrate ${formatNumber(n.carbs)} Gramm, Fett ${formatNumber(n.fat)} Gramm`;
}

// ---------- Tage und Uhrzeiten ----------

// Kalendertag in Ortszeit, z. B. „2026-09-23“
function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// „Heute“, „Gestern“, „Vorgestern“ oder z. B. „Mo., 21. Sep.“
function dayTitle(day, now = new Date()) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((startOf(now) - startOf(day)) / DAY_MS); // gerundet wegen Zeitumstellung
  if (daysAgo === 0) return 'Heute';
  if (daysAgo === 1) return 'Gestern';
  if (daysAgo === 2) return 'Vorgestern';
  return day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Mahlzeit-Gruppen (Frühstück, Mittagessen …) ----------

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

// ---------- Für Bevel kopieren ----------

// Format wie im Chat: Name, darunter „535 kcal | P 18 g | KH 69 g | F 22 g“, Leerzeile dazwischen.
// Ganze Zahlen ohne Tausenderpunkt („1200“ statt „1.200“), damit Bevel sie sicher liest.
function bevelText(meals) {
  const r = Math.round;
  return meals
    .map((m) => `${m.name}\n${r(m.kcal)} kcal | P ${r(m.protein)} g | KH ${r(m.carbs)} g | F ${r(m.fat)} g`)
    .join('\n\n');
}

// Mehrere Mahlzeiten als ein Block: Namen mit „+“ verbunden, Werte addiert
function combinedForBevel(meals) {
  if (meals.length === 1) return meals[0];
  return { name: meals.map((m) => m.name).join(' + '), ...sumNutrients(meals) };
}

// ---------- Nachricht an Claude bei Korrekturen ----------

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

// ---------- Daten aus einer Datei prüfen (Sicherung, Favoriten) ----------

// Bestandteile aus einer Datei in saubere Form bringen (Sicherung und Favoriten)
function cleanItems(list) {
  return list
    .filter((i) => i && typeof i.name === 'string')
    .map((i) => ({
      name: i.name,
      portion: typeof i.portion === 'string' ? i.portion : '',
      kcal: safeNumber(i.kcal),
      protein: safeNumber(i.protein),
      carbs: safeNumber(i.carbs),
      fat: safeNumber(i.fat),
    }));
}

// Prüft eine Mahlzeit aus der Datei und bringt sie in eine saubere Form
function cleanImportedMeal(m) {
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.eatenAt !== 'string') return null;
  const eaten = new Date(m.eatenAt);
  if (isNaN(eaten)) return null;
  const items = Array.isArray(m.items) ? cleanItems(m.items) : [];
  const totals = items.length
    ? sumNutrients(items)
    : { kcal: safeNumber(m.kcal), protein: safeNumber(m.protein), carbs: safeNumber(m.carbs), fat: safeNumber(m.fat) };
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
    ...(typeof m.photo === 'string' && m.photo.startsWith('data:image/') ? { photo: m.photo } : {}),
    costCents: safeNumber(m.costCents),
    corrections: safeNumber(m.corrections),
    ...(typeof m.lastAddedAt === 'string' && !isNaN(new Date(m.lastAddedAt)) ? { lastAddedAt: new Date(m.lastAddedAt).toISOString() } : {}),
    ...(typeof m.groupId === 'string' ? { groupId: m.groupId } : {}),
    ...(typeof m.fromFavorite === 'string' ? { fromFavorite: m.fromFavorite } : {}),
    ...(Number.isFinite(m.savedAt) ? { savedAt: m.savedAt } : {}),
  };
}

// Prüft einen Favoriten aus der Sicherungsdatei
function cleanFavorite(f) {
  if (!f || typeof f.id !== 'string' || typeof f.name !== 'string' || !Array.isArray(f.items)) return null;
  return {
    id: f.id,
    sourceId: typeof f.sourceId === 'string' ? f.sourceId : null,
    name: f.name,
    note: typeof f.note === 'string' ? f.note : '',
    items: cleanItems(f.items),
    assumptions: Array.isArray(f.assumptions) ? f.assumptions.filter((a) => typeof a === 'string') : [],
    thumb: typeof f.thumb === 'string' && f.thumb.startsWith('data:image/') ? f.thumb : null,
  };
}

// ---------- Meine Lebensmittel (Packungswerte) ----------

// Gleicher Name = gleiches Lebensmittel (Groß-/Kleinschreibung und Leerzeichen egal)
const foodKey = (name) => String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Prüft ein Lebensmittel aus Claudes Antwort (Werte je 100 g/ml) oder aus der Sicherung; null = unbrauchbar
function cleanFood(f, now = new Date()) {
  if (!f || typeof f.name !== 'string' || !f.name.trim()) return null;
  const pick = (...values) => safeNumber(values.find((v) => v !== undefined));
  const food = {
    id: typeof f.id === 'string' && f.id ? f.id : null,
    name: f.name.trim(),
    unit: f.unit === 'ml' ? 'ml' : 'g',
    kcal: pick(f.kcal, f.kcal_100),
    protein: pick(f.protein, f.protein_100_g),
    carbs: pick(f.carbs, f.carbs_100_g),
    fat: pick(f.fat, f.fat_100_g),
    portion: typeof f.portion === 'string' ? f.portion.trim() : typeof f.portion_note === 'string' ? f.portion_note.trim() : '',
    updatedAt: typeof f.updatedAt === 'string' && !isNaN(new Date(f.updatedAt)) ? f.updatedAt : now.toISOString(),
  };
  return food.kcal <= 950 ? food : null; // mehr als 900 kcal/100 g (reines Fett) ist ein Lesefehler; 0 kcal gibt es (z. B. Cola Zero)
}

// Neue Werte zu einer Liste: gleicher Name → Werte aktualisieren (Kennung bleibt), sonst anhängen.
// keepExisting: vorhandene nicht überschreiben (Import einer älteren Sicherung)
function mergeFoods(list, incoming, { keepExisting = false, newId = () => crypto.randomUUID() } = {}) {
  const result = [...list];
  const added = [];
  const updated = [];
  for (const food of incoming) {
    const index = result.findIndex((f) => foodKey(f.name) === foodKey(food.name));
    if (index === -1) {
      result.push({ ...food, id: food.id ?? newId() });
      added.push(food.name);
    } else if (!keepExisting) {
      const old = result[index];
      const same = ['unit', 'kcal', 'protein', 'carbs', 'fat'].every((k) => old[k] === food[k]) && (food.portion || old.portion) === old.portion;
      if (!same) {
        result[index] = { ...food, id: old.id, portion: food.portion || old.portion };
        updated.push(food.name);
      }
    }
  }
  return { list: result, added, updated };
}

// Die Liste für Claude: kurze Kennungen (L1, L2 …) statt langer IDs, damit es wenig kostet
function foodsForClaude(foods) {
  const keys = {};
  const value = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const lines = foods.map((f, i) => {
    const key = `L${i + 1}`;
    keys[key] = f.name;
    return `${key}: ${f.name} – je 100 ${f.unit}: ${value(f.kcal)} kcal, P ${value(f.protein)} g, KH ${value(f.carbs)} g, F ${value(f.fat)} g${f.portion ? ` – ${f.portion}` : ''}`;
  });
  return { text: lines.length ? `Meine Lebensmittel (gespeicherte Packungswerte):\n${lines.join('\n')}` : '', keys };
}

// „314 kcal · P 20 g · KH 1 g · F 26 g je 100 g“
function foodValues(f) {
  return `${formatNumber(f.kcal)} kcal · P ${formatNumber(f.protein)} g · KH ${formatNumber(f.carbs)} g · F ${formatNumber(f.fat)} g je 100 ${f.unit}`;
}

// ---------- Protokoll ----------

const LOG_MAX_ENTRIES = 800;
const LOG_MAX_DAYS = 60;
const LOG_MAX_TEXT = 300; // längere Texte (z. B. Fehlermeldungen) werden gekürzt

// Ein Protokolleintrag: Zeit, Art und kurze Werte (Texte gekürzt, Zahlen gerundet, nichts Verschachteltes)
function logEntry(type, data, now = new Date()) {
  const entry = { t: now.toISOString(), e: type };
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number') entry[key] = Number.isFinite(value) ? Math.round(value * 100) / 100 : String(value);
    else if (typeof value === 'boolean') entry[key] = value;
    else {
      const text = String(value);
      entry[key] = text.length > LOG_MAX_TEXT ? text.slice(0, LOG_MAX_TEXT - 1) + '…' : text;
    }
  }
  return entry;
}

// Behält nur die jüngsten Einträge der letzten Wochen
function trimLog(list, now = new Date()) {
  const oldest = new Date(now - LOG_MAX_DAYS * DAY_MS).toISOString();
  return list.filter((x) => x && typeof x.t === 'string' && x.t >= oldest).slice(-LOG_MAX_ENTRIES);
}

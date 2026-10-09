// Automatische Tests für logic.js – im Browser tests.html öffnen, am Mac: node tools/run-tests.mjs
// Kein Test braucht Internet, Speicher oder den Bildschirm der App.

const TESTS = [];
const test = (name, fn) => TESTS.push({ name, fn });

function eq(actual, expected, what = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? what + ': ' : ''}erwartet ${e}, bekommen ${a}`);
}
function ok(condition, what) {
  if (!condition) throw new Error(what);
}

// Ortszeit wie auf dem iPhone: Monat 0 = Januar
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

// ---------- Zahlen ----------

test('formatNumber rundet und setzt Tausenderpunkte', () => {
  eq(formatNumber(1234.5), '1.235');
  eq(formatNumber(0.4), '0');
});

test('mealCount: Einzahl und Mehrzahl', () => {
  eq(mealCount(1), '1 Mahlzeit');
  eq(mealCount(0), '0 Mahlzeiten');
  eq(mealCount(1200), '1.200 Mahlzeiten');
});

test('safeNumber lässt nur endliche Zahlen ab 0 durch', () => {
  eq([12.5, 0, -3, NaN, Infinity, '80', null, undefined].map(safeNumber), [12.5, 0, 0, 0, 0, 0, 0, 0]);
});

test('sumNutrients addiert alle vier Werte', () => {
  eq(sumNutrients([{ kcal: 100, protein: 1, carbs: 2, fat: 3 }, { kcal: 50, protein: 4, carbs: 5, fat: 6 }]), { kcal: 150, protein: 5, carbs: 7, fat: 9 });
  eq(sumNutrients([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

// ---------- Tage ----------

test('dayKey nimmt den Kalendertag in Ortszeit', () => {
  eq(dayKey(at(2026, 1, 5, 23, 59)), '2026-01-05');
  eq(dayKey(at(2026, 12, 31, 0, 0)), '2026-12-31');
});

test('dayTitle: Heute, Gestern, Vorgestern, sonst Datum', () => {
  const now = at(2026, 9, 30, 8);
  eq(dayTitle(at(2026, 9, 30, 23), now), 'Heute');
  eq(dayTitle(at(2026, 9, 29, 0, 5), now), 'Gestern');
  eq(dayTitle(at(2026, 9, 28), now), 'Vorgestern');
  const older = dayTitle(at(2026, 9, 27), now);
  ok(older.includes('27.') && !['Heute', 'Gestern', 'Vorgestern'].includes(older), `ältere Tage mit Datum, bekommen „${older}“`);
});

test('dayTitle stimmt auch über die Zeitumstellung', () => {
  eq(dayTitle(at(2026, 3, 29, 1), at(2026, 3, 30, 1)), 'Gestern'); // Sommerzeit: der Tag hat 23 Stunden
  eq(dayTitle(at(2026, 10, 25, 1), at(2026, 10, 26, 23)), 'Gestern'); // Winterzeit: der Tag hat 25 Stunden
});

test('formatTime zeigt Stunden:Minuten', () => {
  eq(formatTime(at(2026, 9, 30, 8, 5)), '08:05');
});

// ---------- Gruppen ----------

test('mealLabel nach Uhrzeit', () => {
  const label = (h, min) => mealLabel(at(2026, 9, 30, h, min));
  eq([label(4, 59), label(5, 0), label(10, 59), label(11, 0), label(14, 59), label(15, 0), label(17, 29), label(17, 30), label(21, 59), label(22, 0)],
    ['Snack', 'Frühstück', 'Frühstück', 'Mittagessen', 'Mittagessen', 'Snack', 'Snack', 'Abendessen', 'Abendessen', 'Snack']);
});

test('groupMeals: Gruppen, Reihenfolge, Summen, zweites Frühstück = Snack', () => {
  const meal = (id, h, min, kcal, groupId) => ({ id, groupId, eatenAt: at(2026, 9, 30, h, min).toISOString(), kcal, protein: 1, carbs: 1, fat: 1 });
  const groups = groupMeals([
    meal('c', 12, 30, 600),
    meal('b', 8, 40, 100, 'a'),
    meal('a', 8, 30, 300, 'a'),
    meal('d', 9, 30, 80), // eigene Gruppe, auch morgens → Snack
    { ...meal('e', 19, 0, 500), groupId: undefined }, // alter Eintrag ohne Gruppe
  ]);
  eq(groups.map((g) => [g.label, g.meals.map((m) => m.id).join(''), g.kcal]), [
    ['Frühstück', 'ab', 400],
    ['Snack', 'd', 80],
    ['Mittagessen', 'c', 600],
    ['Abendessen', 'e', 500],
  ]);
});

test('groupMeals: gleiche Uhrzeit → Reihenfolge des Speicherns', () => {
  const t = at(2026, 9, 30, 8).toISOString();
  const groups = groupMeals([{ id: 'y', groupId: 'g', eatenAt: t, savedAt: 2, kcal: 1 }, { id: 'x', groupId: 'g', eatenAt: t, savedAt: 1, kcal: 1 }]);
  eq(groups[0].meals.map((m) => m.id), ['x', 'y']);
});

// ---------- Bevel ----------

test('bevelText im vereinbarten Format, ganze Zahlen ohne Tausenderpunkt', () => {
  eq(bevelText([{ name: 'Nudeln', kcal: 1200.4, protein: 18.6, carbs: 69, fat: 22 }, { name: 'Apfel', kcal: 80, protein: 0, carbs: 20, fat: 0 }]),
    'Nudeln\n1200 kcal | P 19 g | KH 69 g | F 22 g\n\nApfel\n80 kcal | P 0 g | KH 20 g | F 0 g');
});

test('combinedForBevel verbindet Namen und addiert', () => {
  const one = { name: 'A', kcal: 1, protein: 2, carbs: 3, fat: 4 };
  eq(combinedForBevel([one]), one);
  eq(combinedForBevel([one, { name: 'B', kcal: 10, protein: 20, carbs: 30, fat: 40 }]), { name: 'A + B', kcal: 11, protein: 22, carbs: 33, fat: 44 });
});

// ---------- Korrektur ----------

test('correctionRequest: Text, Fotos oder beides', () => {
  eq(correctionRequest('nur halb', 0), 'Korrektur vom Nutzer: nur halb\nBitte gib die vollständige, aktualisierte Schätzung zurück.');
  ok(correctionRequest('', 1).startsWith('Ich reiche ein Foto'), 'ein Foto');
  ok(correctionRequest('x', 2).startsWith('Ich reiche 2 Fotos') && correctionRequest('x', 2).includes('Korrektur vom Nutzer: x'), 'zwei Fotos + Text');
});

// ---------- Sicherung und Favoriten ----------

const goodMeal = {
  id: 'm1', name: 'Brot', eatenAt: '2026-09-30T06:30:00.000Z', note: 'zwei Scheiben', groupId: 'g1', fromFavorite: 'f1', savedAt: 5,
  items: [{ name: 'Brot', portion: '2 Scheiben', kcal: 200, protein: 8, carbs: 36, fat: 2 }, { name: 'Butter', kcal: 70, protein: 0, carbs: 0, fat: 8 }],
  assumptions: ['A', 3], thumb: 'data:image/jpeg;base64,AAA', photo: 'https://fremd.example/bild.jpg', costCents: 2.5, corrections: 1,
};

test('cleanImportedMeal übernimmt eine gültige Mahlzeit sauber', () => {
  const m = cleanImportedMeal(goodMeal);
  eq([m.id, m.name, m.day, m.kcal, m.fat, m.groupId, m.fromFavorite, m.savedAt, m.costCents], ['m1', 'Brot', dayKey(new Date(goodMeal.eatenAt)), 270, 10, 'g1', 'f1', 5, 2.5]);
  eq(m.items[1].portion, '', 'fehlende Portion');
  eq(m.assumptions, ['A'], 'nur Texte als Annahmen');
  ok(m.thumb.startsWith('data:image/') && !('photo' in m), 'nur eingebettete Bilder');
});

test('cleanImportedMeal lehnt Unbrauchbares ab', () => {
  eq(cleanImportedMeal(null), null);
  eq(cleanImportedMeal({ ...goodMeal, id: 7 }), null, 'Kennung keine Zeichenkette');
  eq(cleanImportedMeal({ ...goodMeal, eatenAt: 'kaputt' }), null, 'ungültiges Datum');
  eq(cleanImportedMeal({ ...goodMeal, eatenAt: null }), null, 'Datum fehlt (nicht 1970)');
});

test('cleanImportedMeal: kaputte Zahlen werden 0, Summe ohne Bestandteile aus den Gesamtwerten', () => {
  const m = cleanImportedMeal({ ...goodMeal, items: [{ name: 'X', kcal: -5, protein: 'viel', carbs: NaN, fat: Infinity }] });
  eq([m.kcal, m.protein, m.carbs, m.fat], [0, 0, 0, 0]);
  const old = cleanImportedMeal({ ...goodMeal, items: undefined, kcal: 300, protein: 10, carbs: -1, fat: 5 });
  eq([old.items, old.kcal, old.protein, old.carbs, old.fat], [[], 300, 10, 0, 5]);
});

test('cleanImportedMeal: lastAddedAt nur, wenn gültig', () => {
  eq('lastAddedAt' in cleanImportedMeal({ ...goodMeal, lastAddedAt: null }), false, 'null');
  eq('lastAddedAt' in cleanImportedMeal({ ...goodMeal, lastAddedAt: 'nix' }), false, 'Unsinn');
  eq(cleanImportedMeal({ ...goodMeal, lastAddedAt: '2026-09-30T07:00:00Z' }).lastAddedAt, '2026-09-30T07:00:00.000Z');
});

test('cleanFavorite prüft Favoriten aus der Sicherung', () => {
  eq(cleanFavorite({ id: 'f', name: 'Shake' }), null, 'ohne Bestandteile');
  const f = cleanFavorite({ id: 'f', name: 'Shake', sourceId: 3, items: [{ name: 'Milch', kcal: '9' }, 'kaputt'], thumb: 'javascript:alert(1)' });
  eq([f.sourceId, f.items.length, f.items[0].kcal, f.thumb, f.note], [null, 1, 0, null, '']);
});

// ---------- Meine Lebensmittel ----------

const kaese = { name: 'Räucherkäse (Milbona)', unit: 'g', kcal_100: 314, protein_100_g: 20, carbs_100_g: 1, fat_100_g: 26, portion_note: '1 Scheibe ≈ 20 g' };

test('cleanFood nimmt Claudes Werte je 100 g und verwirft Unsinn', () => {
  const f = cleanFood(kaese, new Date('2026-10-09T10:00:00Z'));
  eq([f.name, f.unit, f.kcal, f.protein, f.carbs, f.fat, f.portion, f.updatedAt, f.id], ['Räucherkäse (Milbona)', 'g', 314, 20, 1, 26, '1 Scheibe ≈ 20 g', '2026-10-09T10:00:00.000Z', null]);
  eq(cleanFood({ ...kaese, unit: 'ml' }).unit, 'ml');
  eq(cleanFood({ ...kaese, name: ' ' }), null, 'ohne Namen');
  eq(cleanFood({ ...kaese, kcal_100: 0 }).kcal, 0, '0 kcal gibt es');
  eq(cleanFood({ ...kaese, kcal_100: 3140 }), null, 'Lesefehler');
  eq(cleanFood({ id: 'a', name: 'Saft', unit: 'ml', kcal: 44, protein: 0.5, carbs: 10, fat: 0, portion: '' }).id, 'a', 'aus der Sicherung');
});

test('mergeFoods aktualisiert gleiche Namen und hängt neue an', () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const start = mergeFoods([], [cleanFood(kaese)], { newId });
  eq([start.list.length, start.list[0].id, start.added], [1, 'id1', ['Räucherkäse (Milbona)']]);
  const again = mergeFoods(start.list, [cleanFood({ ...kaese, name: 'räucherkäse  (milbona)' })], { newId });
  eq([again.list.length, again.added, again.updated], [1, [], []], 'gleiche Werte: nichts zu tun');
  eq(mergeFoods(start.list, [cleanFood({ ...kaese, portion_note: '' })], { newId }).updated, [], 'gleiche Werte ohne Portion: nichts zu tun');
  const changed = mergeFoods(start.list, [cleanFood({ ...kaese, kcal_100: 320, portion_note: '' })], { newId });
  eq([changed.list[0].id, changed.list[0].kcal, changed.list[0].portion, changed.updated.length], ['id1', 320, '1 Scheibe ≈ 20 g', 1], 'neue Werte, alte Portion bleibt');
  const kept = mergeFoods(start.list, [cleanFood({ ...kaese, kcal_100: 320 })], { keepExisting: true, newId });
  eq([kept.list[0].kcal, kept.updated.length], [314, 0], 'Import überschreibt nicht');
  const more = mergeFoods(start.list, [cleanFood({ name: 'Saft', unit: 'ml', kcal_100: 44 })], { newId });
  eq([more.list.length, more.list[1].id], [2, 'id2']);
});

test('foodsForClaude: kurze Kennungen und knapper Text', () => {
  const { text, keys } = foodsForClaude([cleanFood(kaese), cleanFood({ name: 'Saft', unit: 'ml', kcal_100: 44.5, carbs_100_g: 10 })]);
  eq(keys, { L1: 'Räucherkäse (Milbona)', L2: 'Saft' });
  eq(text.split('\n'), [
    'Meine Lebensmittel (gespeicherte Packungswerte):',
    'L1: Räucherkäse (Milbona) – je 100 g: 314 kcal, P 20 g, KH 1 g, F 26 g – 1 Scheibe ≈ 20 g',
    'L2: Saft – je 100 ml: 44,5 kcal, P 0 g, KH 10 g, F 0 g',
  ]);
  eq(foodsForClaude([]), { text: '', keys: {} });
});

// ---------- Protokoll ----------

test('logEntry kürzt Texte, rundet Zahlen und lässt Leeres weg', () => {
  const e = logEntry('claude', { ms: 1234.567, cent: 2.58041, text: 'x'.repeat(400), leer: '', nix: undefined, ok: true, kaputt: NaN, liste: ['a', 'b'] }, new Date('2026-10-09T10:00:00Z'));
  eq([e.t, e.e, e.ms, e.cent, e.text.length, 'leer' in e, 'nix' in e, e.ok, e.kaputt, e.liste], ['2026-10-09T10:00:00.000Z', 'claude', 1234.57, 2.58, 300, false, false, true, 'NaN', 'a,b']);
});

test('trimLog behält nur die jüngsten Einträge der letzten 60 Tage', () => {
  const now = new Date('2026-10-09T10:00:00Z');
  eq(trimLog([{ t: '2026-08-01T00:00:00Z' }, { t: '2026-09-01T00:00:00Z' }, null, { e: 'ohne Zeit' }], now), [{ t: '2026-09-01T00:00:00Z' }]);
  const many = Array.from({ length: 900 }, (_, i) => ({ t: '2026-10-09T09:00:00Z', i }));
  const kept = trimLog(many, now);
  eq([kept.length, kept[0].i, kept.at(-1).i], [800, 100, 899]);
});

function runTests() {
  return TESTS.map(({ name, fn }) => {
    try {
      fn();
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, error: err.message };
    }
  });
}

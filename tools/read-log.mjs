// Liest das Protokoll aus der neuesten Sicherung (oder einer angegebenen Datei) und fasst es zusammen.
// node tools/read-log.mjs [datei.json] [--alle]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const local = (t) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
const BACKUP_DIR = join(homedir(), 'Documents/2 Persönlich/Gesundheit/Kcal-App Backups');
const args = process.argv.slice(2);
const all = args.includes('--alle');
const file =
  args.find((a) => !a.startsWith('--')) ??
  join(BACKUP_DIR, readdirSync(BACKUP_DIR).filter((f) => /^kalorientracker-sicherung-.*\.json$/.test(f)).sort().at(-1));

const backup = JSON.parse(readFileSync(file, 'utf8'));
const log = backup.log ?? [];
console.log(`${file}\n${backup.meals.length} Mahlzeiten, ${log.length} Protokolleinträge` + (log.length ? ` (${local(log[0].t)} bis ${local(log.at(-1).t)})` : ''));
if (!log.length) process.exit(0);

const count = (list, key) => Object.entries(list.reduce((m, x) => ((m[x[key]] = (m[x[key]] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const sum = (list, key) => list.reduce((s, x) => s + (Number(x[key]) || 0), 0);

const claude = log.filter((x) => x.e === 'claude');
console.log(`\nClaude: ${claude.length} Anfragen, ${sum(claude, 'cent').toFixed(1)} Cent`);
for (const [art, n] of count(claude, 'art')) {
  const list = claude.filter((x) => x.art === art);
  const secs = list.map((x) => x.ms / 1000).sort((a, b) => a - b);
  console.log(`  ${art}: ${n}× · Mitte ${secs[Math.floor(secs.length / 2)].toFixed(0)} s, längste ${secs.at(-1).toFixed(0)} s · ${sum(list, 'cent').toFixed(1)} ct`);
}
const notOk = claude.filter((x) => x.ergebnis !== 'ok');
if (notOk.length) console.log('  nicht ok:', count(notOk, 'ergebnis').map(([k, n]) => `${k} (${n}×)`).join(' · '));
const models = count(claude.filter((x) => x.modell), 'modell');
if (models.length > 1) console.log('  Modelle:', models.map(([k, n]) => `${k} ${n}×`).join(', '));

const discarded = log.filter((x) => x.e === 'verworfen');
if (discarded.length) console.log(`\nVerworfen: ${discarded.length}× (${sum(discarded, 'cent').toFixed(1)} ct ohne Ergebnis)`);
const starts = log.filter((x) => x.e === 'start');
if (starts.length) {
  const ms = starts.map((x) => x.ms).sort((a, b) => a - b);
  console.log(`\nStarts: ${starts.length}× · Mitte ${Math.round(ms[Math.floor(ms.length / 2)])} ms · Versionen ${[...new Set(starts.map((x) => x.version))].join(', ')} · offline ${starts.filter((x) => x.online === false).length}×`);
}

const problems = log.filter((x) => ['fehler', 'codefehler', 'ladefehler', 'schutzregel', 'speicherfehler'].includes(x.e));
console.log(`\nFehler und Probleme: ${problems.length}`);
for (const x of problems) console.log(`  ${local(x.t)} ${x.e}: ${x.text ?? x.datei ?? x.adresse ?? ''}${x.wo ? ` [${x.wo}]` : ''}${x.ort ? ` @ ${x.ort}` : ''}`);

if (all) {
  console.log('\nAlle Einträge:');
  for (const { t, e, ...rest } of log) console.log(`  ${local(t)} ${e} ${JSON.stringify(rest)}`);
}

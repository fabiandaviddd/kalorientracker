// Liest das Protokoll aus der neuesten Sicherung (oder einer angegebenen Datei) und fasst es zusammen.
// node tools/read-log.mjs [datei.json] [--alle]
// node tools/read-log.mjs --briefkasten [--tage 14] [--alle]   – direkt aus dem Cloudflare-Briefkasten (ohne neue Sicherung)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const local = (t) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
const BACKUP_DIR = join(homedir(), 'Documents/2 Persönlich/Gesundheit/Kcal-App Backups');
const NAMESPACE = '1a676de8b52546d4baa7b1c321caf04f'; // KV „kalorientracker-briefkasten“ (tools/briefkasten)
const STATE = new URL('../.claude/state/', import.meta.url).pathname;
const args = process.argv.slice(2);
const all = args.includes('--alle');
const fromMailbox = args.includes('--briefkasten');
const days = args.includes('--tage') ? Number(args[args.indexOf('--tage') + 1]) || 14 : 14;
const file =
  args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--tage') ??
  join(BACKUP_DIR, readdirSync(BACKUP_DIR).filter((f) => /^kalorientracker-sicherung-.*\.json$/.test(f)).sort().at(-1));

const backup = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(STATE, { recursive: true });

// Briefkasten: ein Schlüssel pro Gerät und Tag (p/<gerät>/<JJJJ-MM-TT>), gelesen über das angemeldete Cloudflare-Konto
const wrangler = (...a) => ['-y', 'wrangler@4', ...a, '--namespace-id', NAMESPACE, '--remote'];
async function readMailbox() {
  const device = backup.geraet; // ältere Sicherungen kennen die Kennung noch nicht – dann alle Geräte
  const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  const listed = JSON.parse(execFileSync('npx', wrangler('kv', 'key', 'list', '--prefix', device ? `p/${device}/` : 'p/'), quiet)).map((k) => k.name);
  if (!device) {
    const byDevice = Object.groupBy(listed, (n) => n.split('/')[1]);
    console.log('Gerätekennung noch nicht in der Sicherung – im Briefkasten:', Object.entries(byDevice).map(([d, k]) => `${d} (${k.length} Tage)`).join(', ') || 'nichts');
  }
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const keys = listed.filter((n) => n.split('/')[2] >= since).sort();
  const run = promisify(execFile);
  const parts = [];
  for (let i = 0; i < keys.length; i += 5) {
    const got = await Promise.all(keys.slice(i, i + 5).map((k) => run('npx', wrangler('kv', 'key', 'get', k, '--text'), { maxBuffer: 50e6 })));
    parts.push(...got.map((r) => JSON.parse(r.stdout)));
  }
  const seen = new Set();
  const unique = (x) => {
    const k = `${x.t}|${x.e}|${JSON.stringify(x)}`;
    return !seen.has(k) && seen.add(k);
  };
  return parts.flat().filter(unique).sort((a, b) => a.t.localeCompare(b.t));
}

let log;
if (fromMailbox) {
  log = await readMailbox();
  // Merken, bis wohin gelesen wurde (für den Hinweis beim Sitzungsstart)
  if (log.length) writeFileSync(join(STATE, 'briefkasten-gelesen'), log.at(-1).t);
  console.log(
    `Briefkasten, letzte ${days} Tage: ${log.length} Protokolleinträge` +
      (log.length ? ` (${local(log[0].t)} bis ${local(log.at(-1).t)})` : '') +
      `\nMahlzeiten laut neuester Sicherung (${file.split('/').at(-1)}): ${backup.meals.length}`
  );
} else {
  // Merken, bis zu welcher Sicherung ausgewertet wurde (der Hinweis beim Sitzungsstart in .claude/ liest das)
  const SEEN = join(STATE, 'protokoll-gelesen');
  const seen = existsSync(SEEN) ? Number(readFileSync(SEEN, 'utf8').trim()) || 0 : 0;
  if (statSync(file).mtimeMs > seen) writeFileSync(SEEN, String(statSync(file).mtimeMs));
  log = backup.log ?? [];
  console.log(`${file}\n${backup.meals.length} Mahlzeiten, ${log.length} Protokolleinträge` + (log.length ? ` (${local(log[0].t)} bis ${local(log.at(-1).t)})` : ''));
}
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

const taps = log.filter((x) => x.e === 'tipp' && (!x.auto || x.auto === 'doppeltipp'));
if (taps.length) console.log(`\nTipps: ${taps.length} · häufigste: ${count(taps, 'knopf').slice(0, 6).map(([k, n]) => `${k} ${n}×`).join(', ')}`);
const turns = log.filter((x) => x.e === 'gedreht');
const shifted = log.filter((x) => x.e === 'seite verschoben');
if (turns.length || shifted.length) console.log(`Gedreht: ${turns.length}× · Seite verschoben und zurückgesetzt: ${shifted.length}×`);

// App-Starts ohne „start“-Eintrag deuten auf verlorene Einträge oder ein zweites Fenster hin
const sessions = [...new Set(log.map((x) => x.s).filter(Boolean))];
const noStart = sessions.filter((s) => !log.some((x) => x.s === s && x.e === 'start'));
if (sessions.length) console.log(`Sitzungen: ${sessions.length}${noStart.length ? ` · ohne Start-Eintrag: ${noStart.join(', ')}` : ''}`);

const problems = log.filter((x) => ['fehler', 'codefehler', 'ladefehler', 'schutzregel', 'speicherfehler', 'protokollfehler', 'seite verschoben', 'anfrage hing', 'briefkasten fehler'].includes(x.e));
console.log(`\nFehler und Probleme: ${problems.length}`);
for (const x of problems) console.log(`  ${local(x.t)} ${x.e}: ${x.text ?? x.datei ?? x.adresse ?? x.grund ?? ''}${x.wo ? ` [${x.wo}]` : ''}${x.ort ? ` @ ${x.ort}` : ''}${x.e === 'seite verschoben' ? ` (oben ${x.seiteOben}, Sicht ${x.sichtOben}, Zoom ${x.zoom})` : ''}`);

if (all) {
  console.log('\nAlle Einträge:');
  for (const { t, e, s: session, ...rest } of log) console.log(`  ${local(t)} ${session ?? '    '} ${e} ${JSON.stringify(rest)}`);
}

// Führt alle Klickprüfungen ohne Browserfenster aus: WebKit (Safari-Unterbau) in iPhone-Größe, Claude vorgespielt.
// Startet dafür einen eigenen kleinen Webserver; jede Prüfung beginnt mit leerem Speicher.
// Aufruf: node tools/run-scenarios.mjs            (alle)
//         node tools/run-scenarios.mjs lebensmittel (nur eine Gruppe: szenarien | lebensmittel)
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';
const { webkit, devices } = await import(PLAYWRIGHT);

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const only = process.argv[2];
const failures = [];
let total = 0;

// Eine frische App (leerer Speicher), Prüfskript laden, ausführen
async function run(name, script, call, { reloadThen } = {}) {
  // Dauerhaftes (aber frisches) Profil: nur so speichert WebKit Fotos in der Datenbank – wie Safari auf dem iPhone
  const profile = await mkdtemp(join(tmpdir(), 'kt-pruefung-'));
  const context = await webkit.launchPersistentContext(profile, { ...devices['iPhone 15'], serviceWorkers: 'block' });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`Konsole: ${msg.text()}`);
  });
  const load = async () => {
    await page.goto(url);
    await page.waitForFunction(() => typeof renderDay === 'function' && document.readyState === 'complete');
    await page.addScriptTag({ url: `_entwurf/${script}` });
  };
  const report = (label, result) => {
    total += result.ok + result.failed;
    const bad = result.failed ? result.results.filter((r) => !r.ok) : [];
    console.log(`${result.failed ? '✗' : '✓'} ${label}: ${result.ok} von ${result.ok + result.failed}`);
    for (const r of bad) {
      console.log(`    ✗ ${r.name}${r.info ? ` – ${r.info}` : ''}`);
      failures.push(`${label}: ${r.name}`);
    }
  };
  await load();
  report(name, await page.evaluate(call));
  if (reloadThen) {
    await load();
    report(`${name} (nach Neustart)`, await page.evaluate(reloadThen));
  }
  // Von der Schutzregel (CSP) blockierte Inhalte schreibt die App ins Protokoll
  const blocked = await page.evaluate(async () => (await readLog()).filter((x) => x.e === 'schutzregel').map((x) => `${x.regel} ${x.adresse}`));
  for (const b of blocked) errors.push(`Schutzregel blockiert: ${b}`);
  for (const e of errors) {
    console.log(`    ✗ Fehler in der Seite: ${e}`);
    failures.push(`${name}: Seitenfehler ${e}`);
  }
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

try {
  if (!only || only === 'szenarien') {
    await run('Abläufe', 'szenarien.js', () => window.__szenarien('a'), { reloadThen: () => window.__szenarien('b') });
  }
  if (!only || only === 'lebensmittel') {
    await run('Meine Lebensmittel', 'szenarien-lebensmittel.js', () => window.__lebensmittel());
  }
} finally {
  server.close();
}

if (total === 0) console.log('\nKeine Prüfung gelaufen – Gruppe falsch geschrieben? (szenarien | lebensmittel)');
else console.log(failures.length ? `\n${failures.length} von ${total} Prüfungen fehlgeschlagen` : `\nAlle ${total} Klickprüfungen bestanden`);
if (total === 0) failures.push('leer');
process.exitCode = failures.length ? 1 : 0;

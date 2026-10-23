// Veröffentlicht die App in einem Schritt – oder setzt eine Testnummer für die lokale Vorschau.
//   node tools/release.mjs --dev            ?v= auf eine frische Testnummer (Browser lädt neu, nichts wird hochgeladen)
//   node tools/release.mjs "Was sich ändert" Version hochzählen, prüfen, committen, hochladen, live nachsehen
//   node tools/release.mjs --check          nur prüfen wie beim Veröffentlichen (Schlüssel, Tests, Klicks), nichts ändern
// Bricht ab (ohne hochzuladen), wenn ein Test fehlschlägt oder ein Claude-Schlüssel im Projekt steht.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'fabiandaviddd/kalorientracker';
const LIVE = 'https://fabiandaviddd.github.io/kalorientracker/';
const VERSIONED = ['styles.css', 'logic.js', 'log.js', 'app.js']; // Icons haben ihre eigene Nummer
const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{16,}/; // ein echter Schlüssel, nicht der Platzhalter „sk-ant-…“

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
const step = (text) => console.log(`\n▸ ${text}`);
let restoreOnFail = () => {};
const fail = (text) => {
  restoreOnFail();
  console.error(`\n✗ ${text}`);
  process.exit(1);
};

const indexPath = `${root}index.html`;
const setVersion = (html, version) =>
  VERSIONED.reduce((h, file) => h.replace(new RegExp(`${file.replace('.', '\\.')}\\?v=[A-Za-z0-9]+`, 'g'), `${file}?v=${version}`), html);

const arg = process.argv[2];
if (!arg) fail('Bitte eine kurze Beschreibung angeben: node tools/release.mjs "Was sich ändert" (oder --dev)');
// Genau ein Argument: „"Text" --check“ hat am 14.10. still veröffentlicht, weil nur das erste gelesen wurde
if (process.argv.length > 3) {
  fail(
    `Genau ein Argument erwartet, bekommen: ${process.argv.length - 2} (${process.argv.slice(2).map((a) => JSON.stringify(a)).join(' ')}).\n` +
      '  Veröffentlichen: node tools/release.mjs "Was sich ändert" · nur prüfen: node tools/release.mjs --check · Vorschau: --dev'
  );
}

// ---------- Testnummer für die Vorschau ----------
if (arg === '--dev') {
  const stamp = `dev${Math.floor(Date.now() / 1000)}`;
  writeFileSync(indexPath, setVersion(readFileSync(indexPath, 'utf8'), stamp));
  console.log(`Testnummer gesetzt: ?v=${stamp}`);
  process.exit(0);
}

// ---------- Veröffentlichen (oder nur prüfen) ----------
const checkOnly = arg === '--check';
const message = arg;
const originalIndex = readFileSync(indexPath, 'utf8');
const restore = () => {
  if (!checkOnly) return;
  writeFileSync(indexPath, originalIndex);
  sh('git', ['reset', '-q']);
};
restoreOnFail = restore;
if (sh('git', ['branch', '--show-current']).trim() !== 'main') fail('Nicht auf main – erst wechseln.');

step('Nächste Versionsnummer');
const released = sh('git', ['show', 'HEAD:index.html']).match(/app\.js\?v=(\d+)/);
if (!released) fail('Keine veröffentlichte Versionsnummer in index.html gefunden.');
const next = Number(released[1]) + 1;
writeFileSync(indexPath, setVersion(readFileSync(indexPath, 'utf8'), next));
const html = readFileSync(indexPath, 'utf8');
for (const file of VERSIONED) if (!html.includes(`${file}?v=${next}`)) fail(`${file} hat nicht v=${next} in index.html.`);
console.log(`v=${released[1]} → v=${next}`);

step('Suche nach Claude-Schlüsseln');
sh('git', ['add', '-A']);
const staged = sh('git', ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
if (staged.length === 0 && !checkOnly) fail('Keine Änderungen zum Veröffentlichen.');
for (const file of sh('git', ['ls-files']).split('\n').filter(Boolean)) {
  if (/\.(png|woff2|jpg)$/.test(file)) continue;
  let text;
  try {
    text = readFileSync(`${root}${file}`, 'utf8');
  } catch {
    continue; // gelöschte Datei
  }
  if (KEY_PATTERN.test(text)) {
    sh('git', ['reset', '-q']);
    fail(`In ${file} steht etwas, das wie ein Claude-Schlüssel aussieht. Nichts hochgeladen.`);
  }
}
console.log(`${staged.length} geänderte Dateien, kein Schlüssel gefunden`);

step('Automatische Tests');
try {
  console.log(sh('node', ['tools/run-tests.mjs']).trim().split('\n').at(-1));
} catch (err) {
  sh('git', ['reset', '-q']);
  fail(`Tests fehlgeschlagen – nichts hochgeladen.\n${err.stdout ?? ''}`);
}

step('Klickprüfungen (WebKit, iPhone-Größe)');
try {
  console.log(sh('node', ['tools/run-scenarios.mjs'], { timeout: 300_000 }).trim().split('\n').at(-1));
} catch (err) {
  sh('git', ['reset', '-q']);
  fail(`Klickprüfungen fehlgeschlagen – nichts hochgeladen.\n${err.stdout ?? ''}`);
}

if (checkOnly) {
  restore();
  console.log('\n✓ Alles bereit zum Veröffentlichen (nur geprüft, nichts geändert).');
  process.exit(0);
}

step('Commit und hochladen');
sh('git', ['commit', '-q', '-F', '-'], { input: `${message}; alle Dateien auf v=${next}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n` });
const commit = sh('git', ['rev-parse', 'HEAD']).trim();
sh('git', ['push', '-q']);
console.log(`Commit ${commit.slice(0, 7)} hochgeladen`);

step('Warten, bis GitHub Pages fertig ist');
const deadline = Date.now() + 6 * 60_000;
let status = '';
while (Date.now() < deadline) {
  try {
    const build = JSON.parse(sh('gh', ['api', `repos/${REPO}/pages/builds/latest`]));
    status = `${build.status} ${build.commit?.slice(0, 7)}`;
    if (build.commit === commit && build.status === 'built') break;
    if (build.commit === commit && build.status === 'errored') fail('GitHub Pages meldet einen Fehler beim Bauen.');
  } catch {
    // kurz nicht erreichbar – weiter warten
  }
  execFileSync('sleep', ['10']);
}
if (!status.startsWith('built')) fail(`GitHub Pages ist nach 6 Minuten nicht fertig (zuletzt: ${status}).`);
console.log('gebaut');

step('Live nachsehen');
const live = await (await fetch(`${LIVE}?nocache=${Date.now()}`, { cache: 'no-store' })).text();
const missing = VERSIONED.filter((file) => !live.includes(`${file}?v=${next}`));
if (missing.length) fail(`Live-Seite verlangt noch nicht v=${next} für: ${missing.join(', ')} (Zwischenspeicher von GitHub? In ein paar Minuten nochmal prüfen).`);
for (const file of VERSIONED) {
  const response = await fetch(`${LIVE}${file}?v=${next}`, { cache: 'no-store' });
  if (!response.ok) fail(`${file}?v=${next} ist live nicht abrufbar (${response.status}).`);
}
console.log(`\n✓ v=${next} ist live. Auf dem iPhone: ca. 10 Minuten warten, App ganz schließen und neu öffnen.`);

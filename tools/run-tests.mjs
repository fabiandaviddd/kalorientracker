// Führt tests.js am Mac aus (ohne Browser): node tools/run-tests.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const context = vm.createContext({ console });
for (const file of ['logic.js', 'tests.js']) vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
const results = vm.runInContext('runTests()', context);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n    ${r.error}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} von ${results.length} Tests fehlgeschlagen` : `\nAlle ${results.length} Tests bestanden`);
process.exitCode = failed ? 1 : 0;

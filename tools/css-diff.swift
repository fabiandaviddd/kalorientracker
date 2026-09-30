// Prüft, ob ein umgebautes styles.css genau gleich wirkt wie eine alte Fassung: Für jeden Zustand aus
// _entwurf/demo.js werden die berechneten Stile ALLER Elemente (samt ::before/::after) mit beiden Fassungen
// verglichen – in hell/dunkel, mit/ohne erhöhten Kontrast, mit/ohne reduzierte Bewegung, als Home-Bildschirm-App
// oder im Browser und mit „gedrückt“ (:active) für alle Elemente. Läuft mit WebKit wie auf dem iPhone.
// Aufruf (Vorschau auf Port 8321 muss laufen): swift tools/css-diff.swift <alte-css> <neue-css> <zustand> [<zustand> …]
import AppKit
import WebKit

let args = Array(CommandLine.arguments.dropFirst())
let (oldCss, newCss) = (args[0], args[1])
let screens = Array(args.dropFirst(2))

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Loader: NSObject, WKNavigationDelegate {
    var done = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done = true }
}

func spin(_ seconds: Double) { RunLoop.main.run(until: Date().addingTimeInterval(seconds)) }

let compareJs = """
const [oldText, newText] = await Promise.all([oldHref, newHref].map((h) => fetch(h + '?' + Date.now()).then((r) => r.text())));
document.getElementById('__still')?.remove();
for (const l of document.querySelectorAll('link[rel=stylesheet]')) l.disabled = true;
const style = document.createElement('style');
document.head.append(style);

// Medienabfragen fest auf wahr/falsch setzen, :active als Klasse erzwingbar machen
function transform(css, v) {
  css = css.replace(/@media ([^{]+)\\{/g, (m, cond) => {
    const c = cond
      .replace(/\\(prefers-color-scheme:\\s*dark\\)/g, v.dark ? 'T' : 'F')
      .replace(/\\(prefers-color-scheme:\\s*light\\)/g, v.dark ? 'F' : 'T')
      .replace(/\\(prefers-contrast:\\s*more\\)/g, v.contrast ? 'T' : 'F')
      .replace(/\\(prefers-reduced-motion:\\s*reduce\\)/g, v.reduce ? 'T' : 'F')
      .replace(/\\(prefers-reduced-motion:\\s*no-preference\\)/g, v.reduce ? 'F' : 'T')
      .replace(/\\(display-mode:\\s*standalone\\)/g, v.standalone ? 'T' : 'F');
    const parts = c.split(',').map((p) => p.trim().split(/\\s+and\\s+/));
    for (const p of parts) for (const t of p) if (t !== 'T' && t !== 'F') throw new Error('Unbekannte Medienabfrage: ' + cond);
    return parts.some((p) => p.every((t) => t === 'T')) ? '@media all {' : '@media not all {';
  });
  if (v.active) css = css.replace(/:active/g, '.__act');
  return css;
}

const els = [...document.querySelectorAll('*')];
function snapshot(css, v) {
  style.textContent = transform(css, v);
  for (const el of els) el.classList.toggle('__act', Boolean(v.active));
  getComputedStyle(document.body).color; // Stile neu berechnen
  for (const a of document.getAnimations()) a.cancel(); // Übergänge nicht mittendrin messen
  const out = [];
  for (const el of els) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) { out.push(null); continue; }
      const vals = {};
      for (let i = 0; i < cs.length; i++) { const p = cs.item(i); if (!p.startsWith('--')) vals[p] = cs.getPropertyValue(p); }
      out.push(vals);
    }
  }
  return out;
}

function label(el) {
  let s = el.tagName.toLowerCase();
  if (el.id) s += '#' + el.id;
  else if (el.className && typeof el.className === 'string') s += '.' + el.className.replace('__act', '').trim().split(/\\s+/).join('.');
  const parent = el.parentElement;
  return (parent && parent !== document.body && parent !== document.documentElement ? (parent.id ? '#' + parent.id : parent.tagName.toLowerCase() + (parent.className ? '.' + String(parent.className).replace('__act', '').trim().split(/\\s+/)[0] : '')) + ' > ' : '') + s;
}

const variants = [];
for (const dark of [false, true]) for (const contrast of [false, true]) for (const reduce of [false, true]) for (const active of [false, true])
  variants.push({ dark, contrast, reduce, active, standalone: true });
variants.push({ dark: false, contrast: false, reduce: false, active: false, standalone: false });
variants.push({ dark: true, contrast: false, reduce: false, active: false, standalone: false });

// Gleiche Unterschiede in mehreren Varianten nur einmal melden (mit den Varianten dahinter)
const kinds = new Map();
let total = 0;
const note = (text, name) => { total++; if (!kinds.has(text)) kinds.set(text, new Set()); kinds.get(text).add(name); };
for (const v of variants) {
  const a = snapshot(oldText, v);
  const b = snapshot(newText, v);
  const name = Object.entries(v).filter(([, on]) => on).map(([k]) => k).join('+') || 'browser-hell';
  for (let i = 0; i < a.length; i++) {
    const el = els[Math.floor(i / 3)];
    const pseudo = ['', '::before', '::after'][i % 3];
    if ((a[i] === null) !== (b[i] === null)) { note(`${label(el)}${pseudo} | Pseudo-Element ${a[i] ? 'fehlt jetzt' : 'neu'}`, name); continue; }
    if (!a[i]) continue;
    for (const p of new Set([...Object.keys(a[i]), ...Object.keys(b[i])])) {
      if (a[i][p] !== b[i][p]) note(`${label(el)}${pseudo} | ${p}: ${a[i][p]} → ${b[i][p]}`, name);
    }
  }
}
const diffs = [...kinds].map(([text, names]) => `${text}   [${names.size === variants.length ? 'alle Varianten' : [...names].join(', ')}]`);
style.remove();
for (const l of document.querySelectorAll('link[rel=stylesheet]')) l.disabled = false;
return JSON.stringify({ elements: els.length, variants: variants.length, total, diffs });
"""

var grandTotal = 0
for screen in screens {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    let window = NSWindow(contentRect: NSRect(x: -5000, y: -5000, width: 390, height: 844), styleMask: [.borderless], backing: .buffered, defer: false)
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
    window.contentView = web
    window.orderBack(nil)
    let loader = Loader()
    web.navigationDelegate = loader
    web.load(URLRequest(url: URL(string: "http://localhost:8321/")!))
    let start = Date()
    while !loader.done && Date().timeIntervalSince(start) < 15 { spin(0.05) }

    var ready = false
    let demo = """
    await new Promise((r) => { const s = document.createElement('script'); s.src = '_entwurf/demo.js?' + Date.now(); s.onload = r; document.head.append(s); });
    await window.__demo('', screen);
    return 1;
    """
    web.callAsyncJavaScript(demo, arguments: ["screen": screen], in: nil, in: .page) { result in
        if case .failure(let e) = result { print("JS-Fehler (Demo):", e) }
        ready = true
    }
    var t = Date()
    while !ready && Date().timeIntervalSince(t) < 20 { spin(0.05) }
    spin(0.3)

    var output: String?
    web.callAsyncJavaScript(compareJs, arguments: ["oldHref": oldCss, "newHref": newCss], in: nil, in: .page) { result in
        switch result {
        case .success(let v): output = v as? String
        case .failure(let e): output = "{\"error\": \"\(e)\"}"
        }
    }
    t = Date()
    while output == nil && Date().timeIntervalSince(t) < 300 { spin(0.05) }
    guard let text = output, let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        print("\(screen): keine Antwort \(output ?? "")"); grandTotal += 1; window.close(); continue
    }
    if let err = json["error"] { print("\(screen): FEHLER \(err)"); grandTotal += 1; window.close(); continue }
    let total = json["total"] as? Int ?? -1
    grandTotal += total
    print("\(screen): \(json["elements"] ?? 0) Elemente × \(json["variants"] ?? 0) Varianten → \(total == 0 ? "gleich" : "\(total) Unterschiede")")
    for line in (json["diffs"] as? [String] ?? []) { print("   ", line) }
    window.close()
}
print(grandTotal == 0 ? "ALLES GLEICH" : "UNTERSCHIEDE: \(grandTotal)")

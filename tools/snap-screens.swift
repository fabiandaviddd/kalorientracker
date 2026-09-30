// Fotografiert die lokal laufende App (Vorschau „kalorientracker“, Port 8321) mit WebKit in iPhone-Breite.
// Beispieldaten kommen aus _entwurf/demo.js (nicht im Repo). Aufruf: swift tools/snap-screens.swift <ordner> - today light - review dark …
import AppKit
import WebKit

// Fotografiert die lokale App (http://localhost:8321) mit WebKit in iPhone-Breite.
// Aufruf: swift snap.swift <ausgabeordner> <entwurf|-> <today|review> <light|dark> [...]
let args = Array(CommandLine.arguments.dropFirst())
let outDir = args[0]
var jobs: [(String, String, String)] = []
var i = 1
while i + 2 < args.count + 0 || i + 2 <= args.count - 1 { jobs.append((args[i], args[i + 1], args[i + 2])); i += 3 }

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Loader: NSObject, WKNavigationDelegate {
    var done = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done = true }
}

func spin(_ seconds: Double) { RunLoop.main.run(until: Date().addingTimeInterval(seconds)) }

for (draft, screen, mode) in jobs {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    let frame = NSRect(x: 0, y: 0, width: 390, height: 844)
    let window = NSWindow(contentRect: NSRect(x: -5000, y: -5000, width: 390, height: 844), styleMask: [.borderless], backing: .buffered, defer: false)
    let web = WKWebView(frame: frame, configuration: config)
    web.appearance = NSAppearance(named: mode == "dark" ? .darkAqua : .aqua)
    window.contentView = web
    window.orderBack(nil)
    let loader = Loader()
    web.navigationDelegate = loader
    web.load(URLRequest(url: URL(string: "http://localhost:8321/")!))
    let start = Date()
    while !loader.done && Date().timeIntervalSince(start) < 15 { spin(0.05) }

    var ready = false
    let js = """
    await new Promise((r) => { const s = document.createElement('script'); s.src = '_entwurf/demo.js?' + Date.now(); s.onload = r; document.head.append(s); });
    await window.__demo(draft === '-' ? '' : draft, screen);
    return 1;
    """
    web.callAsyncJavaScript(js, arguments: ["draft": draft, "screen": screen], in: nil, in: .page) { result in
        if case .failure(let e) = result { print("JS-Fehler:", e) }
        ready = true
    }
    let t = Date()
    while !ready && Date().timeIntervalSince(t) < 15 { spin(0.05) }
    spin(0.6)
    // Lange Bildschirme ganz aufnehmen (höchstens 1900 px hoch)
    var fullHeight = 844.0
    web.evaluateJavaScript("(document.querySelector('.view:not([hidden])') || document.documentElement).scrollHeight") { v, _ in if let n = v as? Double { fullHeight = n } }
    spin(0.3)
    // „…-scrolled“: nur den sichtbaren Bildschirm fotografieren (für schwebende Elemente beim Scrollen)
    let h = screen.hasSuffix("scrolled") ? 844.0 : min(max(844.0, fullHeight), 1900.0)
    window.setContentSize(NSSize(width: 390, height: h))
    web.frame = NSRect(x: 0, y: 0, width: 390, height: h)
    spin(0.8)

    var image: NSImage?
    let snapConfig = WKSnapshotConfiguration()
    snapConfig.rect = NSRect(x: 0, y: 0, width: 390, height: h)
    web.takeSnapshot(with: snapConfig) { img, err in
        if let err { print("Foto-Fehler:", err) }
        image = img
    }
    let t2 = Date()
    while image == nil && Date().timeIntervalSince(t2) < 10 { spin(0.05) }
    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) {
        let name = "\(outDir)/\(draft == "-" ? "aktuell" : draft)-\(screen)-\(mode).png"
        try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: name))
        print("gespeichert:", name)
    }
    window.close()
}

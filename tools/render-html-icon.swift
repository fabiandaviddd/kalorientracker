// Zeichnet ein App-Symbol aus einer HTML-Datei (1024 × 1024, Schrift aus fonts/) mit WebKit und speichert es als PNG.
// Aufruf im Projektordner: swift tools/render-html-icon.swift <symbol.html> <ausgabe.png> [größe=1024]
import AppKit
import WebKit

let args = Array(CommandLine.arguments.dropFirst())
let input = URL(fileURLWithPath: args[0]).standardizedFileURL
let output = args[1]
let size = args.count > 2 ? Double(args[2])! : 1024

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Loader: NSObject, WKNavigationDelegate {
    var done = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done = true }
}
func spin(_ s: Double) { RunLoop.main.run(until: Date().addingTimeInterval(s)) }

let frame = NSRect(x: 0, y: 0, width: 1024, height: 1024)
let window = NSWindow(contentRect: NSRect(x: -5000, y: -5000, width: 1024, height: 1024), styleMask: [.borderless], backing: .buffered, defer: false)
let web = WKWebView(frame: frame, configuration: WKWebViewConfiguration())
window.contentView = web
window.orderBack(nil)
let loader = Loader()
web.navigationDelegate = loader
web.loadFileURL(input, allowingReadAccessTo: URL(fileURLWithPath: FileManager.default.currentDirectoryPath))
let start = Date()
while !loader.done && Date().timeIntervalSince(start) < 15 { spin(0.05) }
var ready = false
web.callAsyncJavaScript("await document.fonts.ready; return 1;", arguments: [:], in: nil, in: .page) { _ in ready = true }
while !ready { spin(0.05) }
spin(0.5)

var image: NSImage?
let config = WKSnapshotConfiguration()
config.rect = frame
config.snapshotWidth = NSNumber(value: size)
web.takeSnapshot(with: config) { img, _ in image = img }
while image == nil { spin(0.05) }
// Pixelgenau in der gewünschten Größe schreiben
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
image!.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print("gespeichert:", output)

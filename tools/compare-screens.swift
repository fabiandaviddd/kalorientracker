// Vergleicht zwei Ordner mit Bildschirmfotos (gleiche Dateinamen) Pixel für Pixel.
// Unterschiede werden rot markiert als <ausgabe>/<name> gespeichert. Aufruf: swift tools/compare-screens.swift <vorher> <nachher> <ausgabe>
import AppKit

let args = Array(CommandLine.arguments.dropFirst())
let (dirA, dirB, outDir) = (args[0], args[1], args[2])
let fm = FileManager.default
try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func bitmap(_ path: String) -> NSBitmapImageRep? {
    guard let data = fm.contents(atPath: path), let rep = NSBitmapImageRep(data: data) else { return nil }
    // Einheitlich als RGBA 8 Bit, damit die Bytes vergleichbar sind
    guard let norm = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: rep.pixelsWide, pixelsHigh: rep.pixelsHigh, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: rep.pixelsWide * 4, bitsPerPixel: 32) else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: norm)
    rep.draw(in: NSRect(x: 0, y: 0, width: rep.pixelsWide, height: rep.pixelsHigh))
    NSGraphicsContext.restoreGraphicsState()
    return norm
}

var changed = 0
let names = ((try? fm.contentsOfDirectory(atPath: dirA)) ?? []).filter { $0.hasSuffix(".png") }.sorted()
for name in names {
    guard let a = bitmap("\(dirA)/\(name)") else { continue }
    guard let b = bitmap("\(dirB)/\(name)") else { print("FEHLT  \(name)"); changed += 1; continue }
    if a.pixelsWide != b.pixelsWide || a.pixelsHigh != b.pixelsHigh {
        print("GRÖSSE \(name): \(a.pixelsWide)×\(a.pixelsHigh) → \(b.pixelsWide)×\(b.pixelsHigh)")
        changed += 1
        continue
    }
    let w = a.pixelsWide, h = a.pixelsHigh
    let pa = a.bitmapData!, pb = b.bitmapData!
    var diff = 0
    var minY = h, maxY = -1
    let out = b.copy() as! NSBitmapImageRep
    let po = out.bitmapData!
    for y in 0..<h {
        for x in 0..<w {
            let i = (y * w + x) * 4
            let d = max(abs(Int(pa[i]) - Int(pb[i])), abs(Int(pa[i + 1]) - Int(pb[i + 1])), abs(Int(pa[i + 2]) - Int(pb[i + 2])))
            if d > 8 { // kleinste Rundungsunterschiede ignorieren
                diff += 1
                minY = min(minY, y); maxY = max(maxY, y)
                po[i] = 255; po[i + 1] = 0; po[i + 2] = 0; po[i + 3] = 255
            }
        }
    }
    if diff == 0 {
        print("gleich \(name)")
    } else {
        changed += 1
        print("ANDERS \(name): \(diff) Pixel, Zeilen \(minY)–\(maxY)")
        try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
    }
}
print(changed == 0 ? "Alle \(names.count) Bilder gleich." : "\(changed) von \(names.count) Bildern anders.")

// Erzeugt die App-Icons aus icon.svg (auf dem Mac ist kein Bildwerkzeug installiert, daher AppKit).
// Aufruf im Projektordner: swift tools/render-icons.swift
import AppKit
let svg = NSImage(contentsOfFile: "icon.svg")!
for (size, name) in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")] {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    svg.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: name))
}

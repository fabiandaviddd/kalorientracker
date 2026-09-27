import AppKit
// Setzt mehrere Bildschirmfotos nebeneinander (oben bündig), jeweils 330 px breit
let args = Array(CommandLine.arguments.dropFirst())
let out = args[0]
let imgs = args.dropFirst().map { NSImage(contentsOfFile: $0)! }
let w = 330.0, gap = 24.0
let heights = imgs.map { w * $0.size.height / $0.size.width }
let W = Int(Double(imgs.count) * w + Double(imgs.count + 1) * gap), H = Int(heights.max()! + 2 * gap)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(white: 0.55, alpha: 1).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
for (i, img) in imgs.enumerated() {
    let h = heights[i]
    let r = NSRect(x: gap + Double(i) * (w + gap), y: Double(H) - gap - h, width: w, height: h)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: r, xRadius: 28, yRadius: 28).addClip()
    img.draw(in: r)
    NSGraphicsContext.restoreGraphicsState()
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))

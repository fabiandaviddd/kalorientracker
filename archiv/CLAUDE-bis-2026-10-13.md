# Kalorientracker – Foto-Kalorien-App für Fabian

iPhone-Web-App (Home-Bildschirm): Foto → Claude schätzt Kalorien und Nährwerte. Reines HTML/CSS/JS ohne Server, live über
GitHub Pages (öffentliches Repo, https://fabiandaviddd.github.io/kalorientracker/). Fabian nutzt sie täglich, iOS 27.
Wie ich mit Fabian arbeite, steht in `~/.claude/CLAUDE.md`.

## Wo was steht
- `STAND.md` – aktueller Stand und nächster Schritt. **Als Erstes lesen.** Bei Meilensteinen überschreiben, nie anhäufen.
- `PLAN.md` – Fortschritt und Bauplan je Punkt mit Fabians Entscheidungen; beim Abschluss eines Punkts ergänzen.
- `app.js` Oberfläche · `logic.js` reine Rechenfunktionen (Tests in `tests.js`) · `log.js` Protokoll · `sw.js` Offline-Cache ·
  `vendor/` Anthropic-SDK (nie ändern, gesperrt).
- Nicht im Repo: `_entwurf/` (Klickprüfungen `szenarien*.js`, Beispieldaten `demo.js`, Entwürfe) und `.claude/` (Skills
  `pruefen`, `veroeffentlichen`, `protokoll`; Agents `pruefer` für Code, `gestalter` für Design; Haken).

## Befehle
- `node tools/run-tests.mjs` – Unit-Tests · `node tools/run-scenarios.mjs` – alle Klickprüfungen (WebKit, iPhone 15, ~15 s).
- `node tools/release.mjs "Was sich ändert"` – **einziger Weg zu veröffentlichen** (`--dev` Testnummer für die Vorschau,
  `--check` nur prüfen).
- `node tools/read-log.mjs [--alle]` – Protokoll aus Fabians neuester Sicherung.
- Vorschau per `preview_start` „kalorientracker“ (Port 8321), Bilder per `playwright-cli` (Skill `pruefen`).

Haken erledigen den Rest: Syntax/Unit-Tests nach JS-Änderungen, Klickprüfungen am Antwortende, Sperre gegen `?v=dev` und
`sk-ant-…` vor commit/push, Hinweis auf neue Sicherung beim Start.

## Wichtig – nie
- **Daten liegen nur auf Fabians iPhone** (IndexedDB + localStorage), die Sicherungsdatei ist das einzige Netz. Nichts darf
  Daten verlieren, verfälschen oder den Start verhindern; alte Sicherungen müssen importierbar bleiben.
- Sicherungen in `~/Documents/2 Persönlich/Gesundheit/Kcal-App Backups/` nur lesen (gesperrt), nie ins Repo kopieren.
- Kein API-Schlüssel (auch keine Teile) und keine Fotos ins Protokoll oder ins Repo.
- Schutzregel (CSP) in `index.html`: nur eigene Skripte/Stile, Verbindungen nur zu api.anthropic.com, keine eingefügten
  `<style>` (Werkzeuge nehmen `adoptedStyleSheets`).
- Design „Nährwert-Etikett“ ist entschieden (PLAN.md V2-13): Archivo, Schwarz auf Papier, Grün nur für Aktionen,
  Kontrast mind. 4,5 : 1. Optische Änderungen Fabian erst als Bild zeigen.

## Eigenheiten
- Pages liefert `index.html` mit max-age=600 → nach dem Veröffentlichen ca. 10 min, bis das iPhone es hat.
- Neues SDK oder neue Schrift → in `sw.js` `CACHE` hochzählen. Neues Icon (Quelle `icon.html`, PNG per
  `swift tools/render-html-icon.swift`) → eigenes `?v=` in `index.html` und `manifest.webmanifest`; für Fabian heißt das:
  Sicherung → App löschen → neu hinzufügen → Schlüssel → Import.
- Die Kostenanzeige rechnet immer mit Opus-Preisen, auch wenn ein Ersatzmodell antwortet (Protokoll zeigt `modell`).
- Der iOS-Simulator startet hier nicht: Drehen, Kamera und Gesten testet Fabian, das Ergebnis zeigt das Protokoll.

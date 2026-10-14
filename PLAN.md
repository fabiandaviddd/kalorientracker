# Kalorientracker mit Foto – Beschreibung & Entscheidungen

> Nur Dauerhaftes: was die App kann, Fabians Entscheidungen, Ideen. Neue Entscheidungen als eine Zeile ergänzen, keine
> Bauschritte. Der volle Bauplan (Schritte 0–13, V2-1 … V2-24) steht in `archiv/PLAN-bis-2026-10-13.md`, der Verlauf in git.
> Was gerade auf Abnahme wartet, steht in `STAND.md`.

## Beschreibung

**Wer:** Nur ich. Ich nutze die App auf meinem iPhone über ein Symbol auf dem Home-Bildschirm. Kein Login, keine anderen Nutzer.

**Was:** Ich fotografiere eine Mahlzeit (bis 5 Fotos, Kamera oder Mediathek) oder beschreibe sie nur, optional mit kurzem
Text („ca. 300 g, in Öl gebraten“). Claude erkennt die Lebensmittel und schätzt Kalorien, Protein, Kohlenhydrate und Fett.
Auf „Prüfen“ kontrolliere ich, korrigiere in Worten oder reiche ein Foto nach (z. B. die Nährwerttabelle), dann speichere ich.
- **Tagesansicht:** Tagessumme als Nährwerttabelle, Einträge gruppiert (Frühstück, Mittagessen, Abendessen, Snack).
  Frühere Tage per Pfeil oder Wischen, dort auch nachtragen.
- **Mahlzeit öffnen:** Datum und Uhrzeit ändern, korrigieren, Foto nachreichen, löschen (mit „Rückgängig“).
- **Für Bevel kopieren:** einzelne Mahlzeit, ganze Gruppe oder freie Auswahl als eine Summe; auch direkt in der Meldung
  nach dem Speichern.
- **Favoriten:** lange auf „+ Mahlzeit“ drücken, ein Tipp trägt ein – ohne Claude, kostenlos.
- **Meine Lebensmittel:** abgelesene Packungswerte werden gemerkt und beim nächsten Mal wiederverwendet.
- **Datensicherung:** Export und Import über das Teilen-Menü, Hinweis, wenn die letzte Sicherung 5 Tage oder älter ist.
- **Protokoll** für die Fehlersuche, reist mit jeder Sicherung mit (`node tools/read-log.mjs`).
- Startet ohne Internet; Dunkelmodus, große Schrift, „Kontrast erhöhen“ und VoiceOver werden unterstützt.

**Welche Daten:**

| Daten | Wo gespeichert |
|---|---|
| Mahlzeiten, Favoriten, Meine Lebensmittel, Protokoll | nur auf dem iPhone |
| Foto pro Mahlzeit (verkleinert) | nur auf dem iPhone |
| Claude-API-Schlüssel | nur auf dem iPhone (in den Einstellungen der App) |
| Foto + Text zur Schätzung | wird an die Claude-API geschickt und dort nicht dauerhaft gespeichert |
| Sicherungsdatei | dort, wo ich sie ablege (z. B. iCloud Drive) |

**Leitplanken:**
- Reine Web-App über GitHub Pages. Claude direkt aus dem Browser mit dem offiziellen Anthropic-SDK (feste Version 0.128.0 in
  `vendor/`, Lizenzen in `vendor/LIZENZEN.txt`), Modell `claude-opus-5-5`. In der Anthropic Console ist ein Ausgabenlimit gesetzt. Seit 14.10. 100 € API-Guthaben
  pro Monat von Anthropic (Verbrauch bisher ca. 3 $/Monat) – Kosten sind kaum noch eine Grenze, Genauigkeit zählt mehr.
- Claudes Werte sind Schätzungen, deshalb gibt es immer den Schritt „Prüfen“ vor dem Speichern.
- Schätz-Stil wie im Chat: Bestandteil + angenommene Menge (z. B. „2 Scheiben, ca. 110 g“) + Nährwerte, dazu kurze
  „Annahmen und Unsicherheiten“ mit Auswirkung in kcal. Gezählt wird nur der Teller im Vordergrund, außer die Beschreibung
  sagt etwas anderes. Denktiefe: mittel.
- Bewusst nicht: Tagesziel, Diagramme, Zahlen selbst eintippen, Cloud-Sync, mehrere Nutzer.

**Versionen:** Version 1 fertig am 26.09.2026, Version 2 am 29.09., Version 2.1 am 30.09.; danach V2-6 und V2-19 … V2-24.

## Entscheidungen

Je Punkt eine Zeile: Kennung (Datum) – was Fabian entschieden hat. Einzelheiten zu jeder Kennung im Archiv.

- **Schritt 7 (23.09.):** Korrigieren nur in Worten an Claude („1 Scheibe Cheddar statt 2“), Claude rechnet alles neu.
  Zahlen selbst eintippen gibt es bewusst nicht – auch nicht bei Favoriten.
- **Schritt 11 (23.09.):** Import ergänzt fehlende Mahlzeiten und ersetzt vorhandene durch den Stand der Sicherung, nichts
  doppelt. Die Sicherung enthält nie den API-Schlüssel.
- **Schritt 12 (23.09.):** Sicherungs-Hinweis ab 5 Tagen (statt 14). Schrift folgt der iOS-Textgröße, große Titel höchstens
  36 px, Texte brechen um statt abgeschnitten zu werden.
- **Bevel (23.09.):** Format wie im Chat – Name, darunter `450 kcal | P 19 g | KH 60 g | F 15 g`; ganze Zahlen ohne
  Tausenderpunkt, Leerzeile zwischen Mahlzeiten.
- **Mehrere Fotos (24.09.):** bis 5 Fotos pro Mahlzeit, Claude wertet alle als eine Mahlzeit aus, zählt nichts doppelt und
  ordnet Packungswerte dem passenden Bestandteil zu.
- **V2-3 (27.09.):** Mehrere gewählte Mahlzeiten gehen als ein Block mit Summe nach Bevel (Name aus den Einzelnamen,
  z. B. „Avocado-Brot + Pfirsich“).
- **V2-4 (27.09.):** „Prüfen“ und „Mahlzeit“: erst Kopfkarte (Foto, Name, kcal, P/K/F), dann Bestandteile, dann Annahmen;
  Korrektur hinter „Etwas stimmt nicht?“. Einstellungen: Datensicherung oben, API-Schlüssel darunter.
- **V2-5 (27.09.):** Design C „Weich & kräftig“ gewählt (A und B abgelehnt, D „Kacheln“ nicht gewählt) – abgelöst durch V2-13.
- **V2-6 (27.09.):** Gruppen statt Verschmelzen (ersetzt V2-2): Frühstück bis 11, Mittagessen 11–15, Abendessen 17:30–22,
  sonst Snack; eine zweite eigene Mahlzeit im selben Zeitraum heißt „Snack“. Annahmen höchstens 3 kurze Punkte.
- **V2-7 (27.09.):** Gesten nach Apple: vom linken Rand wischen = zurück; Mahlzeit nach links wischen = Bevel/Löschen;
  Tag wechseln per Wischen nur über Summe und Kopf.
- **V2-8 (27.09.):** „+ Mahlzeit“, „+ Foto“ und „Foto nachreichen“ öffnen direkt die Kamera, die Mediathek hat eigene Knöpfe.
  Deren iOS-Auswahlmenü lässt sich in einer Web-App nicht überspringen (ginge nur mit einer echten App aus Xcode).
- **V2-9 (28.09.):** Jeder Text mind. 4,5 : 1 Kontrast, dunkle Schrift auf Grün, „Kontrast erhöhen“ wird unterstützt.
- **V2-10 (28.09.):** Nichts geht verloren: Rückfrage vor dem Verwerfen (eigenes Aktionsblatt), „Rückgängig“ nach Löschen
  und Korrektur, der Entwurf übersteht das Beenden der App.
- **V2-11 (28.09.):** Tippflächen mind. 44 pt, Kopieren- statt Teilen-Symbol, kein Datum in der Zukunft.
- **V2-13 (29.09.):** Design „Nährwert-Etikett“ (E, vor F „Bistro“ und G „Marktstand“): Vorbild Nährwerttabelle der
  Packung, nur Archivo in zwei Breiten, Linien in drei Stärken, Schwarz auf Papier, Grün nur für Aktionen, Tagessumme als
  Tabelle, Annahmen wie eine Zutatenliste, schwarze Gruppen-Reiter, Knöpfe mit harter Kante, gestaffelter Aufbau beim Start.
- **V2-14 (29.09.):** Favoriten für (fast) immer gleiche Mahlzeiten wie Shakes; anlegen per Beschreibung ohne Foto oder
  „Als Favorit merken“. Korrektur der Vorlage zieht den Favoriten mit. Mahlzeiten gehen auch ganz ohne Foto.
- **V2-15 – V2-18 (30.09.):** Code-Review: SDK im Repo statt aus dem Netz, Schutzregel (CSP), automatische Tests; Import
  lehnt Mahlzeiten ohne Datum ab. am-pass (teilte sich die Adresse und löschte Offline-Daten) ist offline; `sw.js` löscht
  nur eigene alte Zwischenspeicher.
- **V2-19 (09.10.):** Protokoll still auf dem iPhone, damit Fabian nichts beschreiben muss; nie Schlüssel oder Fotos; reist
  mit jeder Sicherung (Feld `log`), der Import übernimmt es nicht.
- **V2-20 (09.10.):** Im untersten Streifen (34 px, gehört iOS) beginnt kein Wischen der App; abgebrochene Gesten federn zurück.
- **V2-21 (09.10.):** Meine Lebensmittel: Packungswerte automatisch merken (gleicher Name = Werte aktualisieren), nutzen nur,
  wenn klar dasselbe Produkt, sonst normal schätzen und nachfragen. In der Sicherung (Feld `foods`), Import ergänzt fehlende.
- **V2-22 (11.10.):** Protokoll in der Datenbank und mit jedem Tipp (Fabians Wunsch) – nie Text aus Feldern, beim Schlüssel
  gar keine Beschriftung. Seite fest am Bildschirm (`body { position: fixed }`) gegen den iOS-Fehler nach dem Drehen.
- **V2-23 (12.10.):** Zuordnung zur Mahlzeit nach Claudes Einschätzung vorausgewählt, „Speichern“ wird nie blockiert;
  „Für Bevel kopieren“ in der Meldung kopiert nur das neu Gespeicherte.
- **V2-24 (12.10.):** Ladefenster, Hinweise und Meldungen im Etikett-Stil; Kartenschatten im Dunkelmodus gedämpft statt
  grün (bewusste Abweichung von E2: Grün bleibt den Aktionen).
- **V2-25 (13.10.):** „Prüfen“ kürzer – Foto klein neben dem Namen (tippen = Vollbild), Annahmen direkt unter dem
  Etikett vor den Bestandteilen. Die gespeicherte Mahlzeit bleibt mit großem Foto.
- **V2-26 (13.10.):** Ernährungsform in den Einstellungen (keine Angabe, pescetarisch, vegetarisch, vegan; Fabian:
  pescetarisch). Claude nimmt bei Unpassendem die Ersatz-Variante an; eigene Beschreibung, Packung und Meine Lebensmittel gehen
  vor; beim Korrigieren gespeicherter Mahlzeiten gilt sie nur für Neues. Reist mit der Sicherung, Import nur, wenn lokal leer.
- **Modelltest (13.10.):** Opus 5.5 bleibt. An 48 echten Fotos lagen Sonnet 5.5 (18 %) und Haiku 5.5 (21 %) etwa doppelt
  so weit daneben wie Opus (10 %); Ersparnis nur ca. 2–3 $/Monat. Einzelheiten in `_entwurf/modelltest/ERGEBNIS.md`.
- **V2-27 (13.10.):** Kritik 30/40. Getippte, nicht geschickte Korrektur → Rückfrage „Jetzt neu berechnen“ statt still
  ohne sie zu speichern/schließen. Sehr große Schrift: kcal unter den Namen, Silbentrennung, Zahl und Einheit zusammen.
  Favoriten bleiben bewusst nur per langem Druck (kein Stern-Knopf).
- **V2-28 (13.10.):** „Heute nochmal eintragen“ auf der Mahlzeit-Seite (Kopie ohne Claude, kostenlos, immer heute).
  Meldungen nach dem Eintragen nennen Name und neue Tagessumme („heute 1.842 kcal“, kein Tagesziel). Unterbrochene
  Schätzung wird beim nächsten Öffnen höchstens einmal von selbst neu geschickt (bis 60 min nach Beginn), sonst Hinweis.
  Portion ½/1/2× bewusst nicht gewählt (berührt „Zahlen nur über Claude“); Strichcode und Wochenübersicht abgelehnt.
- **Ausrichtung (13.10.):** Hauptzweck ist, Essen möglichst präzise zu erfassen. Keine Statistik- oder Auswertungs-Features
  (macht Bevel). Schätz-Tendenz abgelehnt: verfälscht die Zahlen absichtlich, Puffer gehört ins Ziel in Bevel.
- **V2-29 (14.10.):** Genauer erfassen: „Meine Gewohnheiten“ (Text in den Einstellungen, Claude liest ihn bei jeder
  Schätzung als Anhalt; reist mit der Sicherung), Claudes Rückfrage zur größten Unsicherheit auf „Prüfen“ (Antwort-Knöpfe,
  aktuelle Annahme markiert, andere Antwort = Korrektur), „Reste fotografieren“ auf der Mahlzeit-Seite (Vorher-Foto +
  Reste-Foto, Favorit bleibt volle Portion).
- **V2-30 (14.10.):** Kleinigkeiten aus der Kritik: Aktionsblätter als Etikett (Titel links mit Balken, harte Schatten,
  Knopf-Schrift wie überall), Auswahl-Kästchen eckig, deaktivierter grüner Knopf ruhig ausgegraut, leerer Tag nennt „+ Mahlzeit“.

## Ideen für später


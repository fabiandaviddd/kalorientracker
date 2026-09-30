# Kalorientracker mit Foto – Beschreibung & Bauplan

## Fortschritt

- [x] Schritt 0 – Vorbereitung (API-Schlüssel + Ausgabenlimit)
- [x] Schritt 1 – Leere App online
- [x] Schritt 2 – App auf den Home-Bildschirm
- [x] Schritt 3 – Grundgerüst
- [x] Schritt 4 – API-Schlüssel eintragen
- [x] Schritt 5 – Foto aufnehmen
- [x] Schritt 6 – Claude schätzt
- [x] Schritt 7 – Korrigieren (per Text an Claude)
- [x] Schritt 8 – Speichern & Tagesliste
- [x] Schritt 9 – Bearbeiten & Löschen
- [x] Schritt 10 – Frühere Tage
- [x] Schritt 11 – Export & Import
- [x] Zusatz – Für Bevel kopieren
- [x] Zusatz – Mehrere Fotos pro Mahlzeit
- [x] Schritt 12 – Feinschliff
- [x] Schritt 13 – Abnahme → **Version 1 fertig (v1.0, 26.09.2026)**

### Version 2
- [x] V2-1 – Foto nachreichen
- [x] V2-2 – Mahlzeiten automatisch zusammenfassen
- [x] V2-3 – Bevel: Auswahl als eine Summe exportieren
- [x] V2-4 – Aufräumen: Reihenfolge, Knöpfe, Darstellung
- [x] V2-5 – Design „Weich & kräftig“ (Entwurf C)
- [x] V2-7 – Wischgesten nach Apples Regeln (Zurück, Bevel/Löschen)
- [x] V2-8 – Kamera direkt, Mediathek als eigener Knopf
- [x] V2-9 – Apple-Abgleich 1: Lesbarkeit (Kontraste)
- [x] V2-10 – Apple-Abgleich 2: Nichts geht verloren
- [x] V2-11 – Apple-Abgleich 3: Bedienung
- [x] V2-12 – Apple-Abgleich 4: Extras
→ **Version 2 fertig (v2.0, 29.09.2026)**
- [x] V2-13 – Design „Nährwert-Etikett“
- [x] V2-14 – Favoriten (z. B. Shakes) mit einem Tipp eintragen
- [x] V2-6 – Mahlzeit-Gruppen statt Verschmelzen + kürzere Annahmen

---

## Beschreibung

**Wer:** Nur ich. Ich nutze die App auf meinem iPhone und öffne sie über ein Symbol auf dem Home-Bildschirm. Es gibt kein Login und keine anderen Nutzer.

**Was:** Ich fotografiere eine Mahlzeit und kann optional einen kurzen Text dazuschreiben, z. B. „ca. 300 g, in Öl gebraten“. Claude erkennt die Lebensmittel und schätzt Kalorien, Protein, Kohlenhydrate und Fett. Ich prüfe die Schätzung, korrigiere sie bei Bedarf und speichere. Die Tagesansicht zeigt meine Mahlzeiten und die Tagessummen. Zu früheren Tagen kann ich zurückblättern.

**Welche Daten:**

| Daten | Wo gespeichert |
|---|---|
| Mahlzeiten (Name, Uhrzeit, kcal, P/K/F, mein Text) | nur auf dem iPhone |
| Kleines Vorschaubild pro Mahlzeit | nur auf dem iPhone |
| Claude-API-Schlüssel | nur auf dem iPhone (in den Einstellungen der App) |
| Foto + Text zur Schätzung | wird an die Claude-API geschickt und dort nicht dauerhaft gespeichert |
| Sicherungsdatei | dort, wo ich sie ablege (z. B. iCloud Drive) |

**Bewusst nicht in Version 1:** Tagesziel, Diagramme, Eingabe ohne Foto, manuelle Eingabe ohne Claude, Zahlen selbst ändern, Cloud-Sync, mehrere Nutzer.

**Technische Leitplanken:**
- Reine Web-App (HTML/CSS/JavaScript), veröffentlicht über GitHub Pages, installierbar auf dem Home-Bildschirm.
- Claude wird direkt aus dem Browser aufgerufen, mit dem offiziellen Anthropic-SDK (von jsDelivr geladen, feste Version). Modell: `claude-opus-5-5` (Claude Opus 5.5). Der Schlüssel wird nur auf dem Gerät gespeichert.
- Der API-Schlüssel darf **nie** im Code oder auf GitHub landen. In der Anthropic Console ist ein Ausgabenlimit gesetzt.
- Die Daten liegen nur auf dem iPhone. Die Export-Datei ist die Absicherung.
- Claudes Werte sind Schätzungen, deshalb gibt es immer einen Korrektur-Schritt vor dem Speichern.
- Schätz-Stil wie im Chat: Bestandteil + angenommene Menge (z. B. „2 Scheiben, ca. 110 g“) + Nährwerte, dazu 2–4 „Annahmen und Unsicherheiten“ mit Auswirkung in kcal. Gezählt wird nur der Teller im Vordergrund, außer die Beschreibung sagt etwas anderes. Denktiefe: mittel.
- Design: schlicht, wirkt wie eine iOS-App, unterstützt den Dunkelmodus.

**Version 1 ist fertig, wenn:**
1. die App als Symbol auf dem Home-Bildschirm liegt und ohne Safari-Leiste startet,
2. Foto + Text → Schätzung → Korrigieren → Speichern zuverlässig funktioniert,
3. die Tagesansicht die richtigen Summen zeigt und frühere Tage ansehbar sind,
4. Einträge bearbeitet und gelöscht werden können,
5. Export und Import funktionieren,
6. die App 3 Tage lang echt benutzt wurde, ohne dass etwas Blockierendes schiefging.

---

## Bauplan

Jeder Schritt baut auf dem vorherigen auf. Es geht erst weiter, wenn der Test des aktuellen Schritts bestanden ist.

### Schritt 0 – Vorbereitung
In der Anthropic Console einen API-Schlüssel anlegen und ein monatliches Ausgabenlimit setzen (z. B. 5 €).
**Test:** Der neue Schlüssel und das Limit sind in der Console sichtbar. Der Schlüssel ist sicher notiert, z. B. im iPhone-Passwortmanager.

### Schritt 1 – Leere App online
Eine einfache Seite mit dem Text „Kalorientracker“ wird über GitHub Pages veröffentlicht.
**Test:** Der Link öffnet sich in Safari auf dem iPhone und zeigt den Text.

### Schritt 2 – App auf den Home-Bildschirm
Die App bekommt ein Symbol, einen Namen und startet im Vollbild.
**Test:** In Safari auf Teilen → „Zum Home-Bildschirm“ tippen. Das Symbol erscheint, und nach dem Antippen öffnet sich die App ohne Safari-Adressleiste.

### Schritt 3 – Grundgerüst
Die Tagesansicht zeigt „Heute“, die Summen (0 kcal, 0 g P/K/F), einen „+“-Knopf und einen Zugang zu den Einstellungen.
**Test:** Alles ist sichtbar. Wenn am iPhone der Dunkelmodus eingeschaltet wird, wird auch die App dunkel.

### Schritt 4 – API-Schlüssel eintragen
In den Einstellungen gibt es ein Feld für den Schlüssel und einen Knopf „Verbindung testen“.
**Test:** Ein falscher Schlüssel ergibt eine rote Fehlermeldung, der richtige eine grüne Bestätigung. Nach komplettem Schließen und erneutem Öffnen ist der Schlüssel noch da und wird nur teilweise angezeigt (●●●●1234).

### Schritt 5 – Foto aufnehmen
„+“ öffnet die Kamera (oder die Mediathek). Das Foto erscheint als Vorschau, darunter ist ein Textfeld.
**Test:** Ein Foto machen, es erscheint in der Vorschau. Text eintippen. „Abbrechen“ führt ohne Eintrag zurück.

### Schritt 6 – Claude schätzt
Der Knopf „Schätzen“ schickt Foto und Text an Claude. Während Claude arbeitet, erscheint eine Ladeanzeige. Danach zeigt der Prüfen-Bildschirm die erkannten Lebensmittel mit ihren Werten und eine Gesamtsumme.
**Test:**
- Ein verpacktes Produkt fotografieren und mit den Angaben auf der Packung vergleichen. Die Schätzung sollte grob passen.
- Etwas fotografieren, das kein Essen ist (z. B. einen Schuh). Es erscheint die Meldung „Kein Essen erkannt“.
- Im Flugmodus erscheint eine verständliche Fehlermeldung, und die App stürzt nicht ab.

### Schritt 7 – Korrigieren (per Text an Claude)
Auf dem Prüfen-Bildschirm gibt es ein Feld „Korrektur an Claude“. Dort beschreibe ich in Worten, was nicht stimmt (z. B. „1 Scheibe Cheddar statt 2, Pfirsich mitzählen“), und Claude rechnet die ganze Mahlzeit neu – wie im Chat. Zahlen selbst eintippen gibt es bewusst nicht.
**Test:** Eine Mahlzeit schätzen lassen, dann eine Korrektur schicken. Die geänderten Bestandteile und die Summe passen sich an, die Annahmen erwähnen die Korrektur, die Kosten zeigen „Schätzung + 1 Korrektur“. Leeres Feld → Hinweis statt Anfrage.

### Schritt 8 – Speichern & Tagesliste
„Speichern“ legt die Mahlzeit mit Vorschaubild und Uhrzeit in der Tagesliste ab, und die Summen oben werden aktualisiert.
**Test:** Zwei Mahlzeiten speichern und prüfen, ob die Summe stimmt. Die App komplett schließen und wieder öffnen: Beide Mahlzeiten sind noch da.

### Schritt 9 – Bearbeiten & Löschen
Antippen einer Mahlzeit öffnet sie. Dort lassen sich Datum und Uhrzeit ändern, per „Korrektur an Claude“ neu berechnen (auf Basis der gespeicherten Liste, ohne Foto) und die Mahlzeit löschen, mit Sicherheitsabfrage.
**Test:** Uhrzeit ändern → Liste zeigt neue Zeit. Korrektur schicken → Werte und Tagessumme passen sich an. Beim Löschen erscheint erst eine Rückfrage, danach ist der Eintrag weg.

### Schritt 10 – Frühere Tage
Mit Pfeilen zwischen den Tagen blättern (nicht in die Zukunft). Titel „Heute“, „Gestern“, „Vorgestern“, danach Datum. Ein „Zu heute“-Knopf springt zurück. „+“ auf einem früheren Tag trägt die Mahlzeit dort nach.
**Test:** In Schritt 9 einen Eintrag auf gestern verschieben. Heute verschwindet er, gestern taucht er mit der richtigen Summe auf. Auf „Gestern“ eine Mahlzeit nachtragen → sie landet bei gestern.

### Schritt 11 – Export & Import
In den Einstellungen („Datensicherung“) erstellt „Daten exportieren“ eine Sicherungsdatei (alle Mahlzeiten mit Vorschaubildern, ohne API-Schlüssel) und öffnet das Teilen-Menü („In Dateien sichern“). „Daten importieren“ liest sie wieder ein: fehlende Mahlzeiten kommen dazu, vorhandene werden durch den Stand der Sicherung ersetzt, nichts wird doppelt. Angezeigt werden Anzahl der Mahlzeiten und Datum der letzten Sicherung (rot, wenn älter als 5 Tage).
**Test:** Nach iCloud Drive exportieren und prüfen, ob die Datei in der Dateien-App liegt. Einen Eintrag löschen und die Datei importieren: Der Eintrag ist wieder da und nichts ist doppelt.

### Zusatz – Für Bevel kopieren
„Für Bevel kopieren“ in der Tagesansicht (alle Mahlzeiten des Tages) und in jeder Mahlzeit (nur diese). Format wie im Chat, Leerzeile zwischen Mahlzeiten, ganze Zahlen ohne Tausenderpunkt:
```
Pizza Margherita (½)
450 kcal | P 19 g | KH 60 g | F 15 g
```
**Test:** Knopf tippen, in Bevel einfügen – Text kommt vollständig und im richtigen Format an.

### Zusatz – Mehrere Fotos pro Mahlzeit
Bis zu 5 Fotos pro Mahlzeit (Kamera einzeln, Mediathek auch mehrere auf einmal), jedes mit × entfernbar. Claude wertet alle zusammen als eine Mahlzeit aus, zählt nichts doppelt und liest Nährwerttabellen/Packungen ab und ordnet die Werte dem passenden Bestandteil zu (steht dann in den Annahmen). Vorschaubild ist das erste Foto.
**Test:** Brot + Nährwerttabelle vom Käse fotografieren → eine Mahlzeit, Käse mit Packungswerten, Annahme nennt die Packung. Zwei Fotos vom selben Teller → nichts doppelt. Foto entfernen per ×.

### Schritt 12 – Feinschliff
- Schrift folgt der iOS-Einstellung „Textgröße“ (alle Größen relativ, große Titel höchstens 36 px); Texte brechen um statt abgeschnitten zu werden.
- Hinweis-Banner in der Tagesansicht, wenn die Sicherung fällig ist (noch nie gesichert oder 5 Tage oder älter), mit „Jetzt sichern“ (öffnet direkt das Teilen-Menü) und × (blendet bis zum nächsten Öffnen aus).
- Größere Tippflächen (z. B. × an Fotos), Meldungen dürfen mehrzeilig sein.
**Test:** Am iPhone eine größere Schrift einstellen, nichts wird abgeschnitten. Alle Knöpfe sind gut mit dem Daumen erreichbar. Ohne aktuelle Sicherung erscheint das Banner; nach dem Exportieren verschwindet es.

### Schritt 13 – Abnahme
Die App 3 Tage lang normal nutzen und alles notieren, was stört.
**Test:** Alle sechs Punkte unter „Version 1 ist fertig, wenn“ sind erfüllt. Dann ist Version 1 fertig.

---

## Bauplan Version 2

### V2-1 – Foto nachreichen
Auf dem Prüfen-Bildschirm und bei gespeicherten Mahlzeiten gibt es „Foto nachreichen“ (z. B. die Nährwerttabelle). Claude bekommt das neue Foto zusammen mit der bisherigen Schätzung, ordnet die Werte zu und rechnet neu. Bei gespeicherten Mahlzeiten wird das Ergebnis direkt gespeichert.
**Test:** Brot schätzen lassen, dann das Foto der Käse-Nährwerttabelle nachreichen → Käse hat die Packungswerte, Annahmen nennen die Packung, Summe passt sich an. Dasselbe bei einer schon gespeicherten Mahlzeit.

### V2-2 – Mahlzeiten automatisch zusammenfassen
Liegt die letzte gespeicherte Mahlzeit desselben Tages höchstens 60 Minuten zurück, beurteilt Claude beim Schätzen gleich mit, ob das neue Essen dazugehört (kein zusätzlicher Aufruf). Sicher dazugehörig → der Prüfen-Bildschirm zeigt „Wird zur Mahlzeit von 11:29 hinzugefügt“ und beim Speichern wird zusammengeführt (mit „Getrennt speichern“ als Ausweg). Unsicher oder eher nicht → die App fragt „Gehört das zur Mahlzeit von 11:29?“ – Zusammen / Getrennt. Zusammengeführt heißt: eine Mahlzeit mit allen Bestandteilen, gemeinsamem Namen, frühester Uhrzeit und zusammengezählten Kosten.
**Test:** Zwei Brote kurz nacheinander fotografieren → landen automatisch in einer Mahlzeit. Frühstück und 20 Minuten später ein Kaffee mit Kuchen → App fragt nach. Mahlzeit nach über 60 Minuten → keine Frage, eigener Eintrag.

### V2-3 – Bevel: Auswahl als eine Summe exportieren
„Für Bevel kopieren“ in der Tagesansicht öffnet eine Auswahl: Mahlzeiten ankreuzen → „Kopieren“. Mehrere gewählte Mahlzeiten werden zu einem Block mit Gesamtwerten zusammengefasst (Name aus den Einzelnamen, z. B. „Avocado-Brot + Pfirsich“), im gewohnten Format.
**Test:** Drei Mahlzeiten, zwei davon ankreuzen → in Bevel kommt ein Eintrag mit der Summe der beiden an.

### V2-4 – Aufräumen: Reihenfolge, Knöpfe, Darstellung
1. Tagesansicht: Tag im Kopf wechseln („‹ Heute ›“), zusätzlich wischen.
2. Bevel dezent als Teilen-Symbol neben „Mahlzeiten“.
3. Neue Mahlzeit: „Abbrechen“ links oben.
4. Kürzerer Foto-Hinweis; Packungs-Tipp nur bei einem Foto.
5. Prüfen: Kopf-Karte mit Foto, Name, kcal und P/K/F zuerst; dann Bestandteile, dann Annahmen; kein eigener Bereich „Summe“.
6. Prüfen: „Zurück“ links oben, dazu „Verwerfen“.
7. Korrektur einklappbar hinter „Etwas stimmt nicht?“.
8. Mahlzeit: gleicher Aufbau wie Prüfen.
9. Mahlzeit: „Gegessen am“, „Für Bevel kopieren“, „Löschen“ gesammelt unten; „‹ Zurück“ links oben.
10. Einstellungen: Datensicherung oben, API-Schlüssel darunter und eingeklappt, wenn eingerichtet.
Farben und Stil bleiben unverändert. Vorher Bilder aller Bildschirme, live erst nach Freigabe.
**Test:** Alle Bildschirme durchgehen – jede der 10 Änderungen ist da, alle bisherigen Funktionen gehen weiter.

### V2-6 – Mahlzeit-Gruppen statt Verschmelzen + kürzere Annahmen
Ersetzt das Verschmelzen aus V2-2: Einträge bleiben einzeln und werden auf der Startseite unter Frühstück (bis 11), Mittagessen (11–15), Abendessen (17:30–22) oder Snack gruppiert – eine zweite eigene Mahlzeit im selben Zeitraum heißt „Snack“. Claude entscheidet weiter „dazu / unsicher / eigene“; Karte auf „Prüfen“: „Kommt zum Frühstück von 08:30 Uhr“ mit „Dazu“ / „Eigene Mahlzeit“. Jede Gruppe hat ein Teilen-Symbol (Bevel, eine Summe); „Auswählen“ bleibt für freie Auswahl. Annahmen: höchstens 3 kurze Punkte, bei mehr „Alle N anzeigen“.
**Test:** Drei Einträge hintereinander → eine Gruppe; Teilen der Gruppe → eine Summe in Bevel; eigene Mahlzeit kurz danach → Snack; Annahmen kurz.

### V2-5 – Design „Weich & kräftig“
Entwürfe A (hell mit Icon-Akzenten) und B (ganz im Icon-Look) wurden abgelehnt. Nach zwei Vorbildern gab es die Entwürfe C „Weich & kräftig“ und D „Kacheln“, gewählt wurde C: runde, fette iPhone-Schrift, weiße Karten mit weichem Schatten, Knöpfe als Pillen, Mahlzeit-Gruppen als grüne Etiketten, Flamme neben „kcal“, breiter Knopf „+ Mahlzeit“. „Prüfen“ und „Mahlzeit“ zeigen ein großes Foto oben. Neue Mahlzeiten speichern dafür ein größeres Foto (720 px, ca. 50 KB). Ältere Mahlzeiten zeigen ihr kleines Vorschaubild mittelgroß.
**Test:** Alle Bildschirme hell und dunkel durchgehen. Eine neue Mahlzeit speichern und öffnen → großes, scharfes Foto. Eine alte Mahlzeit öffnen → mittelgroßes Bild. Alles funktioniert wie vorher.


### V2-7 – Wischgesten nach Apples Regeln
Nach Apples Leitlinien für iOS (Bedienung mit dem Daumen): Auf „Neue Mahlzeit“, „Prüfen“, „Mahlzeit“ und „Einstellungen“ führt Wischen vom linken Rand nach rechts zurück (ein kurzer Wisch federt zurück). Eine Mahlzeit in der Liste nach links wischen legt „Bevel“ und „Löschen“ frei (Löschen mit Rückfrage). Auf einer Mahlzeit wechselt Wischen nicht mehr den Tag, über der Tagessumme und dem Kopf weiterhin.
**Test:** Vom linken Rand wischen → zurück. Mahlzeit nach links wischen → Bevel kopiert, Löschen fragt nach und löscht. Antippen woanders klappt zu. Über der Summe wischen → anderer Tag.

### V2-8 – Kamera direkt, Mediathek als eigener Knopf
Das iOS-Auswahlmenü (Fotomediathek / Foto aufnehmen / Dateien) stört. „+ Mahlzeit“, „+ Foto“ und „Foto nachreichen“ öffnen deshalb direkt die Kamera. Die Mediathek hat eigene Knöpfe: rund neben „+ Mahlzeit“ und als Kachel „Mediathek“ auf „Neue Mahlzeit“. Dort zeigt iOS sein Menü weiterhin, denn eine Web-App kann die Mediathek nicht direkt öffnen.
**Test:** „+ Mahlzeit“ → sofort Kamera. Runder Knopf → Mediathek (mit Menü), mehrere Fotos wählbar. Auf „Neue Mahlzeit“ „+ Foto“ → Kamera, „Mediathek“ → Mediathek. „Foto nachreichen“ → Kamera.

### V2-9 bis V2-12 – Abgleich mit Apples Richtlinien (developer.apple.com/design)
Alle Bildschirme und Funktionen wurden mit 48 Kapiteln der Human Interface Guidelines verglichen. Daraus sind vier Pakete entstanden:
- **V2-9 Lesbarkeit:** Alle Texte mindestens 4,5 : 1 Kontrast. Dunkle Schrift auf grünen Knöpfen, satteres Grün und Grau im hellen Modus, kräftigere Nährwert-Farben, sichtbare Auswahlkreise und Feldränder, Unterstützung für „Kontrast erhöhen“. Die grünen Etiketten bleiben (auf Fabians Wunsch).
- **V2-10 Nichts geht verloren:** Nachfrage vor dem Verwerfen (eigenes Aktionsblatt statt Browser-Dialog), „Rückgängig“ nach Löschen und nach Korrekturen, Entwurf übersteht das Beenden der App, Hinweis mit Knopf bei fehlendem API-Schlüssel.
- **V2-11 Bedienung:** sichtbarer Druck-Zustand, Tippflächen mindestens 44 pt, Kopieren- statt Teilen-Symbol, „Verwerfen“ nach unten, „›“ in Zeilen, fester Tag-Pfeil, längere Meldungen, Korrektur zuklappbar, kein Datum in der Zukunft.
- **V2-12 Extras:** Start ohne Internet, Fotos im Vollbild, Tageswechsel mit Animation, einheitliche Symbole, ehrlichere Ladeanzeige, Texte und VoiceOver, Datenschutz-Satz.

### V2-13 – Design „Nährwert-Etikett“
Nach Fabians Design-Anleitung („kein AI-Slop“: markante Schrift, dominante Farbe mit scharfen Akzenten, Atmosphäre im Hintergrund, gezielte Bewegung) drei Richtungen gezeigt (E „Nährwert-Etikett“, F „Bistro“, G „Marktstand“). E wurde vertieft (E2) und eingebaut: Vorbild ist die Nährwerttabelle auf der Packung. Eine Schriftfamilie (Archivo, in der App gespeichert, OFL-Lizenz) in zwei Breiten, Linien in drei Stärken, Schwarz auf Papier, Grün nur für Aktionen, Tagessumme als Tabelle, Annahmen wie eine Zutatenliste, schwarze Gruppen-Reiter, Knöpfe mit harter Kante, gestaffelter Aufbau beim Start. Bedienung und Kontraste (mind. 4,5 : 1) bleiben.
**Test:** Alle Bildschirme hell und dunkel ansehen, Schrift auch im Flugmodus, Aufbau-Animation beim Öffnen, alle Funktionen gehen wie vorher.

### V2-14 – Favoriten
Für Mahlzeiten, die (fast) immer gleich sind, z. B. selbst gemixte Shakes, bei denen Fotos der Zutaten zu umständlich wären. Kein manuelles Eintragen von Zahlen.
- **Anlegen:** In der Favoriten-Liste „Neu beschreiben (ohne Foto)“ – Claude schätzt einmal nur aus dem Text (z. B. „300 ml Hafermilch, 30 g Whey, 1 Banane“). Auf „Prüfen“ gibt es das Häkchen „Als Favorit merken“, auf der Seite jeder Mahlzeit „Als Favorit merken“ / „Aus Favoriten entfernen“.
- **Eintragen:** Lange auf „+ Mahlzeit“ drücken → Liste von unten → ein Tipp trägt den Favoriten sofort mit aktueller Uhrzeit ein (ohne Claude, kostenlos), mit „Rückgängig“. Abweichungen danach per „Etwas stimmt nicht?“.
- Wird die Vorlage-Mahlzeit korrigiert, zieht der Favorit mit. Favoriten sind in der Sicherung enthalten. Neue Mahlzeiten gehen jetzt auch ganz ohne Foto, nur mit Beschreibung.
**Test:** Shake beschreiben → Favorit → lange drücken → antippen → eingetragen; Rückgängig; Favorit entfernen per ×.
---

## Ideen für später

- Schätz-Tendenz in den Einstellungen: „eher niedrig“ (zum Zunehmen), „realistisch“, „eher hoch“ (zum Abnehmen)
- Ernährungsform in den Einstellungen (z. B. pescetarisch, vegetarisch, vegan), damit Claude z. B. Fleisch ausschließt und präziser schätzt
- **Kostensenkung** (später klären): ~~„Häufig gegessen“ zum kostenlosen Wiederholen ohne Claude~~ (erledigt als Favoriten, V2-14); „Meine Lebensmittel“ mit gespeicherten Packungswerten, damit Packungsfotos entfallen; günstigeres Claude-Modell mit echten Fotos vergleichen.

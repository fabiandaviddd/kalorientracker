# Kalorientracker mit Foto – Beschreibung & Bauplan

## Fortschritt

- [x] Schritt 0 – Vorbereitung (API-Schlüssel + Ausgabenlimit)
- [ ] Schritt 1 – Leere App online
- [ ] Schritt 2 – App auf den Home-Bildschirm
- [ ] Schritt 3 – Grundgerüst
- [ ] Schritt 4 – API-Schlüssel eintragen
- [ ] Schritt 5 – Foto aufnehmen
- [ ] Schritt 6 – Claude schätzt
- [ ] Schritt 7 – Korrigieren
- [ ] Schritt 8 – Speichern & Tagesliste
- [ ] Schritt 9 – Bearbeiten & Löschen
- [ ] Schritt 10 – Frühere Tage
- [ ] Schritt 11 – Export & Import
- [ ] Schritt 12 – Feinschliff
- [ ] Schritt 13 – Abnahme

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

**Bewusst nicht in Version 1:** Tagesziel, Diagramme, Eingabe ohne Foto, manuelle Eingabe ohne Claude, Cloud-Sync, mehrere Nutzer.

**Technische Leitplanken:**
- Reine Web-App (HTML/CSS/JavaScript), veröffentlicht über GitHub Pages, installierbar auf dem Home-Bildschirm.
- Claude wird direkt aus dem Browser aufgerufen. Der Schlüssel wird nur auf dem Gerät gespeichert.
- Der API-Schlüssel darf **nie** im Code oder auf GitHub landen. In der Anthropic Console ist ein Ausgabenlimit gesetzt.
- Die Daten liegen nur auf dem iPhone. Die Export-Datei ist die Absicherung.
- Claudes Werte sind Schätzungen, deshalb gibt es immer einen Korrektur-Schritt vor dem Speichern.
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

### Schritt 7 – Korrigieren
Auf dem Prüfen-Bildschirm lassen sich Namen und Zahlen ändern, Lebensmittel entfernen und die Portion anpassen (z. B. ×0,5 oder ×2).
**Test:** 500 kcal auf 400 ändern, die Gesamtsumme passt sich sofort an. Mit „×2“ verdoppeln sich alle Werte.

### Schritt 8 – Speichern & Tagesliste
„Speichern“ legt die Mahlzeit mit Vorschaubild und Uhrzeit in der Tagesliste ab, und die Summen oben werden aktualisiert.
**Test:** Zwei Mahlzeiten speichern und prüfen, ob die Summe stimmt. Die App komplett schließen und wieder öffnen: Beide Mahlzeiten sind noch da.

### Schritt 9 – Bearbeiten & Löschen
Antippen eines Eintrags öffnet ihn zum Bearbeiten. Dort lassen sich auch Datum und Uhrzeit ändern und der Eintrag löschen, mit Sicherheitsabfrage.
**Test:** Einen Wert ändern, die Summe passt sich an. Beim Löschen erscheint erst eine Rückfrage, danach ist der Eintrag weg.

### Schritt 10 – Frühere Tage
Mit Pfeilen zwischen den Tagen blättern. Ein „Heute“-Knopf springt zurück zum aktuellen Tag.
**Test:** In Schritt 9 einen Eintrag auf gestern verschieben. Heute verschwindet er, gestern taucht er mit der richtigen Summe auf.

### Schritt 11 – Export & Import
In den Einstellungen speichert „Daten exportieren“ eine Datei, und „Daten importieren“ stellt sie wieder her.
**Test:** Nach iCloud Drive exportieren und prüfen, ob die Datei in der Dateien-App liegt. Einen Eintrag löschen und die Datei importieren: Der Eintrag ist wieder da und nichts ist doppelt.

### Schritt 12 – Feinschliff
Texte, Fehlermeldungen, große Schrift und Bedienung mit einer Hand werden rund gemacht.
**Test:** Am iPhone eine größere Schrift einstellen, nichts wird abgeschnitten. Alle Knöpfe sind gut mit dem Daumen erreichbar.

### Schritt 13 – Abnahme
Die App 3 Tage lang normal nutzen und alles notieren, was stört.
**Test:** Alle sechs Punkte unter „Version 1 ist fertig, wenn“ sind erfüllt. Dann ist Version 1 fertig.

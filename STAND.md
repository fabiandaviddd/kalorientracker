# Stand – 23.10.2026

> Diese Datei wird bei jedem Meilenstein überschrieben, nicht ergänzt. Geschichte steht in git und `archiv/`.

**Live:** v=75. Abgenommen bis V2-22, dazu aus dem Protokoll 19.10.: V2-23 (Zuordnung 4× ohne Probleme, Bevel aus der
Meldung 13×), V2-25 („Prüfen“ ~18× genutzt), V2-27 Rückfrage bei nicht geschickter Korrektur (1× ausgelöst, richtig
reagiert), V2-28 Tagessumme in allen Meldungen, V2-29 Rückfrage von Claude (8×: 5 geändert, 3 bestätigt).

**Wartet noch:**
- V2-24 Etikett-Optik und V2-30 Kleinigkeiten – sagt nur Fabian.
- V2-26 Ernährung seit 21.10. „pescetarisch“ (Briefkasten); V2-29 Gewohnheiten noch leer. Am 17.10. fragte
  Claude „Welche Wurst bei der Currywurst?“ – mit „Pescetarisch“ wäre das unnötig gewesen.
- V2-28 „Nochmal eintragen“ und Fortsetzen nach Neustart, V2-29 Reste: noch nicht vorgekommen.
- V2-31 Anfrage hing im Hintergrund → einmal neu schicken (Protokoll: `anfrage hing`).
- V2-33 mehr Nutzung im Protokoll (`read-log` zeigt Ansichten mit Dauer/Scrolltiefe, Rückfragen gestellt/beantwortet,
  Textfelder, abgebrochene Fotoauswahl) – nach ein paar Tagen selbst nach Verbesserungen suchen.
- V2-34 Startabsturz behoben: im Briefkasten dürfen keine `codefehler` mit „meal-again“/v=64 mehr kommen; `neu geladen
  nach absturz` = Selbstheilung hat gegriffen. Einmal `protokollfehler [aufräumen]` (21.10., ohne Text) – beobachten.
- V2-32 Protokoll-Briefkasten: funktioniert (23.10.: 749 Einträge seit 9.10. angekommen). Fabians Gerät a81df138…;
  ein zweites (2f5495f6…, 23.10. 01:04, nicht vom Home-Bildschirm, leer) war ein einzelner Browser-Aufruf.

**Protokoll 19.10. (Sicherung 19.10. 12:43, ausgewertet 20.10.):** 18 neue Mahlzeiten, keine Lücken, keine Fehler, nichts
fehlt gegenüber 13.10. 35 Anfragen, 1,75 $ in 10 Tagen. 7 Mahlzeiten korrigiert, davon 5 per Claudes Rückfrage, nur 2
getippt. Auffällig: 15.10. 11:06 „Schätzen“, 5 s später Hintergrund, nach 5 min zurück – Anfrage hing, Fabian musste
abbrechen und neu tippen → behoben in V2-31. Ein Start dauerte 5,8 s (16.10. 14:29), sonst ~0,5 s – beobachten.

**Nächster Schritt:** In ein, zwei Tagen `node tools/read-log.mjs --briefkasten` – Protokoll ohne Sicherung prüfen, offene
Punkte oben abhaken. Fabian stellt Ernährung und Gewohnheiten ein. API-Schlüssel am 22.10. erneuert.

**Danach (meine Empfehlung):** erst Alltag mit V2-26 bis V2-29 abwarten, dann `/impeccable critique` erneut (13.10.: 30/40).
Danach (Fabian: „später“): mit dem neuen Guthaben testen, ob Opus mit Denktiefe „hoch“ oder Fable 5.1 genauer
schätzt – Schwerpunkt auf den korrigierten Mahlzeiten, Skript `_entwurf/modelltest/test.mjs`.
Schätz-Tendenz nicht bauen.

**Klein offen:** Datumsfeld „Gegessen am“ schneidet bei sehr großer Schrift die Uhrzeit ab · Rahmen `.text-input`
1,5 px (Zwischenstärke).

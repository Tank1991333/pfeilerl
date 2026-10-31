# Pfeilerl – Projektkontext für Claude Code

Pfeilerl ist ein Dart-Zähler als Web-App ohne Framework: eine HTML-Seite, eine CSS-Datei, eine JavaScript-Datei. Die Oberfläche ist komplett auf Deutsch (österreichischer Charme ist erwünscht, z. B. „Leiwand!“ bei 180).

## Befehle

- `npm test` – Testsuite ohne Browser (lädt `src/app.js` in einer simulierten Umgebung). Vor jedem Commit ausführen.
- `npm run build` – baut `index.html` und `sw.js` im Hauptordner (installierbare PWA), kopiert die Seite samt Manifest und Icons nach `public/` (für Vercel, nicht eingecheckt) und `dist/claude-artifact.html` (Einzeldatei für claude.ai). Nach jeder Änderung an `src/` ausführen und `index.html` und `sw.js` mit committen, sonst schlägt die Prüfung auf GitHub fehl.
- `npm run serve` – lokaler Server für `public/` (also genau das, was Vercel veröffentlicht; vorher `npm run build`) auf http://localhost:8080, nur auf diesem Rechner. Mit `HOST=0.0.0.0` auch im WLAN, etwa zum Testen am Handy. Kamera und Service Worker brauchen localhost oder https.

Keine Abhängigkeiten, nur Node 18 oder neuer.

## Aufbau

- `src/index.html` – Vorlage mit Platzhaltern `/*STYLES*/`, `/*SCRIPT*/` und `<!--PWA-->`, die `scripts/build.mjs` füllt.
- `src/styles.css` – Design-Tokens auf `:root` (hell) und unter `prefers-color-scheme: dark` bzw. `[data-theme="dark"]`. Farben nur über Variablen: `--bg --surface --ink --muted --line --red --green --yellow --violet --blue --orange`.
- `src/app.js` – die ganze App in einer IIFE, gegliedert in Abschnitte (`/* ---------- Name ---------- */`):
  Checkout · Computer-Gegner · Spielmodi · Party- und Trainingsmodi · Zustand · Sprachausgabe · Setup · Spiel · Statistik · Erfolge & Trainingsplan · Turnier · Online · Kamera · Trainer · Einlauf, Jingles · Großer Bildschirm · Dart-Sets · Ereignisse im Setup
- `src/camera.js` – der ganze Kamera-Teil (Erkennung, Kalibrierung, Selbstheilung, Kameraseite). Build und Tests setzen ihn in `src/app.js` an der Platzhalter-Zeile `/*CAMERA*/` ein; er teilt sich den Gültigkeitsbereich mit der App.
- `src/sw.js` – Vorlage für den Service Worker, der Build setzt die Version ein.
- `src/fonts.css` und `fonts/` – Barlow und Barlow Condensed selbst gehostet (OFL, lateinischer Zeichensatz). Die PWA lädt keine Schriften von Google (DSGVO), nur die claude.ai-Fassung nutzt Google Fonts. Der Build tauscht dafür den Block zwischen `<!--FONTS-->` und `<!--/FONTS-->` in `src/index.html`.
- Hauptordner: `index.html` und `sw.js` sind **gebaut**, nie direkt bearbeiten. `manifest.webmanifest` und die Icons liegen direkt hier.
- `vercel.json` – Vercel baut mit `npm run build` und veröffentlicht `public/`. Setzt Sicherheitsheader (CSP nur `'self'`, kein Einbetten in fremde Seiten, Kamera nur für die eigene Seite). Neue externe Quellen brauchen dort einen Eintrag.
- `.github/workflows/pruefen.yml` – führt bei jedem Push die Tests aus und prüft, ob die gebaute Seite zum Quellcode passt.
- `tests/run.cjs` – Tests. Die App ruft am Ende `window.__pfeilerlTest(api)` auf, falls vorhanden; darüber greifen die Tests auf interne Funktionen zu.

## Zentrale Konzepte

**Spielmodi** stehen im Objekt `MODES`. Jeder Modus ist ein Objekt mit:
`cat` ('spiel' | 'party' | 'training'), `name`, `desc`, `options` (Liste `{key,label,choices:[[wert,'Text']]}`), `sub(opts)`, `init(g)`, `dart(g,p,d)`, optional `startVisit`, `endVisit`, `afterVisit`, `onRound`, `keepTurn`, `beforeNext`, `targets(g)`, `board(g)`, `hint(g,p)`, `prompt(g,p)` (Sprachansage), `aim(g,p,bot)` (Zielwahl des Computers), `stats(g)`, `record(g,p)` (was in die Statistik geht), `statKind` ('score' | 'low' | 'darts' | 'top' | 'avg' | 'wins'), `scoreCall` (Punkte ansagen), `minPlayers`.

**Neuen Modus hinzufügen:** Eintrag in `MODES` (bzw. im `Object.assign(MODES,…)`-Block), Standardoptionen in `DEFAULTS.opts`, `aim` für den Computer nicht vergessen. `npm test` spielt jeden Modus automatisch mit drei Computer-Gegnern durch.

**Dart:** `{seg, mult}` – `seg` 1–20, 25 für Bull, 0 für daneben; `mult` 1–3 (Bull innen = `{seg:25,mult:2}`, daneben = `{seg:0,mult:0}`).

**Spielstand `game`:** `{gid, mode, opts, players[], cur, round, visit[], locked, bust, winner, msg, flash, legDone, online, screen, tour, drill}`. Jede Aktion legt vorher einen Klon in `history` ab; „Rückgängig“ holt ihn zurück. `saveGame()` speichert lokal und pusht bei Online- oder Bildschirm-Spielen in die Datenbank.

**Ablauf einer Aufnahme:** `throwDart(d)` → `MODES[mode].dart()` → nach 3 Darts `locked` → `nextVisit()` → `endVisit` → `advance()` (überspringt ausgeschiedene Spieler, erhöht `round` beim Umlauf) → `onRound` → `startVisit`.

**Tastatur (PC):** `gameKey(e)` im Abschnitt Spiel. Zahl tippen (1, 2 und 5 warten 700 ms auf eine zweite Ziffer), `D`/`T` Double/Triple, `B` Bull, `0` Daneben, Enter/Leertaste Weiter, Rücktaste/`z` Rückgängig, Esc bricht ab. Die Hilfezeile `.kbhelp` erscheint nur bei Maus und Tastatur.

**Statistik:** Beendete Spiele werden als Datensatz gespeichert (`buildRecord`), lokal in `dart.records` und auf claude.ai zusätzlich privat in der Datenbank unter `data/users/<id>/games`. Pro Spieler: Name, Sieg, Darts, Trefferbild `hm` (Schlüssel wie `T20`, `S5`, `D16`, `25`, `50`, `0`), Dart-Set und modusspezifische Werte aus `record()`.

**Startseite:** Zeigt nur vier Modi (`quickModes()`: zuletzt gespielt aus `setup.recent`, sonst X01, Cricket, Rund um die Uhr, Killer), „Alle Spielmodi zeigen“ klappt alle auf. Design, Dart-Sets, Stammspieler und Datensicherung stecken im aufklappbaren Bereich `#more`.

**Stammspieler:** `setup.regulars` (`{name,nick,set,jingle,aid}`, neueste zuerst, max. 30). `rememberPlayers()` merkt beim Spielstart alle echten Namen (keine Computer, nicht „Spieler N“), `addRegular()` setzt einen Stammspieler statt eines Standardnamens ein.

**Design:** `setup.theme` ('auto' | 'light' | 'dark'), `applyTheme()` setzt `data-theme` auf `<html>`.

**Datensicherung:** `backupData()` lädt eine JSON-Datei `{app:'pfeilerl',format:1,version,errors,records,sets,regulars,coach}` herunter. `mergeBackup()` fügt nur fehlende Spiele (nach `id`), Sets und Stammspieler hinzu und markiert neue Spiele als `pending`, damit sie auf claude.ai in die Datenbank wandern.

**Update-Hinweis:** Das Service-Worker-Skript aus `scripts/build.mjs` prüft beim Zurückkehren in die App und alle 30 Minuten auf Updates. Übernimmt ein neuer Service Worker, ruft es `window.pfeilerlUpdate()` auf, das einen Hinweis mit „Aktualisieren“ zeigt.

**Fremde Daten:** Alles, was nicht vom eigenen Gerät stammt (Online-Spielstand, großer Bildschirm, Datenbank-Datensätze, Sicherungsdatei, gespeicherter Spielstand), läuft durch `untrusted()` (entfernt `< > "` und Backtick aus Texten, nur endliche Zahlen, keine `__proto__`-Schlüssel) und `validGame()`. Codes prüft `validCode()`. In Vorlagen trotzdem alle Texte mit `esc()` ausgeben.

**Fehlerprotokoll:** `logError()` hält die letzten 30 unerwarteten Fehler (`window` error und unhandledrejection) in `dart.errors`; sie gehen mit der Datensicherung mit.

**Impressum und Datenschutz:** `renderLegal()` (Link in der Fußzeile). Die Impressum-Angaben stehen in `package.json` unter `impressum` (`name`, `ort`, `email`), der Build setzt sie an `/*IMPRESSUM*/{}` ein. Leer: nur der Datenschutzteil erscheint.

**Online-Codes:** `makeCode()` aus `crypto.getRandomValues`, vor dem Anlegen auf freie Codes geprüft. Spiele älter als 24 Stunden (`ONL_MAX_AGE`) gelten als beendet. Beendet der Gastgeber das Spiel, löscht `onlLeave()` das gemeinsame Dokument.

**Lokaler Speicher (`localStorage`):** `dart.setup`, `dart.game`, `dart.records`, `dart.tour`, `dart.online`, `dart.coach`, `dart.camcal`, `dart.camslots`, `dart.camset`, `dart.errors`. Eigene Einlaufmusik liegt in IndexedDB (`pfeilerl` / `audio`).

## Zwei Laufzeiten

1. **claude.ai** (veröffentlichtes Artifact): `window.claude.use('db' | 'user' | 'sample')` ist verfügbar. Damit laufen Online-Spiele (Dokument `online/<CODE>`), großer Bildschirm (liest dasselbe Dokument), geräteübergreifende Statistik und der KI-Trainer (`sample` mit Bildern).
2. **Eigenes Hosting / PWA** (Vercel): `window.claude` fehlt. Alles, was darauf aufbaut, prüft das und blendet sich aus oder fällt zurück (Trainer ohne KI, Statistik nur lokal). Kamera-Erkennung funktioniert hier zuverlässiger, weil der Browser auf claude.ai den Kamerazugriff meist blockiert.

Auf claude.ai erlaubt die Content-Security-Policy externe Skripte nur von cdnjs.cloudflare.com, cdn.jsdelivr.net/npm, cdn.tailwindcss.com und code.jquery.com sowie Schriften von Google Fonts. Keine weiteren externen Ressourcen einbauen.

## Kamera-Erkennung (Prototyp)

Drei USB-Kameras am Ring rund ums Board, schräg auf die Scheibe blickend wie bei Autodarts (flach seitlich blickende Kameras gehen weiterhin). Kalibrierung: 5 Punkte (Bull und die äußeren Doppel-Drähte von 20, 6, 3, 11), daraus `fitCal()`: eine Homographie `H` (Board in mm ↔ Bild 0 bis 1, `fitH`/`projH`/`invH`), das 1D-Modell `p` (x-Zeile der Abbildung) und `angled` (Board als Ellipse statt Streifen). Nach dem 5. Punkt zeigt die App das Board-Raster (`drawOverlay`) und die Abweichung, erst „Übernehmen“ speichert. Punkte sind relativ zur Bildgröße gespeichert, gelten also nur fürs gleiche Seitenverhältnis (`c.ar`).

Erkennung (`camTick`, Takt nach Erkennungsgeschwindigkeit): Differenzbilder in 480 Pixel Breite im Suchbereich `maskOf()` (schräg: alles bis 300 mm vom Bull, flach: Band um die Oberfläche). Schwelle in Pixeln, passt sich dem Bildrauschen in Ruhe an (`cam.noise`), Hand = großer Anteil. Darts ziehen beendet die Aufnahme wie bei Autodarts, sobald mindestens ein Dart gezählt ist (auch nach einem gewonnenen Leg); fehlende Darts zählen als daneben, die Meldung weist darauf hin. Spitze (`findTip`): schräg der unterste zusammenhängende Teil der Veränderung, flach die Pixel nächst der Oberflächenlinie. `locate()` schneidet die Geraden aller Kameras, eine schräge Kamera allein reicht notfalls. Kameraeinstellungen: Auflösung (`CAM_RES`, Standard 1280×720), Bilder/s, Standby (`standbyCheck`, `camWake` beim Spielstart), Prüfung auf verrutschte Kameras (`ncc` mit Vorschaubild aus der Kalibrierung). Scheitert eine Kamera mit `NotReadableError`, schaltet `camStart()` über `camModes()` sparsamer. Fehlertexte aus `camErrText()`.

**Automatische Kalibrierung** (`autoCalibrate`, Abschnitt „Automatische Kalibrierung“): Farbmaske rot/grün (`acColorMask`) → Ellipse des Board-Rands (`acFindEllipse`, Ausreißer über gleitenden Median) und zweiter Startweg über Bull, nächsten Punkt und Seiten (`acExtremes`) → Suche über Bull-Lage und Drehung mit `acInit` (Lorentz-Boost hält den Rand-Kreis fest) → Feinanpassung `acRefine` der Bewertung `acScore` (Farben je Segment, Messpunkte neben den Ringen) → Lage der 20 aus dem Muster ein-/zweistelliger Zahlen (`acDigitCorr`, nach Bildgröße gewichtet). Die Zahlen sind nur ein Vorschlag: Jede automatisch kalibrierte Kamera speichert alle zehn Drehungen (`alts`, `altCorr`). `locate()` summiert je Kombination, wie schlecht sich die Geraden treffen (`rotAcc`), `voteRotation()` übernimmt nach drei Würfen mit klarem Vorsprung. Würfe klären nur die Drehung der Kameras zueinander (dreht man alle gleich, treffen sich die Geraden genauso gut); welcher dieser Zwillinge stimmt, entscheidet die Zahlenerkennung aller Kameras gemeinsam. Ist die gemeinsame Drehung knapp (`globUnsure`) oder laufen weniger als drei Kameras (dann klären Würfe gar nichts, die Zahlen entscheiden sofort), fragt die Kameraseite „Steht die 20 …?“ mit „Passt“ (`confirmRotation`) und „Die 20 liegt woanders“ (`rotateAll(36)`). Solange `rotPending()`, hängt die Erkennung an jede Meldung „bitte prüfen“ an.

**Kantenverfeinerung und Selbstprüfung** (Abschnitt „Verfeinerung an Ringübergängen und Drähten“): `edgeMeasure()` sucht mit der aktuellen Homographie entlang von Strahlen in der Board-Ebene die sechs Ringübergänge (WDF-Radien, Fenster `RING_WIN`, erst grob, dann fein) und quer die 20 Drähte in den Single-Feldern, subpixelgenau. `edgeFit()` rechnet daraus die Homographie neu (Ringe und Drähte getrennt gefiltert, gleich gewichtet). `edgeStats()`: Reprojektionsfehler in Pixeln in % des Board-Radius (`rel`, ohne die schlechtesten 10 %), Radien-, Winkel- (nur ab 118 mm) und Zentrumsfehler als Median. `camAutoCal()` macht bis zu drei Versuche, präzise unter 0,5 % (`CAL_OK`), angenommen bis 2 % (`CAL_MAX`). Von Hand gesetzte Punkte werden ebenso nachjustiert.

**Selbstheilung** (`selfHeal`, alle 2 s je eine Kamera reihum in 960 Pixel Breite, beim Start alle; nur wenn gerade kein Dart erkannt wird): misst die Kanten mit der gespeicherten Kalibrierung gegen den Maßstab direkt nach dem Kalibrieren (`stats0`). Kleine Drift wird nachgeführt, wenn das Ergebnis so gut wie das Original ist, sonst und bei Bewegung neu kalibriert (`keepRot`: Lage der 20 bleibt). Hinweise bei Unschärfe und stark verändertem Licht (`cam.health`). Beim Start kalibriert die App neue Kameras selbst (`camAutoAll`, Einstellung `autocal`) und prüft danach alle über `selfHeal(true)`. Die Kameraseite zeigt eine Checkliste, Kameras und „Erkennung starten“; alle Feineinstellungen stehen unter „Erweitert“ (`#camadv`). „Kamerabilder speichern“ (`camSaveImages`) lädt die Rohbilder für die Fehlersuche herunter.

Getestet mit simulierten 3D-Kameras (`tests/run.cjs`, Abschnitt „schräge Kameras“). Echte Kamerabilder fehlen noch, dort liegt der größte Verbesserungsbedarf (Linsenverzerrung, Licht, Schatten).

## Konventionen

- UI-Texte auf Deutsch, per du, typografische Anführungszeichen „…“ und Apostroph ’ im sichtbaren Text, gerade Anführungszeichen im Code.
- Keine Mittelpunkte als Trenner in Metazeilen, lieber Kommas oder getrennte Elemente.
- Mobil zuerst (Handy am Board), Safe-Area-Abstände beachten, Bedienelemente mindestens 44 px.
- Versionsnummer steht nur in `package.json`. Bei jeder Veröffentlichung erhöhen (kleine Korrektur 1.2.0 → 1.2.1, neue Funktion → 1.3.0). Der Build schreibt sie in die App (Fußzeile der Startseite) und in den Cache-Namen des Service Workers (`pfeilerl-<version>`), damit installierte Apps die neue Version laden.

## Veröffentlichen

- **Vercel (Live-Version, https://pfeilerl.vercel.app):** Version in `package.json` erhöhen, `npm test`, `npm run build`, alles committen und nach `main` pushen. Vercel baut jeden Push auf `main` automatisch und veröffentlicht `public/`. Schlägt der Build fehl, bleibt die vorige Version live.
- **claude.ai:** Inhalt von `dist/claude-artifact.html` in den Pfeilerl-Chat geben und dort aktualisieren lassen. Benötigte Fähigkeiten: `db`, `user`, `sample` mit Bildern.

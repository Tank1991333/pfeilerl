# Pfeilerl – Dart-Zähler

Installierbare Web-App (PWA). Läuft offline, mit Icon am Homescreen und mit Kamera-Erkennung am PC.

## Auf GitHub Pages veröffentlichen

1. Auf github.com ein neues Repository anlegen, z. B. `pfeilerl` (öffentlich).
2. Alle Dateien aus diesem Ordner hochladen („Add file“ → „Upload files“) und committen.
3. Im Repository: **Settings → Pages → Build and deployment**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, speichern.
4. Nach ein bis zwei Minuten ist die App erreichbar unter `https://<dein-name>.github.io/pfeilerl/`.

## Installieren

- **iPhone (Safari):** Seite öffnen → Teilen → „Zum Home-Bildschirm“.
- **Android (Chrome):** Seite öffnen → Menü → „App installieren“.
- **PC (Chrome oder Edge):** Seite öffnen → Installieren-Symbol in der Adressleiste.

## Kamera-Erkennung am PC

1. Drei USB-Kameras rund ums Board montieren, etwa im 120-Grad-Abstand, knapp vor der Scheibe und flach über die Oberfläche blickend.
2. Möglichst auf verschiedene USB-Anschlüsse verteilen, sonst reicht oft die Bandbreite nicht.
3. In Pfeilerl auf **Kamera** → **Kameras suchen**, jeder Position ein Gerät zuordnen und den Browser-Zugriff erlauben.
4. Jede Kamera **kalibrieren**: im Standbild der Reihe nach Bull-Mitte und den äußeren Draht der Doubles 20, 6, 3 und 11 antippen.
5. **Erkennung starten**, dann wie gewohnt ein Spiel beginnen. Erkannte Würfe werden automatisch eingetragen; Darts ziehen (Hand im Bild) schaltet nach drei Darts zum nächsten Spieler.

Hinweise: Gleichmäßiges Licht (LED-Ring) verbessert die Erkennung stark. Falsch erkannte Würfe mit „Rückgängig“ korrigieren und per Taste eingeben.

## Unterschiede zur claude.ai-Version

- Statistik und Spielstände werden nur auf dem jeweiligen Gerät gespeichert.
- Online-Spiele gegen Freunde funktionieren nur in der claude.ai-Version.

## Aktualisieren

Neue `index.html` hochladen und in `sw.js` die Versionsnummer (`pfeilerl-v1` → `pfeilerl-v2`) erhöhen, damit installierte Apps das Update laden.

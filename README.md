# Plant Monitor LAN-Server mit QR-Code und Server-Speicherung

Diese Version speichert Pflanzen, Ereignisse und Fotos auf dem Laptop-Server.  
Dadurch sehen Laptop und Handy dieselben Daten und sie bleiben nach einem Server-Neustart erhalten.

## Start

Einmalig im Projektordner ausführen:

```bash
npm install
```

Danach starten:

```bash
npm start
```

oder:

```bash
node server.js
```

Der Server lauscht auf `0.0.0.0` und erkennt beim Start automatisch die aktuelle WLAN-/Hotspot-IP. Er zeigt:

- die lokale Laptop-Adresse
- die Handy-URL im Netzwerk
- einen QR-Code im Terminal
- die Datenpfad-Datei
- den externen Server-Datenordner

Beispiel:

```text
Auf dem Handy öffnen:
  http://192.168.178.45:3000
```

Den QR-Code kannst du mit der Handy-Kamera scannen.

## Projektaufbau

Die App kommt ohne Build-Schritt aus. Der Node-Server liefert die Dateien direkt aus:

```text
plant-monitor-lan/
├── index.html                  # statische UI-Struktur, Views und Dialoge
├── styles.css                  # Design Tokens, Layout, Karten, Dialoge, responsive Regeln
├── app.js                      # komplette Browserlogik, Rendering und API-Nutzung
├── server.js                   # lokaler HTTP-Server, JSON-API, QR-/Shortlinks
├── data.js                     # eingebaute Startdatenbank mit Phasen und Sorten
├── data-path.json              # Konfiguration fuer den externen Datenordner
├── assets/plant-icons/         # lokale Pflanzenbilder
└── package.json                # Startskripte und optionale Terminal-QR-Abhaengigkeit
```

Die Nutzdaten liegen getrennt im externen Datenordner:

```text
plant-monitor-data/
├── state.json                  # Pflanzen, Ereignisse, Pflegeplaene, Shortcodes
├── photos.json                 # komprimierte Fotos und Thumbnails
└── library.json                # eigene Sorten, Pflanzenauswahl-Filter, Shoplinks
```

## Architektur

`server.js` ist die einzige Server-Komponente. Er erkennt die LAN-/Hotspot-Adresse, liefert die statische App aus und stellt die API unter `/api/...` bereit. JSON wird ueber temporaere Dateien geschrieben und danach ersetzt, damit die Daten moeglichst nicht halb gespeichert werden.

`app.js` ist die zentrale Frontend-Datei. Sie laedt zuerst die oeffentliche Server-URL, danach Sorten-Erweiterungen aus `library.json`, den Pflanzenstand aus `state.json` und Fotos aus `photos.json`. Aus diesem Zustand rendert sie Dashboard, Aufgaben, Pflegeplaene, Sortendatenbank, Lebenszyklen und History.

`data.js` ist nur die eingebaute Startdatenbank. Laufende Pflanzen, Fotos, Pflegeplaene oder eigene Sorten werden dort nicht gespeichert.

## Dashboard-Sortierung

Aktive Pflanzen werden im Dashboard fachlich sortiert:

```text
Pflanzenart -> Familie/Hersteller -> Sorte -> Benennung
```

Beispiel: Erst kommen die Arten in der Reihenfolge Cannabis, Tomaten, Paprika, Chili. Innerhalb einer Art wird nach Hersteller/Breeder bzw. Sortenfamilie sortiert, danach nach der Sorte und zuletzt nach dem individuellen Pflanzennamen. Wiederholte Praefixe wie `Paprika Albaregia` werden fuer die Sortierung bereinigt, damit die eigentliche Sorte unter `A` landet.

## Performance-Hinweise

Das Dashboard soll beim Start nur die Daten laden, die fuer die erste Ansicht gebraucht werden:

- Die Sortendatenbank wird im Browser gecacht. `getVariety()` greift danach auf eine Map zu, statt alle Sorten pro Pflanzenkarte neu zu normalisieren und zu sortieren.
- Die grosse Sortenauswahl im Dialog `Pflanze anlegen` wird erst beim Oeffnen des Dialogs aufgebaut.
- Foto-Galerien laden zuerst nur Summary-Daten. Originalbilder werden erst beim Oeffnen eines Fotos nachgeladen.
- Neue Fotos bekommen ein kleines Thumbnail. Alte Fotos ohne Thumbnail werden im Dashboard mit einem Platzhalter angezeigt und erst in der grossen Ansicht voll geladen.

## Wo werden die Daten gespeichert?

Die Daten werden jetzt **außerhalb des Projektordners** gespeichert.
Im Projektordner liegt dafür diese Datei:

```text
data-path.json
```

Darin steht der Speicherpfad, standardmäßig:

```json
{
  "dataDir": "../plant-monitor-data"
}
```

Dieser Pfad wird relativ zum Projektordner aufgelöst. Dadurch entsteht neben dem Projektordner automatisch ein separater Datenordner:

```text
plant-monitor-data
```

Darin liegen:

```text
plant-monitor-data/state.json
plant-monitor-data/photos.json
plant-monitor-data/library.json
```

- `state.json` enthält Pflanzen und Ereignisse.
- `photos.json` enthält die komprimierten Foto-Daten.
- `library.json` enthält eigene Sorten und die Pflanzenauswahl-Filter.

Du kannst in `data-path.json` auch einen absoluten Pfad eintragen, zum Beispiel:

```json
{
  "dataDir": "/Users/deinname/PlantMonitorDaten"
}
```

Oder unter Windows zum Beispiel:

```json
{
  "dataDir": "C:/Users/deinname/PlantMonitorDaten"
}
```

Wichtig: Wenn du den Projektordner ersetzt oder aktualisierst, bleibt der externe Datenordner erhalten.
Diese Daten-Dateien bitte nicht löschen, wenn du deine Pflanzen behalten willst.

Falls du noch alte Daten im früheren Ordner `server-data` hast, übernimmt der Server sie beim ersten Start automatisch in den neuen externen Datenordner, solange dort noch keine Daten-Dateien vorhanden sind.

## Sortendatenbank und Pflanzenauswahl

Im Tab `Sortendatenbank` kannst du jetzt:

- eigene Sorten hinzufügen
- Hersteller/Breeder speichern
- Cannabis-Formen wie feminisiert, Autoflower, Regular oder CBD-betont hinterlegen
- über `Pflanzenauswahl` festlegen, welche Pflanzenfamilien und Sorten im Dialog `Pflanze anlegen` erscheinen

Die eigenen Sorten und die Auswahlfilter werden in `plant-monitor-data/library.json` gespeichert.

Die eingebaute Cannabis-Startdatenbank enthält eine erweiterte Herstellerliste. Herstellerkataloge ändern sich laufend; die Liste ist deshalb als Startdatenbank gedacht und kann über eigene Sorten ergänzt werden.

## WLAN / Hotspot

Die Handy-Adresse wird nicht mehr fest auf eine alte Hotspot-IP gesetzt. Standardmäßig verwendet der Server die aktuell erkannte Netzwerk-IP.

Wenn du trotzdem eine feste Adresse erzwingen willst, kannst du den Server so starten:

```bash
PUBLIC_HOST=172.20.10.6 npm start
```

Oder komplett mit URL:

```bash
PUBLIC_URL=http://plant.lan:3000 npm start
```

## Hotspot

Das funktioniert auch über Hotspot, solange Handy und Laptop im gleichen Netzwerk sind.

### Variante A

Handy erstellt Hotspot, Laptop verbindet sich damit.  
Dann die im Terminal angezeigte Laptop-IP am Handy öffnen oder den QR-Code scannen.

### Variante B

Laptop erstellt Hotspot, Handy verbindet sich damit.  
Das ist oft zuverlässiger.

## Falls es nicht klappt

- Öffne am Handy genau die URL, die im Terminal unter `Handy-/QR-/NFC-Ziel` steht.
- Teste am Handy auch `http://DEINE-IP:3000/api/health`.
- Server komplett neu starten.
- Prüfen, ob Firewall/Antivirus Node.js blockiert.
- Handy darf nicht im Gastnetz sein.
- VPN deaktivieren.
- Falls der Port belegt ist:

```bash
PORT=3001 npm start
```

Dann wird eine neue URL mit Port 3001 angezeigt.

## Server-Speicher prüfen

Links unten in der Seitenleiste steht der Speicherstatus.

- `Server-Speicher verbunden` = alles ok.
- `Server-Speicher nicht erreichbar` = App wurde wahrscheinlich direkt als Datei geöffnet oder ein alter Server läuft.

Die Adresse muss mit `http://` beginnen, zum Beispiel:

```text
http://192.168.178.45:3000
```

Nicht verwenden:

```text
file:///.../index.html
```

## Pflanzen-QR-Codes

Jede Pflanze bekommt einen eigenen QR-Code.

- Aktive Pflanzen: QR-Code im rechten Pflanzen-Detailbereich.
- Abgeschlossene Pflanzen: QR-Code im History-Tab.
- Der QR-Code öffnet direkt dieselbe Pflanze auf diesem Server.
- Die QR-Codes nutzen kurze Links wie `/p/1` statt langer `?plant=...`-URLs.
- Dadurch sind die QR-Codes kleiner/luftiger codiert und besser für kleine Pflanzen-Schilder.

Wichtig: Der Server muss laufen und das Handy muss dieselbe lokale Adresse erreichen können.


## Pflanzen-QR und NFC

Jede Pflanze zeigt im Detailbereich:

- `NFC-Link kopieren` zum Schreiben auf einen NFC-Tag mit NFC Tools
- `Pflanze öffnen` zum direkten Öffnen der Pflanzen-URL
- `QR öffnen` zum direkten Öffnen des QR-Codes als SVG

Die Pflanzen-Links nutzen kurze URLs mit der aktuell erkannten Server-Adresse, zum Beispiel:

```text
http://192.168.178.45:3000/p/1
```

Bei anderer IP kannst du den Server so starten:

```bash
PUBLIC_HOST=192.168.x.x npm start
```

oder komplett mit eigener Basis-URL:

```bash
PUBLIC_URL=http://pflanzen.lan:3000 npm start
```

## Pflanzen ausblenden statt löschen

Über **Pflanze ausblenden** werden Pflanzen nicht wirklich gelöscht.
Sie bleiben in der externen Datei `state.json` im konfigurierten Datenordner erhalten, werden aber im Dashboard und in der History standardmäßig nicht mehr angezeigt.
Im History-Tab gibt es den aufklappbaren Bereich **Ausgeblendete Pflanzen verwalten**, über den sie wieder sichtbar gemacht werden können.


## Pflanzenbilder

Die App enthält lokale Bild-Assets unter `assets/plant-icons/`. Tomaten, Paprika, Chili und Cannabis werden automatisch anhand von Sorte, Typ, Traits und Cannabis-Form/Dominanz passenden Bildern zugeordnet.


## Sortenbasis Hof Jeebel

Die Sortendatenbank enthält zusätzlich importierte Tomaten-, Paprika-, Chili- und Pfefferoni-Einträge aus dem öffentlichen Hof-Jeebel/Biogartenversand-Samenshop. Die Detaildaten sind als Startprofile gedacht und können in der App erweitert werden.

## Shoplinks & Preise

In der Sortendatenbank werden pro Sorte Shoplinks angezeigt. Für Tomaten, Paprika und Chili werden automatisch Shop-Suchlinks erzeugt. Konkrete Preise kannst du pro Sorte mit „+ Shop/Preis“ hinterlegen; sie werden in der externen Datei `plant-monitor-data/library.json` gespeichert.

Für Cannabis-Sorten werden keine automatischen Shoppreise vorgeschlagen. Eigene Links können manuell hinterlegt werden.


## Import Sensi Seeds & Bushplanet

Diese Version ergänzt die Sortendatenbank um Samen- und Jungpflanzen-Katalogeinträge aus:

- Sensi Seeds Direktshop
- White Label / Sensi Seeds
- Bushplanet Sensi-Seeds-Samen
- Bushplanet Cannabis-Jungpflanzen

Importstand: 2026-06-20  
Neue Cannabis-Einträge in dieser Version: 279  
Cannabis-Sorten gesamt: 587  
Gesamte Sortendatenbank: 1432

Die importierten Einträge enthalten, soweit aus der Shopliste ersichtlich: Hersteller/Breeder, Samen-/Jungpflanzen-Typ, Form wie feminisiert/autoflower/regulär/CBD, Shoplink und Preisstand. Preise und Verfügbarkeit müssen im Shop geprüft werden.


## Aufgaben & Pflegepläne

Pflegepläne werden jetzt als eigene Vorlagen im Tab **Pläne** erstellt. Eine Vorlage enthält Intervalle für Gießen, Düngen, Kontrolle und Fotos. Aufgaben entstehen nicht automatisch für alle Pflanzen, sondern erst, wenn du eine Vorlage im Dashboard einer einzelnen Pflanze zuweist.

Der einer Pflanze zugewiesene Plan kann danach individuell angepasst werden, ohne die ursprüngliche Vorlage zu verändern. Du kannst eine Pflanze auch wieder auf die Vorlage zurücksetzen oder den Plan entfernen. Pflegeplan-Vorlagen und individuelle Zuordnungen werden im externen `plant-monitor-data/state.json` gespeichert. Der Datenordner ist nicht Teil des Projekt-ZIPs.

## Individuelle Pflegepläne und Verlauf

Im Tab **Pläne** kannst du Pflegeplan-Vorlagen erstellen. Eine Pflanze bekommt erst Aufgaben, wenn du ihr im Dashboard gezielt eine Vorlage zuweist.

Pro Pflanze kannst du danach:

- eine Pflegeplan-Vorlage zuweisen
- einen Grund für Zuweisung oder Wechsel eintragen
- den zugewiesenen Plan individuell anpassen
- den individuellen Plan wieder auf die Vorlage zurücksetzen
- den Pflegeplan entfernen

Im Pflanzendetail erscheint jetzt der **Pflegeplan-Verlauf**. Dort siehst du:

- welchen Pflegeplan die Pflanze hatte
- von wann bis wann der Plan lief
- wie lange der Plan verfolgt wurde
- die jeweiligen Intervalle
- den dokumentierten Grund für Wechsel, Anpassung oder Entfernung

Diese Verlaufsdaten werden pro Pflanze in `plant-monitor-data/state.json` gespeichert.


## Foto-Performance

Neue Fotos werden zusätzlich als kleine Vorschau gespeichert. Die App lädt im Pflanzendetail zuerst nur die Vorschauen und holt das Originalbild erst beim Öffnen der großen Fotoansicht. Bereits vorhandene Fotos bleiben kompatibel; beim ersten Anzeigen alter Fotos kann die Vorschau noch größer sein, bis neue Thumbnails erzeugt wurden.

## Asset-Preload

Die Pflanzen-Icons werden beim Start im Browsercache/Cache Storage vorgeladen. Ein Cookie merkt sich nur die Preload-Version, damit dieselben Assets nicht bei jedem Seitenaufruf erneut aktiv vorgeladen werden.

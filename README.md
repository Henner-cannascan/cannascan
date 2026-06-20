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

Die App ist bewusst einfach aufgebaut und kommt ohne Build-Schritt aus:

```text
plant-monitor-lan/
├── index.html                  # statische App-Struktur und Dialoge
├── styles.css                  # Layout, Komponenten und responsive Darstellung
├── app.js                      # komplette Browserlogik und Server-API-Nutzung
├── server.js                   # lokaler Node-HTTP-Server, API, QR-/Shortlinks
├── data.js                     # eingebaute Startdatenbank mit Phasen und Sorten
├── data-path.json              # Pfad zum externen Datenordner
├── assets/plant-icons/         # lokale Pflanzenbilder fuer Karten und Details
└── package.json                # Startskripte und optionale QR-Terminal-Abhaengigkeit
```

Die wichtigsten Laufzeitdaten liegen nicht im Projektordner, sondern im externen Datenordner:

```text
plant-monitor-data/
├── state.json                  # Pflanzen, Ereignisse, Phasen, ausgeblendete Pflanzen
├── photos.json                 # komprimierte Foto-dataUrls
└── library.json                # eigene Sorten, Pflanzenauswahl-Filter, Shoplinks
```

## Architektur

`server.js` ist die einzige Server-Komponente. Er liefert `index.html`, `styles.css`, `app.js`, `data.js` und die Assets aus und stellt die API unter `/api/...` bereit. Die API speichert JSON-Dateien atomar über temporäre Dateien, damit ein Schreibvorgang die Daten möglichst nicht beschädigt.

`app.js` ist die zentrale Frontend-Datei. Sie lädt zuerst die öffentliche Server-URL, dann `library.json`, danach `state.json`. Anschließend werden Navigation, Filter, Dashboard, Sortendatenbank, History, Fotos und Dialoge aus dem aktuellen Browserzustand gerendert.

`data.js` ist die eingebaute Startdatenbank. Sie wird nicht als Speicherort für Nutzerdaten verwendet. Wenn `state.json` leer ist, kann die App daraus Startpflanzen übernehmen; Sortenprofile aus `data.js` werden mit eigenen Sorten aus `library.json` zusammengeführt.

Pflanzen-QR-Codes verwenden kurze Serverlinks wie `/p/1`. Der Server löst diese Shortcodes in `state.json` auf und leitet dann auf `/?plant=<id>` weiter, damit das Frontend die richtige Pflanze auswählt.

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

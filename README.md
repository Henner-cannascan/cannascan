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
├── index.html                  # Fallback-Weiterleitung zum Dashboard
├── pages/                      # HTML-Fragmente fuer einzelne Unterseiten
│   ├── login.html
│   ├── dashboard.html
│   ├── tasks.html
│   ├── plans.html
│   ├── database.html
│   ├── planner.html
│   ├── history.html
│   └── settings.html
├── partials/dialogs.html       # gemeinsam genutzte Dialoge
├── styles.css                  # Design Tokens, Layout, Karten, Dialoge, responsive Regeln
├── app.js                      # komplette Browserlogik, Rendering und API-Nutzung
├── auth.js                     # Login-/Registrierungslogik fuer /login
├── server.js                   # lokaler HTTP-Server, JSON-API, QR-/Shortlinks
├── data.js                     # eingebaute Startdatenbank mit Phasen und Sorten
├── data-path.json              # Konfiguration fuer den externen Datenordner
├── database/
│   ├── schema.sql              # PostgreSQL-Zielschema fuer Serverbetrieb
│   └── README.md               # Tabellenmodell und Migrationsreihenfolge
├── assets/plant-icons/         # lokale Pflanzenbilder
└── package.json                # Startskripte und optionale Terminal-QR-Abhaengigkeit
```

Die Nutzdaten liegen getrennt im externen Datenordner:

```text
plant-monitor-data/
├── state.json                  # Pflanzen, Ereignisse, Pflegeplaene, Shortcodes
├── photos.json                 # komprimierte Fotos und Thumbnails
├── library.json                # eigene Sorten, Pflanzenauswahl-Filter, Shoplinks
└── auth.json                   # Benutzer, Passwort-Hashes und Sessions
```

## Architektur

`server.js` ist die einzige Server-Komponente. Er erkennt die LAN-/Hotspot-Adresse, rendert die App-Unterseiten aus `pages/*.html` und `partials/dialogs.html` und stellt die API unter `/api/...` bereit. JSON wird ueber temporaere Dateien geschrieben und danach ersetzt, damit die Daten moeglichst nicht halb gespeichert werden.

`app.js` ist die zentrale Frontend-Datei. Sie erkennt die aktive Unterseite ueber `body data-view`, laedt zuerst die oeffentliche Server-URL, danach Sorten-Erweiterungen aus `library.json`, den Pflanzenstand aus `state.json` und Fotos aus `photos.json`. Aus diesem Zustand rendert sie die jeweils aktive Unterseite.

Die App hat echte Unterseiten:

```text
/login      # Landingpage zum Anmelden und Konto erstellen
/dashboard  # aktive Pflanzen und Detailansicht
/tasks      # offene Aufgaben
/plans      # Pflegeplan-Vorlagen
/database   # Sortendatenbank
/planner    # Lebenszyklus-Referenz
/history    # abgeschlossene und ausgeblendete Pflanzen
/settings   # sichtbare Pflanzenfamilien systemweit steuern
```

`/` und `/index.html` zeigen nach dem Login auf das Dashboard. Kurzlinks wie `/p/<code>` leiten nach erfolgreicher Anmeldung ebenfalls auf `/dashboard?plant=<id>` weiter.

`data.js` ist nur die eingebaute Startdatenbank. Laufende Pflanzen, Fotos, Pflegeplaene oder eigene Sorten werden dort nicht gespeichert.

## Login und Benutzerzuordnung

`/login` ist die Landingpage fuer Anmeldung und Registrierung. Der Login laeuft ueber den Benutzernamen; bei der Registrierung muss trotzdem eine E-Mail-Adresse hinterlegt werden. E-Mails werden aktuell nur gespeichert und noch nicht versendet.

Der Server speichert Konten und Sessions in `auth.json`:

- Passwoerter werden nicht im Klartext gespeichert, sondern mit `scrypt` und eindeutigem Salt gehasht.
- Das Session-Token liegt nur als Hash in `auth.json`. Im Browser liegt es als `HttpOnly`-Cookie `pm_session`.
- Ohne `Gerät merken` laeuft die Session nach 12 Stunden ab. Mit `Gerät merken` bleibt sie 60 Tage gueltig.
- Beim ersten angelegten Konto uebernimmt dieser Benutzer vorhandene alte Pflanzen, Pflegeplaene und Fotos.
- Danach werden Pflanzen, Pflegeplaene, Orte und Fotos beim Laden und Speichern nach `ownerUserId` getrennt.

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

## Orte und Standortwechsel

Orte werden in `state.json` unter `locations` gespeichert. Vorhandene Standorte aus Pflanzen und Ereignissen werden beim Laden automatisch in diese Liste uebernommen.

Eine Pflanze kann ihren Standort ueber Ereignisse wechseln:

- Beim Ereignis `Umtopfen` kann der Haken `Beim Umtopfen Standort wechseln` aktiviert werden. Der Haken macht nur das Zielfeld aktiv.
- Das Browse-Dropdown oeffnet erst beim Klick/Fokus in das Zielfeld oder ueber den Pfeil.
- Beim Klick in das Zielort-Feld oder auf den Pfeil erscheint die Liste bekannter Orte; beim Tippen wird sie gefiltert.
- Wenn der eingegebene Zielort keinem vorhandenen Ort entspricht, wird er beim Speichern automatisch angelegt.
- Das eigenstaendige Ereignis `Standortwechsel` macht denselben Wechsel ohne Umtopf-Eintrag.
- Nach dem Speichern berechnet die App den aktuellen Pflanzenstandort aus dem neuesten Standortereignis.

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
- über `Pflanzenauswahl` festlegen, welche Sorten innerhalb der aktiven Familien im Dialog `Pflanze anlegen` erscheinen

Die eigenen Sorten und die Auswahlfilter werden in `plant-monitor-data/library.json` gespeichert.

Die eingebaute Cannabis-Startdatenbank enthält eine erweiterte Herstellerliste. Herstellerkataloge ändern sich laufend; die Liste ist deshalb als Startdatenbank gedacht und kann über eigene Sorten ergänzt werden.

## Einstellungen und Pflanzenfamilien

Im Tab `Einstellungen` legst du fest, welche Pflanzenfamilien im System aktiv sind. Deaktivierte Familien bleiben in den JSON-Dateien gespeichert, werden aber in Dashboard, Aufgaben, Sortendatenbank, History, Auswahlfeldern und Dialogen ausgeblendet.

Die Auswahl wird in `plant-monitor-data/library.json` unter `addPlantFilters.enabledCategories` gespeichert. Mindestens eine Familie muss aktiv bleiben, damit das System immer eine sichtbare Arbeitsbasis hat.

## Server-Datenbank-Zielschema

Für den späteren Mehrnutzer-Serverbetrieb liegt unter `database/schema.sql` ein PostgreSQL-Schema. Es ersetzt die lokalen JSON-Dateien noch nicht, beschreibt aber das Zielmodell:

- numerisch hochlaufende `bigint identity` IDs in allen Tabellen
- Nutzerkonten, Sessions und gespeicherte Geräte
- Workspaces für gemeinsam genutzte Pflanzenbestände
- Sorten, Familien, Pflanzen, Ereignisse, Orte, Pflegepläne und Fotos als relationale Tabellen
- Foto-Metadaten in der Datenbank, Bilddateien im Server-/Object-Storage
- Migrationstabellen für die bestehenden JSON-IDs

Details und die empfohlene Migrationsreihenfolge stehen in `database/README.md`.

Lokal kannst du PostgreSQL und pgAdmin bereits per Docker starten:

```bash
cp .env.example .env
docker compose up -d
```

Danach:

```text
PostgreSQL: localhost:5432
pgAdmin:    http://localhost:5050
```

Die SQL-Migration wird beim ersten Start automatisch aus `database/schema.sql` geladen. Der spaetere Bildspeicher ist als lokaler Ordner `server-uploads/` vorgesehen und wird nicht ins Git-Repo aufgenommen.

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

# Datenbankschema

`schema.sql` beschreibt die Ziel-Datenbank fuer die Server-Version von Plant Monitor. Es ist fuer PostgreSQL 15+ geschrieben und ersetzt spaeter die JSON-Dateien `state.json`, `library.json` und `photos.json` als Hauptspeicher.

## Grundprinzip

- Jede Tabelle hat eine numerische `bigint generated always as identity` ID.
- Mehrere Nutzer koennen ueber `workspaces` und `workspace_members` auf denselben Pflanzenbestand zugreifen.
- Alte String-IDs aus den JSON-Dateien werden in `legacy_key` bzw. `legacy_id_map` behalten, damit die Migration nachvollziehbar bleibt.
- Fotos liegen nicht mehr als Base64 in JSON. Die Tabelle `photos` speichert nur Metadaten und Datei-/Object-Keys.
- QR-/NFC-Links sollten nicht die numerische ID verwenden. Dafuer gibt es in `plants.public_token` einen nicht erratbaren Token.

## Wichtige Tabellen

`users`, `login_sessions`, `trusted_devices`, `email_verification_tokens` und `password_reset_tokens` bilden Registrierung, Login, Sessions und "Geraet merken" ab. Token werden nur gehasht gespeichert; der echte Token gehoert in ein `HttpOnly`, `Secure`, `SameSite` Cookie.

`workspaces` ist der Pflanzenbestand. Ein Nutzer kann mehrere Workspaces haben, und ein Workspace kann mehrere Mitglieder haben.

`plant_families` enthaelt die Systemfamilien Cannabis, Tomate, Paprika und Chili. `workspace_enabled_families` speichert, welche Familien in einem Workspace sichtbar sind.

`varieties`, `variety_traits`, `variety_cannabis_forms`, `variety_shop_links` und `workspace_hidden_varieties` ersetzen die Sortendatenbank und die Pflanzenauswahl aus `library.json`.

`plants`, `plant_events`, `locations`, `care_plan_templates` und `plant_care_plan_history` ersetzen die verschachtelte Pflanzenstruktur aus `state.json`.

`photos` ersetzt `photos.json`. `file_key` zeigt auf die Originaldatei, `thumb_key` auf das Thumbnail.

`legacy_import_runs` und `legacy_id_map` helfen bei der einmaligen Migration der bestehenden JSON-Daten.

## Migrationsreihenfolge

1. Nutzer anlegen.
2. Workspace anlegen und Nutzer als `owner` in `workspace_members` eintragen.
3. Aktive Familien aus `library.json` in `workspace_enabled_families` schreiben.
4. Eingebaute und eigene Sorten nach `varieties` migrieren.
5. Traits, Cannabis-Formen und Shoplinks migrieren.
6. Orte aus `state.json` nach `locations` migrieren.
7. Pflegeplan-Vorlagen nach `care_plan_templates` migrieren.
8. Pflanzen nach `plants` migrieren.
9. Ereignisse nach `plant_events` migrieren.
10. Pflegeplan-Historie nach `plant_care_plan_history` migrieren.
11. Fotos aus Base64-Dateien extrahieren, als Dateien speichern und Metadaten nach `photos` schreiben.
12. Alle alten String-IDs in `legacy_id_map` dokumentieren.

## Naechster Umsetzungsschritt

Als naechstes braucht die App eine Backend-Schicht, die dieses Schema nutzt:

- Registrierung und Login
- Session-Cookies und gespeicherte Geraete
- API-Routen mit Workspace-Rechtepruefung
- Upload-Endpunkte fuer Fotos
- Migrationsskript von JSON nach PostgreSQL

## Lokal mit Docker starten

Im Projektordner:

```bash
cp .env.example .env
docker compose up -d
```

Beim ersten Start legt PostgreSQL die Datenbank an und fuehrt `database/schema.sql` automatisch aus. Die Datenbank bleibt danach im Docker-Volume `postgres-data` erhalten.

Pruefen:

```bash
docker compose ps
docker compose exec postgres psql -U plant_monitor -d plant_monitor -c "\\dt"
```

pgAdmin ist danach erreichbar unter:

```text
http://localhost:5050
```

Standard-Login aus `.env.example`:

```text
admin@plant-monitor.local
plant_monitor_admin
```

In pgAdmin einen neuen Server anlegen:

```text
Name: Plant Monitor Local
Host: postgres
Port: 5432
Maintenance database: plant_monitor
Username: plant_monitor
Password: plant_monitor_dev_password
```

Schema neu initialisieren:

```bash
docker compose down -v
docker compose up -d
```

`down -v` loescht das lokale Datenbank-Volume. Nur fuer Entwicklungsdaten verwenden.

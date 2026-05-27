# HotDoc — Komplette Programmbeschreibung

**Zweck dieses Dokuments**
Diese Datei ist eine Architektur- und Funktionsspezifikation. Sie beschreibt das System so vollständig, dass ein anderes Entwicklerteam HotDoc ohne den bestehenden Quellcode reimplementieren könnte. Sie enthält keine Code-Snippets — nur Verhalten, Verträge, Datenflüsse, Konfliktstrategien und Ausfallsicherheiten.

**Stand:** 2026-05-27
**Auftraggeber:** Freiwillige Feuerwehr Eberstalzell, Solarstraße 1, 4653 Eberstalzell (Oberösterreich)
**Bezug:** ergänzt und konkretisiert `docs/superpowers/specs/2026-05-19-einsatzbericht-pwa-design.md`.

---

## Inhaltsverzeichnis

1. Domäne & fachlicher Kontext
2. Systemüberblick & Topologie
3. Tech-Stack
4. Datenmodell
5. Doc-ID-Konventionen & CouchDB-Konventionen
6. Authentifizierung, Autorisierung, Rollen
7. PWA — Tablet-Anwendung
8. Backoffice — Florianstation/Verwaltung im Browser
9. Backend-API — Endpoints, Worker, Services
10. Externe Schnittstellen (BlaulichtSMS, syBOS)
11. Workflows / Use Cases im Detail
12. Berichts­num­me­rie­rung & Konfliktauflösung
13. Chronik-Cross-Sync (Funkkommando-Logbuch)
14. Online/Offline-Sync & Replication
15. PDF-Generierung & Spickzettel
16. Statistik & Reporting
17. Audit-Trail & Compliance
18. Ausfallsicherheit & Resilienz
19. Security
20. Konfiguration & Stammdaten
21. Branding & Theming
22. Build, Deploy, Betrieb
23. Test-Strategie
24. Roadmap & bewusst nicht implementiert

---

## 1. Domäne & fachlicher Kontext

### 1.1 Wer benutzt HotDoc

Eine kleine bis mittlere österreichische Freiwillige Feuerwehr (FF) mit:

- 4 Einsatzfahrzeugen (KDO, TLF-A 4000, LFA-B, MTF) + einer Einsatzzentrale am FF-Haus.
- ~45 aktiven Mitgliedern.
- Bestehender Software-Infrastruktur: **syBOS** (Stammdaten-Cloud-System für Personal, Material, Atemschutz­prüfungen) und **BlaulichtSMS** (Alarmierungs-Dienst).
- Papier-basiertem Einsatzberichts-Prozess als Vorlage. Das offizielle Papierformular „Einsatzbericht 2025 NEU" ist das Layout-Vorbild für das PDF.

### 1.2 Was HotDoc ersetzt

| Schritt heute (Papier) | HotDoc digital |
|---|---|
| Alarmierung über Pager/BlaulichtSMS | unverändert + automatische Übernahme des Einsatzes |
| Fahrzeug-Kommandant trägt am Papier-Block ein | Tablet pro Fahrzeug, Erfassung touch-tauglich |
| Einsatzleiter sammelt die Blöcke und schreibt den Hauptbericht | Florianstation aggregiert live |
| Bearbeiter überträgt alles in syBOS | PDF + syBOS-Spickzettel (Feld-Reihenfolge wie syBOS) |
| Ablage in Aktenordner | digitales Archiv im Backoffice |

### 1.3 Fachliche Begriffe (Glossar)

- **Einsatz**: ein konkretes Ereignis (z. B. „Wohnungsbrand 14:23"), egal ob es durch BlaulichtSMS, manuell, als Lotsendienst oder als Übung entstanden ist.
- **Fahrzeugbericht** (Kurzbericht): die Erfassung _eines_ Fahrzeugs zu _einem_ Einsatz. Pro eingesetztem Fahrzeug ein Doc.
- **Hauptbericht**: die Aggregation aller Fahrzeugberichte plus die Einsatzleiter-Daten (Meldung, Beteiligte Stellen, Zeitmarken).
- **Funkrufname**: gesprochener Name im Funk („Florian Eberstalzell", „Pumpe Eberstalzell", …). Erscheint in Chronik und PDF.
- **AS** (Atemschutz): Mitglieder mit gültiger AS-Prüfung dürfen unter Atemschutz arbeiten. Pro Trupp wird die Einsatzdauer in Minuten erfasst.
- **B-/T-Stufe**: Stichwort-Stufen für Brand (B-1/B-2/B-3) bzw. Technisch (T-1/T-2/T-3). „BMA" = Brandmeldealarm.
- **Schreibschutz**: Einsatz wurde abgeschlossen, sämtliche Schreib-Operationen liefern HTTP 423 (Locked).
- **Reaktivierung**: nur ein Funktionär darf einen abgeschlossenen Einsatz mit Pflichtbegründung wieder öffnen.

### 1.4 Hardware-Annahmen

- 5 Android-Tablets (eins pro Fahrzeug + 1 fix montiert in der Einsatzzentrale). Diese fahren ausschließlich die PWA in einem Browser/Chrome im Vollbild oder als installierte PWA.
- 1 stationärer PC in der Einsatzzentrale für das Backoffice/Verwaltung.
- Optional: ein Privathandy des Diensthabenden als Notfall-Empfänger der Florianstation-Session (per QR-Handoff).

---

## 2. Systemüberblick & Topologie

### 2.1 Logische Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│  Externe Welt                                               │
│   • BlaulichtSMS Dashboard-API (read-only)                  │
│   • syBOS Read-API (read-only)                              │
│   • OpenStreetMap-Tiles                                     │
└──────────┬──────────────────────────────────────────────────┘
           │ Polling/HTTP
           ▼
┌─────────────────────────────────────────────────────────────┐
│  API-Server (hotdoc-api, Node 20)                           │
│   • REST-Endpoints (/api/...)                               │
│   • Worker-Prozesse: BlaulichtSMS-Poller, syBOS-Cron,       │
│     Audio-Retention                                         │
│   • PDF-Renderer (Puppeteer + Chromium)                     │
│   • Audit-Service                                           │
└──────────┬──────────────────────────────────────────────────┘
           │ Nano-Driver / HTTP
           ▼
┌─────────────────────────────────────────────────────────────┐
│  CouchDB (hotdoc-db, Persistent-Volume)                     │
│   • Master-Datenbank "hotdoc"                               │
│   • Speichert: Einsätze, Fahrzeugberichte, Personal,        │
│     Material, Audits, Tablet-Konfig, Stammdaten, Handoffs   │
└──────────┬──────────────────────────────────────────────────┘
           │ HTTP-Replication (bidirektional)
           ▼
┌─────────────────────────────────────────────────────────────┐
│  PWA (hotdoc-eberstalzell)            Backoffice            │
│   • Service Worker (Offline)          (hotdoc-backoffice)   │
│   • PouchDB lokal pro Tablet          • Verwaltung          │
│   • Leaflet-Karten                    • Statistik           │
│   • Fahrzeugbericht / Florian-UI      • Archiv              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Deployment-Topologie (Produktion)

Vier fly.io-Apps in derselben Region (Default `fra`):

| App | Was läuft | Persistente Daten |
|---|---|---|
| `hotdoc-eberstalzell` | statisch gebaute PWA + Caddy + Reverse-Proxy `/api/* → hotdoc-api.internal` | nein |
| `hotdoc-backoffice` | statisch gebaute Backoffice-SPA + Caddy + Reverse-Proxy `/api/* → hotdoc-api.internal` | nein |
| `hotdoc-api` | Node-Backend (Express) inkl. Worker | nein (DB-Daten extern) |
| `hotdoc-db` | CouchDB 3.4.2 | ja — Volume 5 GB |

**Begründung getrennter Apps:**
- PWA + Backoffice können sehr cache-aggressiv ausgeliefert werden (statische Assets), die API darf nicht gecacht werden.
- Die API darf neu deployt werden, ohne dass die statischen Assets neu gebaut werden müssen.
- CouchDB ist eine zustandsbehaftete, langlebige Persistenz-Schicht; jeder API-Restart darf sie nicht beeinflussen.

**Caddyfile-Proxy** in beiden Frontend-Apps:
- `GET /api/*` → wird intern via `*.internal` an `hotdoc-api` weitergeleitet. Ohne diesen Proxy würde der Browser CORS-Probleme bekommen. Außerdem akzeptiert die fly-PWA-Caddyfile alle HTTP-Methoden (POST/PUT/DELETE für API), nicht nur GET.
- alles andere → Static-File-Fallback auf `index.html` (SPA-Routing).

### 2.3 Source-Code-Layout (Monorepo)

```
apps/
  pwa/         React-PWA (Tablets + ggf. Privathandy nach QR-Handoff)
  backoffice/  React-SPA (PC im FF-Haus, Funktionärs-Verwaltung)
  api/         Node-/Express-Backend
packages/
  shared/      Zod-Schemas + abgeleitete TS-Typen + Konstanten
deploy/
  api/         Dockerfile.api + fly.toml
  pwa/         Dockerfile.pwa + Caddyfile + fly.toml
  backoffice/  dito
  couchdb/     CouchDB-Image + local.ini
docs/          Architektur-Dokumente
prototype/     Statisches HTML-Prototyp (UI-Referenz, nicht produktiv)
```

Paket-Manager: pnpm-Workspaces. Builds einzeln via `pnpm --filter <pkg> build`.

---

## 3. Tech-Stack

### 3.1 Sprachen & Frameworks

| Schicht | Wahl | Begründung |
|---|---|---|
| Frontend (PWA + Backoffice) | React 18 + Vite 6 + TypeScript strict | Komponenten-Modell, schneller HMR, kleine Bundles |
| Frontend-Komponenten | eigene Komponenten + lucide-react Icons + qrcode.react für Handoff | keine UI-Lib-Abhängigkeit (Tailwind/shadcn wurden bewusst ausgeklammert) |
| Karten | Leaflet 1.9.x + OpenStreetMap-Tiles | open source, offline-cachebar |
| Backend | Node 20 + Express 5 + TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | minimaler Footprint, gut testbar |
| Persistenz | CouchDB 3.4.x | gleichzeitig Server-DB und Replikations-Endpoint, perfekt fürs Offline-Modell |
| Lokale DB im Browser | PouchDB-browser | CouchDB-API-kompatibel, replication-fertig |
| Validierung | Zod | gemeinsame Source-of-Truth-Schemas in `packages/shared`, sowohl im Backend (Body-Parse) als auch im Frontend (Typen) |
| Auth | JOSE-Lib (`jose`) für JWT HS256 + bcryptjs für Passwort-Hashes | Standardbibliothek, kein eigener Krypto-Code |
| Logger | pino + pino-http | strukturiert (JSON), schnell, PII-Redact-fähig |
| PDF | puppeteer + system-Chromium aus Dockerfile | Pixel-genaues Layout via HTML+CSS@page |
| Scheduling | node-cron | leichter Cron-Syntax, kein extra Daemon |

### 3.2 Frontend-Konfigurations-Konventionen

- TypeScript-strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` als harte Linie. Patterns wie `{...(value !== undefined ? { key: value } : {})}` werden konsistent verwendet, weil `{ key: undefined }` mit `exactOptionalPropertyTypes` kein `optional` mehr ist.
- ESLint mit `react-hooks/exhaustive-deps`. Bewusste Ausnahmen sind kommentiert.
- Keine globalen CSS-Frameworks. Tokens (`--red`, `--ok`, `--warn`, `--surface`, …) in `theme/tokens.css`. Light + Dark-Mode getrennt definiert.

### 3.3 Backend-Konfigurations-Konventionen

- Alle ENV-Variablen werden beim Server-Start gegen ein Zod-Schema validiert. Fehlt eine Pflichtvariable → Hard-Fail beim Boot, keine Silent-Defaults.
- Feature-Toggles über Helfer wie `hasSyBos()`, `hasBlaulichtSMS()`, `hasWasserkarte()`: Worker werden nur gestartet, wenn die nötigen Credentials da sind. Fehlende Credentials sind kein Fehler — die App startet trotzdem, der jeweilige Worker schreibt nur eine Warnung.

---

## 4. Datenmodell

Alle Schemas sind in `packages/shared/src/schemas/*.schema.ts` als Zod definiert. Die abgeleiteten TypeScript-Typen sind die einzigen Domain-Typen, die App- und Backoffice gemeinsam nutzen.

### 4.1 Domänen-Entitäten (Übersicht)

| Entität | Beschreibung | Lebenszyklus |
|---|---|---|
| `Einsatz` | Ereignis = ein realer Vorfall | Anlage → aktiv → abgeschlossen (→ ggf. reaktiviert) |
| `Fahrzeugbericht` | Erfassung pro Fahrzeug zu einem Einsatz | in_arbeit → abgeschlossen |
| `ChronikEintrag` | Funkkommando-Logbuch-Eintrag (Diktat, Auftrag, BlaulichtSMS) | append-only |
| `FahrzeugPosition` | GPS-Live-Position eines Fahrzeugs | im Einsatz: Stream, danach: Audit |
| `Person` | Mitglied der FF (aus syBOS gesynct + manuelle Ergänzungen) | aktiv/inaktiv |
| `Material` | Gerät / Ausrüstung (aus syBOS gesynct) | dauerhaft |
| `Hydrant` | Löschwasser-Quelle (war für wasserkarte.info vorgesehen, V1.0 ausgeklammert) | passiv |
| `FahrzeugConfig` (PouchDB-lokal) | Welches Fahrzeug ist dieses Tablet? | einmalig beim Setup |
| `TabletAuth` | MSISDN-Variante der Tablet-Auth | passiv |
| `Handoff` | Temporärer QR-Code-Übergabe-Vorgang | 5 min Lebensdauer |
| `Benutzer` | Backoffice-Login-Account | manuell verwaltet |
| `AuditEvent` | Logbuch sicherheits-relevanter Aktionen | min. 1 Jahr Aufbewahrung |
| `ConfigDoc` | Stammdaten (Geräte, Stichworte, Tablet-PINs, …) | manuell editiert |

### 4.2 Entität `Einsatz` — Detailfelder

Pflichtfelder + Validierungsregeln (Zod-Schema):

- `_id`: regex `^einsatz:.+$`. Konvention: BlaulichtSMS-Einsätze nutzen die Alarm-ID, manuelle Einsätze nutzen UUIDs mit Typ-Präfix (`einsatz:manuell-`, `einsatz:lotsendienst-`, `einsatz:uebung-`).
- `type`: Literal `"einsatz"` (für Filter ohne Index).
- `einsatzTyp`: `"alarm" | "manuell" | "lotsendienst" | "uebung"`, Default `"alarm"`.
- `status`: `"aktiv" | "abgeschlossen"`. Steuert das gesamte UI-Verhalten.
- `schreibschutz`: bool, wird beim Abschluss true gesetzt, beim Reaktivieren wieder false.
- `reaktivierungen`: Array von `{ vonBenutzerId, am, grund (min 10 Zeichen), vonStatus }`. Audit-Trail nach FR-14.
- `einsatzort`, `koordinaten` (lat/lng-Pair, optional), `alarmierungZeit` (ISO 8601 datetime).
- `alarmId`, `alarmierungAudio` (URL), `alarmierungAuthor`, `alarmierungText` — nur bei einsatzTyp=alarm gefüllt.
- `einsatzart`: entweder ein Wert aus dem Enum `EINSATZARTEN` (siehe 4.4) ODER ein freier String — weil BlaulichtSMS Stichwörter liefert, die wir nicht alle vorhersehen können.
- `einsatzartFreitext`: für „Andere Einsätze" am Papierformular.
- `pflichtbereich`, `einsatzzoneEzell`, `ueberOertlicheHilfe`: bool, vom Einsatzleiter gesetzt.
- `alarmiertDurch`: `"BWST" | "LWZ"` (Bezirks- oder Landeswarnstelle).
- `einsatzauftragVia`: `"WAS" | "Funk" | "Telefon" | "Bote" | "Behoerde"`.
- `anrufer`, `anruferTel`: optional.
- `zeitmarken`: `{ lageUnterKontrolle?, brandAus?, alst2?, alst3? }` — alle als ISO 8601-Strings.
- `beteiligteStellen`: Array aus dem Enum `BETEILIGTE_STELLEN` (12 Werte: Polizei, RK, BFKDT, AFKDT, Gem., BH, GAS, Ener. AG, RAG, Arzt, Bestatt., STM).
- `sonstigeAnwesendeFF`: `{ aktive: SONSTIGE_FF[], sonstigeFreitext? }`. Enum: OEL, Kran, TMB, SRF, ASF, DLK, GSF, HEU.
- `mannschaft.bereitschaft`, `mannschaft.sonstige`: int ≥ 0. Die _eingesetzte_ Mannschaftsstärke wird aus den Fahrzeugberichten _aggregiert_, nicht hier gespeichert.
- `verrechnung`: `{ verrechenbar: bool, rechnungsadresse? }`.
- `oelbindemittel`: `{ verwendet: bool, gesamtSaecke: int }`. Wird aus den Fahrzeugberichten aufsummiert.
- `meldungEinsatzleitung`: Freitext (großes Feld am Papier).
- `einsatzleiterPersonId`, `bearbeiterPersonId`: int (Referenz auf `Person.syBosId`).
- `fahrzeugPositionen`: Array (Live-Stream im Einsatz, Audit nach Abschluss).
- `chronik`: Array von Chronik-Einträgen (append-only).
- Lotsendienst-spezifisch: `lotsendienstAuftraggeber`, `lotsendienstRoute`.
- Übungs-spezifisch: `uebungThema`, `uebungsleiter`, `uebungsTyp` (Enum mit 8 Werten).
- Audit: `erstelltAm`, `geaendertAm`.

### 4.3 Entität `Fahrzeugbericht` — Detailfelder

- `_id`: regex `^fzgber:.+:.+$`. Convention: `fzgber:<einsatz-id-ohne-präfix>:<fahrzeug-id>` — z. B. `fzgber:2026-001-BSP:lfa-b`. Das macht die Doc-ID **deterministisch**: ein und dasselbe Fahrzeug kann für ein und denselben Einsatz nur einen Bericht haben (siehe Abschnitt 12 zur Konfliktauflösung).
- `einsatzId`, `fahrzeugId`: redundant für Indexe.
- `zeit`: `{ von?, bis? }` — ISO-datetime. Abrückzeit und Rückkehrzeit.
- `km`: `{ abfahrt?, gefahrenKm, rueckkehr? }`. `gefahrenKm` wird aus dem GPS-Track via Haversine + Glättung berechnet.
- `gpsTrack`: Array `{ lat, lng, t, accuracy? }`. Wird nicht im PDF gezeigt, aber im Audit aufgehoben.
- `fahrerPersonId`, `fahrzeugKdtPersonId`: int.
- `mannschaft`: Array von `MannschaftEintrag` mit Pflichtfeldern `slot (1..7), personId, atemschutzAktiv`. Wenn `atemschutzAktiv=true`: zusätzliches Pflichtfeld `atemschutzDauerMin` (AS_MIN..AS_MAX).
- `anhaengerMitgenommen`: nur MTF, Array aus `"HR-Anhaenger" | "PKW-Anhaenger"`.
- `geraete`: Array `{ materialId, anzahl?, bemerkung? }`.
- `oelbindemittelSaecke`: int 0..99. Wird im Hauptbericht aggregiert (verrechenbar).
- `taetigkeitsbericht`: Freitext.
- `fotos`: Array `{ blobId, beschreibung?, aufgenommenAm }`.
- `status`: `"in_arbeit" | "abgeschlossen"`.

### 4.4 Enumeration-Konstanten

In `packages/shared/src/constants/`:

- `EINSATZARTEN`: 28 Stichwörter aus dem Papierformular plus „Lotsendienst" und „Brandsicherheitsdienst".
- `EINSATZART_KATEGORIE`: Mapping jedes Stichworts auf `"brand" | "technisch"`. Steuert das Berichts-Nummern-Präfix (B/T) und das PDF-Template.
- `STICHWORT_STUFEN`: B-1/B-2/B-3/T-1/T-2/T-3/BMA — als Map auf Klartext für Tooltips.
- `BETEILIGTE_STELLEN`, `SONSTIGE_FF`: wie Papier.
- `FAHRZEUGE`: harte Konstante (5 Einträge: kdo, tlf-a-4000, lfa-b, mtf, zentrale) mit Funkrufname, Besatzungs-Typ („1+7"), Mannschaftsplätze, optional Anhänger.
- `AS_MIN=10`, `AS_MAX=120`: Atemschutz-Dauer-Grenzen.

### 4.5 Chronik-Einträge (Hybrid-Schema)

Zwei historische Shapes existieren parallel und werden beide akzeptiert (Schema mit `.passthrough()`):

| Feld | Shape A (Cross-Sync-Broadcast) | Shape B (klassisches Tablet-Diktat) |
|---|---|---|
| `id` | UUID | UUID |
| `zeitstempel` | ISO | ISO |
| `funkrufname` | „Pumpe Eberstalzell" | — |
| `fahrzeugId` | „lfa-b" | „lfa-b" |
| `source` | `"blaulichtsms"|"fahrzeug"|"manuell"|"atemschutz"` | — |
| `text` | menschenlesbarer Eintrag | — |
| `pending` | bool, Transkription noch nicht durch | — |
| `typ` | — | `"diktat"|"manuell"|"auto-blaulichtsms"` |
| `audioBlobId` | — | PouchDB-Attachment-Ref |
| `transkript` | — | Whisper-Output |
| `transkriptStatus` | optional | `"pending"|"verfuegbar"|"manuell-korrigiert"|"fehlgeschlagen"` |
| `tags` | — | optional |

**Begründung Hybrid:** das Chronik-Cross-Sync (Shape A) wurde später eingeführt; die alten Diktat-Einträge aus Phase 5 müssen weiterhin lesbar bleiben.

---

## 5. Doc-ID-Konventionen & CouchDB-Konventionen

Es gibt **eine** Master-DB namens `hotdoc`. Alle Doc-Typen unterscheiden sich rein über das ID-Präfix und ein `type`-Feld. Begründung: nur eine Replikations-Pipeline, kein Cross-DB-Sync.

### 5.1 ID-Präfix-Tabelle

| Präfix | Doc-Typ | Anzahl-Größenordnung |
|---|---|---|
| `einsatz:` | Einsatz | unbegrenzt |
| `fzgber:` | Fahrzeugbericht | ≈ 4× Einsatz |
| `person:` | Mitglied | 30–60 |
| `material:` | Material | 200–500 |
| `tablet:` | TabletAuth | 5–10 |
| `handoff:` | Notfall-Übergabe | flüchtig |
| `user:` | Backoffice-Benutzer | 1–10 |
| `audit:` | Audit-Event | wächst |
| `config:` | Stammdaten-Konfig | fix ~5 |
| `fahrzeug:self` | nur in **PouchDB** lokal — Tablet-Konfig | 1 |

### 5.2 Sortier-Tricks

- **Audit-Events** verwenden als ID `audit:<reverseTimestamp>:<uuid8>`. `reverseTimestamp` = `MAX_SAFE_INTEGER - Date.now()` (16-stellig, zero-padded). Damit liefert ein normaler ascending `allDocs(startkey=audit:, endkey=audit:￰)` automatisch DESC nach Zeit — ohne CouchDB-View.

- **Fahrzeugberichte** verwenden `fzgber:<einsatz>:<fahrzeug>`. Damit liefert ein `allDocs` mit Range-Filter über einen Einsatz `fzgber:<einsatz>:` bis `fzgber:<einsatz>:￰` direkt die Fahrzeugberichte _dieses_ Einsatzes. Das Zeichen `￰` (U+FFF0) wird als hoher Endkey verwendet und liegt nach allen druckbaren ASCII-Zeichen.

- **Einsätze** werden vom Backend nicht sortiert; das Filter im Handler sortiert nach `alarmierungZeit` DESC.

### 5.3 Konflikte (CouchDB-Standard-MVCC)

Jedes Doc trägt ein `_rev`. Update-Operationen müssen das aktuelle `_rev` mitgeben, sonst gibt CouchDB 409 zurück. Die Anwendung behandelt 409 in zwei Mustern:

1. **Lese-vor-Schreib** (alle Updates): Handler lädt das Doc, mergt die Felder, schreibt. Bei 409 von CouchDB lädt der Client neu und versucht es noch einmal. Konkret im Backend macht das der `upsertBulk`-Helper im syBOS-Worker: erst `fetchRevs`, dann mit den aktuellen `_rev`'s schreiben.
2. **Idempotente Append-Operationen** (Chronik-Einträge): der Handler dedupliziert über `entry.id` und gibt 200 zurück, wenn der Eintrag schon vorhanden ist (siehe 13.).

Für die Berichts­num­me­rie­rung mit ihrem _eigenen_ Konfliktproblem (zwei Tablets vergeben offline dieselbe Nummer) gibt es eine eigene Strategie in Abschnitt 12.

### 5.4 Indizes / Views

V1.0 verzichtet auf eigene Map-Reduce-Views. Stattdessen wird konsequent das Doc-ID-Präfix als Index genutzt. Mango-Selektoren werden für Auth-Lookups verwendet (`type=benutzer`, `username=…`); fehlt der Mango-Index, fällt der Code auf ein `allDocs` + Client-side-Filter zurück.

---

## 6. Authentifizierung, Autorisierung, Rollen

### 6.1 Rollenmodell

Vier Rollen mit Rang:

| Rolle | Rang | Was darf sie |
|---|---|---|
| `mannschaft` | 1 | Nur den eigenen Fahrzeugbericht. Chronik schreiben. |
| `einsatzleiter` | 2 | Hauptbericht editieren, Einsatz manuell anlegen, Einsatz abschließen. |
| `funktionaer` | 3 | Stammdaten verwalten, Reaktivierung (mit Pflicht-Grund), PINs ändern. |
| `admin` | 4 | Reserviert für künftige Benutzerverwaltung. |

Die Funktion `satisfiesRole(actual, required)` vergleicht Ranks numerisch — eine höhere Rolle erfüllt jede niedrigere Anforderung automatisch.

### 6.2 Drei Login-Wege

| Weg | Wer nutzt es | Mechanismus |
|---|---|---|
| Backoffice-Login | Funktionär / Bearbeiter am PC | Username + Passwort (bcrypt) |
| Tablet-PIN-Login | jedes Fahrzeug-Tablet inkl. Florianstation | 4-6-stellige PIN pro fahrzeugId |
| MSISDN-Tablet-Register | Legacy-Variante (Telefonnummer + Fahrzeug) | passiv im Code, nicht produktiv |

#### PIN-Login-Verhalten (relevant für Berechtigung):

- Es gibt **eine PIN pro Fahrzeug**, gespeichert im Doc `config:tablet-pins` unter `data.pins.<fahrzeugId>`. Default beim Bootstrap: `1234`. Funktionäre ändern sie in der Verwaltung.
- Rate-Limit für falsche PIN: 5 Versuche pro IP in 15 min → 30 min Sperre (in-memory).
- Rollen-Mapping pro Fahrzeug:
  - `fahrzeugId = "zentrale"` → Token mit Rolle **`einsatzleiter`**. (Begründung: das Florian-Gerät steht im FF-Haus und wird vom diensthabenden Einsatzleiter bedient.)
  - alle anderen Fahrzeuge → Token mit Rolle **`mannschaft`**.

#### Backoffice-Login:

- Rate-Limit identisch (5/15min → 30min).
- Failed-Login wird als `login-failed`-AuditEvent geschrieben (mit Grund: `unknown_or_inactive` oder `wrong_password`).
- Erfolgreicher Login schreibt ein `login-success`-AuditEvent + aktualisiert das User-Doc um `letzterLogin`.

### 6.3 Token / JWT

- Algorithmus HS256, signiert mit `JWT_SECRET` (Pflicht-Secret, min. 32 Zeichen, in fly secrets).
- Default-TTL: 8 Stunden (konfigurierbar via `SESSION_TTL_SEC`).
- Payload-Claims: `sub` (User- oder Tablet-ID), `username`, `rolle`, optional `fahrzeugId`, optional `autoReleaseAt`, optional `viaHandoff`.
- Zwei zusätzliche Custom-Claims für Handoff:
  - `autoReleaseAt`: ISO-Datetime. Wenn vorhanden und in der Vergangenheit, weist die `verifySession`-Funktion den Token zurück — auch wenn die Standard-`exp` noch gültig wäre. Das macht den „24h-Auto-Logout am Handy" möglich, ohne Server-side-Cron.
  - `viaHandoff`: bool. UI zeigt einen Banner „Sitzung kommt von Tablet XY". Wird auch zur Unterscheidung Forward- vs. Reverse-Handoff genutzt.

### 6.4 Auth-Middleware

`requireAuth(minRole?)` wird auf alle geschützten Routen angewendet:

1. Extrahiert `Authorization: Bearer <token>`.
2. Verifiziert die Signatur + Standard-`exp` + Custom-`autoReleaseAt`.
3. Bei fehlendem Token: 401 `missing_authorization`.
4. Bei ungültigem Token (Signatur, abgelaufen, autoReleaseAt überschritten): 401 `invalid_token`.
5. Bei zu niedriger Rolle: 403 `insufficient_role` (+ Hinweis `required`).
6. Bei Erfolg: `req.session` wird gesetzt und an den Handler weitergegeben.

Im PWA-Client wird ein 401 auf nicht-Auth-Routen als „Token verloren" interpretiert: lokales Token und Handoff-Info werden gelöscht, anschließend ein Reload zum Setup-Screen. Auth-Routen sind von dieser Logik ausgenommen, sonst gäbe es Login-Schleifen.

### 6.5 QR-Notfall-Handoff (Tablet ↔ Handy)

Bei leerem Akku oder defektem Tablet muss die Session vom Florian-PC auf das Diensthandy des Einsatzleiters wandern.

Forward-Handoff (Tablet → Handy):
1. Tablet ruft `POST /api/auth/handoff/create`. Server erzeugt 8-Zeichen-Short-Code aus dem Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne 0/O, 1/I — verwechslungssicher).
2. Server speichert `handoff:<code>`-Doc mit allen Quell-Token-Infos (sub, username, rolle, fahrzeugId, einsatzId) und TTL 5 min.
3. Tablet rendert den QR-Code auf `https://hotdoc-eberstalzell.fly.dev/handoff/<code>`.
4. Handy scannt → öffnet die PWA → die liest den Code aus der URL und ruft `GET /api/auth/handoff/<code>`.
5. Server gibt einen neuen JWT zurück mit `viaHandoff=true` und `autoReleaseAt = jetzt + N Stunden` (N kommt aus Stammdaten, Default 24, konfigurierbar: 1/4/12/24/48/0 für „nie"). Das Doc wird `claimed=true`.
6. Das Tablet pollt `GET /api/auth/handoff/<code>/status` alle 5 s. Sobald `claimed=true`: Tablet löscht eigenen Token und zeigt Setup-Screen.

Reverse-Handoff (Handy → Tablet zurück):
- Identischer Flow, aber der Server erkennt anhand des Quell-Tokens (`viaHandoff=true`), dass die Sitzung _zurückgegeben_ wird. Das Zieltablet bekommt einen **normalen** Token (kein autoReleaseAt, kein viaHandoff).

Audit:
- Vier Event-Typen: `handoff-create`, `handoff-claim`, `handoff-reverse-create`, `handoff-reverse-claim`. Außerdem ein manueller `handoff-release`-Event, wenn der Empfänger die Sitzung explizit beendet.

Race-Condition-Schutz:
- Beim Claim wird das Doc auf `claimed=true` gesetzt. Wenn zwei Handys gleichzeitig denselben Code scannen, gewinnt das erste; das zweite bekommt 410 Gone.
- Codes sind single-use: zweiter Claim-Versuch → 410.
- Abgelaufene Codes → 410.

---

## 7. PWA — Tablet-Anwendung

### 7.1 Top-Level State-Machine

`App.tsx` kennt vier Zustände:

```
[loading] ──┬─→ [handoff-claim:<code>]   wenn URL = /handoff/<code>
            ├─→ [setup]                  wenn kein FahrzeugConfig in PouchDB
            ├─→ [setup]                  wenn Handoff-Token abgelaufen
            └─→ [ready:<fahrzeugId>]     sonst
```

Bootstrap-Ablauf:
1. URL prüfen — `/handoff/<8-zeichen>` hat Priorität über alles andere.
2. Lokale `handoffInfo` aus `localStorage` prüfen — falls vorhanden, vergleichen mit der `autoReleaseAt`-Claim im Token. Abgelaufen → Token + FahrzeugConfig-PouchDB-Doc löschen, Setup zeigen.
3. PouchDB seed: Demo-Daten nur einspielen, wenn die DB leer ist.
4. FahrzeugConfig (`fahrzeug:self`) aus PouchDB lesen. Vorhanden → `ready`, sonst Setup.

### 7.2 Setup-Page

- Bietet 5 große Buttons (Fahrzeuge). Auswahl → PIN-Eingabe (Bildschirm-Tastatur).
- POST `/api/auth/tablet/pin-register` mit `{ fahrzeugId, pin, deviceId }`. `deviceId` = `crypto.randomUUID()` im Browser, persistiert in `localStorage`.
- Bei Erfolg: Token in `localStorage` unter `hotdoc.tabletToken`. FahrzeugConfig in PouchDB (`fahrzeug:self` mit `_id`, `fahrzeugId`).
- Bei Fehler (401 invalid_pin / 429 rate-limited): UI zeigt Fehlernummer + Hinweis.

### 7.3 Page-Routing (intern, kein React-Router)

Nicht über die URL — der Setup-Screen, BerichtPage, ZentralePage werden allein über State gewählt:

- `fahrzeugId === "zentrale"` → `ZentralePage` (Florianstation-UI).
- alle anderen `fahrzeugId` → `BerichtPage` (Fahrzeug-Kurzbericht).

### 7.4 BerichtPage (Fahrzeug-Kurzbericht)

Aufbau (vertikal, von oben):

1. **Topbar**: Logo + Funkrufname + GPS-Pill + Theme-Toggle.
2. **HandoffBanner** (nur sichtbar wenn `viaHandoff=true`): „Sitzung läuft auf Handy, autoReleaseAt: …" + Release-Button.
3. **AlarmCard**: Einsatzort + Stichwort + Alarmierungszeit + Audio-Player für die BlaulichtSMS-Aufnahme.
4. **RufnameBar**: aktuelles Fahrzeug + Switch-Button.
5. **Editor-Sektionen**:
   - Ausrückung (Abfahrtszeit, Rückkehrzeit, KM)
   - Mannschaft-Slots (1–8, je nach Fahrzeug)
   - Geräte-Chips (per Fahrzeug aus `config:geraete`)
   - Ölbindemittel-Smart-Chip (besonders behandelt: wenn aktiv → Stepper für Säcke-Anzahl)
   - Chronik (Diktate + Auftrags-Einträge + AS-Trupps)
6. **Karte** (Leaflet) mit Einsatzort-Marker + eigenem Standort + ggf. Hydranten (V1.0 deaktiviert).
7. **Auswärts-Aufgaben** („AuftraegeSection") — Liste der einsatzleiter-vergebenen Aufträge, abhakbar.
8. **Closing-CTA**: „Bericht abschließen" (AbschlussModal).
9. **VorschauModal**-Button: druckbare HTML-Vorschau im Stil des Papier-Originals.

#### Auto-Save:
- Jede Mutation pusht optimistisch in PouchDB (lokal) und mit einer 800ms-Debounce-Schleife per `PUT /api/einsaetze/:id/fahrzeugbericht/:fzgId` ans Backend.
- 423 (schreibschutz_aktiv) wird als „dieser Einsatz ist schon abgeschlossen" gerendert.

#### Abschluss-Persistenz (Phase 8):
- Der Status `abgeschlossen` mit Tupel (Zeitstempel, durch, KM) wird sowohl in PouchDB als auch in `localStorage` unter `hotdoc.report-state.<fahrzeugId>` gespeichert. Beim Mount der Page wird _beides_ konsultiert: localStorage gibt den schnellen First-Hit (kein UI-Flash mit Dummy-Bericht), der Backend-Fetch korrigiert ggf. später. Hintergrund: bei einem Browser-Reload war früher der Schreibschutz-Banner kurz weg, weil React-State alleine nicht ausreichte.

### 7.5 ZentralePage (Florianstation)

Aufbau:

1. Topbar.
2. **EinsatzTabs**: Liste der aktiven Einsätze als Tabs. Klick wechselt den aktiven Einsatz.
3. **FlorianMap**: Karte mit allen Fahrzeug-Positionen + Einsatzort. Fahrzeuge älter als 10 min werden grau („stale") und mit einer Zeitangabe versehen. Die Position der Zentrale ist hart auf das FF-Haus gesetzt (`HOME_POS`) statt aus GPS — das Tablet steht ja immer dort.
4. **Hauptbericht-Editor**:
   - Pflichtbereich/Einsatzzone/Über-Örtl. Hilfe (3-State-Tristate: Yes/No/—)
   - Alarmiert-durch BWST/LWZ
   - Einsatzauftrag-via WAS/Funk/Telefon/Bote/Behörde
   - Anrufer-Name + Tel
   - Zeitmarken HH:MM (lageUnterKontrolle, brandAus) — die UI nimmt HH:MM und kombiniert mit der `alarmierungZeit` zu einem ISO-Datetime.
   - Beteiligte Stellen (Multi-Select)
   - Sonstige Anwesende FFs (Multi-Select + Freitextfeld)
   - Mannschaftszahlen (eingesetzt-aus-Aggregation, Bereitschaft, Sonstige)
   - Verrechnung-Toggle + Rechnungsadresse-Feld
   - Ölbindemittel-Anzeige (aus Aggregation)
   - Meldung der Einsatzleitung (großes Freitextfeld)
5. **Fahrzeugstatus-Liste**: pro eingesetztem Fahrzeug eine Card mit „in Arbeit / abgeschlossen", Kdt-Name, AS-Trupp-Counter. Wird aus den `Fahrzeugbericht`-Docs abgeleitet (Polling alle 15 s).
6. **Chronik-Timeline**: globale Chronik aller Fahrzeuge zum aktiven Einsatz.
7. **PDF-Buttons**: „PDF-Bericht" + „syBOS-Spickzettel".
8. **Einsatz-Abschluss-CTA**: nur klickbar wenn alle Fahrzeugberichte abgeschlossen sind. Confirm-Modal mit Warnung „Schreibschutz wird aktiviert, Reaktivierung nur durch Funktionär". Bei Bestätigung → `POST /api/einsaetze/:id/abschluss`.
9. **Appfoot**: HotDoc · v · Build · Funkrufname · QR-Handoff-Button · Fahrzeug-Wechsel · Setup-Reset.

### 7.6 Offline-Strategie der PWA

#### Storage-Layer

- **PouchDB** (`hotdoc-local`) speichert alle Domain-Docs lokal. Auto-Compaction an. Pro Tablet eine Instanz.
- **localStorage** für: Token, deviceId, Theme-Preference, Bericht-Abschluss-Cache, Handoff-Info.
- **Service Worker** (vite-plugin-pwa, generateSW-Strategie) cached: App-Shell, JS/CSS-Chunks, Map-Tiles (StaleWhileRevalidate).

#### Outbox-Pattern für Chronik

`chronik-sync.ts` führt eine In-Memory-Map `pendingByEinsatz: einsatzId → (entryId → entry)`. Wenn ein Post fehlschlägt:
- 404 oder 423 → nicht queue'n (Einsatz existiert nicht oder ist gelockt).
- Sonstige Fehler → queue'n, beim nächsten erfolgreichen Poll wird die Queue zuerst abgearbeitet.

#### Reconnect-Detection

- `window.addEventListener("online" / "offline")` schaltet zwischen aktivem Polling und Pause.
- Zusätzlich Health-Heartbeat alle 30 s gegen `/api/healthz` für die Topbar-Pill.

### 7.7 Geolocation

Die PWA fragt einmal beim Mount um GPS-Permission. Bei Erfolg:
- `navigator.geolocation.watchPosition` mit High-Accuracy. Sample alle 5–10 s.
- POST an `/api/einsaetze/:id/positions` (Burst-Batch wenn Netz, Pufferung wenn offline).
- KM-Berechnung: Haversine-Distanz pro Schritt, Outliers > 200 m/s werden verworfen (GPS-Jumps), Summe = `gefahrenKm`.

Die Zentrale-PWA pusht **keine** GPS-Position — sie ist hart auf das FF-Haus gepinnt.

### 7.8 Diktat (Phase 5 — UI vorhanden, Whisper-WASM offen)

`DictateButton` startet `MediaRecorder` (mime audio/webm). Audio-Blob → PouchDB-Attachment + neuer Chronik-Eintrag mit `transkriptStatus=pending`.

Geplanter Transkriptions-Flow (V1.1):
- Lokal: Whisper.cpp-WASM (Modell `base`, ~150 MB). Transkript wird in den Chronik-Eintrag geschrieben, Status → `verfuegbar`.
- Fallback (kein Strom für lokales Whisper, kein Netz): Server-Route `/api/audio/:id/transcribe` ruft OpenAI Whisper API.

### 7.9 Error-Boundary

Eine globale `ErrorBoundary` fängt React-Render-Fehler. Sie zeigt:
- Branding-Logo + Fehlertext + Stacktrace (nur in Dev/Build).
- Button „Neu laden" + Button „Setup zurücksetzen" (löscht PouchDB-FahrzeugConfig).

Begründung: ohne Boundary könnte ein Render-Fehler die ganze PWA in einen weißen Bildschirm versetzen — fatal in einer aktiven Einsatz-Situation.

---

## 8. Backoffice — Florianstation/Verwaltung im Browser

### 8.1 Pages

| Page | Berechtigung | Inhalt |
|---|---|---|
| Login | öffentlich | Username/Passwort |
| Florianstation | einsatzleiter+ | identisches Layout wie PWA-Florianstation, aber für den großen Bildschirm |
| Verwaltung | funktionaer+ | Tabs für alle Stammdaten + Archiv + Schnittstellen-Health |

### 8.2 Verwaltung — Tabs

1. **Personal** — Liste aus syBOS gesynct + manuell-hinzugefügte Einträge. Filter Aktiv/Inaktiv + Suche.
2. **Material** — read-only Anzeige aus syBOS, gruppiert nach Klasse1/Klasse2.
3. **Fahrzeuge** — pro Fahrzeug die Geräte-Liste (CRUD via `config:geraete`). Inline-Edit-Chips: Klick auf Bleistift → Input wird editierbar, Enter speichert, Esc verwirft. Validierung gegen Empty / Duplikate. Smart-Chip Ölbindemittel = Toggle „dieser Eintrag ist das Ölbindemittel".
4. **Einsatzstichworte** — Liste der erlaubten Stichwörter (`config:einsatzstichworte`) inklusive Brand/Technisch-Kategorisierung. Inline-editierbar.
5. **Auftrag-Typen** — globale Liste der Auftrags-Typen (`config:auftragstypen`). Inline-editierbar.
6. **Nummerierung** — Stand der laufenden Nummern (B26-xxx, T26-xxx) + manuelle Neuvergabe + Konflikt-Auflösungs-UI (siehe 12).
7. **Schnittstellen** — Status-Panels für syBOS-Sync (letzter Lauf, Erfolg/Fehler-Zahl), BlaulichtSMS-Poll (letzter Poll, neue Alarme, Fehler), Audio-Retention.
8. **Archiv** — Liste aller abgeschlossenen Einsätze. Filter nach Typ (alarm/manuell/lotsendienst/uebung), nach Jahr, nach Stichwort. PDF-Download. Reaktivierung (Funktionär-only, Pflicht-Grund).
9. **Statistik** — Aggregations-Dashboard (siehe 16).
10. **Tablet-PINs** — `config:tablet-pins` editieren. Funktionär-only (siehe 6.).
11. **Stammdaten-allgemein** — HandoffAutoReleaseHours (1/4/12/24/48/0), Heim-Koordinaten, …
12. **Aktivität** — Liste der letzten 50 Audit-Events (siehe 17).

### 8.3 Inline-Edit-Komponente `EditableChip`

Ein wiederverwendbares UI-Element für Stammdaten-Editoren:
- Anzeige: `[● Text Bleistift ✕]`.
- Edit-Modus: `[● <input> ✓ ✕]`.
- Trigger: Klick auf Bleistift → Edit. Enter / Blur → Speichern (wenn nicht leer + geändert). Esc → Abbruch ohne Speichern. ✕ im Edit-Modus → Abbruch. ✕ im Read-Modus → Eintrag löschen.
- Validation-Hook: Komponenten-Konsument kann eine `validate(next)`-Funktion übergeben, die `null | string` liefert. Validierungsfehler werden inline als roter Rahmen + Tooltip gezeigt.
- Touch-tauglich: Bleistift- und ✕-Icons sind echte Buttons, kein Hover-only-Reveal.

### 8.4 ManuellerBerichtModal

Eingang in „Einsatz manuell anlegen". Type-Selector am Anfang:
- **Manuell** (Default): Sonstiger Einsatz ohne BlaulichtSMS-Alarm — nur Einsatzort + Stichwort + Datum.
- **Lotsendienst**: zusätzlich Auftraggeber + Route + Verrechnungs-Block (default verrechenbar=true).
- **Übung**: zusätzlich Thema + Übungsleiter + Übungs-Typ.

Anlage ruft `POST /api/einsaetze/manuell`. Die ID bekommt typabhängiges Präfix (`einsatz:manuell-`, `einsatz:lotsendienst-`, `einsatz:uebung-`) damit man im CouchDB sofort sieht, was es ist.

---

## 9. Backend-API

### 9.1 Routes-Übersicht

| Path | Methode | Auth | Was |
|---|---|---|---|
| `/healthz` | GET | öffentlich | Liveness-Probe |
| `/api/auth/login` | POST | öffentlich (rate-limited) | Backoffice-Login |
| `/api/auth/me` | GET | Bearer-Token | Token-Validität + User-Info |
| `/api/auth/tablet/pin-register` | POST | öffentlich (rate-limited) | PIN-Login Tablet |
| `/api/auth/tablet/register` | POST | öffentlich | Legacy MSISDN-Variante |
| `/api/auth/handoff/create` | POST | requireAuth() | QR-Übergabe-Code generieren |
| `/api/auth/handoff/:code` | GET | öffentlich | QR-Code claimen |
| `/api/auth/handoff/:code/status` | GET | öffentlich | Polling-Status |
| `/api/auth/handoff/release` | POST | requireAuth() | Sitzung freigeben |
| `/api/einsaetze` | GET | requireAuth() | Liste, Filter `?status=aktiv\|abgeschlossen` |
| `/api/einsaetze/:id` | GET | requireAuth() | Detail |
| `/api/einsaetze/:id` | PUT | requireAuth() | Update (mit Schreibschutz-Check) |
| `/api/einsaetze/manuell` | POST | einsatzleiter+ | Manuell anlegen |
| `/api/einsaetze/:id/abschluss` | POST | einsatzleiter+ | Abschließen → schreibschutz=true |
| `/api/einsaetze/:id/reaktivieren` | POST | funktionaer+ | Mit Pflicht-Grund (min. 10 Zeichen) |
| `/api/einsaetze/:id/fahrzeugberichte` | GET | requireAuth() | Liste |
| `/api/einsaetze/:id/fahrzeugbericht/:fzgId` | PUT | requireAuth() | Upsert (mit Schreibschutz-Check) |
| `/api/einsaetze/:id/chronik` | GET | requireAuth() | Vollständige Chronik |
| `/api/einsaetze/:id/chronik` | POST | requireAuth() | Append-only (dedupe via `entry.id`) |
| `/api/einsaetze/:id/positions` | POST | requireAuth() | GPS-Update |
| `/api/einsaetze/:id/pdf` | GET | requireAuth() | Puppeteer-PDF |
| `/api/einsaetze/:id/spickzettel` | GET | requireAuth() | HTML-Spickzettel |
| `/api/admin/health` | GET | funktionaer+ | syBOS + BlaulichtSMS + DB-Status |
| `/api/admin/stats` | GET | funktionaer+ | Statistik-Aggregation |
| `/api/admin/audit` | GET | funktionaer+ | Audit-Events |
| `/api/config/:key` | GET/PUT | requireAuth() (PINs: funktionaer+) | Stammdaten |
| `/api/dev/*` | POST | nur in dev | Mock-Endpoints |

### 9.2 Schreibschutz-Verhalten

`POST /api/einsaetze/:id/abschluss`:
- Lädt das Doc.
- Wenn `status === "abgeschlossen"`: 409 `already_closed`.
- Sonst: setzt `status="abgeschlossen"`, `schreibschutz=true`, `einsatzende=now`, `geaendertAm=now`.
- Schreibt Audit-Event `einsatz-abschluss`.

`POST /api/einsaetze/:id/reaktivieren`:
- Lädt das Doc.
- Wenn `status !== "abgeschlossen"`: 409 `not_closed`.
- Body muss `{ grund: string }` enthalten, `grund.length >= 10`. Schema-Validation via Zod.
- Setzt `status="aktiv"`, `schreibschutz=false`, ergänzt `reaktivierungen[]` um einen Eintrag mit `vonBenutzerId=session.sub`, `am=now`, `grund`, `vonStatus="abgeschlossen"`.
- Schreibt Audit-Event `einsatz-reaktivierung`.

`PUT /api/einsaetze/:id`:
- Lädt das Doc.
- Wenn `schreibschutz === true`: 423 Locked, Hinweis `Bericht muss erst reaktiviert werden`.
- Sonst: Merge (existierende Felder + req.body), `geaendertAm=now`, Zod-Validation, Save.

`PUT /api/einsaetze/:id/fahrzeugbericht/:fzgId`:
- Lädt zuerst das Einsatz-Doc und prüft den Schreibschutz dort.
- Lädt dann den Fahrzeugbericht (404 → wird neu angelegt, mit Defaults).
- Merge + Zod-Validation + Save.

Begründung der 423-Logik: ein abgeschlossener Bericht darf nicht durch verspätete Replication eines Tablets ungewollt überschrieben werden. Der explizite Reaktivierungs-Schritt ist verpflichtend.

### 9.3 Worker-Prozesse

Beim Server-Start werden drei Worker registriert (alle als `void` gestartet — Fehler kippen nicht den Server):

#### 9.3.1 syBOS-Sync (Cron)

- Default-Schedule: täglich 04:00 (`SYBOS_SYNC_CRON`). Per ENV überschreibbar.
- Wird nur registriert wenn `hasSyBos()` (Token+URL gesetzt).
- Lädt vier Endpoints: `Personal.php?Art=MITGLIEDER`, `Material.php`, `Abteilung.php`, `PersUeberpruefung.php?Status=o`.
- Mapper-Pipeline:
  - **`coerceId(raw)`**: syBOS liefert IDs als Strings. Wenn nicht zu `>0 integer` parsbar → null. Items mit null-ID werden _vor_ dem Bulk-Insert ausgesondert (sonst kollidieren sie alle auf `person:undefined`).
  - **`buildAtemschutzSet(rows)`**: durchsucht PersUeberpruefung-Antwort nach Einträgen mit `Pruefungsbezeichnung` matchend `/atemschutz/i` und Status `o` / `gültig`. Liefert ein Set der vollqualifizierten Namen.
  - **`mapPerson(raw, atemschutzSet)`**: konstruiert das `person:<id>`-Doc inkl. `atemschutzGueltig`-Flag durch Set-Lookup.
  - **`mapMaterial(raw)`**: konstruiert das `material:<id>`-Doc, inkl. heuristischem WAT-Code-Mapping (z. B. "atemschutz|maske" → `atems`, "öl|bindemittel|generator" → `gerae`).
- **Upsert-Strategie** `upsertBulk(docs)`:
  1. `fetchRevs({ keys })` für alle vorhandenen Docs.
  2. Pro Doc: wenn `_rev` bekannt → mit `_rev` schreiben, sonst neu.
  3. `bulk_docs`. Fehler werden geloggt (max 5 Samples für Debug), aber blockieren nicht den Sync-Lauf.
- **Telemetrie**: `runSyBosSync()` schreibt nach `services/state.ts` (in-memory) die Statistik des letzten Laufs. Wird über `/api/admin/health` ausgeliefert.

#### 9.3.2 BlaulichtSMS-Poller

- Default-Interval: 15 s (`BLAULICHTSMS_POLL_INTERVAL_SEC`).
- **Idempotenz** über `alarmId`: jeder Alarm wird in CouchDB als `einsatz:<alarmId>` angelegt. Bei `db.get(id)` → schon vorhanden → nichts tun. Bei 404 → upsert.
- Neue Einsätze erhalten:
  - `einsatzTyp="alarm"`, `status="aktiv"`, `schreibschutz=false`.
  - `einsatzort` aus `geolocation.address` ODER `alarmText` ODER `"Unbekannt"`.
  - `koordinaten` aus `geolocation.coordinates`, falls vorhanden.
  - `alarmierungZeit` (BlaulichtSMS), `alarmierungAudio` (URL), `alarmierungAuthor`, `alarmierungText`.
  - **Ein erster Chronik-Eintrag** mit `source="blaulichtsms"` (bzw. legacy `typ="auto-blaulichtsms"`), der den Alarm-Text als Transkript trägt.
- **Sicherheit:** der Poller ist read-only. Es wird _nichts_ an BlaulichtSMS gesendet. Das ist eine explizite Anforderung des Auftraggebers (kein Write-Access für externe Dienste).

#### 9.3.3 Audio-Retention (Cron)

- Default-Schedule: täglich 03:00.
- Löscht Audio-Attachments aus CouchDB die älter als `AUDIO_RETENTION_DAYS` (Default 30) sind.
- Datenschutzkonform — Alarm-Audios enthalten PII, sind nach 30 Tagen nicht mehr nötig.

### 9.4 PII-Filter im API-Logger

Pino-http redact-Konfiguration entfernt vor dem Schreiben in stdout/fly-Logging:
- `req.headers.authorization`
- `req.headers.cookie`
- `req.headers["x-forwarded-for"]` (echte IP über `req.ip`/`trust proxy` aufgelöst)
- `req.body.password`, `req.body.pin`, `req.body.passwordHash`, `req.body.token`, `req.body.sessionId`
- `res.headers["set-cookie"]`
- Custom-Serializer ersetzt zusätzlich auth/cookie-Headers durch `[REDACTED]`.

### 9.5 Rate-Limit-Implementation

In-Memory pro fly-Machine. Map `ip → { count, firstAt, blockedUntil? }`:
- 5 fails / 15 min → 30 min Block.
- Cleanup-Sweep alle 5 min entfernt Einträge mit abgelaufenem Block und außerhalb des Fenster.
- `recordSuccessfulLogin` löscht den IP-Eintrag (Reset, IP ist legitim).

Trade-off: 2 fly-Machines = doppelte effektive Limits. Akzeptabel für eine FF < 50 User. Für höhere Anforderungen wäre Redis nötig.

---

## 10. Externe Schnittstellen

### 10.1 BlaulichtSMS Dashboard API

- **Vertragsart:** read-only. Keine Write-Operations.
- **Auth:** `customer_id`, `user`, `password` als Body-Params bei jedem Call. Credentials in fly secrets.
- **Endpoints, die wir nutzen:**
  - `POST /alarm/v1/list`: liefert die aktiven Alarme der letzten N Stunden.
  - `GET <audioUrl>` (vom Alarm-Doc geliefert): MP3-Aufnahme der Sirene.
- **Antwort-Schema** (relevante Felder):
  - `alarmId` (eindeutig, integer)
  - `alarmDate` (ISO 8601)
  - `alarmText` (kurz, z. B. „B2-Wohnungsbrand")
  - `authorName`
  - `audioUrl`
  - `geolocation.address`, `geolocation.coordinates.{lat,lng}`
- **Adapter-Layer:** `services/blaulichtsms/client.ts` mit `listAlarms()` als einzigem öffentlichem Entry. Mock-Modus: wenn Credentials fehlen, gibt der Client eine In-Memory-Liste zurück, die per `/api/dev/blaulichtsms/trigger` befüllbar ist (für Smoketests in Dev/Staging).
- **Resilienz:** Timeout 30 s. Bei Netzfehler wirft `pollOnce()` und der Worker geht einfach in die nächste Runde — kein Crash.

### 10.2 syBOS Read-API

- **Vertragsart:** read-only.
- **Auth:** `token=<...>` als URL-Param + serverseitige IP-Whitelist (in syBOS Admin gepflegt). Token in fly secrets.
- **Antwort-Format:** JSON. Achtung — manche Endpoints liefern HTML-Fehlerseiten bei Auth-Problemen; der Adapter parst defensiv und wirft `SyBosError` mit Status-Code + Endpoint-Info.
- **Endpoints:**
  - `GET /API/Personal.php?token=...&Art=MITGLIEDER&json=1`: aktive Mitglieder.
  - `GET /API/Material.php?token=...&json=1` (optional `?WATcode=...`).
  - `GET /API/Abteilung.php?token=...&json=1`.
  - `GET /API/PersUeberpruefung.php?token=...&Status=o&json=1`: AS-Prüfungen.

#### Bekannte syBOS-Eigenheiten (die der Mapper berücksichtigt)

1. **IDs sind Strings**, auch wenn sie numerisch aussehen (`"123"` statt `123`). Mapper `coerceId()` parst defensiv. Items mit ungültiger ID werden geskipped (kein Crash).
2. **Feldname `ID`** in Großbuchstaben — `id` matched nicht.
3. **PersUeberpruefung-Antwort ist nicht flach**. Statt `{number, item: []}` ist es `{number, <Prüfungsbezeichnung1>: {item: [...]}, <Prüfungsbezeichnung2>: {item: [...]}, …}`. Der Mapper iteriert über alle Top-Level-Keys außer `number` und flacht ab, wobei der Gruppen-Key als `Pruefungsbezeichnung` ans Item gehängt wird.
4. **Status-Filter wird oft ignoriert** — wir filtern client-side nach `Status === "o"` oder `Status === "gültig"` (case-insensitive, mit und ohne Umlaut).
5. **Atemschutz-Erkennung über den Namen** (`Pruefungsbezeichnung` matched `/atemschutz/i`). Wenn syBOS einmal die Bezeichnung ändert, muss der Mapper nachgezogen werden.

### 10.3 Wasserkarte.info (V1.0 bewusst ausgeklammert)

In der Spec ist ein Backend-Cache für Hydranten-Daten + PWA-Layer geplant. Für V1.0 ist die Funktionalität deaktiviert:
- `hasWasserkarte()` liefert immer false → kein Sync.
- Kein Hydranten-Layer auf der Karte.
- Begründung: Lizenz/Access-Key-Klärung steht aus.

### 10.4 OpenStreetMap-Tiles

- Direkt vom Browser geladen.
- Service-Worker-Strategie StaleWhileRevalidate für Tile-URLs.
- Geographische Begrenzung Eberstalzell-Umgebung im Service-Worker-Pre-Cache (~50 MB).

---

## 11. Workflows / Use Cases im Detail

### 11.1 UC-A: Alarm-Empfang → Erfassung → Abschluss

1. **BlaulichtSMS-Alarm** wird vom Disponenten ausgelöst. Polling-Worker (alle 15 s) erkennt den neuen Alarm und legt `einsatz:<alarmId>` an. Erster Chronik-Eintrag wird automatisch geschrieben.
2. **Tablets** pollen `/api/einsaetze?status=aktiv` (alle 30 s). Sobald sie den neuen Einsatz sehen, übernehmen sie ihn als aktiven Einsatz.
3. **Florianstation-PWA** zeigt den neuen Einsatz als Tab. Der Einsatzleiter klickt drauf und beginnt mit der Erfassung.
4. **Fahrzeug-Tablets** zeigen ihn als AlarmCard. Der Fahrzeug-Kdt. trägt Mannschaft, Geräte, Chronik ein. Jede Mutation pusht direkt ans Backend (Auto-Save).
5. **Chronik-Cross-Sync** (siehe 13): Diktate vom Fahrzeug-Kdt. landen über den Append-Endpoint im Einsatz-Doc und werden von allen anderen Tablets gepollt.
6. **GPS-Tracking** läuft im Hintergrund. Fahrzeug-Positionen werden alle 5–10 s gepusht.
7. **Fahrzeug-Abschluss** (im Tablet, Closing-CTA): Fahrzeug-Kdt. öffnet das AbschlussModal, gibt KM ein, bestätigt. Bericht-Status → `abgeschlossen` (im Fahrzeugbericht-Doc). Anzeige wechselt zu Read-Only/Lock.
8. **Florianstation** sieht alle Fahrzeugberichte auf abgeschlossen. CTA „Einsatz abschließen" wird klickbar. Einsatzleiter bestätigt. Backend setzt `einsatz.status="abgeschlossen"`, `schreibschutz=true`, `einsatzende=now`.
9. **PDF + Spickzettel** werden aus dem Florian-UI generiert.
10. **Bearbeiter** holt sich den Spickzettel und überträgt die Felder in syBOS-Webfrontend.

### 11.2 UC-B: Manueller Einsatz ohne Alarm

Beispiel: Türöffnung nach Anruf.
1. Einsatzleiter öffnet im Florian-UI „Einsatz manuell anlegen".
2. Type-Selector: „Manuell".
3. Einsatzort + Stichwort + Zeit eintragen + Anlegen.
4. Ab da identisch zu UC-A ab Schritt 4 (Tablets sehen den neuen Einsatz, erfassen, schließen ab).

### 11.3 UC-C: Lotsendienst

1. Anlage wie UC-B, aber Type-Selector „Lotsendienst".
2. Zusätzliche Pflichtfelder: Auftraggeber, Route.
3. `verrechnung.verrechenbar` ist Default true (Lotsendienste sind in der Regel verrechenbar).
4. Beim PDF-Druck wird ein **eigenes Template** verwendet (kein Standard-Einsatzbericht):
   - Header „Lotsendienst-Bericht"
   - Auftraggeber-Block
   - Route-Beschreibung
   - Verrechnungs-Block (Adresse, Stundenanzahl, Mitwirkende)

### 11.4 UC-D: Übung

1. Anlage wie UC-B, aber Type-Selector „Übung".
2. Zusätzliche Felder: Thema, Übungsleiter, Übungs-Typ (8 Werte: Atemschutz, Technische Hilfeleistung, Höhenrettung, Sanitätsdienst, Funk, Allgemeine Übung, Bewerb, Sonstige).
3. PDF-Template **eigenes Layout**:
   - Header „Übungs-Bericht"
   - Thema + Übungsleiter + Übungs-Typ
   - Teilnehmer-Liste **mit AS-Stunden** (relevant für AS-Berechtigung)
4. Im Statistik-Dashboard werden Übungen separat von Realeinsätzen geführt.

### 11.5 UC-E: Reaktivierung nach Abschluss

1. Funktionär öffnet das Archiv im Backoffice und wählt einen abgeschlossenen Einsatz.
2. Detail-View bietet Button „Reaktivieren". Klick öffnet Modal mit Pflicht-Textarea.
3. Mindestens 10 Zeichen Begründung verpflichtend. Submit → `POST /api/einsaetze/:id/reaktivieren`.
4. Backend prüft Rolle `funktionaer`, validiert, ergänzt `reaktivierungen[]` und schaltet Schreibschutz aus.
5. Audit-Event `einsatz-reaktivierung` wird geschrieben.
6. Tablets sehen beim nächsten Poll den Einsatz wieder als aktiv und können editieren.

### 11.6 UC-F: QR-Handoff

Tablet im Florianhaus geht der Akku aus. Der Einsatzleiter zeigt seinem Handy den QR auf dem Tablet:
1. Tablet ruft `POST /api/auth/handoff/create`. Bekommt 8-stelligen Code zurück.
2. QR mit URL `https://hotdoc-eberstalzell.fly.dev/handoff/<code>`.
3. Handy scannt → PWA bootet → erkennt den Code in der URL → ruft `GET /api/auth/handoff/<code>`.
4. Server liefert neuen JWT mit `viaHandoff=true` und `autoReleaseAt = jetzt + 24h`.
5. Tablet pollt `…/status`, sieht `claimed=true`, löscht eigenen Token, zeigt Setup.
6. Auf dem Handy läuft jetzt die Florianstation-UI inkl. Banner „Sitzung kommt von Florianstation, läuft bis MM-TT HH:MM".
7. 24h später (oder beim manuellen Release): `autoReleaseAt` ist überschritten → `verifySession` lehnt den Token ab → Handy landet im Setup und kann sich nicht mehr unter Florian-Rechten anmelden, ohne die echte PIN zu kennen.

Reverse-Handoff: gleicher Flow, aber Quell-Sitzung war selbst `viaHandoff=true`. Server erkennt das und gibt einen normalen Token zurück (kein autoReleaseAt) — das Tablet bekommt seine Sitzung „dauerhaft" zurück.

### 11.7 UC-G: Offline-Erfassung + Reconnect

Tablet ist im Funkloch.
1. Service Worker erkennt offline → PWA setzt Topbar-Pill auf „OFFLINE · N Änderungen pending".
2. Alle Mutationen landen in PouchDB. Auto-Save-Fetch zum Backend fängt sich Netzwerkfehler ab und queue't Chronik-Einträge in der Outbox.
3. Im Funkloch keine BlaulichtSMS-Pushs, keine Updates von anderen Fahrzeugen.
4. Beim Reconnect: PouchDB-Replication pushed alle lokalen Änderungen ans Backend. Outbox-Worker postet die Chronik-Einträge nach.
5. Falls Konflikte (z. B. bei manuell vergebenen Berichts­nummern): siehe Abschnitt 12.

---

## 12. Berichts­num­me­rie­rung & Konfliktauflösung

### 12.1 Schema

Format: `<Präfix><JJ>-<NNN>`

- **Präfix** abgeleitet aus `einsatzart` via `kategorieFuer()`:
  - `"brand"` → `B`
  - `"technisch"` → `T`
- **JJ**: letzte 2 Stellen des Kalenderjahrs der Alarmierung.
- **NNN**: 3-stellige laufende Nummer, **je Kategorie separat**, pro Jahr.

Beispiel: erstes Brand-Ereignis 2026 → `B26-001`. Erstes technisches → `T26-001`. Beide existieren parallel.

Hilfsfunktionen in `packages/shared`:
- `buildBerichtNummer(einsatzart, jahr, laufendeNummer)`: konstruiert die Nummer.
- `parseBerichtNummer(n)`: zerlegt einen String zurück in `{ kategorie, jahr, laufendeNummer }`. Liefert null bei Mismatch.

### 12.2 Vergabe-Strategie online

Im Normalfall (Tablet online, Backend erreichbar):
1. Tablet/Florianstation pollt die aktuelle laufende Nummer für (jahr, kategorie) per Verwaltungs-Tab oder einer expliziten Server-Route.
2. Backend hält pro `(jahr, kategorie)` einen Counter in einem CouchDB-Doc `seq:<jahr>:<kategorie>` (z. B. `seq:26:B`) und vergibt die nächste Nummer atomar via _Read-Increment-Write_-Pattern mit `_rev`-Check.
3. Bei `_rev`-Konflikt → Retry mit dem neu gelesenen Wert. Da die Vergabe sehr selten ist (ein paar Mal pro Tag), genügt Optimistic-Locking.

### 12.3 Vergabe-Strategie offline (das eigentliche Problem)

Beispielszenario: TLF und LFA-B sind im Funkloch und legen unabhängig je einen manuellen Einsatz an. Beide bekommen lokal die nächste freie Nummer vorgeschlagen — z. B. `T26-004`. Wenn beide synchronisieren, hätten zwei Einsätze dieselbe Nummer.

**Lösung in vier Schritten:**

#### Schritt 1: Provisorische Nummer beim Anlegen markieren

Das lokal angelegte Einsatz-Doc trägt zusätzliche Felder:
- `berichtNr: "T26-004"`
- `berichtNrProvisorisch: true`
- `berichtNrErsteller: "lfa-b@<deviceId>"`

Auch im UI wird die Nummer mit einem „prov."-Suffix gekennzeichnet, sodass der Fahrzeug-Kdt. nicht denkt, die Nummer sei verbindlich.

#### Schritt 2: Server-side Konflikt-Erkennung beim Sync

Wenn die Continuous-Replication das Doc zur CouchDB pusht, läuft eine **Update-Validator-Function** (CouchDB Design-Doc) gegen jeden eingehenden Einsatz:

- **Wenn `berichtNr` bereits an einem anderen Doc vergeben ist:**
  - Das zeitlich frühere Doc (sortiert nach `erstelltAm`) behält die Nummer.
  - Das zeitlich spätere wird im Validator nicht abgelehnt (sonst würde der Sync hängen), sondern bekommt zusätzlich `konflikt: true` und behält `berichtNrProvisorisch: true`.
- Der Konflikt wird mit einem Audit-Event `bericht-nr-konflikt-erkannt` festgehalten.

#### Schritt 3: Florianstation zeigt den Konflikt zur Auflösung

Im Backoffice → Verwaltung → Nummerierung-Tab erscheint ein Konflikt-Banner mit den beiden konkurrierenden Berichten und einem **Vorschlag**:

```
⚠ Bericht-Nummern-Konflikt
TLF Eberstalzell · Sturm · 14:08 · T26-004 (Originalvergabe)
LFA-B Pumpe Eberstalzell · Ölspur · 14:23 · T26-004 (Konflikt)
Vorschlag: LFA-B-Bericht umnummerieren → T26-005
[Vorschlag übernehmen]  [Manuell anders zuordnen]
```

Der Vorschlag basiert auf der nächsten freien Nummer in (jahr, kategorie).

#### Schritt 4: Aufgelöste Konflikte landen im Doc-Audit-Trail

Bei „Vorschlag übernehmen" setzt der Backend-Handler:
- Konflikt-Doc: `berichtNr: "T26-005"`, `konflikt: false`, `berichtNrProvisorisch: false`.
- `konflikt_history`-Array bekommt einen Eintrag mit: `{ am, vorherige_nr, konflikt_mit, geloest_durch, art: "auto_vorschlag_uebernommen" }`.

Die Replication pusht das Update zu allen Tablets — auf dem LFA-B-Tablet wechselt die Nummer in der UI.

#### Manuelle Sonderauflösung

Der Funktionär kann auch „Manuell anders zuordnen" wählen. Dann öffnet sich ein Eingabefeld mit Validierung gegen schon vergebene Nummern und einem freien Auflösungs-Grund. Auch das landet als `konflikt_history`-Eintrag mit `art: "manuell_zugeordnet"`.

### 12.4 Sonderfälle bei der Nummern-Vergabe

- **Stichwort-Wechsel nach Anlage** (vom Einsatzleiter): wenn nach der Anlage die `einsatzart` so geändert wird, dass die Kategorie wechselt (z. B. ursprüngliche „Brand KFZ" → später als „technisch" eingestuft), bleibt die ursprüngliche Berichts­nummer bestehen. Sonst wäre die Nummer-Kontinuität pro Kategorie kaputt.
- **Manuelle Einsätze ohne `einsatzart`** bekommen Default-Kategorie `"technisch"` (T-Präfix).
- **Übungen** bekommen ein eigenes Präfix `Ü` (Phase 6, V1.1).
- **Lotsendienste** werden als technisch behandelt (T-Präfix) — laut Auftraggeber-Vorgabe.

---

## 13. Chronik-Cross-Sync

### 13.1 Was es ist

Die Chronik ist das **Funkkommando-Logbuch** zum Einsatz: zeitlich sortierte Einträge wie „14:23 Florian Eberstalzell: Alarmierung", „14:31 Pumpe Eberstalzell: Wasser-Anschluss am Hydrant Solar-Gasse", „14:48 Tank Eberstalzell: AS-Trupp 1 unter PA". Sie wird von **allen Fahrzeugen geschrieben und von allen Fahrzeugen gelesen** — Cross-Sync.

### 13.2 Architektur

**Quelle der Wahrheit:** das `chronik`-Array im Einsatz-Doc in CouchDB.

**Append-Endpoint:** `POST /api/einsaetze/:id/chronik`
- Body: `{ id (UUID v4), zeitstempel, funkrufname, fahrzeugId, source, text, pending?, transkriptStatus? }`.
- Idempotent über `id`: Handler dedupliziert intern — wenn ein Eintrag mit derselben `id` schon existiert, kommt `200 { ok, deduped: true, total }` zurück, kein neuer Insert.
- Schreibschutz-Check (423): nach Abschluss können keine Einträge mehr ergänzt werden.
- Schreibt das ganze Einsatz-Doc neu (CouchDB-Update mit aktuellem `_rev`). Bei 409 vom CouchDB würde der Handler retry'en (Read-Merge-Write); in V1.0 wirft er den Fehler aber durch.

**Read-Endpoint:** `GET /api/einsaetze/:id/chronik`
- Liefert nur das Sub-Array, plus `geaendertAm` für ETag-ähnliche Effizienz (nicht aktiv genutzt).

### 13.3 Tablet-Verhalten (chronik-sync.ts)

1. **Beim Mount** liest BerichtPage/ZentralePage die Chronik vom Backend (initial-Fetch) und ergänzt den lokalen State.
2. **Polling** alle 8 s: `fetchChronikDiff(einsatzId, bekannteIds)` lädt die volle Chronik und filtert über `bekannteIds`. Nur neue Einträge werden angehängt.
3. **Outbox**: Lokale Einträge (Diktat, Auftrags-Eintrag, AS-Trupp-Marker) werden _sofort_ in den lokalen State gepusht und parallel via Broadcast ans Backend gepostet. Bei Netzfehler → Outbox-Map (`pendingByEinsatz`). Beim nächsten erfolgreichen Poll wird die Outbox abgearbeitet.
4. **Fehler-Klassen:**
   - 404 (Einsatz nicht gefunden) oder 423 (gelockt) → nicht weiter retryen, Eintrag verwerfen.
   - 5xx oder Netzfehler → in Outbox.

### 13.4 Beispiel-Ablauf

| Zeit | Fahrzeug-Tablet | Florianstation |
|---|---|---|
| 14:23 | (kein Tablet, Backend-Worker schreibt BlaulichtSMS-Eintrag) | sieht den Eintrag binnen 8 s nach Anlage |
| 14:31 | Pumpe-Tablet: Kdt. tippt „Wasser-Anschluss am Hydrant Solar-Gasse" → lokaler State zeigt sofort, parallel POST | sieht Eintrag im nächsten Poll (≤ 8 s) |
| 14:32 | Pumpe-Tablet ist offline → Eintrag in Outbox | sieht ihn (noch) nicht |
| 14:34 | Reconnect → Outbox-Replay → POST OK | sieht Eintrag im nächsten Poll |
| 14:48 | Tank-Tablet: AS-Trupp-1-Marker → POST | nach 8 s sichtbar |

### 13.5 Begründung der Strategie

CouchDB hat eingebaute `_changes`-Feeds, die theoretisch einen WebSocket-ähnlichen Live-Stream erlauben würden. V1.0 nutzt aber bewusst **HTTP-Polling**, weil:
- es einfacher zu debuggen ist,
- es offline-tolerant ist (Polling-Failure ist normaler Zustand, kein Bug),
- es keine fly-Side-WebSocket-Konfiguration braucht,
- 8 s Latenz für eine Funkkommando-Chronik akzeptabel ist.

V1.1 könnte auf `_changes` + EventSource (SSE) wechseln, ohne dass das Append-Modell sich ändert.

---

## 14. Online/Offline-Sync & Replication

### 14.1 Designziel

> **Online-first, aber offline-resilient.** Jedes Tablet kann auch ohne Netz einen vollständigen Fahrzeugbericht erfassen und beim Reconnect automatisch mit der Florianstation zusammenführen.

### 14.2 Replication-Topologie (Soll, V1.1 finalisiert)

- **PouchDB → CouchDB** (bi-direktional, continuous): pro Tablet eine Continuous-Replication zur `hotdoc`-DB.
- **Selektive Replication:** das Tablet braucht nicht alle Docs. Filter-Design-Doc gibt z. B. nur Einsätze der letzten 6 Wochen + aktive Einsätze frei.
- **Conflict-Resolution:** CouchDB hält bei Konflikten alle Revisionen. Der Backend-Handler liefert per Konvention immer die zuletzt deterministisch gewählte Revision (CouchDB sortiert per rev-Hash, das genügt für 99% der Fälle). Für die Spezialfälle (Berichts­nummern) siehe Abschnitt 12.

### 14.3 Was im Offline-Betrieb funktioniert

| Aktion | Verhalten offline |
|---|---|
| Neuer Einsatz manuell anlegen | ✓ funktioniert · ID lokal vergeben mit `provisional`-Flag |
| Person aus Picker auswählen | ✓ funktioniert · Quelle: lokaler Personal-Cache (PouchDB) |
| Diktat aufnehmen | ✓ Audio-Blob als PouchDB-Attachment, Transkript folgt beim Sync |
| GPS-Spur aufzeichnen | ✓ läuft komplett lokal |
| KM-Berechnung | ✓ Haversine lokal |
| Bericht abschließen | ✓ Status → `abgeschlossen` lokal, Schreibschutz aktiv |
| BlaulichtSMS-Empfang | ✗ braucht Netz |
| Live-Position anderer Fahrzeuge | ✗ letzter bekannter Stand, dann grau |
| Chronik-Broadcast zu anderen | ✗ Outbox, schießt beim Reconnect raus |

### 14.4 Reconnect-Detection

- `window.addEventListener("online" | "offline")` schaltet zwischen Sync aktiv / Sync paused.
- Backend-Heartbeat alle 30 s gegen `/api/healthz` für die Topbar-Pill.
- Status-Pill-Werte:
  - `GPS · 12 m` (grün) — online + GPS-Fix
  - `OFFLINE · 4 Änderungen pending` (amber) — offline, lokale Änderungen warten

### 14.5 Service-Worker

- `vite-plugin-pwa` mit `generateSW`-Strategie:
  - App-Shell + JS/CSS Pre-Cache.
  - Map-Tiles: StaleWhileRevalidate für `tile.openstreetmap.org`.
  - 9 Pre-Cache-Einträge, ~950 KiB (V1.0).

### 14.6 Personal-Daten-Fallback

- `services/sybos/sync.ts` cached die letzte erfolgreiche Sync-Antwort in CouchDB als `personal:cache:<datum>`.
- PWA-Tablets arbeiten primär mit der replizierten `person:*`-Sammlung in PouchDB.
- Wenn syBOS für > 7 Tage nicht erreichbar ist:
  1. Banner im Backoffice „syBOS-Sync seit X Tagen fehlgeschlagen".
  2. Personalliste bleibt gültig (Tablets arbeiten weiter mit Cache).
  3. Funktionäre können im Notfall einzelne Personen manuell anlegen (Verwaltung → Personal → manuell).

---

## 15. PDF-Generierung & Spickzettel

### 15.1 Renderer

- **Puppeteer** mit Lazy-Init (Browser wird beim ersten Aufruf gestartet und wiederverwendet).
- Headless Chromium, mit Flags `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` (notwendig in fly-Container).
- Render: `page.setContent(html, { waitUntil: "networkidle0" })` → `page.pdf({ format: "A4", printBackground: true, margin: 16mm allseits })`.

### 15.2 Template-Dispatcher

`/api/einsaetze/:id/pdf` wählt das Template je nach `einsatzTyp`:

| einsatzTyp | Template |
|---|---|
| `alarm` | Standard-Einsatzbericht (Papier-Layout-Klon) |
| `manuell` | Standard-Einsatzbericht (Papier-Layout-Klon, mit Hinweis „manuell angelegt") |
| `lotsendienst` | Lotsendienst-Bericht |
| `uebung` | Übungs-Bericht |

### 15.3 Standard-Einsatzbericht-Template

Layout-Vorbild ist das eingescannte Original-Formular „Einsatzbericht 2025 NEU" der FF Eberstalzell. Aufbau (A4 hochkant, 12mm Margin):

- **Header** mit FF-Wappen (offizielles `Logo_FF-Eberstalzell.png`, 656×185, RGBA, Base64-eingebettet via `getBrandLogoDataUrl()`) + „Einsatzbericht"-Schriftzug rechts.
- **Datenzeile**: Einsatzort / Datum-Uhrzeit / Alarm-ID
- **Checkbox-Reihen**:
  - Pflichtbereich / Einsatzzone / Über örtliche Hilfe
  - Alarmiert durch BWST/LWZ
  - Einsatzauftrag via WAS/Funk/Telefon/Bote/Behörde
  - Fahrzeuge ankreuzen (KDO, TLF-A 4000, LFA-B, PKW-Anhänger, MTF, HR-Anhänger, Stapler)
- **Einsatzart-Matrix**: 7×4 Grid mit Checkboxen für die 28 Einsatzarten + Freitextzeile.
- **Lage unter Kontrolle / Brand AUS**: Uhrzeit-Felder.
- **Beteiligte Stellen + Sonstige FFs**: zwei Checkbox-Reihen.
- **Mannschaft**: Eingesetzt / Bereitschaft / Sonstige.
- **Verrechenbar / Ölbindemittel-Säcke**: zwei Zeilen.
- **Meldung Einsatzleitung**: großes Freitext-Feld.
- **Einsatzleiter / Einsatzende / Bearbeiter / Unterschrift**.
- **Reaktivierungs-Audit** (falls vorhanden): kleine Tabelle mit Datum + Grund am Fuß.

### 15.4 Lotsendienst-Template

- Header „Lotsendienst-Bericht"
- Auftraggeber-Block (Name, Adresse, Tel)
- Route-Beschreibung
- Zeitraum
- Mitwirkende (Personal-Liste)
- Verrechnungs-Block (Stundenanzahl, Rechnungsadresse, Vermerk)

### 15.5 Übungs-Template

- Header „Übungs-Bericht"
- Thema + Übungsleiter + Übungs-Typ
- Datum + Dauer
- Teilnehmer-Tabelle mit AS-Stunden — Spalten Name, Funktion, AS-Aktiv (j/n), AS-Dauer-Minuten
- Bemerkungen

### 15.6 syBOS-Spickzettel

`/api/einsaetze/:id/spickzettel` liefert **HTML** (nicht PDF), das die Felder in genau der Reihenfolge wie das syBOS-Web-Frontend zeigt. Der Bearbeiter öffnet beide Seiten nebeneinander und tippt die Werte ab.

- Format: einseitige HTML-Datei mit Print-CSS optimiert für A4.
- Felder in syBOS-Eingabe-Reihenfolge: Einsatzart, Datum/Uhrzeit, Einsatzort, Stichwort, …, Mannschaft, Verrechnung.
- Reine Read-only-Darstellung mit großer Schrift.

### 15.7 Logo-Asset-Pipeline

Ein kritischer Punkt der Produktiv-Härtung war: **kein selbstgemaltes Logo, nur das echte**.

- Quelldatei: `Logo_FF-Eberstalzell.png` (656×185, RGBA).
- Drei parallel gehaltene Kopien:
  - `apps/pwa/src/assets/ff-eberstalzell-logo.png` (Vite-Asset-Import mit Hash-Versionierung, Cache-bypass-fähig).
  - `apps/backoffice/src/assets/ff-eberstalzell-logo.png` (analog).
  - `apps/api/assets/ff-eberstalzell-logo.png` (vom PDF-Renderer als Base64 eingebettet).
- Vite-Asset-Import statt `/public/`-Fallback war nötig, weil Caddy `Cache-Control: max-age=31536000, immutable` ausliefert — ein neuer Logo-Push wäre nie sichtbar geworden ohne Hash-im-Pfad.

---

## 16. Statistik & Reporting

### 16.1 Endpoint `/api/admin/stats`

Aggregations-Antwort über alle `einsatz:*`-Docs:

- **Einsätze pro Jahr / Monat**: gruppiert nach `einsatzTyp`.
- **Einsätze nach Stichwort**: Top-N + Kategorie-Aufteilung.
- **Mannschafts-Stunden gesamt** (eingesetzt × Dauer).
- **AS-Stunden gesamt** (Summe `mannschaft[].atemschutzDauerMin`).
- **Ölbindemittel verbraucht** (Summe `oelbindemittel.gesamtSaecke`).
- **Bereitschafts-Statistik** (Bereitschaft-Anzahl, Sonstige).
- **Lotsendienste**: Anzahl + Stundenanzahl.
- **Übungen**: Anzahl pro Übungstyp.

### 16.2 Backoffice-Dashboard

Zeigt die Statistik mit:
- Jahres-Selector (Default: aktuelles Jahr).
- Vier Kennzahlen-Kacheln (Einsätze gesamt, AS-Stunden, Übungen, Lotsendienste).
- Stichwort-Top-10-Liste.
- Monats-Verlaufs-Chart (einfache SVG, kein chart-lib).

---

## 17. Audit-Trail & Compliance

### 17.1 Was wird auditiert

`AuditEventType`:
- `login-success`, `login-failed` (mit Grund)
- `handoff-create`, `handoff-claim`, `handoff-reverse-create`, `handoff-reverse-claim`, `handoff-release`
- `einsatz-abschluss`, `einsatz-reaktivierung`
- `config-changed` (Stammdaten-Änderungen)

### 17.2 Doc-Struktur

`audit:<reverseTs>:<uuid8>`:
- `docType: "audit-event"`
- `type` (AuditEventType)
- `timestamp` (ISO)
- `actorUsername`, `actorRolle`
- `fahrzeugId`, `einsatzId` (kontextabhängig)
- `code` (bei Handoff-Events)
- `userAgent`, `ipAddress`, `details` (frei)
- `autoReleaseAt` (bei Handoff-Claim)

### 17.3 Retention

- **Minimum:** 1 Jahr (DSGVO-Anforderung).
- **Worker für Cleanup:** geplant, aber nicht in V1.0.

### 17.4 Sichtbarkeit

- Backoffice → Verwaltung → Aktivität: Liste der letzten 50 Events mit Typ-Icon, Actor, Zeitstempel.
- Klick auf Event → Details (Code, IP, User-Agent).

### 17.5 PII-Schutz

- Logger-Redact (siehe 9.4).
- IP-Adressen werden in Audit gespeichert (legitime Verarbeitung für Brute-Force-Schutz + Forensik), nicht in den Standard-Logs.
- Datenschutz-Hinweis-Dokument liegt im Repository und ist im PWA-Footer verlinkt.

---

## 18. Ausfallsicherheit & Resilienz

### 18.1 Backend-Boot

- **CouchDB-Wait-Loop:** Beim Server-Start wird `couch.info()` mit exponential backoff probiert (max 12 Versuche, 0.5 s → 8 s). Wenn CouchDB nicht erreichbar ist, läuft der API-Server **trotzdem hoch**, `/healthz` bleibt verfügbar (für fly-Health-Checks), die Routen liefern 500 — aber kein Crash.
- **Bootstrap-Admin:** Falls keine `user:*`-Docs existieren, wird einer mit `BOOTSTRAP_ADMIN_USERNAME` und gehashtem `BOOTSTRAP_ADMIN_PASSWORD` automatisch angelegt. Der Funktionär muss das Passwort nach dem ersten Login ändern.

### 18.2 Worker-Ausfallsicherheit

- **syBOS-Worker:** Fehler in einem Lauf (Netzwerk, syBOS-down, Schema-Drift) werden geloggt, der Worker macht beim nächsten Cron-Tick weiter. Letzter erfolgreicher Lauf bleibt in `services/state.ts`.
- **BlaulichtSMS-Poller:** Identisch — Fehler → log + Skip. Der nächste Poll versucht's erneut.
- **Audio-Retention:** Idempotent über Datum.

### 18.3 PWA-Ausfallsicherheit

- **Service Worker:** App-Shell ist auch ohne Netz da.
- **PouchDB:** Lokaler Schreibspeicher, läuft offline weiter.
- **Outbox** für Chronik-Broadcasts (siehe 13.).
- **Error-Boundary:** kein White-Screen-of-Death (siehe 7.9).

### 18.4 Backup & Recovery

V1.0:
- Tägliches fly-Volume-Snapshot (manuell konfiguriert).
- CouchDB hat eingebaute Replication — als Backup-Strategie genügt ein Replikat ins zweite fly-Volume oder ein externer CouchDB-Mirror.

V1.1 (geplant):
- Monatlicher Restore-Test mit Dummy-Daten.
- Off-site-Backup als Cold-Storage.

---

## 19. Security

### 19.1 Secrets

Alle Credentials werden als fly secrets gesetzt:
- `JWT_SECRET` (HS256-Key, ≥ 32 Zeichen, Pflicht)
- `COUCH_USER`, `COUCH_PASS`
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`
- `BLAULICHTSMS_CUSTOMER_ID`, `BLAULICHTSMS_USER`, `BLAULICHTSMS_PW`
- `SYBOS_TOKEN`, `SYBOS_API_URL`

Niemals als `[env]`-Entry in `fly.toml` — diese Datei ist im Git-Repo und würde die Secrets unverschlüsselt ausliefern. Migrationspfad: `flyctl secrets set NAME=value -a hotdoc-api`.

### 19.2 Rate-Limiting

Login-Endpoints (Backoffice, Tablet-PIN): 5 Fails/15 min → 30 min Block. Pro IP. In-Memory.

### 19.3 PII-Schutz im Logging

Siehe 9.4.

### 19.4 CORS, Helmet

- `helmet({ contentSecurityPolicy: false })` für sinnvolle Security-Headers (HSTS, X-Frame-Options, …).
- `cors({ origin: true, credentials: true })` — die PWAs laufen auf eigener Domain via Caddy-Proxy, das `origin: true` erlaubt Cross-Site-Tests; für strenges CORS in Produktion wäre eine Allowlist sinnvoll (V1.1).

### 19.5 Transport-Sicherheit

- Alles HTTPS via fly.
- HSTS via Helmet aktiviert.

### 19.6 Read-Only externe APIs

- BlaulichtSMS und syBOS sind **strict read-only**. Keine Write-Operationen werden implementiert (auch wenn die APIs theoretisch welche anbieten). Das ist eine harte Anforderung des Auftraggebers.

### 19.7 Externe Logo-Validierung

Nur das offizielle FF-Eberstalzell-Logo wird verwendet. Keine selbstgestalteten Annäherungen, keine SVG-Klone. Logo-Quelldatei wird vor Build im Repo gegen Hash geprüft (V1.1, manuell V1.0).

---

## 20. Konfiguration & Stammdaten

### 20.1 ENV-Variablen (Backend)

| Variable | Default | Zweck |
|---|---|---|
| `NODE_ENV` | development | Standard |
| `PORT` | 3000 | HTTP-Port |
| `COUCH_URL` | http://localhost:5984 | CouchDB-URL |
| `COUCH_USER`/`COUCH_PASS` | admin/admin | Credentials |
| `COUCH_DB` | hotdoc | DB-Name |
| `BLAULICHTSMS_*` | optional | wenn nicht gesetzt, Worker pausiert |
| `BLAULICHTSMS_POLL_INTERVAL_SEC` | 15 | |
| `SYBOS_*` | optional | wenn nicht gesetzt, Worker pausiert |
| `SYBOS_SYNC_CRON` | "0 4 * * *" | Cron-Ausdruck |
| `AUDIO_RETENTION_DAYS` | 30 | |
| `JWT_SECRET` | dev-fallback | **min 32 Zeichen, Pflicht in Produktion** |
| `SESSION_TTL_SEC` | 8h | |
| `BOOTSTRAP_ADMIN_USERNAME` | admin | |
| `BOOTSTRAP_ADMIN_PASSWORD` | admin12345678 | **muss nach Setup geändert werden** |

### 20.2 Stammdaten-Docs (in CouchDB)

| Doc | Inhalt |
|---|---|
| `config:auftragstypen` | Globale Liste der Auftrags-Typen (Defaults: 10 typ. Aufgaben) |
| `config:einsatzstichworte` | Liste `{art, kategorie, standardStufe}` (Defaults: 16 Stichworte) |
| `config:geraete` | Map `byFahrzeug.<fahrzeugId>: [{id, bezeichnung, isOelbindemittel?}]` |
| `config:stammdaten` | freie Map: `handoffAutoReleaseHours`, Heim-Koord, Versions-Info, … |
| `config:tablet-pins` | `data.pins.<fahrzeugId>: "1234"` |

**Lese-Berechtigungen:**
- Defaults sind für alle Authentifizierten lesbar.
- `tablet-pins` ist `RESTRICTED_KEYS` — nur `funktionaer+` (eine Mannschafts-Session vom Fahrzeug-Tablet darf NICHT die PINs aller anderen Fahrzeuge enumerieren).

**Schreib-Berechtigungen:**
- Alle Config-Docs: `funktionaer+`.

---

## 21. Branding & Theming

### 21.1 Farben (Design-Tokens)

Light-Mode:
- `--red: #C8102E` (FF-Brand-Rot)
- `--ok: #16A34A`
- `--warn: #D97706`
- `--info: #2563EB`
- `--surface: #fff`, `--fg: #0F172A`, …
- Border-, Tint-Varianten je Status.

Dark-Mode (für Nacht-Einsätze, hoher Kontrast):
- `--bg: #0E1116`, `--surface: #181C24`, …
- Status-Farben in heller Variante mit Alpha.

### 21.2 Schriften

- Sans: **Inter** (variabel, mit System-Fallback).
- Mono: **JetBrains Mono** (für Codes, Berichts­nummern, Audit-IDs).

### 21.3 Logo-Verwendung

Pflicht:
- Tablet-PWA: Topbar links, ErrorBoundary-Screen.
- Backoffice: Header links auf jeder Page.
- PDF: Header oben links auf jedem Bericht.
- Favicon + PWA-Manifest-Icon.

Verboten:
- Selbstgestaltete Flamme/Helm/Wappen-Vereinfachungen.
- SVG-Annäherungen.
- Farb-Modifikationen.

### 21.4 Versionierung im Footer

PWA + Backoffice: jeweils eine `version.ts` mit `APP_VERSION` und `APP_BUILD`. Im Footer der App immer sichtbar (für Support-Anfragen).

---

## 22. Build, Deploy, Betrieb

### 22.1 Lokale Entwicklung

- `pnpm install` im Root.
- `pnpm --filter @hotdoc/api dev` (Node mit tsx-watch).
- `pnpm --filter @hotdoc/pwa dev` (Vite, default Port 5173).
- `pnpm --filter @hotdoc/backoffice dev` (Vite, default Port 5174).
- CouchDB lokal: per Docker, Port 5984.

### 22.2 Tests

Mit `vitest`:
- `@hotdoc/api`: Unit-Tests für JWT, Password, syBOS-Mapper.
- `@hotdoc/shared`: keine Tests nötig (reines Schema).
- `@hotdoc/pwa`: nicht-priorisiert (Snapshot-Vermeidung).

### 22.3 Build

- `pnpm --filter @hotdoc/api build` → tsc-compile nach `dist/`.
- `pnpm --filter @hotdoc/pwa build` → Vite-Bundle nach `dist/`.
- `pnpm --filter @hotdoc/backoffice build` → analog.

### 22.4 Deploy

- `flyctl deploy --config fly.api.toml --dockerfile Dockerfile.api --remote-only`.
- `flyctl deploy --config fly.pwa.toml --dockerfile Dockerfile.pwa --remote-only`.
- `flyctl deploy --config fly.backoffice.toml --dockerfile Dockerfile.backoffice --remote-only`.
- CouchDB als statische fly-App ohne Re-Deploy (Volume bleibt).

### 22.5 Monitoring

- `flyctl logs -a hotdoc-api` für Live-Logs.
- `/healthz` als Liveness.
- `/api/admin/health` als Readiness (zeigt syBOS- und BlaulichtSMS-Last-Sync).

---

## 23. Test-Strategie

### 23.1 Unit-Tests

- **Pure-Function-Tests** für: `mapPerson`, `mapMaterial`, `buildAtemschutzSet`, `coerceId`, `buildBerichtNummer`, `parseBerichtNummer`, Haversine-Distance.
- **Auth-Tests:** Passwort-Hash + Verify, JWT-Sign + Verify, `autoReleaseAt`-Logik.

### 23.2 Integrations-Tests

- supertest gegen den Express-Server mit Mock-CouchDB.
- Smoke-Test pro Worker (syBOS-Sync-Run mit Mock-Antwort).

### 23.3 E2E

- Playwright (vorgesehen, V1.1).
- Kritische Pfade:
  - PIN-Login → Setup → Bericht-Erfassung → Abschluss.
  - Manueller Einsatz → PDF.
  - QR-Handoff.

### 23.4 Vibe-Coding-Benchmark v2.0 (Smoke-Test-Protokoll)

- 14 Module wurden in einem intensiven Smoke-Test durchgegangen.
- Status nach V1.0:
  - Module A (Auth-Flows), B (Berichte-CRUD), C (Konfig-CRUD), E (PDF), F (Chronik), G (Statistik), H (Audit) — komplett getestet.
  - **A-light** (Subset Auth) und **D** (Konfliktauflösung-UI) — als „nicht voll getestet" dokumentiert, V1.1.

---

## 24. Roadmap & bewusst nicht implementiert

### 24.1 In V1.0 nicht enthalten

- **Wasserkarte.info-Integration** (Hydranten-Layer + Backend-Cache). Ausgeklammert wegen offener Lizenzfrage.
- **Whisper-WASM-lokale-Transkription**. UI vorhanden, Backend-Fallback wäre per OpenAI verfügbar — der lokale Whisper-Layer fehlt aber noch.
- **WebPush-Benachrichtigung** an Tablets bei BlaulichtSMS-Alarm. VAPID-Keys + Service-Worker-Push-Handler wären nötig. V1.0 polled stattdessen.
- **Cleanup-Worker für Audit-Events**. Retention-Policy ist dokumentiert, der Cleanup-Lauf fehlt.
- **CouchDB-Filter-Function für Berichts­nummern-Konflikte**. Spec-Skizze in Abschnitt 12, Implementation steht aus.

### 24.2 V1.1 Kandidaten

- **Mobile-First-Erweiterung** der Backoffice-App.
- **Karten-Tile-Pre-Cache** für die ganze Gemeinde Eberstalzell (statt nur Center).
- **SSE-basierte Live-Updates** statt 8s-Polling.
- **Mehrere FFs in einer Instanz** (multi-tenant) — derzeit hart auf Eberstalzell zugeschnitten.

### 24.3 Bewusst-nicht-Anforderungen (auf Wunsch des Auftraggebers)

- Kein **Schreib-Zugriff** auf BlaulichtSMS oder syBOS.
- Kein **anderes Logo** als das offizielle FF-Eberstalzell-Logo.
- Keine **DIN-Normen** in Bericht oder UI — wir sind in Österreich (ÖNORM, OIB, TRVB).
- Keine **automatischen E-Mail-Benachrichtigungen** an Externe ohne explizite Eingabe.

---

## Anhang A — Glossar abkürzungs-zentriert

| Abk. | Bedeutung |
|---|---|
| AFKDT | Abschnitts-Feuerwehrkommando |
| AS | Atemschutz |
| ASF | Atemschutzfahrzeug |
| BFKDT | Bezirks-Feuerwehrkommando |
| BMA | Brandmeldealarm |
| BWST | Bezirkswarnstelle |
| DLK | Drehleiter-Kran |
| FF | Freiwillige Feuerwehr |
| GSF | Gerätewagen Sonderfahrzeug |
| HEU | Heu-Bergegerät |
| HR-Anh. | Höhenretter-Anhänger |
| KDO | Kommandofahrzeug |
| LFA-B | Löschfahrzeug A-B (Pumpe) |
| LWZ | Landeswarnzentrale |
| MTF | Mannschafts-Transport-Fahrzeug |
| OEL | Oeleinheit / Schadstoffeinheit |
| PA | Pressluftatmer |
| RAG | Rohöl-Aufsuchungs-Gesellschaft |
| RK | Rotes Kreuz |
| SRF | Schadstoff-Rüstfahrzeug |
| STM | Straßenmeisterei |
| TLF-A 4000 | Tanklöschfahrzeug, 4000 l Wasser |
| TMB | Teleskop-Mast-Bühne |
| VU | Verkehrsunfall |

## Anhang B — HTTP-Statuscode-Konvention (zusammengefasst)

| Code | Bedeutung in HotDoc |
|---|---|
| 200 | OK (inkl. Idempotenz-Treffer wie deduped Chronik) |
| 201 | Created (manueller Einsatz) |
| 204 | No Content (z. B. DELETE) |
| 400 | Body-Validation fehlgeschlagen (Zod-Issues im `details`-Feld) |
| 401 | `missing_authorization` / `invalid_token` / `invalid_credentials` / `invalid_pin` |
| 403 | `insufficient_role` (mit `required`) |
| 404 | Doc nicht gefunden (`einsatz_not_found`, `code_not_found`) |
| 409 | Konflikt: `already_closed` / `not_closed` / Berichts­nummer-Konflikt |
| 410 | Handoff abgelaufen oder schon claimed (`expired`, `already_claimed`) |
| 423 | Schreibschutz aktiv (`schreibschutz_aktiv`) |
| 429 | Rate-Limit überschritten (mit `retryAfterMinutes`) |
| 500 | Interner Fehler / unerwartete Schema-Invalidität |

## Anhang C — Doc-ID-Beispiele

```
einsatz:31337                       (BlaulichtSMS-Alarm-ID = 31337)
einsatz:manuell-a3f8…               (manuell, UUID-Anteil)
einsatz:lotsendienst-…              (Lotsendienst)
einsatz:uebung-…                    (Übung)

fzgber:31337:lfa-b                  (Pumpe-Bericht zum Alarm 31337)
fzgber:manuell-a3f8…:tlf-a-4000     (Tank-Bericht zum manuellen Einsatz)

person:42                           (syBOS-Personal-ID 42)
material:117                        (syBOS-Material-ID 117)

handoff:K9P7Q2NX                    (Notfall-Übergabe-Code)

audit:9007199254730816:e8a3f201     (Audit-Event, reverse-ts)

config:tablet-pins                  (Stammdaten-Doc)
fahrzeug:self                       (nur lokal in PouchDB, Tablet-Konfig)
```

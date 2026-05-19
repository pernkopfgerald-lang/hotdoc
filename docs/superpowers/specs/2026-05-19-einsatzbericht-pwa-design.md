# Design: Einsatzbericht-PWA für FF Eberstalzell (UC2)

**Version:** 1.0
**Datum:** 2026-05-19
**Status:** Design-Entwurf, bereit für Implementierungsplan
**Auftraggeber:** Freiwillige Feuerwehr Eberstalzell, Solarstraße 1, 4653 Eberstalzell
**Ansprechperson & Entwickler:** Gerald Pernkopf · gerald.pernkopf@ff-eberstalzell.at
**Use Case:** UC2 — Digitale Einsatzberichte auf Fahrzeug-Tablets

---

## 1. Zusammenfassung

Eine offline-fähige Progressive Web App (PWA), die auf fünf Android-Tablets läuft (vier Fahrzeuge + Einsatzzentrale) und den heutigen papierbasierten Einsatzbericht ablöst. Im Einsatz wird komplett offline gearbeitet; Sync mit dem zentralen Backend findet ausschließlich in der Fahrzeughalle über WLAN statt. Alarmdaten werden aus BlaulichtSMS vorausgefüllt, Personal und Material aus syBOS gesynct, der finale Bericht wird als PDF erzeugt und über einen „Spickzettel-Modus" manuell in syBOS übertragen.

UC0 (Tätigkeitsnachweise) und UC1 (Anwesenheitserfassung im FF-Haus) sind **explizit Out-of-Scope** dieser Iteration.

---

## 2. Beteiligte und Rollen

| Rolle | Tablet | Funkrufname | Besatzung | Aufgabe |
|---|---|---|---|---|
| Fahrzeug-Kdt. KDO | KDO-Tablet | **Kommando Eberstalzell** | 1+3 (4 Sitzpl.) | erfasst Fahrzeugbericht KDO |
| Fahrzeug-Kdt. TLF-A 4000 | TLF-Tablet | **Tank Eberstalzell** | 1+7 (8 Sitzpl.) | erfasst Fahrzeugbericht TLF |
| Fahrzeug-Kdt. LFA-B | LFA-B-Tablet | **Pumpe Eberstalzell** | 1+7 (8 Sitzpl.) | erfasst Fahrzeugbericht LFA-B |
| Fahrzeug-Kdt. MTF | MTF-Tablet | **MTF Eberstalzell** | 1+8 (9 Sitzpl.) + Anhänger | erfasst Fahrzeugbericht MTF, ggf. HR- oder PKW-Anhänger |
| Einsatzleiter | Zentrale-Tablet | **Florian Eberstalzell** | — | erfasst Hauptbericht, sieht alle Fahrzeugberichte live (sobald gesynct) |
| Bearbeiter (Funktionär) | Zentrale-Tablet / Browser | — | — | schließt Bericht ab, generiert PDF, überträgt nach syBOS |

**Keine personalisierten Logins.** Jedes Tablet ist auf ein Fahrzeug konfiguriert (einmaliger Setup); wer das Tablet bedient, wählt sich aus der Personalliste als Fahrer / Fahrzeug-Kdt. / Mannschaft.

**Diktat-Quelle ist der Funkrufname, nicht die Person.** Sowohl Fahrzeugkommandant als auch Kraftfahrer (oder beliebige andere Person im Fahrzeug) können das Diktat-Mikrofon nutzen. In der Chronik wird der Eintrag mit dem taktischen Funkrufnamen des Fahrzeugs ausgewiesen — die genaue Person dahinter wird **nicht** unterschieden. Das entspricht dem FF-Funksprech-Stil („Tank Eberstalzell – Brand aus") und ist realitätsnah für die spätere Nachbearbeitung.

---

## 3. Anforderungen

### 3.1 Funktionale Anforderungen

**FR-1 — Alarm-Auslösung**
Bei eingehendem Alarm (BlaulichtSMS) öffnet die App auf allen Tablets automatisch das Einsatzformular, vorausgefüllt mit BlaulichtSMS-Daten (Einsatzort, Koordinaten, Zeit, Audio).

**FR-2 — Fahrzeug-Kurzbericht (auf Fahrzeug-Tablets)**
Auf dem Fahrzeug-Tablet erfasst der Fahrzeug-Kdt. (oder Kraftfahrer) einen **kompakten** Fahrzeug-Kurzbericht: Fahrer, Fahrzeug-Kdt., Mannschaft (Anzahl der Plätze je Fahrzeug — siehe Tabelle in Kapitel 2) mit individueller **Atemschutz-Markierung pro Person**, KM-Stand Abfahrt, eingesetzte Geräte (gefiltert auf das Fahrzeug), Tätigkeitsbericht (Freitext / Diktat). KM-Rückkehr und Endzeit kommen beim Einrücken dazu. Layout siehe Anhang A.

**Besatzungs-Konvention:** Die FF-Konvention „1+X" bedeutet im UI: 1 Fahrzeug-Kdt. (Pflicht) + 1 Fahrer (Pflicht) + (X−1) zusätzliche Mannschaftsplätze.

| Fahrzeug | Besatzungs-Typ | Mannschaftsplätze im UI |
|---|---|---|
| KDO | 1+3 | 2 |
| TLF-A 4000 | 1+7 | 6 |
| LFA-B | 1+7 | 6 |
| MTF | 1+8 | 7 |

**Anhänger (nur MTF):** Auf dem MTF-Tablet erscheinen zwei zusätzliche Checkboxen — „HR-Anhänger mitgenommen" und „PKW-Anhänger mitgenommen". Diese werden im Fahrzeugbericht-MTF gespeichert und im Hauptbericht-Fahrzeug-Checkliste automatisch übernommen.

**Atemschutz-Erfassung (Detail)**
Pro Mannschaftsplatz (sowie für Fahrer und Fahrzeug-Kdt., falls relevant) gibt es einen AS-Toggle. Wird er aktiviert, erscheint ein Zeit-Counter mit **Default 15 Minuten** Einsatzdauer. Der Counter ist über **+ / − Buttons** in **5-Minuten-Schritten** anpassbar (Min. 5 Min., Max. 60 Min. — letzteres entspricht etwa zwei PA-Flaschen). Wenn der Toggle deaktiviert wird, verschwindet der Counter und der Zeitwert wird verworfen.

**FR-3 — Hauptbericht (auf Zentrale-Tablet „Florian Eberstalzell")**
Auf dem Zentrale-Tablet erfasst der Einsatzleiter den **vollumfänglichen** Einsatzbericht mit allen Feldern gemäß heutigem Papierformular: Einsatzort, Datum/Uhrzeit, Pflichtbereich-Flags, Alarmierungs-Quelle, Anrufer, Fahrzeug-Checkliste, Einsatzart (28 Checkboxen + Freitext), Zeitmarken (Lage unter Kontrolle, Brand AUS, Alst. 2, Alst. 3), beteiligte Stellen (Polizei, RK, BFKDT, AFKDT, …), sonstige anwesende FF, Mannschaftszahlen, Verrechnung, Ölbindemittel, „Meldung von der Einsatzleitung", Einsatzleiter, Einsatzende, Bearbeiter. Layout siehe Anhang B.

Die beiden Berichtstypen sind **bewusst unterschiedlich strukturiert** — der Fahrzeug-Kurzbericht ist auf die im Einsatz schnell erfassbaren Daten reduziert, der Hauptbericht der Einsatzzentrale enthält alle einsatzübergreifenden Felder.

**FR-4 — Diktat / Einsatzchronik**
Jedes Tablet kann während des Einsatzes Sprachnotizen mit Zeitstempel aufnehmen, die offline transkribiert werden (Whisper.cpp). Die Chronik erscheint im fertigen Bericht und im Spickzettel. Diktat-Einträge werden mit dem **taktischen Funkrufnamen** des Tablet-Fahrzeugs ausgewiesen (z.B. „Tank Eberstalzell", „Florian Eberstalzell"); Fahrzeug-Kdt. und Kraftfahrer werden dabei nicht unterschieden.

**FR-5 — Aggregation**
Mannschaftszahlen im Hauptbericht („Eingesetzt") werden automatisch aus den Fahrzeugberichten summiert. „Bereitschaft" und „Sonstige" sind manuelle Felder.

**FR-6 — Bericht-Abschluss**
Wenn alle Fahrzeugberichte abgeschlossen sind, kann der Einsatzleiter den Einsatz gesamt abschließen. Backend generiert PDF + Spickzettel-JSON.

**FR-7 — PDF-Ausgabe**
Das PDF folgt der Struktur der heutigen Papierformulare: **Seite 1+ Hauptbericht** (Layout wie Anhang B), gefolgt von je einer Seite **Fahrzeug-Kurzbericht** pro eingesetztem Fahrzeug (Layout wie Anhang A), abschließend die **Einsatzchronik** mit Zeitstempeln und Funkrufnamen. Layout: A4 hochkant, 1:1 zum heutigen Papier-Workflow, damit Bearbeiter/Einsatzleiter visuell wiedererkennen.

**FR-8 — syBOS-Spickzettel**
Ein zweites Output-Format (HTML oder PDF) zeigt die Pflichtfelder in der Reihenfolge der syBOS-Einsatz-Eingabemaske, damit der Bearbeiter sie effizient abtippen kann. PDF ist als Anhang an den syBOS-Eintrag gedacht.

### 3.2 Nicht-funktionale Anforderungen

**NFR-1 — Offline-Vertrag**
Während des Einsatzes (Ausrücken → Einrücken) macht die App **keine** Netzwerkanfragen. Alle Stammdaten sind lokal verfügbar; alle Eingaben werden lokal persistiert.

**NFR-2 — Sync-Zeitpunkte**
Sync findet ausschließlich statt: (a) bei WLAN-Verfügbarkeit in der Halle, (b) auf manuellen Trigger des Funktionärs.

**NFR-3 — Robustheit**
Jede einzelne Tastatureingabe / Auswahl wird sofort in PouchDB persistiert (kein „Speichern"-Button erforderlich). Stromausfall, App-Crash, Tablet-Neustart dürfen zu **null** Datenverlust führen.

**NFR-4 — Reaktionszeit**
Diktat-Aufnahme startet < 500 ms nach Knopfdruck. Transkription läuft im Web Worker, blockiert das UI nicht.

**NFR-5 — Datenschutz**
- DSGVO-konform: Hosting in EU (fly.io Region `fra`).
- Audio-Aufnahmen werden 30 Tage nach Einsatzabschluss automatisch gelöscht.
- Personenbezug der Mannschaftslisten bleibt im Bericht (rechtliche Aufbewahrungspflicht).

**NFR-6 — Wartbarkeit**
Stack auf TypeScript / Node.js / React aufsetzen — vertraute Technologien beim Ansprechperson-Entwickler, damit langfristige Wartbarkeit gegeben ist.

---

## 4. Architektur

```
                   ┌─────────────────────────────────────────────┐
                   │  ALARMIERUNG durch BWST / LWZ               │
                   └────────────────────┬────────────────────────┘
                                        ▼
                   ┌─────────────────────────────────────────────┐
                   │  BlaulichtSMS  (externes System)            │
                   └────────────────────┬────────────────────────┘
                                        │ Polling alle 15s
                                        ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │  BACKEND (fly.io, Frankfurt)                                    │
        │  ─────────────────────────────────────────────────────          │
        │  ├── BlaulichtSMS-Poller       → schreibt Alarme in CouchDB     │
        │  ├── syBOS-Stammdaten-Sync     → 1×/Tag, schreibt in CouchDB    │
        │  ├── Replication-Endpoint      ← → PouchDB-Tablets              │
        │  ├── PDF-Generator (Puppeteer) → Hauptbericht + Fahrzeugber.    │
        │  ├── Spickzettel-Generator     → HTML/PDF für syBOS-Eingabe     │
        │  └── Transcript-Fallback       → OpenAI Whisper API, optional   │
        │                                                                 │
        │  Apache CouchDB als Master-DB (Persistent Volume)               │
        └────────────────────────┬────────────────────────────────────────┘
                                 │ WebPush (in Halle) + Replication
                ┌────────────────┼────────────────┬───────────────┐
                ▼                ▼                ▼               ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │ KDO-Tablet   │ │ TLF-Tablet   │ │ LFA-B-Tablet │ │ ZENTRALE     │
        │ "Kommando    │ │ "Tank        │ │ "Pumpe       │ │ "Florian     │
        │  Eberstalz." │ │  Eberstalz." │ │  Eberstalz." │ │  Eberstalz." │
        │ PWA+PouchDB  │ │ PWA+PouchDB  │ │ PWA+PouchDB  │ │ PWA+PouchDB  │
        │ + Whisper    │ │ + Whisper    │ │ + Whisper    │ │ + Whisper    │
        └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

        (MTF-Tablet "MTF Eberstalzell" identisch wie die anderen Fahrzeug-Tablets,
         hier weggelassen)
```

### 4.1 Komponentenbeschreibung

**PWA (Tablet-Client)**
- Läuft im Android-Chrome, installierbar als Home-Screen-App
- Lokale PouchDB persistiert Stammdaten + den aktuellen Einsatz
- Service Worker für PWA-Shell-Cache, WebPush und Whisper-Modell-Cache
- Whisper.cpp via WASM für offline Transkription

**Backend (fly.io, Node.js + Express)**
- HTTP-API für Tablet-Replikation (CouchDB-Replication-Protokoll)
- Worker für BlaulichtSMS-Polling (Cronjob, alle 15s)
- Worker für syBOS-Stammdaten-Sync (täglich 04:00)
- PDF-Generator on-demand (Puppeteer headless)
- WebPush für Alarm-Notifications

**CouchDB**
- Master-DB für Alarme, Einsätze, Stammdaten, Logs
- Konflikt-Resolution: standard MVCC + Custom-Logik für definierte Felder
- Persistent Volume auf fly.io

---

## 5. Datenmodell

### 5.1 Entitäten und Beziehungen

```
EINSATZ (zentral angelegt aus Alarm)
  ├── alarmId, einsatzort, koordinaten, alarmierungZeit, audioUrl
  ├── einsatzart, pflichtbereich, alarmiertDurch, einsatzauftragVia
  ├── zeitmarken: { lageUnterKontrolle, brandAus, alst2, alst3 }
  ├── beteiligteStellen[], sonstigeAnwesendeFF
  ├── mannschaft: { eingesetzt (aggregiert), bereitschaft, sonstige }
  ├── verrechnung: { verrechenbar, rechnungsadresse }, oelbindemittel
  ├── meldungEinsatzleitung (Freitext)
  ├── einsatzleiter, bearbeiter (Person-Refs)
  ├── status: 'aktiv' | 'abgeschlossen'
  └── chronik[]  ← Einsatzchronik (siehe 5.2)

  1:N
  ▼

FAHRZEUGBERICHT (1 pro eingesetztem Fahrzeug)
  ├── einsatzId (FK)
  ├── fahrzeugId
  ├── zeit: { von, bis }
  ├── km: { abfahrt, rueckkehr }
  ├── fahrer, fahrzeugKdt (Person-Refs)
  ├── mannschaft[]: 0..N Plätze (N = Fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich)
  │     {
  │       slot: 1..N,                ← Reihenfolge wie im Papierformular
  │                                     (KDO: 1..2, TLF/LFA-B: 1..6, MTF: 1..7)
  │       personId,
  │       atemschutzAktiv: bool,
  │       atemschutzDauerMin?: number  ← nur wenn atemschutzAktiv=true
  │                                     Default 15, Schritte à 5, Range 5..60
  │     }
  ├── anhaengerMitgenommen?: string[]  ← nur MTF, z.B. ["HR-Anhaenger"]
  ├── geraete[]: { materialId, anzahl?, bemerkung? }
  ├── taetigkeitsbericht (Freitext + verlinkte Chronik-Einträge)
  ├── fotos[]: { blobId, beschreibung }
  └── status: 'in_arbeit' | 'abgeschlossen'

STAMMDATEN (aus syBOS, lokal gecacht):

PERSON
  ├── id (syBOS-Personal-ID)
  ├── nachname, vorname, dienstgrad
  ├── mobil1, mobil2, email
  ├── funktionen[]
  ├── atemschutzGueltig (aus PersUeberpruefung-API abgeleitet)
  └── aktiv (Filter)

FAHRZEUG (Konfiguration, lokal)
  ├── id, bezeichnung, kurz
  ├── funkrufname              ← taktischer Funkrufname für Chronik-Anzeige
  │                              z.B. "Tank Eberstalzell"
  ├── besatzung: {
  │     typ: "1+3" | "1+7" | "1+8",          ← informativ
  │     gesamtSitzplaetze: number,            ← inkl. Kdt + Fahrer
  │     mannschaftsplaetzeZusaetzlich: number ← UI-relevant
  │   }
  ├── kannAnhaengerMitnehmen?: string[]       ← optional, z.B.
  │                              ["HR-Anhaenger", "PKW-Anhaenger"]  (nur MTF)
  └── geraeteIds[]             ← welche Geräte sind auf diesem Fahrzeug verlastet

MATERIAL (aus syBOS)
  ├── id (syBOS-Material-ID)
  ├── bezeichnung, klasse1, klasse2, klasse3
  ├── watCode
  └── fahrzeugId?  ← optional, falls in syBOS gepflegt
```

### 5.2 Einsatzchronik

```
CHRONIK-EINTRAG
  ├── id
  ├── zeitstempel       ← exakt der Moment des Aufnahme-Knopf-Drucks
  ├── fahrzeugId        ← welches Tablet diktiert hat (technische ID)
  │                       Anzeige in UI/PDF: Fahrzeug.funkrufname
  │                       z.B. "Tank Eberstalzell", "Florian Eberstalzell"
  ├── typ: 'diktat' | 'manuell' | 'auto-blaulichtsms'
  ├── audioBlobId?      ← bei Diktat: Audio im lokalen Storage
  ├── transkript?       ← gefüllt sofort (Whisper) oder beim Sync-Fallback
  ├── transkriptStatus: 'pending' | 'verfügbar' | 'manuell-korrigiert'
  └── tags?[]           ← V1.1: Auto-Extraktion ('brand-aus', 'lage-uK', …)

Hinweis: Es wird KEINE Person als Diktat-Autor gespeichert. Sowohl
Fahrzeug-Kdt. als auch Kraftfahrer (oder jede andere Person im Fahrzeug)
darf diktieren. Quelle ist allein der Funkrufname des Tablet-Fahrzeugs.
```

### 5.3 CouchDB-Dokumentschema

Document-Typ als `type`-Feld pro Dokument:

```
{ "_id": "einsatz:<alarmId>",         "type": "einsatz",         ... }
{ "_id": "fzgber:<einsatzId>:<fzg>",  "type": "fahrzeugbericht", ... }
{ "_id": "person:<syBosId>",          "type": "person",          ... }
{ "_id": "material:<syBosId>",        "type": "material",        ... }
{ "_id": "fahrzeug:<id>",             "type": "fahrzeug",        ... }
{ "_id": "audio:<uuid>",              "type": "audio",           "_attachments": {...} }
```

CouchDB-Views:
- `einsaetze/aktiv` → alle Einsätze mit `status=aktiv`
- `fzgberichte/by_einsatz` → Fahrzeugberichte eines Einsatzes
- `personal/aktiv` → aktive Personen, sortiert nach Nachname
- `material/by_fahrzeug` → Material gefiltert nach `fahrzeugId`

---

## 6. Workflow

```
1. ALARMIERUNG
   ─────────────
   BlaulichtSMS → Backend pollt → legt Einsatz in CouchDB an
   Backend sendet WebPush an alle Tablets
   (Tablets sind in der Halle → WLAN da → Push kommt an)

2. AUSRÜCKUNG
   ─────────────
   Tablets öffnen automatisch das Einsatzformular
   Vorausgefüllt: Einsatzort, Datum/Zeit, Audio
   Fahrzeug-Kdt. wählt Mannschaft + Fahrer aus lokaler Personalliste
   KM-Stand Abfahrt
   → ab hier: Fahrzeug verlässt die Halle, kein Netz mehr

3. WÄHREND EINSATZ (offline)
   ─────────────────────────
   • Geräte ankreuzen (vorgefiltert auf Fahrzeug)
   • Diktat-Knopf für Chronik-Einträge (Zeitstempel + Transkript via Whisper)
   • Tätigkeitsbericht ergänzen
   • Fotos optional
   • Auf Zentrale-Tablet: Einsatzleiter erfasst Hauptbericht-Felder
     (Einsatzart, Pflichtbereich, Zeitmarken, Verrechnung, …)
   Alle Eingaben → lokal persistiert in PouchDB

4. EINRÜCKEN
   ─────────
   KM-Stand Rückkehr, Endzeit
   Fahrzeug-Kdt. drückt „Fahrzeugbericht abschließen"

5. IN HALLE — SYNC
   ────────────────
   WLAN erkannt → PouchDB ↔ CouchDB Replikation läuft automatisch
   • Push: abgeschlossene Fahrzeugberichte + Chronik + Audios
   • Pull: ggf. Daten anderer Tablets (z.B. neue Hauptbericht-Felder)
   Backend: Whisper-Fallback transkribiert noch nicht erkannte Audios

6. ABSCHLUSS
   ─────────
   Wenn alle Fahrzeugberichte abgeschlossen sind:
   Einsatzleiter drückt „Einsatz abschließen"
   → Backend generiert PDF (Hauptbericht + Fahrzeugberichte + Chronik)
   → Backend generiert syBOS-Spickzettel
   Bearbeiter öffnet PDF, druckt + heftet ab
   Bearbeiter öffnet Spickzettel + syBOS und tippt die Pflichtfelder ein,
     hängt PDF als Anhang an
```

---

## 7. Sync-Strategie (Offline-Vertrag im Detail)

| Trigger | Was passiert |
|---|---|
| App-Start in Halle, WLAN da | Pull-Replikation: neue Stammdaten, neue Alarme, ggf. Daten anderer Tablets |
| WebPush „neuer Alarm" empfangen | Tablet zieht den frischen Einsatz, öffnet Formular |
| Eingabe auf Tablet | Sofort in PouchDB persistiert. KEINE Server-Anfrage. |
| WLAN-Wiederherstellung (z.B. nach Einsatzrückkehr) | Auto-Push abgeschlossener Berichte + Chronik + Audios |
| Backend hat neue Daten (z.B. anderes Tablet hat seinen Fzg.-Bericht abgeschickt) | Live-Pull über CouchDB-Continuous-Replication |
| Manueller Sync-Trigger (Setup-Screen) | Voll-Pull für Stammdaten-Refresh |

**Network-Detection:**
Tablet erkennt Netzwerk via `navigator.onLine` + Heartbeat-Ping ans Backend (nur wenn `onLine=true`). Während des Einsatzes ist Sync **explizit deaktiviert** (Flag in App-Settings: „Einsatz-Modus aktiv → kein 4G-Sync"). Aktivierung erfolgt automatisch wenn ein aktiver Einsatz offen ist und das Tablet die Halle verlässt (Heuristik: WLAN-SSID-Wechsel oder GPS-Distanz).

### 7.1 Konfliktauflösung

| Konflikt-Szenario | Häufigkeit | Lösung |
|---|---|---|
| Fahrzeug-Tablet schreibt eigenen Fzg.-Bericht | nie | nicht zutreffend, exklusiver Schreibzugriff |
| Zwei Personen am Zentrale-Tablet gleichzeitig | sehr selten | last-write-wins |
| Einsatzleiter + Zentrale-Tablet editieren denselben Hauptbericht von zwei Orten | selten | CouchDB MVCC, manueller Merge im Konfliktfall (UI zeigt Diff) |
| Stammdaten-Konflikt (Backend & Tablet ändern dasselbe) | nie | Tablet-Schreiben für Stammdaten ist verboten — nur Backend schreibt |

---

## 8. BlaulichtSMS-Integration

### 8.1 Polling

- Worker auf fly.io ruft alle 15 s `POST /api/alarm/v1/list` mit Customer-ID + Username + Password (aus fly secrets) ab.
- Vergleicht mit lokalem letzten `alarmId` → nur neue Alarme verarbeiten.
- Bei neuem Alarm: Detail-Pull `POST /api/alarm/v1/query?alarmId=<id>` für vollständige Daten inkl. `audioUrl`.

### 8.2 Mapping in das eigene Datenmodell

| BlaulichtSMS-Feld | Eigenes Feld |
|---|---|
| `alarmId` | `einsatz.alarmId` (eindeutiger Schlüssel) |
| `alarmDate` | `einsatz.alarmierungZeit` |
| `geolocation.address` | `einsatz.einsatzort` |
| `geolocation.coordinates` | `einsatz.koordinaten` |
| `authorName` | Heuristik → `einsatz.alarmiertDurch` (BWST/LWZ) |
| `alarmText` | Heuristik → `einsatz.einsatzart` (Vorschlag, editierbar) |
| `audioUrl` | Backend lädt Audio einmalig herunter, speichert als Attachment am Einsatz-Dokument, wird mit-synct |
| `recipients` | **NICHT** für Mannschafts-Mapping verwendet (User-Entscheidung). Nur als Audit-Information gespeichert. |
| `indexNumber` | informativ, im Bericht-Header |

### 8.3 Audio-Caching

- Backend lädt Audio sofort beim Alarm-Empfang herunter (während die Tablets noch in der Halle online sind).
- Audio wird als CouchDB-Attachment am Einsatz-Dokument gespeichert.
- Replikation überträgt das Attachment automatisch zu den PouchDB-Tablets.
- Tablets können das Audio offline abspielen.

---

## 9. Transkription / Diktat

### 9.1 Frontend (in Tablet)

- Bibliothek: **whisper.cpp** als WASM-Modul (oder alternativ `transformers.js` Whisper)
- Modell: **`whisper-base`** (~150 MB) als Standardwahl
  - Bei Performance-Problemen Fallback auf `whisper-tiny` (~75 MB)
  - Bei Bedarf an höherer Qualität optional `whisper-small` (~500 MB)
- Modell wird beim ersten Start in der Halle heruntergeladen, im Cache abgelegt
- Ausführung im Web Worker (UI bleibt responsiv)
- Sprache: Deutsch (`de`)

### 9.2 Workflow

```
1. User drückt Mikrofon-Knopf
2. MediaRecorder zeichnet Audio auf (WebM/Opus)
3. User lässt los oder drückt Stopp
4. Zeitstempel = Aufnahme-Start
5. Audio wird als Blob in PouchDB persistiert
6. Web Worker startet Whisper-Transkription parallel
7. Sobald fertig: Transkript wird ins Chronik-Dokument geschrieben
   → UI aktualisiert sich reaktiv
8. Falls Whisper fehlschlägt (Modell-Ladefehler, OOM):
   → Eintrag erhält "🎤 Audio · Transkription fehlgeschlagen"
   → Audio bleibt erhalten, Backend transkribiert beim Sync nach
```

### 9.3 Backend-Fallback

- Wenn ein Audio mit Status `pending` synct wird, transkribiert ein Backend-Worker via OpenAI Whisper API (oder selbst gehostet whisper-large)
- Resultat wird zurück in CouchDB geschrieben → repliziert zu allen Tablets

### 9.4 Performance-Spike

**Risiko:** Whisper-Performance auf den konkret eingesetzten Android-Tablets ist nicht garantiert. Es muss **vor dem MVP-Bau** ein technischer Spike erfolgen:
1. Whisper.cpp WASM-Demo auf einem der echten Tablets laden
2. 30-sekundiges deutsches Diktat aufnehmen + transkribieren
3. Latenz und CPU-Last messen
4. Entscheidung: `base` oder `tiny`, oder Backend-Only

---

## 10. syBOS-Übergabe

### 10.1 PDF

Generiert vom Backend mit Puppeteer aus **zwei HTML-Templates**, die die heutigen Papierformulare 1:1 nachbilden:

**Template „Hauptbericht" (Anhang B)** — vom Zentrale-Tablet „Florian Eberstalzell" erfasst:
- Header mit FF-Eberstalzell-Logo, „Einsatzbericht"-Titel, Einsatzort, Datum/Uhrzeit
- Pflichtbereich, Einsatzzone, Überörtliche Hilfeleistung, Alarmierungsquelle (BWST/LWZ)
- Einsatzauftrag-Quelle (WAS / Funk / Telefon / Bote / Behörde), Anrufer + Tel.
- Fahrzeug-Checkliste (KDO, TLF-A 4000, LFA-B, PKW-Anhänger, MTF, HR-Anhänger, Stapler)
- Einsatzart (28 Checkboxen + Freitext + Warn-/Alarmsystem-Nr.)
- Zeitmarken (Lage unter Kontrolle, Brand AUS, Alst. 2, Alst. 3 mit Anforderer)
- Beteiligte Stellen (Polizei, RK, BFKDT, AFKDT, Gem., BH, GAS, Ener.AG, RAG, Arzt, Bestatt., STM)
- Sonstige anwesende Feuerwehren (OEL, Kran, TMB, SRF, ASF, DLK, GSF, HEU, Sonstige)
- Mannschaft (Eingesetzt aggregiert, Bereitschaft, Sonstige, Gesamt)
- Verrechenbarkeit + Rechnungsadresse, Ölbindemittel
- Freitext „Meldung von der Einsatzleitung"
- Footer: Einsatzleiter, Einsatzende, Bearbeiter, Unterschrift

**Template „Fahrzeug-Kurzbericht" (Anhang A)** — vom jeweiligen Fahrzeug-Tablet erfasst, eine Seite pro eingesetztem Fahrzeug:
- Layout deutlich kompakter als der Hauptbericht
- Konkrete Feldliste wird vor Implementierungsstart finalisiert (User liefert nach)
- Aktueller Stand basiert auf dem bestehenden Papier-Fahrzeugdatenblatt:
  Einsatzort, Datum, Uhrzeit von/bis, Fahrzeug, Kilometer, Fahrer, Fahrzeug-Kdt.,
  Mannschaft (7 Plätze mit AS-Markierung), Geräte/Mittel, Tätigkeitsbericht

**Einsatzchronik (letzte Seite[n])** — chronologisch sortiert mit Zeitstempel und Funkrufname-Quelle.

**Foto-Anhänge** — wenn vorhanden, am Ende als separater Anhang.

### 10.2 Spickzettel

HTML-Seite (mit Druck-Option), die die Pflichtfelder in der Reihenfolge der syBOS-Einsatz-Eingabemaske zeigt. Beispiel:

```
EINSATZ-ANLAGE IN SYBOS
———————————————————————
1. Einsatzort:           Eberstalzeller Str. 5
2. Datum:                19.05.2026 17:43
3. Einsatzart:           Brand KFZ
4. Pflichtbereich:       JA
5. Alarmierungsquelle:   BWST
6. Mannschaft:           Eingesetzt 8 · Bereitschaft 0 · Sonstige 0
7. Zeitmarken:
   Lage unter Kontrolle: 17:55
   Brand AUS:            18:32
…

ANHANG:  Einsatzbericht_2026-014.pdf  [Download]
```

Der Bearbeiter öffnet syBOS in einem zweiten Browser-Tab, hangelt sich durch die Liste, kopiert Werte und hängt am Ende das PDF an.

### 10.3 Zukunftsausblick (V1.1+)

Halbautomatischer Playwright-Bot, der die Spickzettel-Felder direkt in syBOS einträgt. Setzt formelle Klärung mit SOLARYS voraus.

---

## 11. Tech-Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Tablet-Frontend | React 18 + Vite + TypeScript | Brandmeister-kompatibel, schnelle Build-Zeit |
| UI-Komponenten | TailwindCSS + shadcn/ui | Pragmatischer Standard, gute Tablet-UX |
| Lokale DB | PouchDB | Bewährte Offline-Sync, IndexedDB-basiert |
| PWA-Shell | Service Worker + Workbox | App-Shell-Cache, WebPush, Modell-Cache |
| Transkription | whisper.cpp WASM (Modell `base`) | Offline-fähig |
| Backend | Node.js 20 + Express + TypeScript | Brandmeister-Stack-konsistent |
| DB | Apache CouchDB | Konflikt-Resolution out-of-the-box |
| PDF | Puppeteer (Headless Chrome) | Pixelgenaue PDFs aus HTML-Vorlagen |
| Hosting Backend | fly.io Region `fra` | EU-DSGVO, Docker-nativ, persistent volumes |
| Hosting CouchDB | fly.io Volume | im selben Netzwerk wie Backend |
| Hosting PWA | Vercel oder fly.io static | CDN, schnelles Ausliefern |
| WebPush | web-push (npm) + VAPID-Keys | offener Standard, ohne Drittanbieter |

---

## 12. Pre-Launch-Checkliste

Diese Punkte müssen vor Produktiv-Start geklärt sein:

1. **syBOS-Personal-Pflege:** Alle aktiven Mitglieder müssen in syBOS als „veröffentlicht" markiert sein, sonst tauchen sie nicht in der App auf.
2. **syBOS-API-Token aktiviert** für die Server-IP von fly.io (siehe Handbuch Kapitel 3.1 — Domain + IP-Ermitteln).
3. **BlaulichtSMS-Credentials** beschafft (CustomerId, Username, Password).
4. **Fahrzeug-Konfigurationen:** Pro Tablet eine Setup-Sequenz, in der Funktionär das Fahrzeug auswählt und die Geräte-Liste vom Fahrzeug pflegt.
5. **Whisper-Performance-Spike:** Tests auf den konkret eingesetzten Android-Tablets bestanden.
6. **WLAN in Halle:** ausreichende Abdeckung, dass alle Tablets verbindbar sind.
7. **Datenschutz-Hinweis** für Mitglieder: Welche Daten werden wie lange gespeichert, Audio 30 Tage.
8. **Schulung:** Einsatzleiter + Fahrzeug-Kdt. erhalten eine kurze Einweisung (30 min, mit echtem Übungs-Alarm).

---

## 13. Out-of-Scope (V1.0)

Diese Punkte sind bewusst **nicht** Teil des MVP und werden in späteren Versionen evaluiert:

- **UC0** Tätigkeitsnachweise / Pflichtstunden-Tracking
- **UC1** Anwesenheitserfassung im FF-Haus
- **Auto-Extraktion** strukturierter Daten aus der Chronik („Brand aus 18:32" → automatische Befüllung des Brand-AUS-Feldes)
- **Karten-Anzeige** Einsatzort offline (gecachte Tiles)
- **Foto-Anhänge** mit Vor-Ort-Annotation (Pfeile, Marker)
- **Halbautomatischer Playwright-Bot** für syBOS-Eintrag
- **Microsoft AD / Azure SSO** für Backoffice (kommt mit Brandmeister V1.1-Welle)
- **Echtzeit-Lagedarstellung** auf Zentrale-Tablet (Tracking, wo welches Fahrzeug ist)
- **Push-Benachrichtigung an Funktionäre** über abgeschlossene Berichte
- **Statistik-Dashboard** für Jahresauswertung (kommt ggf. mit UC0)

---

## 14. Risiken und offene Fragen

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|---|---|---|---|
| Whisper-Performance auf Android-Tablets unzureichend | Mittel | Hoch | Spike vor MVP-Bau, Fallback `whisper-tiny`, Backend-Transkription |
| BlaulichtSMS-API ändert Format | Niedrig | Mittel | Adapter-Schicht im Poller, Schema-Validierung |
| syBOS-Update bricht API-Endpoint | Niedrig | Niedrig | Read-API ist stabil seit 2008, Schema-Validierung |
| WLAN-Ausfall in Halle während Sync | Niedrig | Niedrig | Sync läuft autom. erneut bei Reconnect, idempotent |
| Konflikt am Hauptbericht (zwei Personen am Zentrale) | Niedrig | Mittel | UI-Diff im Konfliktfall, manuelle Auflösung |
| Tablet geht im Einsatz kaputt / verloren | Niedrig | Hoch | PouchDB-Daten lokal verloren, aber bisher gesyncte Daten in CouchDB sicher. Frische, ungesyncte Eingaben verloren — Restore über Audio + Chronik anderer Tablets |
| Mitglied wird neu aufgenommen während Einsatz | Mittel | Niedrig | Person wird beim nächsten Tag-Sync ergänzt. Im laufenden Einsatz: Freitextfeld als Behelfslösung. |

### Offene Fragen für Klärung im Implementierungsplan

- Welches konkrete Android-Tablet-Modell wird verwendet? (für Whisper-Spike)
- Wer übernimmt das initiale Pflegen der Fahrzeug-Geräte-Liste? (Funktionär? In syBOS? Lokal?)
- Welche Email-Adresse / Kontaktperson für SOLARYS-Anfragen?
- Welche genaue WLAN-Infrastruktur in der Halle (für Push-Server-Reachability)?
- Backup-Strategie: Wie oft Backup der CouchDB? Wohin? Wer prüft Restore?

---

## 15. Implementierungsphasen (Vorschlag für den Implementierungsplan)

1. **Phase 0 — Spikes (1 Woche)**
   - Whisper-Performance auf Ziel-Hardware
   - BlaulichtSMS-API Smoke-Test mit echtem Account
   - syBOS-API Smoke-Test mit Token

2. **Phase 1 — Foundation (1–2 Wochen)**
   - fly.io Setup (Backend, CouchDB)
   - syBOS-Sync-Worker
   - Stammdaten-Datenmodell + erste Replikation zu einem Test-Tablet

3. **Phase 2 — Tablet-PWA Grundgerüst (2 Wochen)**
   - Setup-Screen (Fahrzeug-Auswahl)
   - PouchDB-Anbindung
   - Personalauswahl-UI, Materialauswahl-UI
   - Fahrzeugbericht-Formular ohne Diktat

4. **Phase 3 — Alarm-Integration (1 Woche)**
   - BlaulichtSMS-Poller
   - WebPush an Tablets
   - Auto-Öffnen des Formulars bei Alarm

5. **Phase 4 — Hauptbericht + Aggregation (1 Woche)**
   - Zentrale-Tablet-Modus
   - Aggregation Mannschaftszahlen
   - Abschluss-Workflow

6. **Phase 5 — Diktat / Transkription (1–2 Wochen)**
   - Whisper.cpp WASM-Integration
   - Chronik-UI
   - Backend-Fallback-Transkription

7. **Phase 6 — PDF + Spickzettel (1 Woche)**
   - Puppeteer-PDF-Generator
   - HTML-Vorlage nach Papierformular
   - Spickzettel-Generator

8. **Phase 7 — Härtung + Schulung (1 Woche)**
   - End-to-End-Tests mit echten Alarmen (Übung)
   - Schulung Einsatzleiter
   - Produktiv-Schaltung

**Geschätzte Gesamtdauer:** 9–11 Wochen (1 Entwickler in Vollzeit).

---

## 16. Glossar

| Begriff | Bedeutung |
|---|---|
| BlaulichtSMS | Alarmierungsplattform für österreichische Feuerwehren |
| BWST | Brandwache-Steyr (Bezirksalarmzentrale Steyr-Land) |
| LWZ | Landeswarnzentrale |
| FF | Freiwillige Feuerwehr |
| KDO | Kommando-Fahrzeug (Funkrufname: „Kommando Eberstalzell") |
| TLF | Tanklöschfahrzeug (Funkrufname: „Tank Eberstalzell") |
| LFA-B | Löschfahrzeug-Allrad, Bauart B (Funkrufname: „Pumpe Eberstalzell") |
| MTF | Mannschaftstransportfahrzeug (Funkrufname: „MTF Eberstalzell") |
| Zentrale | Einsatzzentrale im Wachhaus (Funkrufname: „Florian Eberstalzell") |
| Funkrufname | Taktische Bezeichnung im FF-Funkverkehr, im Bericht als Diktat-Quelle verwendet |
| AS | Atemschutz |
| FFK | Feuerwehrkommandant |
| syBOS | Verwaltungssystem für Behörden- und Organisations-Strukturen (Hersteller SOLARYS, Götzis) |
| MVCC | Multi-Version Concurrency Control (Konflikt-Lösungsverfahren in CouchDB) |
| MVP | Minimum Viable Product |
| PWA | Progressive Web App |
| WAS | Wachalarmsystem (Sirenen-Alarmierung) |
| LFK | Landesfeuerwehrkommando |
| OEL | Öl-Wehr |
| TMB | Tauch-Mobil-Boot |
| SRF | Schweres Rüstfahrzeug |
| ASF | Atemschutz-Fahrzeug |
| DLK | Drehleiter |
| GSF | Gerätschaftsfahrzeug |
| HEU | Hilfslöschzug (Heutender) |

---

---

## Anhang A — Fahrzeug-Kurzbericht (Layout-Referenz)

**Status: definiert** durch das aktuelle Papier-Fahrzeugdatenblatt der FF Eberstalzell.

**Bezugsdokument:** `Einsatzberichte-Fahrzeugdatenblatt/Fahrzeugdatenblatt.docx`

### A.1 Layout (1:1 zum Papier-Original, Mannschaftsplätze dynamisch je Fahrzeug)

```
┌─────────────────────────────────────────────────────────────┐
│  FF Eberstalzell      [Wappen]      Fahrzeugbericht         │
├─────────────────────────────────────────────────────────────┤
│  Einsatzort         | (übernommen aus Hauptbericht)         │
│  Datum              | (übernommen)                          │
│  Uhrzeit von        | (Zeitstempel KM-Abfahrt)              │
│  Uhrzeit bis        | (Zeitstempel KM-Rückkehr)             │
├─────────────────────────────────────────────────────────────┤
│  Fahrzeug           | (fix pro Tablet)                      │
│  Besatzungs-Typ     | z.B. 1+7 (8 Sitzplätze)               │
│  Kilometer          | Abfahrt:  ____   Rückkehr:  ____      │
├─────────────────────────────────────────────────────────────┤
│  Fahrer             | [Person-Picker]    [☐ AS]             │
│  Fahrzeug-Kdt.      | [Person-Picker]    [☐ AS]             │
├─────────────────────────────────────────────────────────────┤
│                     | 1  [Person-Picker]   [☐ AS]           │
│                     | 2  [Person-Picker]   [☐ AS]           │
│  Mannschaft         | 3  [Person-Picker]   [☑ AS] ⎡−⎤15⎡+⎤  │
│  (dyn. Anzahl)      | …                                     │
│                     | N  [Person-Picker]   [☐ AS]           │
│                     |                                       │
│                     | N je Fahrzeug:                        │
│                     |   KDO → 2  ·  TLF → 6                 │
│                     |   LFA-B → 6  ·  MTF → 7               │
├─────────────────────────────────────────────────────────────┤
│  Anhänger (nur MTF) | [☐ HR-Anhänger]  [☐ PKW-Anhänger]    │
├─────────────────────────────────────────────────────────────┤
│  Geräte, Mittel     | [Multi-Select aus Fahrzeug-           │
│   (Pumpe, Generator,|  Geräteliste]                         │
│    Seilwinde,       |                                       │
│    Leiter, Lüfter,  |                                       │
│    Ölbindemittel)   |                                       │
├─────────────────────────────────────────────────────────────┤
│  Näherer Tätigkeitsbericht (auf Rückseite / unten):         │
│  [Freitext, ergänzt durch Chronik-Diktate dieses Fahrzeugs] │
└─────────────────────────────────────────────────────────────┘
```

### A.2 Feldliste

| Feld | Typ | Pflicht? | Bemerkung |
|---|---|---|---|
| Einsatzort | Text | ja | übernommen aus Hauptbericht (read-only auf Fahrzeug-Tablet) |
| Datum | Datum | ja | übernommen aus BlaulichtSMS-Alarm |
| Uhrzeit von | Zeit | ja | gesetzt bei Erfassung KM-Abfahrt |
| Uhrzeit bis | Zeit | ja | gesetzt bei „Bericht abschließen" |
| Fahrzeug | fix | ja | pro Tablet konfiguriert, nicht editierbar |
| KM Abfahrt | Zahl | ja | manuell eingegeben beim Ausrücken |
| KM Rückkehr | Zahl | ja | manuell eingegeben beim Einrücken |
| Fahrer | Person | ja | Auswahl aus aktiver syBOS-Personalliste |
| Fahrzeug-Kdt. | Person | ja | Auswahl aus aktiver syBOS-Personalliste |
| Mannschaft (dyn. Anzahl) | Liste | nein | Pro Slot: Person + AS-Toggle + ggf. AS-Dauer (siehe A.3). Max-Anzahl je Fahrzeug: KDO 2, TLF 6, LFA-B 6, MTF 7 |
| Anhänger-Mitnahme (nur MTF) | Multi-Select | nein | [HR-Anhänger / PKW-Anhänger], wird in Hauptbericht-Fahrzeug-Checkliste übernommen |
| Geräte/Mittel | Multi-Select | nein | Vorgefilterte Liste aus Fahrzeug-Geräteliste |
| Tätigkeitsbericht | Text | nein | Freitext, ergänzt automatisch durch Chronik-Diktate |

### A.3 Atemschutz-Erfassung (AS-Toggle pro Mannschaftsplatz)

**Verhalten:**
- Jeder der 7 Mannschaftsplätze hat einen AS-Toggle (Checkbox / Switch).
- AS-Toggle **inaktiv** (Default): keine PA-Zeit, keine zusätzlichen Felder.
- AS-Toggle **aktiviert**:
  - Zeit-Counter erscheint mit Default-Wert **15 Min**.
  - Steuerung über `[−] 15 Min [+]`, Schrittweite **5 Min**.
  - **Range:** Minimum 5 Min., Maximum 60 Min.
  - Bei Klick auf `−` unter 5 Min.: bleibt bei 5 Min. (keine Deaktivierung des Toggles durch Min-Erreichen).
  - Bei Klick auf `+` über 60 Min.: bleibt bei 60 Min.

**Werte-Skala:** 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60 Minuten.

**Im PDF-Output** wird die AS-Markierung wie im Papier-Original angezeigt:
```
3.  Sepp HUBER ............... AS 30 min
```

**Annahme zu validieren:** Schrittweite 5 Min. und Range 5–60 Min. ist eine sinnvolle Default-Vorgabe. Falls in der Praxis andere Schrittweiten gewünscht sind (z.B. 1 Min., oder gar keine Begrenzung), in 2-Minuten-Anpassung im Implementierungsplan korrigierbar.

## Anhang B — Hauptbericht (Layout-Referenz)

**Status: definiert** durch das aktuelle Papier-Formular der FF Eberstalzell.

Bezugsdokumente:
- `Einsatzberichte-Fahrzeugdatenblatt/Einsatzbericht 2025 NEU.pdf`
- `Einsatzberichte-Fahrzeugdatenblatt/2025 Einsatzbericht Neu.xlsx`

**Feldgruppen** (Auflistung aus Original-Formular):

1. **Kopf**: Einsatzort, Datum/Uhrzeit
2. **Klassifikation**: Pflichtbereich (JA/NEIN), Einsatzzone E-zell (JA/NEIN), Überörtliche Hilfeleistung (JA/NEIN), Alarmiert durch (BWST/LWZ), Einsatzauftrag eingelangt über (WAS/Funk/Telefon/Bote/Behörde), Anrufer + Tel.Nr.
3. **Eingesetzte Fahrzeuge** (Checkboxen): KDO, TLF-A 4000, LFA-B, PKW-Anhänger, MTF, HR-Anhänger, Stapler
4. **Einsatzart** (28 Checkboxen): Brand Sonstiges / Brand Gewerbe / Brand Landwirtschaft / Brand Wohnhaus / BMA / Brandverdacht / Brand Kamin / Brand Abfall / Brand KFZ / Flurbrand / Brandwache n. Brand / Personenrettung / Überflutung / Pumparbeiten / Sturm / Ölspur / Lift / Tierrettung / Türöffnung / Wasserschaden / Straßenreinigung / Lotsendienst / Kanalspülen / Brandsicherheitsdienst / VU Eingekl. Per. / VU Aufräumarbeiten / Höhenrettungseins. / Bienen-Wespen
5. **Andere Einsätze** (Freitext) + **Warn- und Alarmsystem-Nummer**
6. **Zeitmarken**: Lage unter Kontrolle Uhrzeit, Brand AUS Uhrzeit, Alst. 2 (Uhrzeit + Anforderer), Alst. 3 (Uhrzeit + Anforderer)
7. **Beteiligte Stellen** (Checkboxen): Polizei, RK, BFKDT, AFKDT, Gem., BH, GAS, Ener.AG, RAG, Arzt, Bestatt., STM
8. **Sonstige anwesende Feuerwehren**: OEL, Kran, TMB, SRF, ASF, DLK, GSF, HEU, Sonstige (Freitext)
9. **Mannschaft**: Eingesetzt (aggregiert aus Fahrzeug-Kurzberichten), Bereitschaft, Sonstige, Gesamt
10. **Verrechenbarer Einsatz** (JA/NEIN) + Rechnungsadresse
11. **Ölbindemittel** (JA + Anzahl Stk.)
12. **Meldung von der Einsatzleitung** (Freitext, großes Feld)
13. **Footer**: Einsatzleiter, Einsatzende, Bearbeiter, Unterschrift

---

**Ende des Dokuments.**

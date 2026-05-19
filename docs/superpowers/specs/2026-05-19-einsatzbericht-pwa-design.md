# Design: Einsatzbericht-PWA für FF Eberstalzell (UC2)

**Version:** 1.0
**Datum:** 2026-05-19
**Status:** Design-Entwurf, bereit für Implementierungsplan
**Auftraggeber:** Freiwillige Feuerwehr Eberstalzell
**Use Case:** UC2 — Digitale Einsatzberichte auf Fahrzeug-Tablets

---

## 1. Zusammenfassung

Eine offline-fähige Progressive Web App (PWA), die auf fünf Android-Tablets läuft (vier Fahrzeuge + Einsatzzentrale) und den heutigen papierbasierten Einsatzbericht ablöst. Im Einsatz wird komplett offline gearbeitet; Sync mit dem zentralen Backend findet ausschließlich in der Fahrzeughalle über WLAN statt. Alarmdaten werden aus BlaulichtSMS vorausgefüllt, Personal und Material aus syBOS gesynct, der finale Bericht wird als PDF erzeugt und über einen „Spickzettel-Modus" manuell in syBOS übertragen.

UC0 (Tätigkeitsnachweise) und UC1 (Anwesenheitserfassung im FF-Haus) sind **explizit Out-of-Scope** dieser Iteration.

---

## 2. Beteiligte und Rollen

| Rolle | Tablet | Aufgabe |
|---|---|---|
| Fahrzeug-Kdt. KDO | KDO-Tablet | erfasst Fahrzeugbericht KDO |
| Fahrzeug-Kdt. TLF-A 4000 | TLF-Tablet | erfasst Fahrzeugbericht TLF |
| Fahrzeug-Kdt. LFA-B | LFA-B-Tablet | erfasst Fahrzeugbericht LFA-B |
| Fahrzeug-Kdt. MTF | MTF-Tablet | erfasst Fahrzeugbericht MTF |
| Einsatzleiter | Zentrale-Tablet | erfasst Hauptbericht, sieht alle Fahrzeugberichte live (sobald gesynct) |
| Bearbeiter (Funktionär) | Zentrale-Tablet / Browser | schließt Bericht ab, generiert PDF, überträgt nach syBOS |

**Keine personalisierten Logins.** Jedes Tablet ist auf ein Fahrzeug konfiguriert (einmaliger Setup); wer das Tablet bedient, wählt sich aus der Personalliste als Fahrer / Fahrzeug-Kdt. / Mannschaft.

---

## 3. Anforderungen

### 3.1 Funktionale Anforderungen

**FR-1 — Alarm-Auslösung**
Bei eingehendem Alarm (BlaulichtSMS) öffnet die App auf allen Tablets automatisch das Einsatzformular, vorausgefüllt mit BlaulichtSMS-Daten (Einsatzort, Koordinaten, Zeit, Audio).

**FR-2 — Fahrzeugbericht-Erfassung**
Auf dem Fahrzeug-Tablet erfasst der Fahrzeug-Kdt.: Fahrer, Fahrzeug-Kdt., Mannschaft (mit Atemschutz-Markierung), KM-Stand Abfahrt, eingesetzte Geräte (gefiltert auf das Fahrzeug), Tätigkeitsbericht. KM-Rückkehr und Endzeit kommen beim Einrücken dazu.

**FR-3 — Hauptbericht-Erfassung**
Auf dem Zentrale-Tablet erfasst der Einsatzleiter alle einsatzübergreifenden Felder gemäß heutigem Papierformular (Einsatzart, Pflichtbereich, Alarmierungsquelle, Zeitmarken, beteiligte Stellen, Verrechnung, Freitext-Meldung).

**FR-4 — Diktat / Einsatzchronik**
Jedes Tablet kann während des Einsatzes Sprachnotizen mit Zeitstempel aufnehmen, die offline transkribiert werden (Whisper.cpp). Die Chronik erscheint im fertigen Bericht und im Spickzettel.

**FR-5 — Aggregation**
Mannschaftszahlen im Hauptbericht („Eingesetzt") werden automatisch aus den Fahrzeugberichten summiert. „Bereitschaft" und „Sonstige" sind manuelle Felder.

**FR-6 — Bericht-Abschluss**
Wenn alle Fahrzeugberichte abgeschlossen sind, kann der Einsatzleiter den Einsatz gesamt abschließen. Backend generiert PDF + Spickzettel-JSON.

**FR-7 — PDF-Ausgabe**
Das PDF folgt der Struktur des heutigen Papierformulars (Hauptbericht + ein Fahrzeugdatenblatt pro Fahrzeug + Einsatzchronik). Layout: A4 hochkant.

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
Stack möglichst nah am Brandmeister-Projekt (TypeScript, Node.js, React), damit derselbe Entwickler beide Projekte betreuen kann.

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
        │   PWA        │ │   PWA        │ │   PWA        │ │   PWA        │
        │ + PouchDB    │ │ + PouchDB    │ │ + PouchDB    │ │ + PouchDB    │
        │ + Whisper    │ │ + Whisper    │ │ + Whisper    │ │ + Whisper    │
        └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

        (MTF-Tablet identisch wie die anderen Fahrzeug-Tablets, hier weggelassen)
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
  ├── mannschaft[]: { personId, atemschutz: bool }
  ├── geraete[]: { materialId, anzahl?, bemerkung? }
  ├── taetigkeitsbericht (Freitext)
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
  └── geraeteIds[]  ← welche Geräte sind auf diesem Fahrzeug verlastet

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
  ├── fahrzeugId        ← welches Tablet diktiert hat
  ├── typ: 'diktat' | 'manuell' | 'auto-blaulichtsms'
  ├── audioBlobId?      ← bei Diktat: Audio im lokalen Storage
  ├── transkript?       ← gefüllt sofort (Whisper) oder beim Sync-Fallback
  ├── transkriptStatus: 'pending' | 'verfügbar' | 'manuell-korrigiert'
  └── tags?[]           ← V1.1: Auto-Extraktion ('brand-aus', 'lage-uK', …)
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

Generiert vom Backend mit Puppeteer aus einer HTML-Vorlage, die das heutige Papierformular nachbildet:
- Seite 1: Hauptbericht (Header, Fahrzeuge, Einsatzart, Zeitmarken, beteiligte Stellen, Mannschaftszahlen, Verrechnung, Freitext)
- Seite 2+: Pro Fahrzeug ein Fahrzeugdatenblatt
- Letzte Seiten: Einsatzchronik (chronologisch, mit Zeitstempel und Diktat-Quelle)
- Optional: Foto-Anhänge

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
| KDO | Kommando-Fahrzeug |
| TLF | Tanklöschfahrzeug |
| LFA-B | Löschfahrzeug-Allrad, Bauart B |
| MTF | Mannschaftstransportfahrzeug |
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

**Ende des Dokuments.**

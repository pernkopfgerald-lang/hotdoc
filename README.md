# HotDoc

**Digitale Einsatzberichte für die Freiwillige Feuerwehr Eberstalzell.**

Offline-fähige PWA für Fahrzeug-Tablets, Verwaltungs-Website + Florianstation-Modus
für Funktionäre, Backend mit syBOS-/BlaulichtSMS-Anbindung, automatische PDF-Generierung.

```
┌─────────────────────────────────────────────────────────────┐
│  Auftraggeber   FF Eberstalzell, Solarstraße 1, 4653        │
│  Ansprechperson Gerald Pernkopf · gerald.pernkopf@…         │
│  Status         Phase 1–10 umgesetzt, alle Builds grün      │
│  Git            http://192.168.178.219:3006/gerald/HotDoc   │
│  fly.io         https://hotdoc-eberstalzell.fly.dev/        │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo-Struktur

```
hotdoc/
├── apps/
│   ├── pwa/         Fahrzeug-Tablets (React 18 + Vite + PouchDB + Leaflet)
│   ├── backoffice/  Verwaltung + Florianstation (React + Tailwind, PC-Browser)
│   └── api/         Backend (Node 20 + Express + CouchDB + Puppeteer)
├── packages/
│   └── shared/      Zod-Schemas + Typen + Konstanten (FAHRZEUGE, AS_*, EINSATZARTEN, …)
├── docs/superpowers/specs/  Spec — 17 FRs, 6 NFRs, Datenmodell, Anhang A/B
├── prototype/lfa-b/         HTML-Prototyp (Referenz, bleibt erhalten)
└── (root)           fly.toml, Dockerfile, Caddyfile, DEPLOY.md
```

## Lokal starten

```bash
# 1. Dependencies
pnpm install

# 2. CouchDB lokal (Docker)
docker run -d --name hotdoc-couchdb -p 5984:5984 \
  -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=admin \
  couchdb:3.4

# 3. Backend (Port 3000)
pnpm dev:api

# 4. Fahrzeug-PWA (Port 5173)
pnpm dev:pwa

# 5. Backoffice (Port 5174)
pnpm --filter @hotdoc/backoffice dev
```

Initial-Admin wird beim ersten Start angelegt:
- **Username:** `admin`
- **Passwort:** `admin12345678`
- Sofort über das Backoffice ändern (nach Phase 11).

## Backend-API — verfügbare Endpoints

| Methode | Route | Auth | Zweck |
|---|---|---|---|
| GET  | `/healthz` | — | Health-Check |
| GET  | `/api/version` | — | Version + Feature-Map |
| POST | `/api/auth/login` | — | Backoffice-Login (Username + Passwort) |
| GET  | `/api/auth/me` | Bearer | Aktuelle Session validieren |
| POST | `/api/auth/tablet/register` | — | Tablet-Setup (MSISDN + Fahrzeug) |
| GET  | `/api/einsaetze` | Bearer | Liste aller Einsätze (Filter `?status=`) |
| GET  | `/api/einsaetze/:id` | Bearer | Detail |
| POST | `/api/einsaetze/manuell` | einsatzleiter | Manuell anlegen — **FR-12** |
| POST | `/api/einsaetze/:id/abschluss` | einsatzleiter | Abschließen → Schreibschutz aktiv |
| POST | `/api/einsaetze/:id/reaktivieren` | funktionaer | Reaktivieren mit Grund — **FR-14** |
| PUT  | `/api/einsaetze/:id` | Bearer | Update (mit Schreibschutz-Check 423) |
| PUT  | `/api/einsaetze/:id/fahrzeugbericht/:fzgId` | Bearer | Fahrzeugbericht upsert |
| GET  | `/api/einsaetze/:id/fahrzeugberichte` | Bearer | Liste Fzg.-Berichte zu Einsatz |
| GET  | `/api/einsaetze/:id/pdf` | Bearer | PDF-Generierung — **FR-7** |
| GET  | `/api/einsaetze/:id/spickzettel` | Bearer | syBOS-Spickzettel HTML — **FR-8** |
| POST | `/api/admin/sybos/sync` | — | Manueller syBOS-Stammdaten-Sync |
| POST | `/api/dev/blaulichtsms/trigger` | — (dev only) | Mock-Alarm triggern |
| POST | `/api/dev/blaulichtsms/poll` | — (dev only) | Manueller Poll-Trigger |

## Hintergrund-Worker

| Worker | Cron | Funktion |
|---|---|---|
| `blaulichtsms-poller` | alle 15 s (default) | Holt neue Alarme, schreibt sie in CouchDB |
| `sybos-stammdaten-sync` | täglich 04:00 | Personal, Material, Abteilung, AS-Berechtigung |
| `audio-retention` | täglich 03:00 | Löscht Audio-Attachments > 30 Tage nach Abschluss |

Worker starten nur, wenn die zugehörigen Credentials (Env-Variablen) gesetzt sind.
Sonst werden sie übersprungen und melden das in den Logs.

## Spec & Anforderungen

Alle **17 FRs** und **6 NFRs** in `docs/superpowers/specs/2026-05-19-einsatzbericht-pwa-design.md`.

| FR | Status |
|---|---|
| FR-1 Alarm-Auslösung (BlaulichtSMS → Auto-Open) | ✅ Poller + Mock-Adapter |
| FR-2 Fahrzeug-Kurzbericht | ✅ PWA LfaBPage + API-Endpoint |
| FR-3 Hauptbericht (Zentrale) | ✅ Backoffice Florianstation-Tab |
| FR-4 Diktat + Whisper | ⚠️ UI-Skeleton (DictateButton), Whisper-WASM folgt mit Hardware-Spike |
| FR-5 Mannschaftszahlen aggregieren | ✅ Zod-Schema, Aggregation-View folgt mit echten Daten |
| FR-6 Bericht-Abschluss | ✅ POST `/abschluss` + Schreibschutz |
| FR-7 PDF | ✅ Puppeteer + Template |
| FR-8 syBOS-Spickzettel | ✅ HTML-Template |
| FR-9 Karte + Live-Tracking | ✅ PWA Leaflet-Komponente |
| FR-10 KM auto aus GPS | ✅ PWA read-only Field + Haversine |
| FR-11 wasserkarte.info | ⚠️ Mock-Hydranten (echter API-Key fehlt) |
| FR-12 Manuelle Anlage | ✅ Backoffice Modal + API |
| FR-13 Parallele Einsätze | ✅ via CouchDB-Liste |
| FR-14 Schreibschutz/Reaktivierung | ✅ API + Backoffice Modal + Audit-Trail |
| FR-15 Auth (MSISDN / Username) | ✅ bcrypt + JWT + Tablet-Register |
| FR-16 Backoffice | ✅ Berichte / Personal / Stammdaten / Florian |
| FR-17 Florianstation 3-spaltig | ✅ Querformat-Layout |

## Test-Suite

```bash
pnpm --filter @hotdoc/api test
# 17 Tests grün (Mapper, JWT-Roundtrip, Password-Hashing)
```

Test-Coverage-Schwerpunkte:
- syBOS-Mapper (mapPerson, mapMaterial, buildAtemschutzSet)
- JWT Sign + Verify Round-Trip + Manipulations-Resistenz
- Password-Hash + Verify

## Was außerhalb dieser Codebase noch passieren muss

1. **fly.io Setup für Backend + CouchDB** (siehe `DEPLOY.md`)
2. **fly secrets** für externe Services:
   - `SYBOS_API_URL`, `SYBOS_TOKEN`
   - `BLAULICHTSMS_CUSTOMER_ID`, `BLAULICHTSMS_USER`, `BLAULICHTSMS_PW`
   - `WASSERKARTE_ACCESS_KEY`
   - `OPENAI_API_KEY` (Whisper-Fallback)
   - `JWT_SECRET` (in Produktion zwingend, ≥32 Zeichen)
3. **Tablet-Whisper-Performance-Spike** (Hardware vor Ort)
4. **Schulung** der Einsatzleiter + Fahrzeug-Kdt. (30 Min)
5. **Datenschutz-Hinweis-Dokument** für FF-Mitglieder (DSGVO)

## Lizenz

Internes Projekt der FF Eberstalzell. Nicht für externe Verteilung.

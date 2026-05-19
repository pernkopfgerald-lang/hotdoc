# HotDoc

**Digitale Einsatzberichte für die Freiwillige Feuerwehr Eberstalzell.**

Eine offline-fähige Progressive Web App für Fahrzeug-Tablets und Einsatzzentrale,
die den papierbasierten Einsatzbericht-Workflow ablöst und am Ende strukturierte
Daten zur halbautomatischen Übertragung nach syBOS bereitstellt.

```
┌─────────────────────────────────────────────────────────────┐
│  Auftraggeber  · FF Eberstalzell, Solarstraße 1, 4653       │
│  Ansprechperson· Gerald Pernkopf                            │
│  Email         · gerald.pernkopf@ff-eberstalzell.at         │
│  Status        · Prototyp v0.2 · LFA-B Layout fertig        │
└─────────────────────────────────────────────────────────────┘
```

## Was steckt drin?

- **`docs/superpowers/specs/`** — Vollständiges Design-Dokument (Spec für UC2)
- **`prototype/lfa-b/`** — Interaktiver HTML-Prototyp für das LFA-B-Tablet
- **`fly.toml` / `Dockerfile` / `Caddyfile`** — Deployment auf fly.io (Frankfurt)
- **`DEPLOY.md`** — Schrittweise Anleitung Gitea + fly.io Setup

## Lokal anschauen

```bash
python -m http.server 5500 --directory prototype/lfa-b
# Browser → http://localhost:5500
```

## Stack (geplant, siehe Spec)

| Schicht           | Technologie                         |
|-------------------|-------------------------------------|
| PWA               | React 18 + Vite + TypeScript        |
| Lokale DB         | PouchDB (IndexedDB)                 |
| Offline-Transkript| whisper.cpp WASM                    |
| Backend           | Node 20 + Express                   |
| Master-DB         | Apache CouchDB                      |
| PDF               | Puppeteer                           |
| Hosting           | fly.io (Frankfurt)                  |
| Source-Control    | Gitea (intern) + GitHub Mirror      |

## Use Cases

- **UC2 (jetzt)** — Digitaler Einsatzbericht auf 5 Tablets (4 Fahrzeuge + Zentrale)
- **UC1 (später)** — Anwesenheitserfassung im FF-Haus
- **UC0 (später)** — Tätigkeitsnachweise & Pflichtstunden-Tracking

## Lizenz

Internes Projekt der FF Eberstalzell. Nicht für externe Verteilung.

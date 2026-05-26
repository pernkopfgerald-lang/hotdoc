# HotDoc · Online/Offline-Sync-Architektur

**Stand:** 2026-05 · Plan-Skizze für Phase 1.2 + 3.5
**Spec-Bezug:** FR-1, FR-6, FR-14, NFR-Resilience

## Designziel

> **Online-first, aber offline-resilient.** Jedes Tablet kann auch ohne Netz
> einen vollständigen Fahrzeugbericht erfassen und beim Reconnect automatisch
> mit der Florianstation zusammenführen — inklusive automatischer
> Konfliktauflösung bei doppelt vergebenen Bericht-Nummern.

## Datenfluss im Normalbetrieb (online)

```
┌────────────┐      Continuous-Replication      ┌──────────────┐
│  PWA-Tablet│ ◄───────────────────────────────►│   CouchDB    │
│  PouchDB   │     bi-direktional, ~1 s Latenz  │  hotdoc-db   │
└────────────┘                                  └──────┬───────┘
       ▲                                               │
       │ Service-Worker-Push                           │ Replication
       │                                               ▼
       │                                       ┌──────────────┐
       │                                       │ Backoffice   │
       │                                       │ Florianstat. │
       │                                       └──────────────┘
       ▲
       │ SSE-Stream `/api/positions/stream`
       │ Diktat-Broadcasts via _changes-Feed
```

**Konkret:**

1. Tablet macht Änderung → PouchDB lokal schreibt (`db.put`)
2. PouchDB-Continuous-Replication pusht zur CouchDB (Latenz ~1 s im LAN)
3. CouchDB sendet `_changes`-Notify an alle anderen Tablets + Backoffice
4. Diktat-Eintrag in Chronik erscheint überall — solange jemand online ist
5. Hydranten-/Position-Sharing über SSE-Endpoint
   (`/api/positions/stream` — leichtgewichtig, kein Doc-Schreiben)

## Datenfluss bei Offline-Betrieb

Jedes Tablet hat eine vollständige lokale PouchDB-Instanz:

- `hotdoc-local` enthält *alle eigenen Berichte*
- Personal-Cache (~45 Personen) bleibt verfügbar
- Geräte-Listen + Auftrag-Typen sind Bestandteil der App-Bundle (kein DB-Round-Trip)
- Map-Tiles werden via Service-Worker gecacht (CacheFirst-Strategie für `tile.openstreetmap.org`)

Was im Offline-Betrieb passiert:

| Aktion | Verhalten offline |
|---|---|
| Neuer Einsatz manuell anlegen | ✓ funktioniert · ID wird *provisorisch* vergeben |
| Personen aus Picker auswählen | ✓ funktioniert · Quelle: lokaler Personal-Cache |
| Diktat aufnehmen | ✓ Audio-Blob als PouchDB-Attachment, Transkript folgt beim Sync |
| GPS-Spur aufzeichnen | ✓ läuft komplett lokal |
| KM-Berechnung | ✓ aus Luftlinie × 1.3 × 2 (Konstante, kein API-Call) |
| Bericht abschließen | ✓ Status → `abgeschlossen` lokal, Schreibschutz aktiv |
| BlaulichtSMS-Empfang | ✗ braucht Netz · Tablet bekommt Push erst nach Reconnect |
| Andere Fahrzeuge auf der Karte | ✗ letzter bekannter Stand, dann grau / „Standby" |
| Diktat-Broadcast zu anderen | ✗ wird gepuffert, schießt beim Reconnect raus |

## Konfliktauflösung: doppelt vergebene Bericht-Nummern

**Problem:** TLF und LFA-B legen unabhängig im Offline-Betrieb je einen neuen
manuellen Einsatz an. Beide bekommen lokal die nächste freie Nummer
vorgeschlagen — z. B. `T26-004`.

**Lösung in 4 Schritten:**

### 1. Provisorische Nummer markieren

Bei Offline-Vergabe wird das Doc mit einem Flag versehen:

```json
{
  "_id": "einsatz:T26-004",
  "type": "einsatz",
  "berichtNr": "T26-004",
  "berichtNrProvisorisch": true,
  "berichtNrErsteller": "lfa-b@<tablet-uuid>",
  ...
}
```

### 2. CouchDB-Counter prüft beim Replication-Push

Server-Side erkennt CouchDB beim Replication-Push, wenn `berichtNr` schon vergeben:

- Hat ein anderes Doc bereits die Nummer? → Konflikt
- Der zeitlich frühere Eintrag behält die Nummer
- Der zeitlich spätere wird auf `berichtNrProvisorisch=true, konflikt=true` gesetzt

### 3. Florianstation bekommt Konflikt-Vorschlag

Backoffice → Verwaltung → Berichte zeigt einen **Konflikt-Banner**:

```
⚠ Bericht-Nummern-Konflikt erkannt

  TLF Eberstalzell · Sturm · 14:08 · T26-004 (Originalvergabe)
  LFA-B Pumpe Eberstalzell · Ölspur · 14:23 · T26-004 (Konflikt)

  Vorschlag: LFA-B-Bericht umnummerieren → T26-005
  [Vorschlag übernehmen]  [Manuell anders zuordnen]
```

### 4. Übernahme aktualisiert beide Tablets

Klick auf „Vorschlag übernehmen" → Backend setzt das Konflikt-Doc auf
`berichtNr: "T26-005"`, `konflikt: false`, `berichtNrProvisorisch: false`.
Replication pusht das Update zu beiden Tablets — auf dem LFA-B-Tablet
wechselt die Nummer in der UI.

## Diktat-Broadcast

Wenn ein Fahrzeug-Kdt. ein Diktat aufnimmt:

1. Audio-Blob landet als CouchDB-Attachment am `einsatz:XX`-Doc
2. Whisper-Worker (WASM lokal oder Backend-Fallback) transkribiert
3. Transkript wird als neuer Chronik-Eintrag in dasselbe Doc geschrieben
4. CouchDB `_changes` notifiziert alle Subscriber dieses `einsatz:XX`
5. Andere Tablets aktualisieren ihre Chronik-Timeline live

**Bei Offline-Aufnahme:** Audio-Blob bleibt lokal, Transkription läuft trotzdem
lokal (Whisper-WASM braucht kein Netz). Beim Reconnect repliziert das Attachment
+ Transkript zu CouchDB → von dort an alle anderen.

## Reconnect-Detection

```typescript
// PWA-seitig
window.addEventListener("online", () => sync.startRetry());
window.addEventListener("offline", () => sync.pause());

// Backend-Heartbeat zusätzlich alle 30 s
setInterval(() => {
  fetch("/api/healthz").then(() => setOnline()).catch(() => setOffline());
}, 30_000);
```

Status wird in der Topbar als Pill angezeigt:

- `GPS · 12 m` (grün) — online + GPS fix
- `OFFLINE · 4 Änderungen pending` (amber) — offline, lokale Änderungen warten

## Personal-Daten-Fallback

`apps/api/src/services/sybos/sync.ts` hat zwei Modi:

- **Online**: API-Sync alle 24 h um 04:00, schreibt nach `_users` und cached
- **Fallback**: Letzte erfolgreiche Sync wird in CouchDB als
  `personal:cache:<datum>` archiviert; PWA-Tablets nutzen lokalen
  `personen`-Index aus PouchDB

Wenn syBOS für > 7 Tage nicht erreichbar:

1. Banner im Backoffice: „syBOS-Sync seit X Tagen fehlgeschlagen"
2. Personalliste bleibt gültig (Tablets arbeiten weiter mit Cache)
3. Funktionäre können im Notfall einzelne Personen manuell anlegen
   (Verwaltung → Personal → manuell hinzufügen — Phase 6)

## Audit-Trail bei Konflikten

Jeder aufgelöste Konflikt landet im Bericht-Doc:

```json
{
  "_id": "einsatz:T26-005",
  "berichtNr": "T26-005",
  "konflikt": null,
  "konflikt_history": [{
    "am": "2026-05-14T14:35:12Z",
    "vorherige_nr": "T26-004",
    "konflikt_mit": "einsatz:T26-004",
    "geloest_durch": "florianstation@gerald.pernkopf",
    "art": "auto_vorschlag_uebernommen"
  }]
}
```

Sichtbar im Bericht-Detail als „Audit"-Sektion (analog zu Reaktivierungs-Audit
nach FR-14).

## Implementierungsstand

| Komponente | Status |
|---|---|
| PouchDB lokal | ✓ Phase 1 fertig |
| Continuous-Replication zu CouchDB | ⏳ Phase 1.2 — Code-Skeleton da, Aktivierung steht aus |
| Server-Side Konflikt-Erkennung | ⏳ Phase 1.2 (CouchDB-Filter-Function + Update-Handler) |
| Florianstation Konflikt-UI | ⏳ Phase 6 (Backoffice) |
| Diktat-Broadcast via `_changes` | ⏳ Phase 5 (zusammen mit Whisper-Integration) |
| Whisper-WASM lokal | ⏳ Phase 5 (großer Brocken, ~150 MB Modell) |
| `online`/`offline`-Detection | ✓ Boilerplate in `lib/geo.ts` ähnlich |
| Service-Worker Map-Tile-Cache | ✓ vite-plugin-pwa konfiguriert |
| syBOS-Fallback (Cache) | ✓ Code da, läuft sobald erster Sync gelaufen ist |

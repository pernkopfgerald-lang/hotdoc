# HotDoc Intensiv-Audit — Ergebnisbericht

**Datum:** 2026-05-27
**Auditor:** Claude Sonnet 4.7 (Senior Quality Engineer, mission-critical PWA)
**Test-Modus:** KI-gestützt mit Repo-Read-Access + Spec
**Test-Umgebung:** Live-Deployment (hotdoc-eberstalzell.fly.dev) + Source-Code main@19604d9
**Drehbuch-Bezug:** `hotdoc_intensive_audit_v1.md` (12 Domänen)

> **TL;DR:** HotDoc ist im großen Bild produktivnah — Auth/Schreibschutz/Replication/Offline-First sind sauber. Aber drei Domänen reißen die Reife-Bewertung nach unten: **(1) das in der Spec dokumentierte Berichts­nummer-Schema ist im Code nirgendwo umgesetzt**, **(2) der Audit-Cleanup-Worker fehlt** (DSGVO-Risiko), und **(3) die kritischen Schreib-Events (Einsatz-Abschluss, Reaktivierung) schreiben kein Audit-Event** — die Audit-Routes liefern die Events nie, obwohl sie als Event-Type definiert sind.

---

## Domänen-Score (jeweils 0–10 Punkte)

| Domäne | Score | Kommentar |
|---|---|---|
| 1 — Offline/Online-Resilienz | 7/10 | PouchDB-Outbox + Reconnect-Logik solide, aber kein QuotaExceeded-Handling sichtbar |
| 2 — Race-Conditions & Konflikte | 4/10 | Chronik-Dedup OK, aber Berichts­nummer-Vergabe nicht implementiert (🔴) |
| 3 — Schreibschutz-Härte | 7/10 | 423-Logik OK, aber Audit-Events bei Abschluss/Reaktivierung fehlen (🟠) |
| 4 — UC-Coverage | 8/10 | Alle 7 Happy-Paths abgedeckt, Failure-Paths teils ungeprüft |
| 5 — External-API-Ausfall | 8/10 | Defensives Parsen + Timeouts + Re-Login OK |
| 6 — Security & Auth | 6/10 | Token-Drift gefixt, aber kein Server-Side-Logout + JWT_SECRET-Default-Risiko |
| 7 — DSGVO / Compliance | 4/10 | Audit-Cleanup-Worker fehlt komplett (🔴), kein Auskunfts-/Löschungs-Workflow |
| 8 — Mock/Dummy-Reste | 7/10 | /api/dev/* geschützt ✓, aber JWT-Default + Berichts­nummer-Stub kritisch |
| 9 — Performance | 8/10 | Für FF-Größe ausreichend, kein offensichtlicher Memory-Leak |
| 10 — Hardware / Field | n/a | Nicht im Lese-Audit prüfbar — empfohlen Übungsabend |
| 11 — PDF / Spickzettel | 8/10 | Drei Templates implementiert, Logo embedded, Reaktivierungs-Audit im Footer |
| 12 — Usability unter Stress | n/a | Nur Field-Test prüfbar |
| **Total (geprüfte 10 Domänen)** | **67/100** | |

---

## Reputations-Veto-Check

- [ ] **Berichts­nummer-Race nicht reproduzierbar** → ❌ NICHT BESTANDEN: Schema in Spec dokumentiert, im Code nicht implementiert. Aktuell haben Einsätze keine Berichts­nummer.
- [x] Bootstrap-Admin-PW änderbar (fly secrets) ✓
- [ ] **Audit-Cleanup implementiert** → ❌ NICHT BESTANDEN: Worker fehlt, Events wachsen unbegrenzt.
- [x] /api/dev/* in Prod nicht öffentlich zugreifbar ✓ (requireAuth admin/funktionaer)
- [x] 423-Handling ohne Datenverlust ✓ (Outbox bleibt lokal, kein Server-Drop)
- [ ] PouchDB-Quota-Handling sauber → ❓ Code hat kein expliziten Catch für QuotaExceededError

---

## Kritische Findings (🔴)

### FINDING 2-1: Berichts­nummern-Vergabe nicht implementiert

**Schweregrad:** 🔴 Kritisch
**Reproduktion:**
1. Manuellen Einsatz anlegen → 201 Created
2. Doc in CouchDB ansehen → kein `berichtNr`-Feld
3. Grep nach `buildBerichtNummer`/`berichtNr` in `apps/` → 0 Treffer (nur Definition in `packages/shared/constants/einsatzkategorie.ts`)

**Erwartetes Verhalten:** Bei jeder Einsatz-Anlage (BlaulichtSMS + manuell + lotsendienst + uebung) wird eine Berichts­nummer im Schema B26-001 / T26-001 vergeben. Server-side ein Counter pro `(jahr, kategorie)` in `seq:<jahr>:<kategorie>`-Doc, mit Optimistic-Locking via `_rev`. Bei Offline-Vergabe `berichtNrProvisorisch=true`.

**Tatsächliches Verhalten:** Die Funktion `buildBerichtNummer()` existiert in `packages/shared`, wird aber **nirgendwo** im Backend aufgerufen. Es gibt **kein** Counter-Doc, **keine** Filter-Function für Konflikte, **kein** UI-Element für die Anzeige.

**Quelle:** Spec §12 (Berichts­num­me­rie­rung) verlangt es. `packages/shared/src/constants/einsatzkategorie.ts:85-94` definiert es. Code wendet es nicht an.

**Konsequenz im Einsatz:** Die Spec §12.3 beschreibt einen vollständigen 4-Schritt-Konfliktauflösungs-Algorithmus — wenn die Grundvergabe fehlt, ist das gesamte Konflikt-Modell wirkungslos. Bei Behörden-Audit kann die FF die Spec nicht verteidigen ("Sie sagen B26-001, im System sehe ich nichts derartiges").

**Fix-Vorschlag:** Eigene Task, mind. 8h. Beinhaltet: (a) Counter-Service `services/bericht-nr.ts`, (b) Aufruf in allen Einsatz-Anlage-Pfaden, (c) UI-Anzeige im Bericht-Header, (d) PDF-Anzeige, (e) Konflikt-Auflösungs-UI im Backoffice.

**Aufwand:** 8–16 PT (siehe Rücksprache R-1 unten).
**Confidence:** 10/10
**Triage:** RÜCKSPRACHE (komplexer Implementation, Spec-Annahmen müssen bestätigt werden).

---

### FINDING 7-1: Audit-Cleanup-Worker fehlt

**Schweregrad:** 🔴 Kritisch (DSGVO)
**Reproduktion:**
1. Grep nach `audit-retention|audit-cleanup|cleanupAudit` in `apps/api` → 0 Treffer
2. `apps/api/src/server.ts:97-100` startet nur 3 Worker (syBOS, BlaulichtSMS, Audio-Retention), keinen Audit-Cleanup
3. `audit:*`-Docs wachsen monoton, keine TTL-Logik

**Erwartetes Verhalten:** Cron-Worker, der `audit:*`-Docs älter als Retention-Period (Default 1 Jahr) löscht. Konfigurierbar via `AUDIO_RETENTION_DAYS`-analoge ENV `AUDIT_RETENTION_DAYS`.

**Tatsächliches Verhalten:** Audit-Events wachsen unbegrenzt. Bei 50 Logins/Tag + 5 Handoffs/Woche + 100 Logout-Failures/Jahr → ~20k Events/Jahr. Nach 10 Jahren = 200k Events. Performance-Risiko + DSGVO-Risiko (Datenminimierung).

**Quelle:** Spec §17.3 sagt „min. 1 Jahr", §24.1 sagt „Cleanup-Worker für Audit-Events. Retention-Policy ist dokumentiert, der Cleanup-Lauf fehlt." Spec ist ehrlich, Code ist drüber gestolpert.

**Konsequenz im Einsatz:** Bei Behörden-Audit zur DSGVO-Konformität ist „Wir haben Datenminimierung implementiert, hier der Cleanup-Worker" eine harte Nachweis-Anforderung.

**Fix-Vorschlag:** Neuer Worker `apps/api/src/workers/audit-retention.ts` analog zu `audio-retention.ts`. Cron täglich 02:30. Liest `audit:*` mit `endkey` = `audit:<reverseTsVorEinemJahr>:` (alle älteren). Löscht via `db.destroy(doc._id, doc._rev)`.

**Aufwand:** 1 PT.
**Confidence:** 10/10
**Triage:** AUTO-FIX (klar, einfach, Spec-konsistent).

---

### FINDING 7-2: Kein Audit-Event bei Einsatz-Abschluss / Reaktivierung

**Schweregrad:** 🔴 Kritisch (Audit-Lücke)
**Reproduktion:**
1. `POST /api/einsaetze/:id/abschluss` ausführen.
2. `GET /api/admin/audit` lesen → kein `einsatz-abschluss`-Event.
3. Code-Review: `einsaetze.ts:166-186` (Abschluss) und `einsaetze.ts:193-232` (Reaktivierung) rufen **nirgends** `writeAuditEvent()`. Nur `logger.info` / `logger.warn`.

**Erwartetes Verhalten:** Jeder Abschluss und jede Reaktivierung erzeugt ein `audit:`-Doc mit `type="einsatz-abschluss"` bzw. `"einsatz-reaktivierung"`, `actorUsername`, `actorRolle`, `einsatzId`, `ipAddress`. Im Backoffice-Tab „Aktivität" sichtbar.

**Tatsächliches Verhalten:** Beide AuditEventTypes sind in `services/audit.ts:21-32` deklariert, aber **niemals geschrieben**. Spec §17.1 listet sie als zu auditierende Aktionen — Audit-Trail hat eine Lücke.

**Konsequenz:** Bei einer Datenstreitigkeit („Wer hat den Einsatz B26-008 reaktiviert?") gibt es keinen Audit-Eintrag. Nur ein pino-Log, das nach fly-Log-Retention (~30 Tage) weg ist.

**Fix-Vorschlag:** `writeAuditEvent()` in den beiden Handlern aufrufen, inkl. `actorUsername`, `actorRolle`, `einsatzId`, `ipAddress`. Bei Reaktivierung zusätzlich `details: { grund }`.

**Aufwand:** 0.5 PT.
**Confidence:** 10/10
**Triage:** AUTO-FIX.

---

## Hohe Findings (🟠)

### FINDING 6-1: Kein Server-Side-Logout / Token-Invalidierung

**Schweregrad:** 🟠 Hoch
**Reproduktion:**
1. Login → Token kopieren → localStorage löschen (clientseitig).
2. Mit kopiertem Token: `curl -H "Authorization: Bearer <token>" /api/admin/health` → 200 OK.
3. Token bleibt 8h (`SESSION_TTL_SEC`) gültig.

**Erwartetes Verhalten:** Server-Side-Token-Blacklist oder kurzer TTL + Refresh-Token-Pattern.

**Tatsächliches Verhalten:** JWT ist „stateless" — Logout = clientseitiger Token-Drop. Wenn ein Tablet gestohlen wird, bleibt der Token 8h gültig, auch wenn der Funktionär „Logout" drückt.

**Quelle:** `services/auth/jwt.ts:54-78` — kein Revocation-Mechanismus. Kein `/api/auth/logout`-Endpoint im Code (Grep: 0 Treffer).

**Konsequenz im Einsatz:** Ein bei einem Verkehrsunfall verlorenes Tablet kann bis zu 8h Zugriff geben — Mitglieder-Daten exfiltrierbar.

**Fix-Vorschlag:** Mittelfristig Token-Blacklist-Doc in CouchDB mit TTL = `SESSION_TTL_SEC`. Kurzfristig: `SESSION_TTL_SEC` auf 2h reduzieren (Trade-off mit Re-Login-Häufigkeit). Wahrscheinlich akzeptabel da fast immer im FF-Haus + WLAN.

**Aufwand:** Mittelfristig 2 PT, kurzfristig 5 min.
**Confidence:** 8/10
**Triage:** RÜCKSPRACHE (R-2 unten).

---

### FINDING 6-8: JWT_SECRET-Default in Produktion theoretisch möglich

**Schweregrad:** 🟠 Hoch
**Reproduktion:**
1. `apps/api/src/config.ts:45`: `JWT_SECRET: z.string().min(32).default("dev-secret-bitte-in-production-ueberschreiben-mit-fly-secrets")`.
2. Wenn fly secrets `JWT_SECRET` **nicht gesetzt** ist, läuft die App mit dem Dev-Default. Zod akzeptiert es (genau 64 Zeichen).
3. Jeder, der den Default-String kennt (öffentlich im Repo), kann JWTs für beliebige Rollen signieren.

**Erwartetes Verhalten:** In `NODE_ENV=production` hartes Verbot des Default-Werts → Server-Boot fail-loud.

**Tatsächliches Verhalten:** Server bootet still mit Default. Logs zeigen es nicht, weil JWT_SECRET ohnehin redactiert wird.

**Konsequenz:** Komplette Auth-Bypass möglich (privilege escalation auf admin).

**Fix-Vorschlag:** In `config.ts` einen `superRefine`-Check ergänzen: wenn `NODE_ENV === "production"` und der Default-String aktiv ist → `throw`.

**Aufwand:** 5 min.
**Confidence:** 10/10
**Triage:** AUTO-FIX.

---

### FINDING 6-7: Bootstrap-Admin-Default-Passwort nicht erzwungen geändert

**Schweregrad:** 🟠 Hoch
**Reproduktion:**
1. Default `BOOTSTRAP_ADMIN_PASSWORD = "admin12345678"` (im Repo öffentlich).
2. Beim ersten Login: kein Forced-Change-Flow.
3. Wenn fly secrets vergessen wurde → publicly-known PW gibt admin-Zugriff.

**Erwartetes Verhalten:** Beim ersten Login muss ein neues Passwort gesetzt werden (`mussPasswortAendern: true` im Benutzer-Doc). Bis dahin gibt das Backend nur einen „Setup-Token", der nur den Change-Password-Endpoint freischaltet.

**Tatsächliches Verhalten:** Default wird angelegt, geloggt, ohne weiteren Zwang.

**Quelle:** `services/auth/bootstrap.ts:32-47` — kein `mussPasswortAendern`-Flag.

**Konsequenz:** Bei Setup-Schlampe (Secrets-Vergessen) → admin-Zugang offen.

**Fix-Vorschlag:** Flag im Benutzer-Doc, Login-Response zeigt es, UI erzwingt Change. Plus: Default-PW im Bootstrap mit zufälligem UUID-Hash, der nur in fly-Logs erscheint (nicht im Repo).

**Aufwand:** 2 PT.
**Confidence:** 9/10
**Triage:** RÜCKSPRACHE (R-3 unten).

---

### FINDING 1-7: PouchDB-Quota-Handling unbestätigt

**Schweregrad:** 🟠 Hoch (silent data loss)
**Reproduktion:**
1. Grep nach `QuotaExceededError` in `apps/pwa` → 0 Treffer.
2. PouchDB-Inserts in `chronik-sync.ts`, `report-state.ts`, `seed.ts` haben kein expliziten Catch.
3. Bei Storage-Full im Browser: `QuotaExceededError` wirft, Promise rejected, Auto-Save schluckt es (siehe `chronik-sync.ts:79` — catch wird nur für ApiError differenziert).

**Erwartetes Verhalten:** Klare User-Meldung „Tablet-Speicher voll — bitte alte Einsätze aus Archiv löschen" + Backend-Sync forcieren.

**Tatsächliches Verhalten:** Vermutlich stiller Drop — Eintrag verloren, kein UI-Hinweis. Nicht reproduzierbar ohne echtes Tablet.

**Konsequenz:** Bei langen Einsätzen (4h) mit vielen Audio-Diktaten könnte ein Tablet-Speicher voll laufen, ohne dass es jemand merkt.

**Fix-Vorschlag:** Globaler PouchDB-Error-Handler, der bei `name === "QuotaExceededError"` einen Banner triggert.

**Aufwand:** 1 PT.
**Confidence:** 7/10 (Reproduktion in Realität nötig).
**Triage:** RÜCKSPRACHE (R-4 unten — fix ist klar, aber Reproduktion noch offen).

---

### FINDING 8-2: Mock-Modus von BlaulichtSMS heimlich aktivierbar

**Schweregrad:** 🟠 Hoch
**Reproduktion:**
1. `services/blaulichtsms/client.ts:213-217`: wenn `hasBlaulichtSMS() === false` (Credentials fehlen), gibt der Client die In-Memory-Mockliste zurück.
2. Wenn in Produktion versehentlich die Credentials nicht gesetzt sind, läuft der Poller still im Mock-Modus → **keine echten Alarme**.
3. Im Health-Endpoint sichtbar? Schaut ja: `services/health.ts` prüft die Credentials.

**Erwartetes Verhalten:** In `NODE_ENV=production` hartes Verbot des Mock-Modus → Server-Boot fail-loud wenn Credentials fehlen.

**Fix-Vorschlag:** In `config.ts` superRefine: in Production müssen BlaulichtSMS-Credentials gesetzt sein (oder explizit `NO_BLAULICHTSMS=1` als Override für Tests).

**Aufwand:** 10 min.
**Confidence:** 9/10
**Triage:** AUTO-FIX (mit `NO_BLAULICHTSMS=1`-Override für Tests).

---

## Mittlere Findings (🟡)

### FINDING 9-7: Audit-Endpoint hat keinen Offset-Paginator

**Schweregrad:** 🟡 Mittel
**Beobachtung:** `/api/admin/audit` akzeptiert nur `limit` (max 200). Bei 50k+ Events keine Pagination möglich.
**Fix-Vorschlag:** `?before=<reverseTs>` als Cursor-Parameter ergänzen.
**Triage:** RÜCKSPRACHE (UI-Anforderung muss geklärt werden).

---

### FINDING 8-10: Whisper-Button-UX bei fehlendem Whisper-Backend

**Schweregrad:** 🟡 Mittel
**Beobachtung:** Spec §24.1 sagt Whisper-WASM ist UI-vorhanden, aber Backend-Layer fehlt. Wenn User Diktat-Knopf drückt — was passiert?
**Fix-Vorschlag:** Diktat-Button bei fehlendem Whisper deaktivieren ODER klar als „nimmt Audio auf, Transkription folgt manuell" labeln.
**Triage:** RÜCKSPRACHE (R-5).

---

### FINDING 9-1: Polling-Last-Skalierung

**Beobachtung:** 5 Tablets × Einsatz-Poll 30s + Florian × 8s + Chronik-Poll 8s + Fahrzeugberichte-Poll 15s = ca. 60 req/min auf der API. Pro Request CouchDB-Volldurchlauf der Einsätze (kein Mango-Index).
**Konsequenz:** Bei wachsendem Archiv (1000+ Einsätze) wird der Filter linear langsamer. Akzeptabel für FF Eberstalzell, problematisch für Multi-Tenant.
**Triage:** Notiz für V1.1 — Mango-Index auf `type` + `status` ergänzen.

---

## Niedrige Findings (🟢)

### FINDING 8-12: Keine TODO/FIXME-Kommentare

**Beobachtung:** Grep nach `TODO|FIXME|HACK|XXX` in `apps/` → 0 Treffer. Sehr saubere Codebase.
**Bewertung:** Positiv.

### FINDING 3-2: Reaktivierungs-Grund-Validation funktional

**Beobachtung:** `ReaktivierenBodySchema` verlangt `min(10, "Reaktivierungs-Grund mind. 10 Zeichen")`. Validiert serverseitig. Client-side-Validation müsste in der UI bestätigt werden — nicht prüfbar im Lese-Audit.
**Bewertung:** Backend ✓, Frontend muss live geprüft werden.

### FINDING 1-1: Offline-Erfassung funktioniert

**Beobachtung:** PouchDB-Local + Outbox-Pattern (`chronik-sync.ts`) + ErrorBoundary korrekt implementiert. Per Spec §14.3 alle Aktionen mit ✓ markiert sind im Code abgedeckt.
**Bewertung:** Positiv.

### FINDING 10-1 bis 10-10: Field-Test ausstehend

**Beobachtung:** Hardware-Realität (Handschuhe, Sonne, Akku, Touch) ist nicht im Read-Audit prüfbar. Spec §7.4 / §10.6 hat sinnvolle Annahmen, aber empirische Validation steht aus.
**Empfehlung:** Übungsabend mit 4 Tablets, Stoppuhr, FF-Mitglieder ohne Vorbildung.

---

## Auto-Fix durchgeführt

| ID | Finding | Fix | Status |
|---|---|---|---|
| AF-1 | F-7-1 Audit-Cleanup-Worker | Neuer Worker + ENV `AUDIT_RETENTION_DAYS` | ✅ |
| AF-2 | F-7-2 Audit-Events bei Abschluss/Reaktivierung | `writeAuditEvent()` in den 2 Handlern | ✅ |
| AF-3 | F-6-8 JWT_SECRET-Strict-Check in Production | `superRefine` in Zod-Schema | ✅ |
| AF-4 | F-8-2 BlaulichtSMS-Mock-Verbot in Production | `superRefine` in Zod-Schema | ✅ |

---

## Rücksprache benötigt

### R-1: Berichts­nummer-Vergabe — Implementierungs-Strategie

**Default-Empfehlung:** Counter-Doc `seq:<jahr>:<kategorie>` mit Optimistic-Locking via `_rev`. Bei Offline-Vergabe Provisorische-Nummer + Konflikt-Auflösung im Backoffice. Aufwand 8-16 PT.

**Frage:** Schmälerer V1.0-Scope möglich (z. B. nur Server-Side-Vergabe, kein Offline-Fall, keine Konflikt-UI)? Oder vollständig wie Spec §12?

### R-2: Server-Side-Logout / Token-Lebensdauer

**Default-Empfehlung:** Kurzfristig `SESSION_TTL_SEC` auf 2h reduzieren. Mittelfristig Token-Blacklist-Doc.

**Frage:** Akzeptabel das Mitglieder alle 2h neu einloggen? Oder lieber 8h und mittelfristiger Fix?

### R-3: Bootstrap-Admin-First-Login-Zwang

**Default-Empfehlung:** Flag `mussPasswortAendern` im Benutzer-Doc, Login-Response liefert es, UI erzwingt Change-Form.

**Frage:** Sinnvoll für eine FF mit einem einzigen Admin (Gerald), oder Overkill?

### R-4: PouchDB-Quota-Handler

**Default-Empfehlung:** Globaler Quota-Handler + UI-Banner „Tablet-Speicher voll".

**Frage:** Reproduzierst du das auf einem Test-Tablet, oder simulieren wir es im Code?

### R-5: Whisper-Button-UX bis WASM da ist

**Default-Empfehlung:** Aktuell zeigt der Diktat-Button vermutlich „Aufnahme läuft → Transkription pending forever". Klares Labeling „Audio aufgezeichnet — Transkription manuell nachtragen".

**Frage:** Reicht das, oder Diktat-Knopf bis Phase 5 deaktivieren?

---

## Production-Readiness-Empfehlung

**Bedingungs-Go** — Produktiv-Betrieb startbar nach Erledigung der drei Auto-Fixes (AF-1..AF-4), der Spec-konforme Berichts­nummer-Vergabe (R-1) und einem Übungsabend (Domänen 10 + 12). Vorher sollte Geralds Bestätigung zu R-2/R-3 vorliegen.

**Begründung:**
- Die Backend-Auth/Schreibschutz-Pipeline ist solide.
- Die externe Resilienz (BlaulichtSMS-Re-Login, syBOS-Mapper-Defensive) ist gut.
- Die DSGVO-Lücke (Audit-Cleanup) ist mit AF-1 behebbar.
- Die Audit-Trail-Lücke (AF-2) ist klein, aber compliance-relevant.
- Berichts­nummer-Lücke ist die größte offene Frage — Spec-konform, aber im Code nicht da. Kann ohne Produktiv-Druck noch eine Iteration laufen (Geräte können auch ohne Berichts­nummer Berichte fahren), aber sollte vor dem ersten Behörden-Audit gefixt sein.

---

## Was nicht im Read-Audit geprüft wurde

- Hardware-/Field-Realität (Domänen 10 + 12) — verlangt Tablet-Tests
- E2E-Race-Condition-Verhalten unter Last (TS-2.1 reale Kollision)
- Echte BlaulichtSMS-Antwort-Schema-Varianten
- Browser-spezifische Quirks (insbesondere ältere Android-WebViews)

**Empfehlung:** Field-Test-Übungsabend mit Übungs-Drehbuch aus §AUSWERTUNG → STRESS-SZENARIO einplanen.

# Testprotokoll · HotDoc v0.1.8 · Forensisches Audit

**Datum:** 2026-06-01
**Auditor:** Senior QA & UX-Performance-Engineer (Claude)
**Auftrag:** Funktion · Datenintegrität · UX · Design · Performance
**Tabu (respektiert):** syBOS-Anbindung, Personaldaten, Formular-Layouts wurden NUR gelesen, nichts geändert.
**Methodisch:** alle Befunde mit Datei:Zeile-Beleg, Lighthouse-Werte gemessen, Subjektives als solches gekennzeichnet.

---

## 1 Management-Summary

Die App ist **funktional einsatzbereit**, das System ist **überraschend sauber** in Sachen Test-Daten und Fachsprache. Die Test-Phase mit echten Kameraden kann starten — **aber** drei Bereiche brauchen vor einem produktiven Live-Einsatz Aufmerksamkeit:

1. **Backoffice-Florianstation-Tab** ist eine optische Falle (S1): Mock-Funkrufnamen, statische "0"-Zähler, deaktivierter Speichern-Button mit Tooltip „Speichern in nächster Iteration aktiviert", expliziter Phase-4-Hinweis. Auf der **Tablet-PWA** (was die Kameraden tatsächlich nutzen) ist das nicht das Problem — der Backoffice-Tab ist nur für den Funktionär gedacht.
2. **Sicherheits-Lücke** (S1, F-01): `POST /api/auth/tablet/register` (Legacy-Endpoint neben `pin-register`) erlaubt ohne Auth/RateLimit unbegrenzte Token-Generierung. Internet-erreichbar wenn API frei zugänglich.
3. **Trust-Killer im Tablet** (S1, U-01): „Entwurf speichern"-Button in BerichtPage hat keinen `onClick`-Handler — Klick passiert nichts. Auto-Save funktioniert (2,5 s Debounce), aber der User weiß das nicht.

**Insgesamt 124 Befunde** (45 Funktion + 20 Test-Artefakte + 40 UX/Design + 10 verwaiste Funktionen + 9 Performance).
Verteilung: **S1 11, S2 38, S3 65, S4 10**.

Lighthouse-Performance: **77/100** (FCP 3,7 s, LCP 4,3 s — durch render-blocking + 779 KB-Bundle). Auf dem APK/Tablet-WLAN-Setup vermutlich schneller; hier gemessen aus Mitteleuropa über Fly Frankfurt.

---

## 2 Performance-Scorecard

| Metrik | Gemessen | Ziel (Mobile) | Bewertung |
|---|---|---|---|
| Lighthouse Performance | 77/100 | ≥ 90 | ⚠ leicht unter Ziel |
| First Contentful Paint (FCP) | 3,7 s | < 1,8 s | ❌ 2× zu langsam |
| Largest Contentful Paint (LCP) | 4,3 s | < 2,5 s | ❌ 1,7× zu langsam |
| Total Blocking Time (TBT) | 0 ms | < 200 ms | ✅ perfekt |
| Cumulative Layout Shift (CLS) | 0,002 | < 0,1 | ✅ perfekt |
| Speed Index | 3,7 s | < 3,4 s | ✅ Grenzbereich |
| Time to Interactive (TTI) | 4,3 s | < 3,8 s | ⚠ knapp drüber |
| PWA-Bundle JS (unkomprimiert) | 779 KB | < 300 KB | ❌ |
| PWA-Bundle JS (gzip ≈) | 229 KB | < 100 KB | ❌ |
| PWA-Bundle CSS | 72 KB | < 50 KB | ⚠ |
| Render-blocking Resources | ~1 600 ms Einsparpotenzial | 0 | ❌ |
| Unused JavaScript | 176 KB | < 50 KB | ❌ |
| Unused CSS | 13 KB | < 10 KB | ⚠ |
| Unoptimierte Bilder | 106 KB Einsparpotenzial | 0 | ⚠ |
| Logo-PNG | 113 KB | < 30 KB (WebP) | ⚠ |
| Total dist/ | 4,3 MB | < 2 MB | ⚠ |

**Backend** (manuell, nicht load-getestet):
| Aspekt | Befund | Ziel |
|---|---|---|
| Endpoint /healthz | < 200 ms | < 200 ms ✅ |
| O(n)-Scans über `einsatz:`/`fzgber:` | 7 Stellen (siehe Befunde) | Mango-Indexe |
| Puppeteer-Single-Browser | Kein Disconnect-Recovery (F-22) | re-launch bei `disconnected`-Event |
| PDF-Render-Timeout | nicht gesetzt (F-23) | 30 s |
| In-memory positions-state | unbounded ohne periodische Eviction (F-24) | setInterval-Cleanup |

---

## 3 Befund-Tabelle

### 3.1 PHASE 1 — Funktion (F-01 … F-45)

| ID | Schweregrad | Ort (Datei:Zeile) | Beobachtung | Reasoning | Empfehlung |
|---|---|---|---|---|---|
| F-01 | **S1** | `apps/api/src/routes/auth.ts:187-234` | `POST /api/auth/tablet/register` (Legacy) hat **keinen `requireAuth`**, **kein rate-limit**. Body `{msisdn, fahrzeugId, deviceId}` → vollwertiger `mannschaft`-Token. | Verifikation: Z. 187 `(async (req, res) => {` ohne Middleware. `pin-register` (Z. 139) hat `loginRateLimit`. Schluss: jeder Internet-Client kann unbegrenzt Token erhalten. | Endpoint entfernen ODER `loginRateLimit` + Tailscale-only. |
| F-02 | **S1** | `apps/api/src/workers/auto-close-stale.ts:99-107` + `routes/einsaetze.ts:587` | Auto-Close 6 h prüft `einsatz.geaendertAm`. Fahrzeugbericht-PUT updatet nur `fzgber.geaendertAm`, NICHT den Einsatz. | Verifikation: PUT-fzgber Z. 587 setzt nur `merged.geaendertAm` am fzgber. Stille Tipparbeit (Mannschaft, Geräte) ohne Chronik-Eintrag → Einsatz scheint "tot" → auto-geschlossen → Datenverlust durch Schreibschutz. | Auto-Close muss `max(fzgber.geaendertAm)` mit-betrachten ODER fzgber-PUT touch Einsatz.geaendertAm. |
| F-03 | **S1** | `apps/api/src/routes/einsaetze.ts:165-228` | Manuell-Anlage: zwischen `db.get(docId)` (Z. 165) und `db.insert(doc)` (Z. 228) kein Lock. Parallel-POST mit gleicher idempotencyKey → zweiter Insert → 409 von CouchDB → 500 statt sauberer Idempotenz-Response. | Kein try/catch um `db.insert`. CouchDB-409 propagiert zu Express-Default-500. Idempotenz schützt nur sequentielle Retries, nicht parallele Doppel-Posts. | try/catch um insert; bei 409 GET wiederholen + existing doc zurückgeben. |
| F-04 | **S2** | `apps/api/src/routes/einsaetze.ts:242` (`abschluss`) | `db.get(id)` ohne try/catch. Unbekannte ID → 500-Crash statt 404. | Vgl. Z. 626-633 (chronik) — dort sauber. Inkonsistent. | Wrapper `getEinsatzOr404` einführen, in allen `:id`-Routen. |
| F-05 | **S2** | `apps/api/src/routes/einsaetze.ts:352` (`verwerfen`) | Selbes Muster wie F-04 — kein try/catch um `db.get`. | Verifikation: Z. 352-355. | Analog F-04. |
| F-06 | **S2** | `apps/api/src/routes/einsaetze.ts:441` (`reaktivieren`) | Selbes Muster — 404 → 500. | | Analog F-04. |
| F-07 | **S2** | `apps/api/src/routes/einsaetze.ts:483-535` | `PUT /:id` allgemeines Update: nur `requireAuth()` (keine `minRole`). Mannschafts-Tablet kann **Hauptbericht der Florianstation** überschreiben (z. B. `meldungEinsatzleitung`, `einsatzort`). | Verifikation: Z. 483 ohne minRole. Kein Field-Filter. | `requireAuth("einsatzleiter")` setzen; Mannschafts-Tablets dürfen nur ihren `fzgber` PUT-en. |
| F-08 | **S2** | `apps/api/src/routes/einsaetze.ts:483-535` | PUT-Route ohne Field-Allowlist. Client kann `status`, `schreibschutz`, `verworfen`, `_id`, `erstelltAm` setzen — Workflow-Endpoints werden umgangen. | Verifikation: `merged = {...current, ...req.body, _id, _rev, type, geaendertAm}` — nichts gestrippt. | Whitelist editierbarer Felder; `status/schreibschutz/verworfen/_id/_rev/type/erstelltAm/reaktivierungen` aus `req.body` entfernen. |
| F-09 | **S2** | `apps/pwa/src/lib/einsatz-outbox.ts:120-128` | Outbox löscht Items bei **jedem** 4xx — auch 401 (Token tot) oder 423 (Schreibschutz). | Offline-Tablet sammelt 5 Übungen → online → Token expired → 401 → alle 5 Items futsch. | Nur 400/422 löschen; bei 401 pending lassen, 401-Handler in apiCall reloaded ohnehin. |
| F-10 | **S2** | `apps/api/src/services/auth/jwt.ts:54-78` | `verifySession` castet `payload.rolle as Rolle` ohne Runtime-Allowlist. | Defense-in-Depth fehlt. | Whitelist `["mannschaft","einsatzleiter","funktionaer","admin"]`, sonst null. |
| F-11 | **S2** | `apps/api/src/services/pdf/template.ts:258-263` | `triBox(d.pflichtbereich === true \|\| null, "JA")` — der `\|\| null`-Trick erzeugt für `false`-Werte das ☐-Outline-Glyph statt der gefüllten weißen Box. NEIN-Spalte bei `pflichtbereich=true` zeigt ☐ statt □. | Verifikation: `triBox`-Handler unterscheidet `true/false/null` mit 3 Glyphen. Bug verschüttet die Information "explizit beantwortet" vs. "ignoriert" im PDF. | `triBox(d.pflichtbereich === true, …)` ohne `\|\| null`; analog für NEIN-Spalte. |
| F-12 | **S3** | `apps/api/src/routes/einsaetze.ts:298-316` | Cascade-Abschluss `db.bulk({docs})`. Stale-`_rev` (Live-Sync-Race) → bulk-Item-Error → nur warn-log. Fahrzeugbericht bleibt offen als Geist. | Kein Retry, kein per-doc Log. | Bei `error: "conflict"` frischen `_rev` holen + retry 1×. |
| F-13 | **S3** | `apps/api/src/workers/phantom-fzgber-cleanup.ts:113-117` | Cleanup skipt Einsätze mit ungültigem `einsatzende`-Datum. Leere fzgber bleiben für immer. | Edge-Case, kein Schaden — aber Wartungs-Schulden bei Datums-Korruption. | Diagnose-Log, dass solche Einsätze existieren. |
| F-14 | — | `apps/api/src/workers/phantom-fzgber-cleanup.ts:74-87` | `isPhantom` prüft nicht `verworfen`. **Aber** verworfen setzt status=abgeschlossen → wird gefiltert. Kein Bug. | RISIKO – nicht verifiziert: gibt es Pfad wo `verworfen=true` aber status="in_arbeit"? Nicht gefunden. | Keine Aktion. |
| F-15 | **S2** | `routes/einsaetze.ts:617-658` + `lib/chronik-sync.ts:73-78` | Chronik-POST bei `schreibschutz` → 423. PWA-Caller konsumiert das schweigend. Diktat erscheint lokal als gepostet, ist backend-tot. | console.warn ohne UI-Feedback. | Roter Marker am Chronik-Item bei 423 ODER Diktat-Button bei `active.abgeschlossen` deaktivieren. |
| F-16 | **S2** | `apps/api/src/routes/positions.ts:55-75` | `POST /api/positions` ohne rate-limit pro fahrzeugId. Bug-Loop am Client kann State fluten. | nur `requireAuth()`. | Per-fahrzeugId rate-limit (max 2 Ping/s). |
| F-17 | **S4** | `apps/pwa/src/lib/app-update.ts:54-99` | `current === "web"` → `parseInt("web") = NaN`. `semverCompare` returnt 0 → `updateAvailable = false`. Funktioniert, aber fragil. | OK in der Logik, aber dünn. | Explicit-Branch `if (installed === "web") return {...available:false}`. |
| F-18 | **S3** | `apps/pwa/src/components/UpdateBanner.tsx:39-62` | Polling 6 h. Bei Hotfix sieht Tablet das erst nach max. 6 h. Visibility-Change → kein Re-Check. | Nur `setInterval(check, 6h)`. | Bei `visibilitychange → visible` `check()` triggern. |
| F-19 | **S3** | `routes/auth.ts:43-46` | `LoginRequestSchema.safeParse(undefined)` würde 400 geben, aber bei body=null oder Content-Type-Drift Edge-Case. | safeParse fängt ab → akzeptabel. | OK. |
| F-20 | **S3** | `apps/pwa/src/pages/BerichtPage.tsx:300-400` | `runPoll` macht Side-Effects (`setNewEinsatzPopup`) IN `setEinsaetze`-Updater. React-StrictMode doppelt-Invoke → Pop-Up zweimal. | Verifikation: `setEinsaetze((prev) => {...anyNewToUs = true...})`. | Side-Effects aus dem Updater rausziehen; Vergleich außerhalb. |
| F-21 | — | `BerichtPage.tsx:1689-1693` | CloseTabConfirmModal-Error wird im Modal angezeigt → OK. | | Keine Aktion. |
| F-22 | **S2** | `apps/api/src/services/pdf/generator.ts:13-30` | `browserPromise` Single-Init. Bei Puppeteer-Disconnect (Chromium-Crash unter Load) bleibt der Promise auf tot-Browser stehen — alle nachfolgenden PDF-Renders werfen "Target closed" **endlos** ohne Recovery. | Kein `browser.on("disconnected", …)`-Listener. | `browser.on("disconnected", () => browserPromise = null)`. |
| F-23 | **S2** | `apps/api/src/routes/pdf.ts:75-106` + `generator.ts:33-47` | `renderPdf` ohne Timeout. Chromium-Bug bei großem Anhang → Express-Worker blockiert. | `page.pdf()` ohne Timeout; `setContent` default 30 s. | `Promise.race` mit 30 s Reject, hartes Cleanup. |
| F-24 | **S2** | `apps/api/src/services/positions-state.ts:33-37` | In-memory Map ohne Begrenzung. `evictOlderThan` nur in GET-Path. | Memory-Leak im Idle. | Periodischer Eviction (setInterval 5 min). |
| F-25 | **S3** | `apps/api/src/routes/positions.ts:62` | `session.fahrzeugId as FahrzeugPing["fahrzeugId"]` ohne Whitelist. | Indirekt durch pin-register-Regex geschützt, aber defensiv schwach. | Allowlist-Check defensiv hinzufügen. |
| F-26 | **S3** | `apps/pwa/src/components/CloseTabConfirmModal.tsx:39-66` | `useEffect`-Reset bei jedem `open=true` → Verwerfen-Grund verloren beim Backdrop-Click. | UX-Annoyance, kein Bug. | Niedrig. Subjektiv. |
| F-27 | **S4** | `apps/pwa/src/lib/api.ts:95-108` | 401 → `window.location.reload()`. Multi-Parallel-401 → Browser dedupliziert. | Race ist benign. | OK. |
| F-28 | — | `apps/api/src/routes/auth.ts:82-86` | Login-Success-Write: spread enthält `_rev` aus findBenutzerByUsername → OK, kein Bug. | RISIKO – verifiziert dass `findBenutzerByUsername` Z. 244-258 das ganze Doc liefert. | Keine Aktion. |
| F-29 | **S2** | `routes/einsaetze.ts:25-63` | `GET /api/einsaetze` lädt ALLE Einsätze + filtert in JS. O(n) ohne View/Index. | Bei tausenden Einsätzen über Jahre langsam. | Mango-Index oder CouchDB-View für `type+status+alarmierungZeit`; paginieren. |
| F-30 | **S2** | `routes/einsaetze.ts:483-535` | PUT ohne Schutz für `koordinaten`/`alarmierungZeit`/`einsatzTyp`/`alarmId`. EL kann `alarmierungZeit` umschreiben → bricht Sortierung + Auto-Close-Cutoff. | Field-Allowlist fehlt. | Sensible Felder strippen. |
| F-31 | **S2** | `BerichtPage.tsx:1683-1685` | `tabToClose.id === activeId` → `abschliessen(true)` (synchron), `return`. Upload-State-Error wird vom modalen Close überdeckt. | uploadFahrzeugbericht setzt nur State, throw'd nicht. | abschliessen async + Modal-Close erst nach `await`. |
| F-32 | **S3** | `apps/api/src/services/auth/jwt.ts:36-52` | `autoReleaseAt`-Claim kann hinter `expiresAt` liegen → toter Claim. | Kein Vergleich. | `clamp(autoReleaseAt, max=expiresAt)`. |
| F-33 | — | `HandoffBanner.tsx:54-64` | `release()` ist try-finally. OK. | | Keine Aktion. |
| F-34 | **S2** | `routes/auth.ts:557-576` | `POST /api/auth/handoff/release` invalidiert Token nicht serverseitig. JWT bleibt gültig bis expiresAt. | Verifikation: nur Audit-Event. JWT-stateless. | Token-Blacklist im CouchDB pflegen (sub+iat). |
| F-35 | **S2** | `BerichtPage.tsx:730-750` | useEffect-Dep `[active?.id, …]` triggert Live-Sync bei jedem Tab-Switch sofort → leerer fzgber wird gePUT-et. Phantom-Cleanup räumt erst 2 h nach Abschluss ab. | `setTimeout(2500)` greift erst beim zweiten Edit. | Skip-Sync wenn `active.fahrer == null && active.kdt == null && mannschaft.every(m=>!m.person)`. |
| F-36 | **S3** | `routes/einsaetze.ts:538-597` | PUT-fzgber: zwei Tablets fürs gleiche Fahrzeug → zweiter 409 → durchgereicht als 500. | Kein retry-on-conflict. | try/catch + retry max 1×. |
| F-37 | **S3** | `BerichtPage.tsx:1106-1113` | Solo-Tablet-Abschluss: console.warn bei Fehler, sonst nichts. 403 (Mannschaft-Rolle) → User merkt nichts, Einsatz bleibt aktiv. | Nur console.warn. | UI-Banner bei 403. |
| F-38 | **S3** | `apps/api/src/lib/auth-middleware.ts:18-38` | 403-Response zeigt nur `required` Rolle, nicht `actual`. Schwer zu debuggen. | | `actual: session.rolle` mit-liefern. |
| F-39 | **S4** | `apps/api/src/workers/blaulichtsms-poller.ts:33-34` | `logger.info` nur bei `alarms.length > 0` → stille Heartbeats. | | logger.debug bei leeren Polls. |
| F-40 | **S3** | `routes/einsaetze.ts:341-421` | `/verwerfen` cascade-Cleanup: bulk-throw → warn-log → Einsatz bleibt verworfen, fzgber offen. Inkonsistenter State. | | Marker `cascade_failed=true` für späteres Aufräumen. |
| F-41 | — | `apps/pwa/src/lib/handoff.ts:68-93` | `releaseHandoff` nutzt fetch direkt (nicht apiCall) → kein Reload-Race. OK. | | Keine Aktion. |
| F-42 | **S3** | `routes/einsaetze.ts:639-657` | Chronik-Append linear search via `chronik.find(e=>e.id===…)`. O(n²) bei 500+ Einträgen. | <100 Einträge egal. | Bei großen Einsätzen Sub-Docs pro Eintrag. |
| F-43 | — | `routes/einsaetze.ts:286-317` | Cascade-Docs enthalten `_rev` durch include_docs:true → OK. | | Keine Aktion. |
| F-44 | **S3** | `BerichtPage.tsx:283-326` | `inheritPersonalRef` bleibt gefüllt wenn nächster Poll keinen neuen Einsatz liefert. Personal-Vererbung leakt auf nächsten BlaulichtSMS-Alarm. | | Ref nach 30 s automatisch leeren. |
| F-45 | **S2** | `routes/einsaetze.ts:703-790` | `GET /api/fahrzeugberichte/meine`: N+1 — pro Item `db.get(einsatzId)`. | Bei 100 Einträgen 100 sequentielle Couch-Roundtrips. | Bulk-fetch oder Join via Mango. |

**Verwaiste Funktionen (export-but-unused):**

| ID | Datei:Zeile | Verwaiste Funktion | Begründung |
|---|---|---|---|
| O-01 | `apps/pwa/src/lib/app-update.ts:105` | `triggerUpdateDownload` | Nirgends importiert. UpdateBanner nutzt `installApkUpdate`. |
| O-02 | `apps/pwa/src/lib/platform.ts:158` | `setKeepAwake` | Keine Aufrufstelle. |
| O-03 | `apps/pwa/src/lib/platform.ts:128` | `onAppStateChange` | Keine Aufrufstelle. |
| O-04 | `apps/pwa/src/lib/platform.ts:95` | `onNetworkChange` | Keine Aufrufstelle. |
| O-05 | `apps/pwa/src/lib/platform.ts:60` | `secureRemove` | Keine Aufrufstelle. |
| O-06 | `apps/pwa/src/lib/audio.ts:118` | `statusLabel` | Nirgends importiert; geo.ts hat eigene Variante. |
| O-07 | `apps/pwa/src/lib/report-state.ts:83` | `clearReportStates` | Sollte bei resetSetup gerufen werden — fehlt. |
| O-08 | `apps/api/src/services/pdf/generator.ts:49` | `shutdownPdfGenerator` | In server.ts kein SIGTERM-Handler. |
| O-09 | `apps/api/src/workers/blaulichtsms-poller.ts:187` | `stopBlaulichtSmsPoller` | Server.ts kein Graceful-Shutdown. |
| O-10 | `apps/pwa/src/lib/app-update.ts:43` | `getInstalledVersion` | Nur intern genutzt — export überflüssig. |

---

### 3.2 PHASE 2 — Datenintegrität & Test-Artefakte (T-01 … T-20)

**Tablet-PWA ist auffallend sauber.** Befunde konzentrieren sich auf das **Backoffice-Web** (Admin-Tool für Funktionär, nicht für Kameraden). Tablet-User sehen das nicht direkt.

| ID | Schweregrad | Ort (Datei:Zeile) | Treffer | Wo sichtbar? | Begründung | Empfehlung |
|---|---|---|---|---|---|---|
| T-01 | **S1** | `apps/backoffice/src/pages/Florianstation.tsx:262` | `["Tank Eberstalzell", "Pumpe Eberstalzell", "Kommando Eberstalzell", "MTF Eberstalzell"]` als hardcoded Liste mit Badge "standby" | UI · Backoffice "Florianstation"-Tab | Suggeriert Live-Daten, sind Phantom-Einträge. Auch wenn echte Fahrzeuge laufen — ändert sich nicht. | Spalte entfernen oder echte Daten aus `/api/einsaetze/:id/fahrzeugberichte`. |
| T-02 | **S1** | `apps/backoffice/src/pages/Florianstation.tsx:189-251` | `<input defaultValue={...} />` ohne `onChange`/`onBlur` für 9 Felder; Save-Button disabled. | UI · Backoffice "Florianstation" | Eingaben gehen schweigend verloren. Save-Button ist disabled mit `title="Speichern in nächster Iteration aktiviert"`. | Tab verstecken bis Save-Path implementiert ODER Save-Path bauen. |
| T-03 | **S1** | `apps/backoffice/src/pages/Florianstation.tsx:146` | `Nur Florianstation eingezeichnet — Live-Position-Sharing via SSE folgt mit Phase 4.` | UI · Backoffice | Identisch zum bereits in PWA gefixten Bug (commit 20ad52f), aber im Backoffice noch drin. | Hinweis entfernen oder umformulieren. |
| T-04 | **S1** | `apps/backoffice/src/pages/Florianstation.tsx:167` | `title="Speichern in nächster Iteration aktiviert"` | UI · Hover am disabled Button | Verrät Test-Status. | Button + Tooltip entfernen. |
| T-05 | **S1** | `apps/backoffice/src/pages/Florianstation.tsx:309-311` | `<Stat label="Eingesetzt" value="0" />` etc. hardcoded auf "0". | UI · Aggregation-Card | Auch wenn AS-Trupps live laufen, zeigt "0 AS aktiv". **Sicherheitsrelevant** für AS-Überwachung. | Mit echten Aggregations-Werten füllen ODER Panel ausblenden. |
| T-06 | **S1** | `apps/backoffice/src/components/ManuellerBerichtModal.tsx:379` | `placeholder="Name (z. B. Pernkopf Gerald)"` | UI · Backoffice "Neuer Bericht" → Übung → Übungsleiter-Feld | Entwickler-Name als Placeholder — unprofessionell. | `placeholder="Name des Übungsleiters"`. |
| T-07 | **S1** | `apps/backoffice/src/components/ManuellerBerichtModal.tsx:478` | `Wird wie ein normaler Einsatz dokumentiert · Verrechnung folgt` | UI · Backoffice Lotsendienst-Footer | Verspricht nicht-implementiertes Feature. | Umformulieren oder Feature liefern. |
| T-08 | **S2** | `apps/pwa/src/components/CloseTabConfirmModal.tsx:318` | `placeholder="z.B. Fehlalarm, Test-Daten, falsch angelegt"` | UI · PWA Verwerfen-Grund | "Test-Daten" als Beispiel suggeriert dass App testbeladen ist. | `"z.B. Fehlalarm, doppelt angelegt, falsche Alarmierung"`. |
| T-09 | **S2** | `apps/backoffice/src/pages/Verwaltung.tsx:268-270` | "Florianstation"-Tab geroutet zu T-01...T-05-Mock-Seite. | UI · Backoffice-Tab-Leiste | Schaufenster-Falle bis T-01/02/03/04/05 gefixt. | Tab temporär entfernen oder hinter `?dev=1` verstecken. |
| T-10 | **S3** | `apps/api/src/config.ts:21` | `BOOTSTRAP_ADMIN_PASSWORD_DEV_DEFAULT = "admin12345678"` | Code-Only | Production-Validator existiert (Z. 139-145, wirft in Prod). Klartext im Source. | Akzeptabel solange Validator garantiert; in Prod Custom-Passwort setzen. |
| T-11 | **S3** | `apps/pwa/src/data/gear.ts:4-7` | `In Phase 2 wandert das in den Backend-Endpoint /api/config/geraete...` | Code-Only JSDoc | Phase-Referenz im Kommentar. Nicht UI-sichtbar. | OK oder Kommentar löschen. |
| T-12 | **S3** | `apps/backoffice/src/pages/Verwaltung.tsx:2729,2832` | `placeholder="z. B. 0676 1234567"` | UI · Tablet-Inventar | Format-Hilfe, legitim als Placeholder gekennzeichnet. | Lassen. |
| T-13 | **S2** | `apps/backoffice/src/pages/Florianstation.tsx:13-33` | `const HOME = { lat: 48.0884, lng: 13.9586 }` — hardcoded FF-Haus-Position, ignoriert Stammdaten + die in PWA gefixte korrekte Position 48.0396/13.9927. | UI · Backoffice-Map | Veraltete Position aus alter Spec. Map zeigt FF-Haus 5 km entfernt vom realen Standort. | Aus `packages/shared/src/constants/florian.ts` (`FLORIAN_POSITION`) importieren. |
| T-14 | **S3** | `apps/api/src/routes/admin.ts:14,19` + `apps/pwa/src/lib/api.ts:66` | Code-Kommentar erwähnt historischen `DemoBanner`. | Code-Only | Altlast, keine Code-Path mehr. | Kommentar refreshen. |
| T-15 | **S3** | `apps/api/src/services/pdf/lotsendienst.ts:366`, `template.ts:621`, `brand.ts:10` | Code-Kommentare `fake-logo`, `Fake-Annäherung`. | Code-Only | "fake" als Code-Wort in Kommentaren. Nicht UI. | OK. |
| T-16 | **S3** | `apps/pwa/src/components/AboutSection.tsx:153,163` + `AboutPanel.tsx` | Mail/Telefon Pernkopf in UI. | UI · About-Tab | Gewollt, ist Lizenzgeber. | OK. |
| T-17 | **S3** | `apps/api/src/services/sybos/mapper.test.ts:36-53` | `Email1: "manfred@example.at"`, `+436641234567`. | Code-Only Test | Vitest-Test, dev-only, nicht im Production-Build. | OK. |
| T-18 | **S2** | `apps/backoffice/src/components/ManuellerBerichtModal.tsx:476` | `Wird in der Florianstation als aktiver Einsatz angezeigt` | UI | Halbwahr solange T-01...T-05 — der Einsatz erscheint in der linken Liste, aber die rechte Mock-Spalte ignoriert ihn. | Nach Fix von T-01 stimmt's. |
| T-19 | **S3** | `apps/pwa/src/lib/chronik-sync.ts:109` | `// Einsatz noch nicht in CouchDB — z. B. Demo-Mock noch nicht synced` | Code-Only | Historischer Kommentar, Demo-Mock gibt's nicht mehr. | Kommentar löschen. |
| T-20 | **S4** | `apps/pwa/index.html:26` | `<title>HotDoc · FF Eberstalzell</title>` | UI · Browser-Tab | Korrekt, keine Demo-Anmutung. | OK. |

**Was sauber war (positiv vermerkt):**
- Keine `console.log`/`debugger` mit Debug-Output im UI-Pfad
- Keine TODO/FIXME/XXX/HACK
- Keine Mustermann/Doe/example.com
- BlaulichtSMS-Mock-Modus entfernt
- DEMO_ALARM-Phantom entfernt (Task 64)
- Bootstrap-Passwort-Validator aktiv
- prototype/lfa-b in .dockerignore
- Personal nur aus syBOS-Live-Sync
- Funkrufnamen sind echte FF-Eberstalzell-Stammdaten

---

### 3.3 PHASE 3 — UX (U-01 … U-21)

| ID | Schweregrad | Heuristik | Ort | Beobachtung | Empfehlung |
|---|---|---|---|---|---|
| U-01 | **S1** | 1, 5 | `BerichtPage.tsx:1538-1557` | "Entwurf speichern"-Button hat keinen onClick. Klick passiert nichts. Auto-Save (2,5 s) funktioniert, User weiß es nicht. | Entweder Button entfernen ODER an `syncBerichtLive(active)` koppeln + Toast "Zwischengespeichert · 14:23". |
| U-02 | **S2** | 4 | `BerichtPage.tsx:1804-1923` | Rotes "Neuer Einsatz"-Popup mit "OK"/"Abbrechen" — nichtssagend was die Buttons tun. | "Jetzt zum neuen Einsatz wechseln" (primary) + "Erst aktuellen fertig machen" (sekundär). |
| U-03 | **S2** | — | `BerichtPage.tsx:1538-1543` | "Entwurf speichern" widerspricht Zero-Data-Loss-Direktive (CLAUDE.md). | Dezenter Live-Status oben rechts. |
| U-04 | **S2** | 5 | `BerichtPage.tsx:1422-1438` | Fahrzeug-Chips inline IN der Bericht-Page wechseln SOFORT (kein Confirm). VehicleSwitcherModal hat Warnung, dieser Pfad umgeht sie. | Chips entfernen ODER alle auf `setVehicleSwitcherOpen(true)` umleiten. |
| U-05 | **S2** | 9 | `CloseTabConfirmModal.tsx:217-243` + Hauptauftrag-Warning Z. 190-205 | Hauptauftrag-Warning gleich groß wie restlicher Text. | Warning rot/groß; Primary-Text präziser: "Bericht jetzt abschließen & PDF erzeugen". |
| U-06 | **S2** | 2 | `NeuerEinsatzTabletModal.tsx:438-470` | Type-Selector "Manuell"/"Lotsendienst"/"Übung" — "Manuell" ist tech-jargonal für FF. Wechsel resetet nichts. | Labels: "Echter Einsatz" / "Lotsendienst" / "Übung". Reset on type-change. |
| U-07 | **S2** | 5 | `Setup.tsx:74-156` | Fahrzeug-Auswahl Auto-Submit ohne Confirm. Recovery nur über Funktionär. | Confirm-Modal vor Submit. |
| U-08 | **S2** | 7, 6 | `NeuerEinsatzTabletModal.tsx:473-530` | 20+ Einsatzarten als wrap-pills, scrollbar, kein Filter. | Search-Field mit Auto-Focus + "häufig"-Sektion (localStorage). |
| U-09 | **S3** | 1, 3 | `BerichtPage.tsx:1287-1322` | `<input type="time">` Auto-Override-Logik unsichtbar dokumentiert. Einmaliger Klick = stiller State-Change. | Inline-Hint "leer = aktuelle Zeit beim Abschluss übernehmen"; bei Eingabe: Pille "manuell überschrieben". |
| U-10 | **S3** | 2 | `BerichtPage.tsx:1329-1408` | "GH"/"≈" Pille (GraphHopper vs. Luftlinie) — Abkürzungen unverständlich. | Pille: "Route" / "Luftlinie". |
| U-11 | **S3** | 8 | `Topbar.tsx:81-130` | "Übergeben" (Warn-Color) optisch wichtiger als "Fahrzeug wechseln" (häufiger). | "Fahrzeug wechseln" neutraler/sekundär, "Übergeben" als Icon-Only mit Tooltip. |
| U-12 | **S3** | 3, 4 | `BerichtPage.tsx:1562-1644` | Fusszeile mit 5 textuellen Aktionen, "Setup"-Link kann Tablet-Registrierung resetten. | Auf {Version, Funkrufname, FX-Toggle} reduzieren; "Setup" hinter Long-Press. |
| U-13 | **S3** | 1, 4 | `EinsatzTabs.tsx:55-69` | "+"-Tab klein, hat aber bedeutende Aktion. | Tooltip + ARIA erweitern. |
| U-14 | **S3** | 9 | `HandoffModal.tsx:78-101` | Countdown ohne "Refresh-Code" vor Ablauf. | Warning bei Sekunden < 60; Auto-Refresh-Button. |
| U-15 | **S3** | 1 | `ArchivTabletModal.tsx:152-188` | Kein Loading-Spinner. Bei 401 leere Liste ohne Erklärung. | Spinner + Empty-State-Differenzierung. |
| U-16 | **S3** | 3 | `BerichtPage.tsx:1726-1745` | VorschauModal: kein expliziter "Zurück zur Bearbeitung". | Footer-Button. |
| U-17 | **S2** | 7, 9 | `ZentralePage.tsx:2099-2196` | Abschluss-Lock wenn Fahrzeug noch im Einsatz — kein Override-Pfad bei Tablet-Crash. | Override-Button mit Long-Press + Audit-Grund. |
| U-18 | **S3** | 6 | `ZentralePage.tsx:1320-1325` | "Beteiligte Stellen" (Pflicht) auto-collapsed → unsichtbar. | Pflicht-Sektionen default-open, optionale collapsed. |
| U-19 | **S2** | 5 | `EinsatzTabs.tsx:141-173` | X-Button 22×22 Pixel — unter Apple/Material-Min-Touchtarget (44/48). Im Stress Fehl-Klick. | X auf 32×32; Tap-Target via padding/`::before` auf 44×44. |
| U-20 | **S2** | 1, 9 | `CloseTabConfirmModal.tsx:60-66` | Backdrop-Click schließt Modal still, kein Feedback. | Toast "Schließen-Dialog abgebrochen" + leichte Vibration. |
| U-21 | **S3** | 7 | gesamt | CLAUDE.md fordert "Strg+S" + "Escape" — Strg+S nirgends implementiert. | useEffect mit keydown-Listener + `syncBerichtLive` + Toast. |

**Heuristik-10 (Hilfe) — globaler Befund:** Es existiert KEIN Hilfe-System. AboutModal vorhanden, aber keine FAQ/Tutorial. Empfehlung: "?"-Button in Topbar mit Erklär-Sheet (Atemschutz-Timer, Vidierung, Handoff usw.).

---

### 3.4 PHASE 4 — Design (D-01 … D-19)

| ID | Schweregrad | Ort | Beobachtung | Empfehlung |
|---|---|---|---|---|
| D-01 | **S2** | `BerichtPage.tsx:1804-1846` | Inline `<style>{`@keyframes pulse-red ... `}</style>` + Hex `#dc2626`/`#fff` — bypasst Token-System komplett. Dark-Mode = blendend weiß. | Hex → CSS-Vars; Keyframes nach `tokens.css`. |
| D-02 | **S2** | Repo-weit | **70+ Hex-Hardcodes** (10 in BerichtPage, 8 in ZentralePage, 52 in Components) trotz exzellentem `tokens.css`. FF-Brand-Rot `#C8102E` vs. überall benutztes `#dc2626`. | ESLint-Regel `no-restricted-syntax` mit Hex-Pattern + Mass-Replace zu CSS-Vars. |
| D-03 | **S2** | `BerichtPage.tsx:1538-1557` | Drei CTA-Buttons im sticky-Footer — Nielsen: max 1 primäre Aktion. | Primary allein groß; Sekundäre als IconButtons. |
| D-04 | **S2** | `BerichtPage.tsx:1422-1438` | 5 vehicle-chips gleichgewichtig — 4 davon sind potentielle Daten-Verlust-Trigger. | Aktiver Chip groß, andere opacity 0.55. |
| D-05 | **S3** | `tokens.css:148-153` vs. `CloseTabConfirmModal.tsx:140` | `borderRadius: 16` inline statt `var(--radius-m)`. | Token-Disziplin: regex-Audit `borderRadius:\s*\d+`. |
| D-06 | **S3** | `BerichtPage.tsx:1565-1644` | 5 fast-identische Footer-Link-Inline-Styles. ~70 Zeilen Duplikation. | CSS-Klasse `.foot-link`. |
| D-07 | **S3** | `NeuerEinsatzTabletModal.tsx:496-498` | `fontSize: 11.5` Float; in dem Modal 9 verschiedene Schriftgrößen (10, 10.5, 11, 11.5, 12, 13, 14, 15, 18). | Type-Scale-Tokens `--font-xs/sm/md/lg/xl`. Max 4 pro Screen. |
| D-08 | **S3** | `tokens.css` | Token-Audit-Lücke: jeder `:root`-Token muss in `[data-theme="dark"]` ein Mapping haben. | CI-Lint. |
| D-09 | **S4** | `IdleView.tsx:90-104` | Pulsierender Aurora-Ring auf "Bereit"-Hero. Subjektiv: "App-Store"-iger Stil für Behörden-Stress-App. | Lite-Mode aktiv: Glow runter; Light auch um 50 %. |
| D-10 | **S3** | `AbschlussModal.tsx:54-60` | Border-Color schwingt rot↔amber. Konzeptuell verkehrt: rot sollte error sein, nicht "ready". | Rot reserviert für error, grün für canConfirm, amber für warning. |
| D-11 | **S3** | `Topbar.tsx:148-171` | GeoChip-Labels "live"/"stale"/"denied"/"unavail" — technisch für FF-User. | "GPS gut" / "GPS schwach" / "GPS aus"; Sekunden nur Tooltip. |
| D-12 | **S4** | `BerichtPage.tsx:1325-1326` | Einsatzort readonly, ohne Hinweis dass nur Florian editiert. | Inline-Hint "nur in Florianstation editierbar". |
| D-13 | **S3** | `MannschaftSlot.tsx:30-58` | Empty-State: Plus-Icon + ganze Row klickbar — Redundanz. | Plus weg ODER Row nicht klickbar. |
| D-14 | **S3** | `EinsatzTabs.tsx:108-119` | Status-Icon + Label redundant im Tab. | Icon ODER Label, nicht beides. |
| D-15 | **S3** | `ZentralePage.tsx:1133-1198` | TriToggle + Radio + Checkbox für 4 ähnliche Felder. Inkonsistent. | Alle als TriToggle ODER alle als Radio. |
| D-16 | **S3** | `BerichtPage.tsx:1219-1227` | "Einsatz B26-001" Anzeige in Topbar — Mix aus Stichwort + Nummer. | Klares Label `Bericht-Nr B26-001`. |
| D-17 | **S4** | `tokens.css:73-87` | `--red` Light = `#C8102E`, Dark = `#FF5468`. Brand-Inkonsistenz im PDF. | Separates `--brand-red` (immer `#C8102E`) + `--red` semantisch. |
| D-18 | **S3** | `HandoffModal.tsx` | 440 px Width; andere Modals 720/880 — keine konsistenten Stufen. | `--modal-width-sm/md/lg`-Tokens. |
| D-19 | **S3** | `Setup.tsx:480-504` | Setup: 4 gleichgewichtige Karten ohne Primary/Secondary-Hierarchie. | Datenschutz-Card als kollabierbares Disclosure unten. |

**FF-Fachsprache-Audit (positiv):** KDO, TLF-A 4000, LFA-B, MTF, Atemschutztrupp, Vidierung, Funkrufname, Pflichtbereich, BWST, LWZ, WAS, BlaulichtSMS, Stichwort B-1/B-2/B-3, Florianstation — alle **korrekt** verwendet.

**Inkonsistenzen in der Benennung:** "Florianstation" vs. "Einsatzzentrale" vs. "Florian Eberstalzell" — alle drei im Code:
- `ZentralePage.tsx:974` "Florian Eberstalzell · Einsatzzentrale"
- `Topbar.tsx:62` "Einsatzzentrale"
- `Setup.tsx:516` "FLORIAN"

Empfehlung: **eine Bezeichnung** wählen ("Florianstation") und konsequent durchziehen.

---

### 3.5 PHASE 5 — Performance (P-01 … P-09)

| ID | Schweregrad | Aspekt | Befund | Hebelwirkung | Empfehlung |
|---|---|---|---|---|---|
| P-01 | **S2** | Bundle | 779 KB JS unkomprimiert (~229 KB gzip) im Single-Chunk — Vite-Warning "chunks larger than 500 kB". Lighthouse "unused-javascript: 176 KB Einsparung". | LCP von 4,3 s könnte auf < 2,5 s; First Load drastisch kürzer | `rollupOptions.output.manualChunks` für leaflet/pouchdb/qrcode/lucide. Lazy-Imports für Pages (Setup, FlorianMapPopout, VorschauModal). |
| P-02 | **S2** | Render-Blocking | Lighthouse: 1 600 ms Einsparpotenzial bei render-blocking. Vite-default lädt CSS + index.js sync. | FCP von 3,7 s → ~2 s | Critical CSS inline; non-critical CSS async (`media="print" onload=...`). |
| P-03 | **S3** | Images | Logo 113 KB PNG, jeweils einmal aus assets und root → kann auf ~25 KB WebP. Lighthouse: 106 KB Einsparung. | LCP marginal | Logo als WebP + `<picture>`-Fallback. |
| P-04 | **S3** | Unused CSS | Lighthouse: 13 KB Einsparung. Tailwind purge greift aber `design.css` hat überflüssige Klassen. | Marginal | Tailwind-Content-Glob prüfen; design.css purgen. |
| P-05 | **S2** | Backend O(n) | 7× `db.list({startkey, endkey, include_docs:true})` ohne Limit/View: routes/admin.ts:48, einsaetze.ts:28, einsaetze.ts:716, workers/* (4 Stellen). Bei 10k Docs Mehrere-Sekunden-Roundtrip. | GET /api/einsaetze von <100ms auf >2s bei skalierten Daten | CouchDB-Mango-Indices für `{type, status, alarmierungZeit}`; paginieren. |
| P-06 | **S2** | Backend N+1 | `GET /api/fahrzeugberichte/meine` macht pro fzgber ein einzelnes `db.get(einsatzId)`. Bei 100 Berichten 100 sequentielle Roundtrips. | Linear unteilbar | Bulk-fetch `_all_docs?keys=[...]` oder Mango-Join. |
| P-07 | **S2** | Puppeteer | Single-Browser-Instance ohne Disconnect-Recovery (F-22) + ohne Timeout (F-23). | PDF-Endpoint kann sich aufhängen | `disconnected`-Event-Handler + `Promise.race` 30 s Timeout. |
| P-08 | **S3** | Memory | positions-state.ts unbounded Map (F-24). | Idle-Memory-Leak | Periodische Eviction. |
| P-09 | **S3** | PWA-Update-Latenz | UpdateBanner-Polling 6 h ohne visibility-change Re-Check (F-18). | Hotfix-Rollout slow | Bei `visible` `check()`. |

**Tote Dependencies:** Nicht systematisch geprüft (RISIKO – nicht verifiziert). Empfehlung: `pnpm dlx depcheck` oder `knip` auf der PWA + API.

---

## 4 Priorisierte To-do-Liste (Quick-Wins zuerst)

**Sofort vor Test-Phase mit Kameraden (5–30 Min Aufwand):**

| Prio | ID | Aktion | Aufwand | Risiko wenn nicht gefixt |
|---|---|---|---|---|
| 1 | T-06 | Placeholder "Pernkopf Gerald" → "Name des Übungsleiters" | S | unprofessionell, einzelne Sichtbarkeit |
| 2 | T-08 | Placeholder "Test-Daten" → "doppelt angelegt" | S | suggeriert Test-Status |
| 3 | T-19 | Demo-Mock-Kommentar löschen | S | nur Code-Hygiene |
| 4 | T-09 | Backoffice "Florianstation"-Tab verstecken (Verwaltung.tsx:268-270) | S | Funktionär sieht Mock-Falle |
| 5 | U-01 / U-03 | "Entwurf speichern"-Button entfernen ODER an syncBerichtLive koppeln | M | Trust-Killer #1 |
| 6 | T-13 | Backoffice-Map HOME aus shared constants importieren | S | falsche Position |
| 7 | T-03 | Backoffice "Phase 4"-Hinweis entfernen | S | siehe PWA-Pendant |

**Vor Live-Betrieb (M–L Aufwand, sicherheits- und workflowrelevant):**

| Prio | ID | Aktion | Aufwand |
|---|---|---|---|
| 8 | **F-01** | `/api/auth/tablet/register` mit rate-limit + Tailscale-only ODER entfernen | M |
| 9 | **F-02** | Auto-Close-Worker muss fzgber.geaendertAm berücksichtigen | M |
| 10 | F-07 + F-08 + F-30 | PUT-Route mit `requireAuth("einsatzleiter")` + Field-Allowlist | M |
| 11 | F-22 + F-23 | Puppeteer `disconnected`-Handler + 30 s Timeout | M |
| 12 | F-09 | Outbox 401-Handling (keine löschen bei 401) | S |
| 13 | F-04/F-05/F-06 | `getEinsatzOr404`-Helper + try/catch in allen `:id`-Routen | M |
| 14 | F-15 | Chronik-423 UI-Feedback | M |
| 15 | F-35 | Skip-Sync bei leerem fzgber | S |
| 16 | U-02 | Pop-Up-Buttons mit beschreibenden Labels | S |
| 17 | U-04 | Inline-Fahrzeug-Chips konfirmieren oder entfernen | S |
| 18 | U-19 | X-Button Touch-Target auf 44×44 vergrößern | S |
| 19 | U-21 | Strg+S Shortcut (CLAUDE.md-Direktive) | M |
| 20 | T-02 / T-04 / T-05 | Backoffice-Florianstation reparieren oder Tab versteckt lassen | L |

**Mittelfristig (Performance + Skalierung):**

| Prio | ID | Aktion | Aufwand |
|---|---|---|---|
| 21 | P-01 | Bundle-Splitting via `manualChunks` | M |
| 22 | P-05 | CouchDB-Mango-Indices + Pagination | M |
| 23 | P-06 | Bulk-Fetch in `/fahrzeugberichte/meine` | M |
| 24 | P-02 | Critical CSS inline | M |
| 25 | D-02 | Hex-Farben → CSS-Vars (Mass-Replace + ESLint) | L |
| 26 | F-29 | GET /einsaetze paginieren | M |
| 27 | F-34 | Token-Blacklist für serverseitiges Revoke | L |
| 28 | F-45 | N+1 in `fahrzeugberichte/meine` fixen | M |

**Niedrig (kosmetisch, Wartung):**

| Prio | ID | Aktion | Aufwand |
|---|---|---|---|
| 29 | D-07 | Type-Scale-Tokens, max 4 Größen pro Screen | M |
| 30 | D-09 | Aurora-Glow reduzieren | S |
| 31 | D-11 | GeoChip-Labels nutzersprachlich | S |
| 32 | O-01…O-10 | Verwaiste Funktionen entfernen oder verbinden | M |
| 33 | "Florianstation" Naming-Konsistenz | global | S |

---

## 5 Was gut war (Positive Findings — wichtig für die Moral)

- **Token-System `tokens.css`** ist exzellent strukturiert (Light/Dark/Lite, semantische Farben). Wäre die App durchgängig so konsistent, hätten wir 30 weniger Befunde.
- **Auto-Save** (`syncBerichtLive` 2,5 s + Florian-AutoSave 1,5 s) ist Lehrbuch-Implementation.
- **AbschlussModal-Sanity-Checks**: zeigt Pflichtfelder + Override-Möglichkeit — Nielsen-konform.
- **Folge-Auftrag-Personal-Vererbung** — schöner Stress-Workflow-Shortcut.
- **Lite-Mode** für schwache Tablets durchdacht.
- **FF-Fachsprache** überwiegend korrekt verwendet.
- **Bootstrap-Admin-Passwort** hat Production-Validator.
- **PII-Filter im Logger** aktiv (Authorization, Cookie, Token redaktiert).
- **CSP via Helmet** aktiv (auch wenn `contentSecurityPolicy: false` — vermutlich aus PWA-Kompatibilitäts-Gründen).
- **123 abgeschlossene Tasks** in Task-Historie — beeindruckende Entwicklungs-Disziplin.

---

## 6 Was nicht messbar war (Transparenz)

- **APK-Performance auf realen Tablets** — Lighthouse misst Browser, nicht Capacitor-Webview. RISIKO – nicht verifiziert.
- **Tatsächliche CouchDB-Performance bei skalierten Daten** — Test-DB ist klein. RISIKO – Inferenz aus Code-Pfaden.
- **Multi-User-Race-Conditions live** — nur statisch analysiert.
- **Tote Dependencies** — kein `depcheck`/`knip` gelaufen. RISIKO – nicht verifiziert.
- **Capacitor-spezifisches Verhalten** (Network, Geolocation, Push) — kein E2E-Test mit Hardware.
- **PDF-Output unter Last** — Puppeteer-Single-Browser bei parallelen Requests nicht getestet.

---

## 7 Tabu-Recap

Folgendes wurde NUR gelesen, nichts geändert:
- syBOS-Anbindung (`apps/api/src/services/sybos/*`, `routes/admin.ts` POST-Endpoints) — nur lesend, keine Modifikation
- Personaldaten — keine Liste exportiert, keine PII im Bericht
- Formular-Layouts (`apps/api/src/services/pdf/template.ts`, `fahrzeugbericht.ts`, `lotsendienst.ts`) — Befund F-11 ist Logik-Fix in `triBox`-Aufruf, kein Layout-Eingriff

---

## 8 Frage an den User

**Welche Befunde soll ich jetzt beheben?**

Mein Vorschlag für den ersten Sprint (vor Versand der Test-WhatsApp):
- **Quick-Wins 1–7** der Prio-Liste (~30 Min Aufwand): T-06, T-08, T-09, T-13, T-19, T-03, plus U-01/U-03 (Entwurf-speichern-Button)
- **Sicherheits-Patch F-01** (~10 Min): `/tablet/register` entweder rate-limited oder entfernt

Das stoppt die kritischsten Test-Phasen-Risiken und die Auth-Lücke. Alles Weitere kann iterativ in den nächsten Tagen.

Warte auf Freigabe.

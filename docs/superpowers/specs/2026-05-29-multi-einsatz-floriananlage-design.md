# Multi-Einsatz + Florianstation-Anlage — Design

**Datum:** 2026-05-29
**Status:** Design freigegeben durch Funktionär, bereit für Implementation-Plan
**Auftraggeber:** FF Eberstalzell
**Ansprechperson:** Gerald Pernkopf · gerald.pernkopf@ff-eberstalzell.at

---

## 1. Motivation

Aktuell ist HotDoc auf den Einzelfall „BlaulichtSMS-Alarm → ein Einsatz → alle 4 Fahrzeuge sehen ihn" optimiert. Zwei reale Lagen passen damit schlecht:

1. **Übungs-Anlage von der Florianstation aus.** Bisher kann eine Übung nur am Fahrzeug-Tablet erstellt werden. Funktionäre planen Einsatzübungen / Planspiele / Funkübungen aber typischerweise zentral.
2. **Sturm / Großschadensereignis.** Bei mehreren parallelen Schadensstellen fährt nicht jedes Fahrzeug jede Adresse an. Florian muss aufteilen können — und das Fahrzeug-Tablet soll nur „seinen" Auftrag sehen, nicht die ganze Lage.

## 2. Lösungsansatz (entschieden)

**Datenmodell:** Pro Einsatz neues optionales Feld `zugewieseneFahrzeuge?: FahrzeugId[]`. Wenn das Feld leer/undefined ist → alle Fahrzeug-Tablets sehen den Einsatz (Default, BlaulichtSMS-Verhalten unverändert). Wenn das Feld eine Liste enthält → nur die zugewiesenen Fahrzeuge sehen den Einsatz, alle anderen Tablets bleiben in IdleView.

**Florianstation** sieht IMMER alle aktiven Einsätze. Bei mehreren parallelen Einsätzen werden sie als Tab-Strip am oberen Rand der ZentralePage gerendert (Komponente `EinsatzTabs` existiert bereits).

**Anlage-Workflow:**
- Florianstation öffnet das bestehende `NeuerEinsatzTabletModal` (gleiche UI wie auf Fahrzeug-Tablets — Typ-Selektor manuell/lotsendienst/übung, Einsatzort mit Photon-Autocomplete, Übungsleiter aus syBOS-Personenliste).
- Anlage erfolgt ohne Fahrzeug-Zuweisung (1 Schritt, einfach).
- Zuweisung erfolgt direkt nach Anlage in der Detail-View über eine neue Sektion „Fahrzeug-Disposition" mit Multi-Toggle-Chips pro Fahrzeug.

## 3. Datenmodell-Änderungen

### 3.1 `einsatz`-Doc (CouchDB)

Neues optionales Feld:
```ts
zugewieseneFahrzeuge?: FahrzeugId[];  // FahrzeugId = "kdo" | "tlf-a-4000" | "lfa-b" | "mtf"
```

`zentrale` ist KEIN gültiges Element dieser Liste — die Florianstation ist Disposition, kein Einsatzfahrzeug.

### 3.2 Zod-Schema (`packages/shared`)

`EinsatzSchema` bekommt:
```ts
zugewieseneFahrzeuge: z.array(z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf"])).optional()
```

### 3.3 Migration

Keine. Neue Einsätze ohne Feld verhalten sich exakt wie heute. Existierende Einsätze bleiben unverändert sichtbar für alle Fahrzeuge.

## 4. Backend-Änderungen

### 4.1 Filter-Logik auf `GET /api/einsaetze`

Neuer optionaler Query-Param `fuerFahrzeug=<FahrzeugId>`. Logik:

```ts
const fuerFahrzeug = String(req.query.fuerFahrzeug ?? "");

docs = docs.filter((d) => {
  const z = d.zugewieseneFahrzeuge;
  if (!z || z.length === 0) return true;             // keine Zuweisung → alle sehen
  if (!fuerFahrzeug) return true;                    // Florianstation → alles
  return z.includes(fuerFahrzeug);                   // explizit zugewiesen
});
```

### 4.2 Zuweisungs-Update-Endpoint

Existierender `PATCH /api/einsaetze/:id` reicht — die ZentralePage schickt das Feld mit. `requireAuth("einsatzleiter")` (vorhanden). Schreibschutz-Check vorhanden.

Audit-Event-Typ ergänzen:
```ts
{
  type: "config-changed",  // oder neuer Typ "einsatz-zuweisung"
  fahrzeugId: undefined,   // ist über mehrere
  details: {
    what: "fahrzeug-zuweisung",
    einsatzId: "einsatz:lotsendienst-xxx",
    vorher: ["kdo"],
    nachher: ["kdo", "tlf-a-4000"],
  },
}
```

## 5. PWA-Änderungen

### 5.1 BerichtPage.tsx (Fahrzeug-Tablets)

Polling-URL bekommt den Fahrzeug-Parameter:
```ts
await apiCall("/api/einsaetze?status=aktiv&fuerFahrzeug=" + encodeURIComponent(fahrzeugId));
```

Vibrations-Auto-Open ändert sich nicht — wer in der Liste auftaucht, ist ohnehin „für mich". Wenn ein Einsatz nachträglich „weggenommen" wird (Florian entfernt das Fahrzeug aus `zugewieseneFahrzeuge`), fällt er beim nächsten Poll aus der Liste → bestehender Idle-Reset räumt ihn aus dem lokalen State.

### 5.2 ZentralePage.tsx (Florianstation)

#### 5.2.1 Multi-Einsatz-State

Heute: `aktiverEinsatz: EinsatzApiDoc | null` (genau einer). Wird zu:
```ts
const [aktiveEinsaetze, setAktiveEinsaetze] = useState<EinsatzApiDoc[]>([]);
const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
const aktiverEinsatz = aktiveEinsaetze.find((e) => e._id === aktiverEinsatzId) ?? null;
```

Polling-Effekt befüllt `aktiveEinsaetze` aus `r.items`. Auto-Select: wenn aktiverEinsatzId nicht in der Liste, auf `aktiveEinsaetze[0]?._id` setzen.

#### 5.2.2 Tab-Strip

Bestehender `EinsatzTabs` bekommt `tabs` aus `aktiveEinsaetze` gefüllt. `onSelect` setzt `aktiverEinsatzId`. Zusätzlicher `onNew`-Callback öffnet das Anlage-Modal.

#### 5.2.3 Idle-Card

Wenn `aktiveEinsaetze.length === 0`: bestehende „Bereit"-Karte (von letztem Commit) wird ergänzt um 3 Quick-Action-Buttons:
- „Neue Tätigkeit" → öffnet Modal mit `initialTyp="manuell"`
- „Übung" → `initialTyp="uebung"`
- „Lotsendienst" → `initialTyp="lotsendienst"`

#### 5.2.4 Anlage-Modal

Wiederverwendet `NeuerEinsatzTabletModal` (im PWA `apps/pwa/src/components/`). Bisher nur in BerichtPage benutzt — wird jetzt auch in ZentralePage gemountet. Props identisch.

#### 5.2.5 Sektion „Fahrzeug-Disposition"

Neue `<section className="card">` zwischen „Stammdaten Einsatz" und „Pflichtbereich". 4 Toggle-Chips (KDO · TLF · LFA-B · MTF). Default alle aus = leere Liste = alle sehen den Einsatz. Klick toggelt das Fahrzeug rein/raus. Hinweis-Zeile:

> *„Keine Auswahl → alle Fahrzeug-Tablets sehen den Einsatz (Default bei BlaulichtSMS-Alarm). Auswahl filtert die Sichtbarkeit auf die markierten Fahrzeuge — nützlich bei Sturm um Adressen aufzuteilen."*

Speicherung erfolgt im normalen Editor-Auto-Save-Pfad (existierender Mechanismus für Pflichtbereich etc.).

## 6. Backoffice-Änderungen

Keine, oder minimal:
- `ManuellerBerichtModal` (Backoffice) kann ebenfalls zugewieseneFahrzeuge übernehmen — Stretch-Ziel, kein Muss.
- `BerichtDetail` (Backoffice) zeigt das Feld read-only als Badge-Liste.

## 7. Audit-Trail

- Anlage eines Einsatzes von der Florianstation: existierendes `einsatz-angelegt`-Event reicht. Quelle = `"einsatzleiter"`-Session.
- Änderung der Fahrzeug-Zuweisung: neues Audit-Event `einsatz-zuweisung-geaendert` mit `vorher` / `nachher`.

## 8. Tests / Verifikation

### 8.1 Einheits-/Integrationstests (vitest)

- Backend: `/api/einsaetze?status=aktiv&fuerFahrzeug=tlf-a-4000` mit (a) leerem Feld, (b) zugewiesenem `tlf-a-4000`, (c) zugewiesenem `kdo` (nicht TLF) — alle drei Cases.
- Zod-Schema akzeptiert `undefined` und gültige Listen, lehnt `["zentrale"]` und Unbekannte ab.

### 8.2 E2E-Smoke (manuell vor Produktiv-Schaltung)

1. **Übungs-Anlage Florian:** Funktionär legt „Einsatzübung Atemschutz" mit Übungsleiter „Eder Christoph" und Thema „Innenangriff-Übung" an → erscheint sofort als Tab auf der Florianstation.
2. **Sturm-Multi-Einsatz:** Florianstation legt 3 Einsätze an:
   - „Baum auf Fahrbahn · Eberstalzeller Straße 12" → Zuweisung: KDO + TLF
   - „Keller unter Wasser · Hauptstraße 4" → Zuweisung: LFA-B
   - „Verkehrsabsicherung · B1 km 23" → Zuweisung: MTF
   Jedes Fahrzeug-Tablet zeigt nur seinen Einsatz im aktiven Formular.
3. **Default-Verhalten unverändert:** BlaulichtSMS-Alarm trifft ohne Zuweisung ein → alle 4 Fahrzeug-Tablets vibrieren + öffnen automatisch.
4. **Tab-Strip-Scroll:** 5 parallele Einsätze auf der Florianstation → horizontal scrollbarer Tab-Strip ohne Layout-Bruch.
5. **Re-Zuweisung:** Florian nimmt TLF aus Einsatz A heraus → beim nächsten Poll (innerhalb 30 s) verschwindet Einsatz A vom TLF-Tablet, TLF landet in IdleView (falls keine anderen aktiven für ihn).

## 9. Sicherheits- & Daten-Aspekte

- Florianstation darf zuweisen → `requireAuth("einsatzleiter")` auf PATCH-Route.
- Fahrzeug-Tablet kann das Feld nicht ändern (Schreibschutz-Check ausreicht durch `mannschaft`-Rolle).
- Audit-Trail dokumentiert Wer-was-wann.
- Keine PII-Implikationen — `zugewieseneFahrzeuge` ist nur eine Liste von Fahrzeug-Slugs.

## 10. Out-of-Scope

- **Sammel-Einsatz mit Sub-Aufträgen** (Variante 2 der Frage 1): User hat sich für separate Einsätze entschieden, nicht Sammel-Doc.
- **Karten-zentriertes Florianstation-Layout** (Frage 3 Option C): bleibt Tab-Layout.
- **Florian-spezifischer Anlage-Modal mit Multi-Fahrzeug-Auswahl im Anlage-Schritt** (Frage 4 Option A/C): bleibt 2-Schritt-Pfad.
- **Tab-Strip im Backoffice-Florianstation:** das Backoffice rendert weiterhin „erster aktiver Einsatz" (geringfügige UI-Schräge, akzeptabel).

## 11. Abhängigkeiten / Risiken

- Zod-Schema-Update in `@hotdoc/shared` → API + Backoffice müssen neu gebaut werden.
- Polling-Race: wenn das Tablet einen Einsatz im lokalen State hat, der server-side abgeschlossen oder aus der Zuweisung entfernt wurde, gibt es eine kurze Lücke bis zum nächsten Poll. Akzeptabel (max 30 s).
- TS-Strictness (`exactOptionalPropertyTypes`) — alle neuen Feld-Spreads brauchen die `...(value ? { x: value } : {})`-Idiomatik (siehe vorige Refactorings).

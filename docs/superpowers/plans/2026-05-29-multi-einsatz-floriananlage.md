# Multi-Einsatz + Florianstation-Anlage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Florianstation kann Übungen / Sturm-Einsätze anlegen und gezielt einzelne Fahrzeuge zuweisen; Fahrzeug-Tablets sehen nur ihre zugewiesenen Einsätze.

**Architecture:** Optionales Feld `zugewieseneFahrzeuge: FahrzeugId[]` am Einsatz-Doc. Backend-Filter via Query-Param `fuerFahrzeug=<id>`. ZentralePage rendert mehrere parallele Einsätze als Tab-Strip (Komponente existiert), Fahrzeug-Tablet pollt mit eigenem `fuerFahrzeug`-Filter.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes`), Zod, React 18, CouchDB via nano, Express.

**Spec:** `docs/superpowers/specs/2026-05-29-multi-einsatz-floriananlage-design.md`

---

## File Structure

| Pfad | Rolle | Aktion |
|---|---|---|
| `packages/shared/src/schemas/einsatz.schema.ts` | Zod-Schema des Einsatz-Docs + Manuell-Anlage | Modify: neues Feld + ManuellAnlage akzeptiert es |
| `apps/api/src/routes/einsaetze.ts` | `GET /api/einsaetze` Filter + POST `/manuell` | Modify: Filter-Logik + Feld persistieren |
| `apps/api/src/services/audit.ts` | Audit-Event-Service | Modify: neuen Event-Typ akzeptieren |
| `apps/pwa/src/pages/BerichtPage.tsx` | Fahrzeug-Tablet Bericht-Seite | Modify: Polling-URL mit `fuerFahrzeug` |
| `apps/pwa/src/pages/ZentralePage.tsx` | Florianstation | Modify: Multi-Einsatz-State + Tabs + Idle-Quick-Actions + Disposition-Sektion + Modal-Mount |
| `apps/pwa/src/components/NeuerEinsatzTabletModal.tsx` | Anlage-Modal | Read only — wird unverändert von Zentrale wiederverwendet |

---

## Task 1: Zod-Schema — neues Feld `zugewieseneFahrzeuge`

**Files:**
- Modify: `packages/shared/src/schemas/einsatz.schema.ts` (innerhalb EinsatzSchema-Block + ManuellAnlageSchema-Body)

- [ ] **Step 1: Erweitere EinsatzSchema um `zugewieseneFahrzeuge`**

Direkt nach dem `status`-Feld (vor `einsatzende`) in `EinsatzSchema` einfügen:

```ts
  /**
   * Optionale Disposition: welche Fahrzeuge sind diesem Einsatz zugewiesen?
   * Leer/undefined → alle Tablets sehen den Einsatz (BlaulichtSMS-Default).
   * Liste vorhanden → nur die zugewiesenen Fahrzeug-Tablets pollen ihn,
   * andere bleiben in IdleView. Florianstation sieht IMMER alles.
   * "zentrale" ist absichtlich nicht erlaubt — Florianstation ist
   * Disposition, kein Einsatzfahrzeug.
   */
  zugewieseneFahrzeuge: z
    .array(z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf"]))
    .optional(),
```

- [ ] **Step 2: Build shared package**

```bash
pnpm --filter @hotdoc/shared build
```

Expected: keine TS-Fehler.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/einsatz.schema.ts
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(schema): zugewieseneFahrzeuge optional an EinsatzSchema"
```

---

## Task 2: Backend — Filter-Logik in `GET /api/einsaetze`

**Files:**
- Modify: `apps/api/src/routes/einsaetze.ts` (Lines 25-48, der List-Handler)

- [ ] **Step 1: Lies den existierenden Handler**

Lokalisiere `einsaetzeRouter.get("/api/einsaetze", ...)` in `apps/api/src/routes/einsaetze.ts`. Vor der `sort`-Stelle nach der `status`-Filter-If-Block.

- [ ] **Step 2: Füge `fuerFahrzeug`-Filter hinzu**

Direkt NACH dem bestehenden Block:
```ts
  if (status === "aktiv" || status === "abgeschlossen") {
    docs = docs.filter((d) => (d as { status?: string }).status === status);
  }
```

einfügen:

```ts
  // Fahrzeug-Filter: jedes Fahrzeug-Tablet schickt seine eigene Id mit,
  // damit es nur Einsaetze sieht die ihm explizit zugewiesen sind (oder
  // ueberhaupt keine Zuweisung tragen = Default offen). Florianstation
  // schickt keinen Filter und sieht alle aktiven Einsaetze.
  const fuerFahrzeug = String(req.query.fuerFahrzeug ?? "");
  if (fuerFahrzeug) {
    docs = docs.filter((d) => {
      const z = (d as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge;
      if (!Array.isArray(z) || z.length === 0) return true;
      return z.includes(fuerFahrzeug);
    });
  }
```

- [ ] **Step 3: Build API**

```bash
pnpm --filter @hotdoc/api build
```

Expected: keine TS-Fehler.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/einsaetze.ts
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(api): fuerFahrzeug-Filter auf /api/einsaetze (Default offen)"
```

---

## Task 3: Audit-Event-Service — neuen Event-Typ akzeptieren

**Files:**
- Modify: `apps/api/src/services/audit.ts`

- [ ] **Step 1: Lies die existierenden Event-Typen**

```bash
grep -n "type: z.enum\|export type AuditEvent" "apps/api/src/services/audit.ts"
```

- [ ] **Step 2: Ergänze `einsatz-zuweisung-geaendert` im AuditEvent-Type**

Im Enum / Union-Type den neuen Wert `"einsatz-zuweisung-geaendert"` hinzufügen. Falls als zod-enum:

```ts
type: z.enum([
  // ...bestehende Werte...
  "einsatz-zuweisung-geaendert",
]),
```

Falls als TS-Union: `... | "einsatz-zuweisung-geaendert"`.

- [ ] **Step 3: Build API**

```bash
pnpm --filter @hotdoc/api build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/audit.ts
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(audit): einsatz-zuweisung-geaendert Event-Typ"
```

---

## Task 4: PWA BerichtPage — Polling mit `fuerFahrzeug`

**Files:**
- Modify: `apps/pwa/src/pages/BerichtPage.tsx` (runPoll-Effekt, Line ~146)

- [ ] **Step 1: Erweitere die Polling-URL**

Im `runPoll`-Callback die Zeile

```ts
const list = await apiCall<{ items: ApiEinsatzListItem[] }>(
  "/api/einsaetze?status=aktiv",
);
```

ersetzen durch:

```ts
const list = await apiCall<{ items: ApiEinsatzListItem[] }>(
  `/api/einsaetze?status=aktiv&fuerFahrzeug=${encodeURIComponent(fahrzeugId)}`,
);
```

- [ ] **Step 2: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

Expected: keine TS-Fehler.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/pages/BerichtPage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(pwa): Fahrzeug-Tablet pollt nur eigene zugewiesene Einsaetze"
```

---

## Task 5: PWA ZentralePage — Multi-Einsatz-State

**Files:**
- Modify: `apps/pwa/src/pages/ZentralePage.tsx` (Lines 255-256 + Polling-Effekt 302-330)

- [ ] **Step 1: State-Deklaration ändern**

Suche:
```ts
const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
const [aktiverEinsatz, setAktiverEinsatz] = useState<EinsatzApiDoc | null>(null);
```

Ersetze durch:
```ts
const [aktiveEinsaetze, setAktiveEinsaetze] = useState<EinsatzApiDoc[]>([]);
const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
const aktiverEinsatz: EinsatzApiDoc | null =
  aktiveEinsaetze.find((e) => e._id === aktiverEinsatzId) ?? null;
```

- [ ] **Step 2: Polling-Effekt anpassen**

Im useEffect Polling-Block:

```ts
const r = await apiCall<{ items: EinsatzApiDoc[] }>(
  "/api/einsaetze?status=aktiv",
);
if (cancelled) return;
const first = r.items[0];
if (first) {
  setAktiverEinsatzId(first._id);
  setAktiverEinsatz(first);
} else {
  // ... idle reset code
}
```

ersetze durch:

```ts
const r = await apiCall<{ items: EinsatzApiDoc[] }>(
  "/api/einsaetze?status=aktiv",
);
if (cancelled) return;
setAktiveEinsaetze(r.items);
// Auto-Select: wenn aktuell ausgewaehlter Einsatz nicht mehr in der Liste
// (z. B. abgeschlossen oder gewipt) → auf den ersten verbleibenden umschalten.
setAktiverEinsatzId((prev) => {
  if (prev && r.items.some((e) => e._id === prev)) return prev;
  return r.items[0]?._id ?? null;
});
if (r.items.length === 0) {
  setFahrzeugberichte([]);
}
```

- [ ] **Step 3: Alle setAktiverEinsatz(...)-Aufrufe entfernen**

Andere Stellen, die `setAktiverEinsatz(reloaded)` rufen (in den Save/Abschluss-Handlern, Lines ~498, ~548): die Funktion `setAktiverEinsatz` existiert nicht mehr. Ersetze:

```ts
setAktiverEinsatz(reloaded);
```

durch:

```ts
setAktiveEinsaetze((prev) => prev.map((e) => (e._id === reloaded._id ? reloaded : e)));
```

- [ ] **Step 4: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

Falls Fehler: alle weiteren Vorkommen von `setAktiverEinsatz` (außer als Variable!) prüfen und ersetzen.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/pages/ZentralePage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(florian): Multi-Einsatz-State (aktiveEinsaetze[])"
```

---

## Task 6: ZentralePage — EinsatzTabs befüllen + onNew

**Files:**
- Modify: `apps/pwa/src/pages/ZentralePage.tsx` (tabs-Konstruktion ~Line 718 + JSX am Topbar-Block)

- [ ] **Step 1: tabs aus aktiveEinsaetze bauen**

Suche die existierende `const tabs: EinsatzTabSummary[] = istIdle ? [] : [...]`-Stelle. Ersetze durch:

```ts
const tabs: EinsatzTabSummary[] = aktiveEinsaetze.map((eDoc) => {
  const id = eDoc._id.replace(/^einsatz:/, "");
  const art = eDoc.einsatzart ?? eDoc.einsatzartFreitext ?? eDoc.alarmierungText ?? "Einsatz";
  const ort = eDoc.einsatzort ?? "";
  return {
    id,
    einsatzart: art,
    einsatzort: ort,
    status: "aktiv" as const,
    manuell: eDoc.einsatzTyp === "manuell" || eDoc.einsatzTyp === "uebung" || eDoc.einsatzTyp === "lotsendienst",
  };
});
```

Note: `EinsatzTabs` verwendet die `id` als Selektions-Key — wir nehmen denselben Strip-Trick wie für `einsatzId`. Tab-Onclick muss `aktiverEinsatzId` auf das volle `_id` setzen.

- [ ] **Step 2: EinsatzTabs in JSX mit `onSelect` und `onNew` befüllen**

Suche `<EinsatzTabs tabs={tabs} activeId={einsatzId} onSelect={() => {}} onNew={() => {}} />`.

Ersetze durch:

```tsx
<EinsatzTabs
  tabs={tabs}
  activeId={einsatzId}
  onSelect={(id) => {
    const fullId = id.startsWith("einsatz:") ? id : `einsatz:${id}`;
    setAktiverEinsatzId(fullId);
  }}
  onNew={() => setNeuerEinsatzOpen("manuell")}
/>
```

- [ ] **Step 3: State für Modal hinzufügen**

Im Block der useState-Hooks (oben in der Funktion, vor dem ersten useEffect) ergänze:

```ts
import type { EinsatzTyp } from "../components/NeuerEinsatzTabletModal";
// ...
const [neuerEinsatzOpen, setNeuerEinsatzOpen] = useState<EinsatzTyp | null>(null);
```

Den Import oben im File ergänzen falls nicht vorhanden.

- [ ] **Step 4: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/pages/ZentralePage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(florian): EinsatzTabs mit Multi-Tab-Switch + Neuer-Einsatz-Trigger"
```

---

## Task 7: ZentralePage — Idle-Card Quick-Action-Buttons

**Files:**
- Modify: `apps/pwa/src/pages/ZentralePage.tsx` (idle alarm-card section, vorhanden seit Phantom-Cleanup)

- [ ] **Step 1: Lies den vorhandenen Idle-Branch**

```bash
grep -n "Bereit\|Keine aktive Einsatzdokumentation" "apps/pwa/src/pages/ZentralePage.tsx"
```

Locate die `{istIdle ? (...) : ...}`-Sektion.

- [ ] **Step 2: Quick-Action-Buttons unter dem Idle-Text einfügen**

Direkt nach dem `<div className="alarm-addr">...</div>` und vor dem schließenden `</div></div>` der `alarm-top`-Sektion, am Ende des Idle-Card-Bodys einen weiteren Block einfügen:

```tsx
            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="cta"
                onClick={() => setNeuerEinsatzOpen("uebung")}
                style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center" }}
              >
                <GraduationCap size={14} /> Übung anlegen
              </button>
              <button
                type="button"
                className="cta"
                onClick={() => setNeuerEinsatzOpen("lotsendienst")}
                style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--warn) 80%, transparent)" }}
              >
                <MapPin size={14} /> Lotsendienst
              </button>
              <button
                type="button"
                className="cta"
                onClick={() => setNeuerEinsatzOpen("manuell")}
                style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--info) 80%, transparent)" }}
              >
                <Plus size={14} /> Sonstige Tätigkeit
              </button>
            </div>
```

Imports oben im File ergänzen falls fehlend: `GraduationCap, MapPin, Plus` aus `lucide-react`.

- [ ] **Step 3: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/src/pages/ZentralePage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(florian): Quick-Action-Buttons in der Idle-Card (Uebung/Lotsendienst/Sonstige)"
```

---

## Task 8: ZentralePage — NeuerEinsatzTabletModal mounten

**Files:**
- Modify: `apps/pwa/src/pages/ZentralePage.tsx` (am Ende des Component-Returns vor `</div>`)

- [ ] **Step 1: Modal-Mount in JSX einfügen**

Suche das Ende der ZentralePage-Return-JSX (vor dem letzten `</div>` der Hauptkomponente). Ergänze:

```tsx
      <NeuerEinsatzTabletModal
        open={neuerEinsatzOpen !== null}
        initialTyp={neuerEinsatzOpen ?? "manuell"}
        onClose={() => setNeuerEinsatzOpen(null)}
        onCreated={(einsatzId) => {
          setNeuerEinsatzOpen(null);
          // Auto-Switch auf neu angelegten Einsatz beim naechsten Poll —
          // bis dahin manueller Trigger damit der Funktionaer nicht warten muss.
          setAktiverEinsatzId(einsatzId);
        }}
      />
```

Import oben im File ergänzen:
```ts
import { NeuerEinsatzTabletModal } from "../components/NeuerEinsatzTabletModal";
```

- [ ] **Step 2: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/pages/ZentralePage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(florian): NeuerEinsatzTabletModal in Florianstation gemountet"
```

---

## Task 9: ZentralePage — Sektion "Fahrzeug-Disposition"

**Files:**
- Modify: `apps/pwa/src/pages/ZentralePage.tsx` (Editor-Block, nach Stammdaten Einsatz, vor Pflichtbereich)

- [ ] **Step 1: Editor-State um `zugewieseneFahrzeuge` ergänzen**

Suche das `setEditor((prev) => ({...}))`-Update in der useEffect, die `aktiverEinsatz`-Hydration macht (~Line 403-438). Ergänze im State-Objekt die Initialisierung:

```ts
zugewieseneFahrzeuge: Array.isArray(aktiverEinsatz.zugewieseneFahrzeuge)
  ? aktiverEinsatz.zugewieseneFahrzeuge
  : [],
```

Den `editor`-State-Type oben (Interface `EditorState`) erweitern:

```ts
zugewieseneFahrzeuge: Array<"kdo" | "tlf-a-4000" | "lfa-b" | "mtf">;
```

Und im Initial-State (useState `const [editor, setEditor] = useState<EditorState>({...})`) ebenfalls `zugewieseneFahrzeuge: []` hinzufügen.

- [ ] **Step 2: Editor-Save-Handler erweitern**

Suche `await apiCall(\`/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}\`, { method: "PATCH", body: { ... } })`. Im body das neue Feld mitschicken:

```ts
zugewieseneFahrzeuge: editor.zugewieseneFahrzeuge,
```

- [ ] **Step 3: Neue Sektion im JSX einfügen**

Direkt nach der existierenden `<section>...Stammdaten Einsatz...</section>` und vor dem `<SectionHead title="Einsatzauftrag" />` (oder dem nächsten SectionHead). Füge ein:

```tsx
        <SectionHead title="Fahrzeug-Disposition" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Truck size={20} />
              Welche Fahrzeuge bearbeiten diesen Einsatz?
            </div>
            <span className="card-meta">
              {editor.zugewieseneFahrzeuge.length === 0
                ? "Default: alle Fahrzeuge sehen den Einsatz"
                : `${editor.zugewieseneFahrzeuge.length} zugewiesen`}
            </span>
          </div>

          <p style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.55, margin: "0 0 14px" }}>
            Keine Auswahl → alle Fahrzeug-Tablets sehen den Einsatz (Default bei
            BlaulichtSMS-Alarm). Auswahl filtert die Sichtbarkeit auf die
            markierten Fahrzeuge — nuetzlich bei Sturm um Adressen aufzuteilen.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["kdo", "tlf-a-4000", "lfa-b", "mtf"] as const).map((id) => {
              const aktiv = editor.zugewieseneFahrzeuge.includes(id);
              const fz = FAHRZEUGE[id];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={schreibschutz}
                  onClick={() =>
                    patchEditor({
                      zugewieseneFahrzeuge: aktiv
                        ? editor.zugewieseneFahrzeuge.filter((x) => x !== id)
                        : [...editor.zugewieseneFahrzeuge, id],
                    })
                  }
                  className={`chip${aktiv ? " active" : ""}`}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: aktiv ? "var(--info)" : "var(--surface)",
                    color: aktiv ? "#fff" : "var(--fg)",
                    border: `1px solid ${aktiv ? "var(--info)" : "var(--border)"}`,
                    borderRadius: 10,
                    cursor: schreibschutz ? "not-allowed" : "pointer",
                    opacity: schreibschutz ? 0.5 : 1,
                  }}
                >
                  {fz.funkrufname}
                </button>
              );
            })}
          </div>
        </section>
```

Import oben im File ergänzen falls fehlend: `Truck` aus `lucide-react`, `FAHRZEUGE` aus `@hotdoc/shared`.

- [ ] **Step 4: Build PWA**

```bash
pnpm --filter @hotdoc/pwa build
```

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/pages/ZentralePage.tsx
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(florian): Fahrzeug-Disposition-Sektion mit Multi-Toggle"
```

---

## Task 10: Backend — manuelle Anlage akzeptiert `zugewieseneFahrzeuge`

**Files:**
- Modify: `apps/api/src/routes/einsaetze.ts` (ManuellAnlageBodySchema + doc-Konstruktion ~Line 108-150)

- [ ] **Step 1: Erweitere ManuellAnlageBodySchema**

In `ManuellAnlageBodySchema` ergänze:

```ts
zugewieseneFahrzeuge: z
  .array(z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf"]))
  .optional(),
```

- [ ] **Step 2: Im Doc-Build mit übernehmen**

In der Konstruktion des `doc`-Objekts (innerhalb des POST-Handlers), unmittelbar nach den anderen `...(d.X ? {X: d.X} : {})`-Zeilen, ergänze:

```ts
...(d.zugewieseneFahrzeuge && d.zugewieseneFahrzeuge.length > 0
  ? { zugewieseneFahrzeuge: d.zugewieseneFahrzeuge }
  : {}),
```

- [ ] **Step 3: Build API**

```bash
pnpm --filter @hotdoc/api build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/einsaetze.ts
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(api): manuelle Einsatz-Anlage akzeptiert zugewieseneFahrzeuge"
```

---

## Task 11: Audit-Event bei Zuweisungs-Änderung

**Files:**
- Modify: `apps/api/src/routes/einsaetze.ts` (PATCH-Handler — alternativ POST `/{id}` falls so heißt)

- [ ] **Step 1: Lies den existierenden Save-Handler**

```bash
grep -n "router\.\(patch\|post\).*einsaetze" "apps/api/src/routes/einsaetze.ts"
```

- [ ] **Step 2: Vor dem `db.insert(merged)` Diff ermitteln + Event schreiben**

Wenn `zugewieseneFahrzeuge` sich vom existing zum merged geändert hat, ergänze NACH dem `db.insert(merged)` (oder unmittelbar vor `res.json(...)`):

```ts
const vorher = JSON.stringify(
  Array.isArray(existing?.zugewieseneFahrzeuge) ? existing.zugewieseneFahrzeuge : [],
);
const nachher = JSON.stringify(
  Array.isArray(merged.zugewieseneFahrzeuge) ? merged.zugewieseneFahrzeuge : [],
);
if (vorher !== nachher) {
  await writeAuditEvent({
    type: "einsatz-zuweisung-geaendert",
    actorUsername: req.session?.username ?? "anonym",
    actorRolle: req.session?.rolle,
    details: {
      einsatzId: einsatzId,
      vorher: existing?.zugewieseneFahrzeuge ?? [],
      nachher: merged.zugewieseneFahrzeuge ?? [],
    },
    ipAddress: req.ip,
  });
}
```

`writeAuditEvent` ist bereits importiert; ansonsten Import oben ergänzen.

- [ ] **Step 3: Build API**

```bash
pnpm --filter @hotdoc/api build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/einsaetze.ts
git -c user.email=gerald.pernkopf@ff-eberstalzell.at -c user.name="Gerald Pernkopf" commit -m "feat(audit): einsatz-zuweisung-geaendert Event bei PATCH"
```

---

## Task 12: Push + Deploy

- [ ] **Step 1: Push nach Gitea**

```bash
git push origin main
```

- [ ] **Step 2: Deploy alle 3 Apps parallel**

```bash
$env:FLY_API_TOKEN = "<aktueller Org-Token>"
flyctl deploy --config fly.api.toml --remote-only
flyctl deploy --config fly.pwa.toml --remote-only
flyctl deploy --config fly.backoffice.toml --remote-only
```

(API ist Pflicht, Backoffice nur wenn sich was geändert hat — in diesem Plan nicht.)

- [ ] **Step 3: Smoke-Test**

1. Florianstation öffnen, Idle-Card sichtbar mit 3 Quick-Action-Buttons.
2. "Übung anlegen" → Modal öffnet → Übungs-Thema + Übungsleiter aus syBOS-Picker → Anlegen → Tab erscheint sofort.
3. "Fahrzeug-Disposition"-Sektion erscheint im Editor.
4. KDO + TLF aktivieren → Save → kein Fehler → KDO/TLF-Tablet sieht den Einsatz, LFA-B/MTF bleiben in IdleView.
5. KDO entfernen → KDO-Tablet räumt den Einsatz beim nächsten Poll.

---

## Self-Review-Notizen

- **Spec coverage:** Sektionen 3 (Datenmodell), 4 (Backend), 5 (PWA), 6 (Backoffice keine Änderung), 7 (Audit), 8 (Tests) sind in den Tasks 1–11 abgedeckt.
- **Placeholder-Scan:** Task 3 + 11 enthalten `grep`-Anweisungen für die exakte Stelle — okay weil der Handler-Name historisch unklar ist (PATCH vs POST). Implementierender muss kurz prüfen, ist aber 30 s.
- **Type-Konsistenz:** `editor.zugewieseneFahrzeuge` ist `Array<FahrzeugId>`, Backend-Filter-Property ist `zugewieseneFahrzeuge?: string[]` — kompatibel.

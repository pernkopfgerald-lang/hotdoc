/**
 * Lokaler Persistenz-Layer für den BerichtPage-Abschluss-Status.
 *
 * Hintergrund:
 * Der React-State der BerichtPage (Mannschaft, Geräte, Chronik etc.) wird
 * nach jeder Änderung optimistisch ins Backend gepusht. Aber der
 * `abgeschlossen`-Status — ein zusammengesetztes Tupel (Zeitstempel, Wer,
 * KM) — wurde bisher NICHT lokal persistiert. Beim Browser-Reload kam die
 * Page mit `abgeschlossen: null` zurück, obwohl Backend schon "abgeschlossen"
 * hatte. Die "Bericht abgeschlossen"-Anzeige verschwand bei jedem Refresh.
 *
 * Lösung — zweistufig:
 *  1. localStorage als schneller First-Hit beim Mount → sofort die richtige
 *     Anzeige, kein Flash mit Dummy-Bericht.
 *  2. Beim Mount ZUSÄTZLICH aus Backend laden (GET .../fahrzeugberichte)
 *     für den Fall dass:
 *      - Tablet gewechselt (anderes Gerät, leerer localStorage)
 *      - Backend hat neueren Stand als localStorage (Sync-Race)
 *
 * Doc-Pattern: `hotdoc.report-state.<fahrzeugId>` →
 *   `{ [einsatzId]: { ts, durch, kmGefahren } | null }`
 */

import type { FahrzeugId } from "@hotdoc/shared";

export interface AbgeschlossenInfo {
  ts: string;
  durch: string;
  kmGefahren: number;
}

type StateMap = Record<string, AbgeschlossenInfo>;

function keyFor(fahrzeugId: FahrzeugId): string {
  return `hotdoc.report-state.${fahrzeugId}`;
}

export function loadReportStates(fahrzeugId: FahrzeugId): StateMap {
  try {
    const raw = localStorage.getItem(keyFor(fahrzeugId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    // Defensives Re-Validating der Struktur — fremde Daten könnten im Storage liegen
    const out: StateMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as AbgeschlossenInfo).ts === "string" &&
        typeof (v as AbgeschlossenInfo).durch === "string" &&
        typeof (v as AbgeschlossenInfo).kmGefahren === "number"
      ) {
        out[k] = v as AbgeschlossenInfo;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Speichert oder löscht einen einzelnen Einsatz-Abschluss-Status. */
export function saveReportState(
  fahrzeugId: FahrzeugId,
  einsatzId: string,
  state: AbgeschlossenInfo | null,
): void {
  try {
    const all = loadReportStates(fahrzeugId);
    if (state === null) {
      delete all[einsatzId];
    } else {
      all[einsatzId] = state;
    }
    localStorage.setItem(keyFor(fahrzeugId), JSON.stringify(all));
  } catch {
    // Quota/Private-Mode → silent fail, der nächste Backend-Sync repariert es.
  }
}

/** Clearen aller Berichts-States dieses Fahrzeugs — z. B. bei Setup-Reset. */
export function clearReportStates(fahrzeugId: FahrzeugId): void {
  try {
    localStorage.removeItem(keyFor(fahrzeugId));
    // BLOCKER-1: auch alle Arbeits-Drafts dieses Fahrzeugs miträumen.
    clearAllDrafts(fahrzeugId);
  } catch {
    // egal
  }
}

// ──────────────────────────────────────────────────────────────────────────
// BLOCKER-1 (Audit 2026-06-03): Arbeits-Draft des kompletten Fahrzeugbericht-
// Zustands. Bisher lebte der gesamte Arbeitsstand (Mannschaft, Atemschutz-
// Zeiten, Öl, Geräte, Aufträge, Chronik) NUR im flüchtigen React-RAM —
// Reload/OOM-Kill im Funkloch = Totalverlust ohne Warnung. Wir spiegeln den
// Stand debounced nach localStorage und laden ihn beim Mount als First-Hit
// (vor dem Backend-Hydrate). `gearSelected` muss als Array serialisiert werden
// (ein Set überlebt JSON.stringify nicht) — das macht der Aufrufer.
//
// Bewusst typ-agnostisch (`unknown`), damit report-state.ts NICHT vom
// EinsatzInstance-Typ in BerichtPage abhängt (kein Zirkular-Import). Die
// Set↔Array-Konvertierung + Typ-Casting liegt beim Aufrufer.
// ──────────────────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "hotdoc.draft.";

function draftKey(fahrzeugId: FahrzeugId, einsatzId: string): string {
  return `${DRAFT_PREFIX}${fahrzeugId}.${einsatzId}`;
}

/** Speichert den Arbeitsstand eines Einsatzes. `draft` muss bereits
 *  JSON-serialisierbar sein (gearSelected als Array, kein Set). */
export function saveDraft(fahrzeugId: FahrzeugId, einsatzId: string, draft: unknown): void {
  try {
    localStorage.setItem(draftKey(fahrzeugId, einsatzId), JSON.stringify(draft));
  } catch {
    // Quota/Private-Mode → silent fail. Der Live-Sync/Outbox ist der zweite Schutz.
  }
}

/** Lädt den Arbeitsstand eines Einsatzes (oder null wenn keiner da ist). */
export function loadDraft(fahrzeugId: FahrzeugId, einsatzId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(draftKey(fahrzeugId, einsatzId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Löscht den Draft eines Einsatzes (z. B. nach erfolgreichem Abschluss). */
export function clearDraft(fahrzeugId: FahrzeugId, einsatzId: string): void {
  try {
    localStorage.removeItem(draftKey(fahrzeugId, einsatzId));
  } catch {
    // egal
  }
}

/** Löscht ALLE Drafts dieses Fahrzeugs — bei Setup-Reset. */
export function clearAllDrafts(fahrzeugId: FahrzeugId): void {
  try {
    const prefix = `${DRAFT_PREFIX}${fahrzeugId}.`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // egal
  }
}

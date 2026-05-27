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
  } catch {
    // egal
  }
}

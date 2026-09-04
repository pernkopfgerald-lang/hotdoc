/**
 * Persistenter Worker-Zustand — Doc `state:worker` in CouchDB (I-06, Audit R3).
 *
 * Der In-Memory-State in state.ts ist nach jedem API-Neustart (Deploy,
 * fly-Maschine wandert) leer. Die Health-Anzeige meldete dann faelschlich
 * "noch kein Sync gelaufen", und der Stand der syBOS-Personenliste
 * (standVom) war unbekannt. Hier landen deshalb die Zeitstempel des
 * jeweils letzten Erfolgs / Fehlers pro Worker.
 *
 * Schreib-Disziplin liegt beim Aufrufer (state.ts): nur bei Zustandswechsel
 * (ok <-> error) plus hoechstens 1x/Stunde als Heartbeat bei ok — der
 * 15-s-BlaulichtSMS-Poller darf CouchDB nicht mit Schreibzugriffen fluten.
 *
 * Fehler beim Lesen/Schreiben werden ausschliesslich geloggt, nie geworfen:
 * der Worker-Pfad (Alarm!) darf an dieser Buchhaltung nie scheitern.
 */

import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

export interface WorkerState {
  blaulichtLastOkAt?: string;
  blaulichtLastError?: string;
  blaulichtLastErrorAt?: string;
  sybosLastOkAt?: string;
  sybosLastError?: string;
  sybosLastErrorAt?: string;
}

const WORKER_STATE_DOC_ID = "state:worker";

/** Alle Felder von WorkerState — fuer das saubere Herausziehen aus dem Doc. */
const STATE_KEYS: ReadonlyArray<keyof WorkerState> = [
  "blaulichtLastOkAt",
  "blaulichtLastError",
  "blaulichtLastErrorAt",
  "sybosLastOkAt",
  "sybosLastError",
  "sybosLastErrorAt",
];

interface WorkerStateDoc extends WorkerState {
  _id: string;
  _rev?: string;
  type: "state";
  geaendertAm: string;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Zieht nur die WorkerState-Felder (ohne _id/_rev/type) aus einem Doc oder
 * Patch heraus. Leere Strings werden verworfen.
 */
function pickState(src: Partial<WorkerState>): WorkerState {
  const out: WorkerState = {};
  for (const key of STATE_KEYS) {
    const value = src[key];
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * Liest den persistierten Worker-Zustand. `null` wenn das Doc (noch) nicht
 * existiert oder CouchDB nicht antwortet — der Aufrufer faellt dann auf
 * seinen RAM-Stand zurueck.
 */
export async function readWorkerState(): Promise<WorkerState | null> {
  try {
    const doc = (await db.get(WORKER_STATE_DOC_ID)) as Partial<WorkerStateDoc>;
    return pickState(doc);
  } catch (err) {
    if (statusCode(err) !== 404) {
      logger.warn({ err: errMsg(err) }, "state:worker konnte nicht gelesen werden");
    }
    return null;
  }
}

/** Ein Schreibversuch: get -> merge -> insert. Wirft bei Fehler (auch 409). */
async function writeOnce(patch: Partial<WorkerState>): Promise<void> {
  let existing: Partial<WorkerStateDoc> = {};
  try {
    existing = (await db.get(WORKER_STATE_DOC_ID)) as Partial<WorkerStateDoc>;
  } catch (err) {
    if (statusCode(err) !== 404) throw err;
  }
  const merged: WorkerStateDoc = {
    ...pickState(existing),
    ...pickState(patch),
    _id: WORKER_STATE_DOC_ID,
    ...(existing._rev ? { _rev: existing._rev } : {}),
    type: "state",
    geaendertAm: new Date().toISOString(),
  };
  await db.insert(merged);
}

/**
 * Merged `patch` in das Doc `state:worker`. Bei 409 (paralleler Schreiber,
 * z. B. zweite API-Instanz) genau ein Retry mit frischer _rev. Fehler
 * werden nur geloggt.
 */
export async function recordWorkerEvent(patch: Partial<WorkerState>): Promise<void> {
  for (let versuch = 1; versuch <= 2; versuch++) {
    try {
      await writeOnce(patch);
      return;
    } catch (err) {
      if (statusCode(err) === 409 && versuch === 1) continue;
      logger.warn(
        { err: errMsg(err), versuch, patchKeys: Object.keys(patch) },
        "state:worker konnte nicht geschrieben werden",
      );
      return;
    }
  }
}

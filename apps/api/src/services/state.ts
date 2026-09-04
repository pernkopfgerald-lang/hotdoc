/**
 * In-Memory-State der Worker (BlaulichtSMS-Poller, syBOS-Sync).
 *
 * Wird vom Health-Endpoint gelesen. Der RAM-Stand ist der Fast-Path;
 * zusaetzlich spiegeln wir die Zeitstempel des letzten Erfolgs/Fehlers in
 * das CouchDB-Doc `state:worker` (I-06, siehe worker-state.ts), damit die
 * Health-Anzeige nach einem API-Neustart nicht "noch kein Sync gelaufen"
 * meldet und der Personen-Stand (standVom) bekannt bleibt.
 *
 * Schreib-Disziplin fuer das Doc: nur bei Zustandswechsel (ok <-> error)
 * plus hoechstens 1x/Stunde als Heartbeat bei ok. Der In-Memory-Merker
 * dafuer liegt hier (blsPersist / sybosPersist).
 */

import { recordWorkerEvent } from "./worker-state.js";

interface BlaulichtSmsState {
  /** Letzter Poll — egal ob erfolgreich oder nicht. */
  lastPollAt: string | null;
  /** Letzter ERFOLGREICHER Poll — Basis fuer die 10-min-Luecken-Regel in health.ts. */
  lastOkAt: string | null;
  totalPolls: number;
  totalNeu: number;
  lastError: string | null;
}

interface SyBosState {
  /** Letzter Sync — egal ob erfolgreich oder nicht. */
  lastSyncAt: string | null;
  /** Letzter ERFOLGREICHER Sync — Basis fuer standVom (V14). */
  lastOkAt: string | null;
  lastOk: boolean;
  personalCount: number;
  materialCount: number;
  abteilungenCount: number;
  durationMs: number;
  lastError: string | null;
}

const blsState: BlaulichtSmsState = {
  lastPollAt: null,
  lastOkAt: null,
  totalPolls: 0,
  totalNeu: 0,
  lastError: null,
};

const sybosState: SyBosState = {
  lastSyncAt: null,
  lastOkAt: null,
  lastOk: false,
  personalCount: 0,
  materialCount: 0,
  abteilungenCount: 0,
  durationMs: 0,
  lastError: null,
};

// ─── Persistenz-Drossel (I-06) ──────────────────────────────────────
// Heartbeat-Intervall fuer das Doc `state:worker` im ok-Zustand.
const WORKER_STATE_HEARTBEAT_MS = 60 * 60 * 1000;

interface PersistMerker {
  /** Zuletzt persistierter Zustand; null = seit Prozessstart noch nichts geschrieben. */
  ok: boolean | null;
  /** Zeitpunkt (ms) des letzten Schreibens. */
  at: number;
}

const blsPersist: PersistMerker = { ok: null, at: 0 };
const sybosPersist: PersistMerker = { ok: null, at: 0 };

/**
 * Entscheidet, ob der aktuelle Zustand ins Doc `state:worker` gehoert:
 * beim ersten Ereignis nach Prozessstart, bei jedem Wechsel ok <-> error,
 * sowie im ok-Zustand hoechstens einmal pro Stunde (Heartbeat). Aktualisiert
 * den Merker, wenn geschrieben werden soll.
 */
function shouldPersist(merker: PersistMerker, ok: boolean, now: number): boolean {
  const wechsel = merker.ok === null || merker.ok !== ok;
  const heartbeat = ok && now - merker.at >= WORKER_STATE_HEARTBEAT_MS;
  if (!wechsel && !heartbeat) return false;
  merker.ok = ok;
  merker.at = now;
  return true;
}

export function getBlaulichtSmsState(): Readonly<BlaulichtSmsState> {
  return blsState;
}

/**
 * Wird nach jedem Poll aufgerufen (alle 15 s). Die Persistenz laeuft
 * fire-and-forget — recordWorkerEvent wirft nie, der Poller wartet nicht.
 */
export function recordBlaulichtSmsPoll(neu: number, error: string | null = null): void {
  const nowIso = new Date().toISOString();
  blsState.lastPollAt = nowIso;
  blsState.totalPolls += 1;
  blsState.totalNeu += neu;
  blsState.lastError = error;
  if (error === null) {
    blsState.lastOkAt = nowIso;
    if (shouldPersist(blsPersist, true, Date.now())) {
      void recordWorkerEvent({ blaulichtLastOkAt: nowIso });
    }
  } else if (shouldPersist(blsPersist, false, Date.now())) {
    void recordWorkerEvent({ blaulichtLastError: error, blaulichtLastErrorAt: nowIso });
  }
}

export function getSyBosState(): Readonly<SyBosState> {
  return sybosState;
}

/**
 * Wird nach jedem Sync aufgerufen (taeglich bzw. manuell). Die Persistenz
 * wird hier awaited, damit ein manueller Sync im Backoffice erst antwortet,
 * wenn `sybosLastOkAt` (= standVom) geschrieben ist.
 */
export async function recordSyBosSync(result: {
  ok: boolean;
  personalCount: number;
  materialCount: number;
  abteilungenCount: number;
  durationMs: number;
  error?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  sybosState.lastSyncAt = nowIso;
  sybosState.lastOk = result.ok;
  sybosState.personalCount = result.personalCount;
  sybosState.materialCount = result.materialCount;
  sybosState.abteilungenCount = result.abteilungenCount;
  sybosState.durationMs = result.durationMs;
  sybosState.lastError = result.error ?? null;
  if (result.ok) {
    sybosState.lastOkAt = nowIso;
    if (shouldPersist(sybosPersist, true, Date.now())) {
      await recordWorkerEvent({ sybosLastOkAt: nowIso });
    }
  } else if (shouldPersist(sybosPersist, false, Date.now())) {
    await recordWorkerEvent({
      sybosLastError: result.error ?? "unbekannt",
      sybosLastErrorAt: nowIso,
    });
  }
}

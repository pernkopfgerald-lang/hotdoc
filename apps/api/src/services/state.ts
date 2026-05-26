/**
 * In-Memory-State der Worker (BlaulichtSMS-Poller, syBOS-Sync).
 *
 * Wird vom Health-Endpoint gelesen. Persistent halten wir das (noch)
 * nicht — bei Restart läuft der erste Sync/Poll sofort und füllt den
 * State neu. In Phase 6 wandert das in ein CouchDB-Doc `state:worker`
 * damit auch über Restarts hinweg historisierbar.
 */

interface BlaulichtSmsState {
  lastPollAt: string | null;
  totalPolls: number;
  totalNeu: number;
  lastError: string | null;
}

interface SyBosState {
  lastSyncAt: string | null;
  lastOk: boolean;
  personalCount: number;
  materialCount: number;
  abteilungenCount: number;
  durationMs: number;
  lastError: string | null;
}

const blsState: BlaulichtSmsState = {
  lastPollAt: null,
  totalPolls: 0,
  totalNeu: 0,
  lastError: null,
};

const sybosState: SyBosState = {
  lastSyncAt: null,
  lastOk: false,
  personalCount: 0,
  materialCount: 0,
  abteilungenCount: 0,
  durationMs: 0,
  lastError: null,
};

export function getBlaulichtSmsState(): Readonly<BlaulichtSmsState> {
  return blsState;
}
export function recordBlaulichtSmsPoll(neu: number, error: string | null = null): void {
  blsState.lastPollAt = new Date().toISOString();
  blsState.totalPolls += 1;
  blsState.totalNeu += neu;
  blsState.lastError = error;
}

export function getSyBosState(): Readonly<SyBosState> {
  return sybosState;
}
export function recordSyBosSync(result: {
  ok: boolean;
  personalCount: number;
  materialCount: number;
  abteilungenCount: number;
  durationMs: number;
  error?: string;
}): void {
  sybosState.lastSyncAt = new Date().toISOString();
  sybosState.lastOk = result.ok;
  sybosState.personalCount = result.personalCount;
  sybosState.materialCount = result.materialCount;
  sybosState.abteilungenCount = result.abteilungenCount;
  sybosState.durationMs = result.durationMs;
  sybosState.lastError = result.error ?? null;
}

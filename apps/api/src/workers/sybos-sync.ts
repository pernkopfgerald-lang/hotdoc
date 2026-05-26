/**
 * syBOS-Stammdaten-Sync.
 *
 * - Läuft täglich um 04:00 (cron-Ausdruck konfigurierbar via SYBOS_SYNC_CRON).
 * - Holt Personal, PersUeberpruefung, Material, Abteilung.
 * - Schreibt nach CouchDB (upsert via bulk_docs).
 * - Wenn syBOS nicht konfiguriert ist (no token), startet der Worker nicht.
 */

import cron from "node-cron";
import type { DocumentBulkResponse } from "nano";
import { env, hasSyBos } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import {
  getAbteilungen,
  getMaterial,
  getPersonalAktiv,
  getPersUeberpruefungen,
} from "../services/sybos/client.js";
import { buildAtemschutzSet, mapMaterial, mapPerson } from "../services/sybos/mapper.js";
import { recordSyBosSync } from "../services/state.js";

interface SyncResult {
  ok: boolean;
  personalCount: number;
  materialCount: number;
  abteilungenCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Führt einen vollen Stammdaten-Sync durch. Exportiert für Tests + manuelle Triggers.
 */
export async function runSyBosSync(): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    ok: false,
    personalCount: 0,
    materialCount: 0,
    abteilungenCount: 0,
    durationMs: 0,
  };

  if (!hasSyBos()) {
    result.error = "syBOS nicht konfiguriert";
    logger.warn(result.error);
    result.durationMs = Date.now() - start;
    return result;
  }

  try {
    // Atemschutz-Gültigkeit vorab holen, damit wir Personen direkt anreichern können
    const ueberpruefungen = await getPersUeberpruefungen("o");
    const atemschutzSet = buildAtemschutzSet(ueberpruefungen);
    logger.info({ count: atemschutzSet.size }, "AS-Berechtigte erkannt");

    // Personal
    const personalRaw = await getPersonalAktiv();
    const personalDocs = personalRaw.map((p) => mapPerson(p, atemschutzSet));
    const personalResults = await upsertBulk(personalDocs);
    result.personalCount = personalResults.length;

    // Material
    const materialRaw = await getMaterial();
    const materialDocs = materialRaw.map(mapMaterial);
    const materialResults = await upsertBulk(materialDocs);
    result.materialCount = materialResults.length;

    // Abteilungen (Header-Info, für später wenn Hauptbericht detaillierter)
    const abteilungenRaw = await getAbteilungen();
    result.abteilungenCount = abteilungenRaw.length;

    result.ok = true;
    result.durationMs = Date.now() - start;
    logger.info(result, "syBOS-Sync erfolgreich");
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.durationMs = Date.now() - start;
    logger.error({ err, result }, "syBOS-Sync fehlgeschlagen");
  }

  recordSyBosSync(result);
  return result;
}

/**
 * Upsert mit Conflict-Resolution: erst per allDocs die aktuellen _rev holen,
 * dann mit _rev versorgen, dann bulk_docs aufrufen.
 */
async function upsertBulk(docs: Array<{ _id: string }>): Promise<DocumentBulkResponse[]> {
  if (docs.length === 0) return [];

  const ids = docs.map((d) => d._id);
  const existing = await db.fetchRevs({ keys: ids });
  const revMap = new Map<string, string>();
  for (const row of existing.rows ?? []) {
    if ("value" in row && row.value?.rev) {
      revMap.set(row.id, row.value.rev);
    }
  }
  const withRev = docs.map((d) => {
    const rev = revMap.get(d._id);
    return rev ? { ...d, _rev: rev } : d;
  });

  return await db.bulk({ docs: withRev });
}

/**
 * Initialisiert den Cronjob. Wird einmalig beim Server-Start aufgerufen.
 */
export function startSyBosSyncCron(): void {
  if (!hasSyBos()) {
    logger.warn("syBOS-Sync-Cron NICHT gestartet (Credentials fehlen)");
    return;
  }
  cron.schedule(env.SYBOS_SYNC_CRON, () => {
    logger.info({ cron: env.SYBOS_SYNC_CRON }, "syBOS-Sync-Cron tickt");
    void runSyBosSync();
  });
  logger.info({ cron: env.SYBOS_SYNC_CRON }, "syBOS-Sync-Cron geplant");
}

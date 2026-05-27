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
  personalErrors: number;
  materialCount: number;
  materialErrors: number;
  abteilungenCount: number;
  durationMs: number;
  error?: string;
  /** Erste 5 Fehler-Details für Debugging. */
  errorSamples?: Array<{ id: string; error: string; reason?: string }>;
}

/**
 * Führt einen vollen Stammdaten-Sync durch. Exportiert für Tests + manuelle Triggers.
 */
export async function runSyBosSync(): Promise<SyncResult> {
  const start = Date.now();
  const result: SyncResult = {
    ok: false,
    personalCount: 0,
    personalErrors: 0,
    materialCount: 0,
    materialErrors: 0,
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

    // Personal — mapPerson liefert null bei ungültiger ID, die filtern wir hier raus
    const personalRaw = await getPersonalAktiv();
    const personalDocs = personalRaw
      .map((p) => mapPerson(p, atemschutzSet))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    const personalSkipped = personalRaw.length - personalDocs.length;
    if (personalSkipped > 0) {
      logger.warn(
        { skipped: personalSkipped, totalRaw: personalRaw.length },
        "syBOS-Sync: Personal-Mapping skipped (ungültige IDs)",
      );
    }
    const personalResults = await upsertBulk(personalDocs);
    const personalErrors = personalResults.filter((r) => r.error);
    result.personalCount = personalResults.length - personalErrors.length;
    result.personalErrors = personalErrors.length + personalSkipped;
    if (personalErrors.length > 0) {
      result.errorSamples = personalErrors.slice(0, 5).map((r) => ({
        id: r.id ?? "?",
        error: r.error ?? "unknown",
        ...(r.reason ? { reason: r.reason } : {}),
      }));
      logger.warn(
        { count: personalErrors.length, samples: result.errorSamples },
        "syBOS-Sync: Personal-Bulk hatte Fehler",
      );
    }

    // Material — analog
    const materialRaw = await getMaterial();
    const materialDocs = materialRaw
      .map(mapMaterial)
      .filter((d): d is NonNullable<typeof d> => d !== null);
    const materialSkipped = materialRaw.length - materialDocs.length;
    const materialResults = await upsertBulk(materialDocs);
    const materialErrors = materialResults.filter((r) => r.error);
    result.materialCount = materialResults.length - materialErrors.length;
    result.materialErrors = materialErrors.length + materialSkipped;
    if (materialErrors.length > 0) {
      logger.warn(
        { count: materialErrors.length, sample: materialErrors.slice(0, 3) },
        "syBOS-Sync: Material-Bulk hatte Fehler",
      );
    }
    logger.info(
      { materialRawCount: materialRaw.length, materialDocsCount: materialDocs.length, materialSkipped },
      "syBOS-Sync: Material-Stats",
    );

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

/**
 * Audit-Retention — DSGVO-konforme Bereinigung der `audit:*`-Events.
 *
 * Spec §17.3 verlangt min. 1 Jahr Retention. Spec §24.1 hatte diesen Worker
 * als Gap markiert ("Cleanup-Worker für Audit-Events. Retention-Policy ist
 * dokumentiert, der Cleanup-Lauf fehlt."). Hier ist der Cleanup-Lauf.
 *
 * Läuft täglich um 02:30 — vor Audio-Retention (03:00) und vor syBOS-Sync
 * (04:00) damit die jeweils nachfolgenden Worker mit aufgeräumter DB
 * starten.
 *
 * Doc-ID-Konvention: `audit:<reverseTimestamp>:<uuid8>`.
 * `reverseTimestamp = MAX_SAFE_INTEGER - Date.now()` — d. h. ältere Events
 * haben *höhere* reverseTimestamps. Wir löschen alles mit
 * `reverseTimestamp >= reverseTsVorRetention`.
 *
 * Wir nutzen `startkey/endkey`-Range-Scan + Batch-Delete. Bei großen
 * Beständen würde ein _design/views-Index sauberer sein, aber für eine FF
 * < 50 User reichen die paar tausend Events problemlos.
 */

import cron from "node-cron";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

/** Cron-Ausdruck: täglich 02:30. */
const CRON_AUSDRUCK = "30 2 * * *";

/** Wie viele Docs pro Batch gelöscht werden — bei großer DB nicht alles auf einmal. */
const DELETE_BATCH_SIZE = 200;

interface RetentionResult {
  geprueft: number;
  geloescht: number;
  fehler: number;
  durationMs: number;
}

/**
 * Liefert den Reverse-Timestamp für "vor genau N Tagen" — alles ÄLTER als
 * dieser Zeitpunkt hat einen reverseTs >= diesem Wert (weil Reverse-TS
 * monoton fällt mit der Zeit).
 */
function reverseTimestampForCutoff(retentionDays: number): string {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const reverse = Number.MAX_SAFE_INTEGER - cutoffMs;
  return String(reverse).padStart(16, "0");
}

/**
 * Führt einen Retention-Lauf aus. Idempotent — kann beliebig oft gerufen
 * werden, löscht nur Events älter als `AUDIT_RETENTION_DAYS` (Default 365).
 */
export async function runAuditRetention(): Promise<RetentionResult> {
  const start = Date.now();
  const result: RetentionResult = {
    geprueft: 0,
    geloescht: 0,
    fehler: 0,
    durationMs: 0,
  };

  const cutoffReverseTs = reverseTimestampForCutoff(env.AUDIT_RETENTION_DAYS);

  // Range-Scan: alles mit reverseTs >= cutoff (= älter als die Retention-Grenze).
  // Wir nehmen `audit:<cutoff>:` als startkey und das übliche `audit:￰` als endkey.
  const list = await db.list({
    startkey: `audit:${cutoffReverseTs}:`,
    endkey: "audit:￰",
    include_docs: false,
    limit: DELETE_BATCH_SIZE,
  });

  result.geprueft = list.rows.length;
  if (list.rows.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  // Batch-Delete via bulk-docs mit _deleted=true.
  const docs = list.rows
    .filter((r) => r.id.startsWith("audit:"))
    .map((r) => ({ _id: r.id, _rev: r.value.rev, _deleted: true }));

  const bulkResult = await db.bulk({ docs });
  for (const r of bulkResult) {
    if (r.error) {
      result.fehler += 1;
      logger.warn({ id: r.id, error: r.error, reason: r.reason }, "Audit-Retention: Delete fehlgeschlagen");
    } else {
      result.geloescht += 1;
    }
  }

  result.durationMs = Date.now() - start;
  logger.info(result, "Audit-Retention-Lauf fertig");
  return result;
}

/**
 * Initialisiert den Cronjob. Wird einmalig beim Server-Start aufgerufen.
 */
export function startAuditRetentionCron(): void {
  cron.schedule(CRON_AUSDRUCK, () => {
    logger.info({ cron: CRON_AUSDRUCK }, "Audit-Retention-Cron tickt");
    void runAuditRetention().catch((err) => {
      logger.error({ err }, "Audit-Retention-Lauf fehlgeschlagen");
    });
  });
  logger.info(
    { cron: CRON_AUSDRUCK, retentionDays: env.AUDIT_RETENTION_DAYS },
    "Audit-Retention geplant",
  );
}

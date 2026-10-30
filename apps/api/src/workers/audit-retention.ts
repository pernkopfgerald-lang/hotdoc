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

  // WARUM try/finally: der Blacklist-Cleanup hat mit den Audit-Events nichts zu
  // tun und muss JEDEN Lauf stattfinden — auch wenn es keine alten Events gibt
  // (fruehes Return bei leerer Liste -> Cleanup nie erreicht) oder der Audit-Teil wirft.
  try {
    await loescheAlteAuditEvents(result, start);
  } finally {
    try {
      await cleanupExpiredBlacklist();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Blacklist-Cleanup nach Audit-Retention fehlgeschlagen",
      );
    }
  }
  return result;
}

/** Audit-Teil des Laufs (ein Batch); schreibt seine Zaehler in `result`. */
async function loescheAlteAuditEvents(result: RetentionResult, start: number): Promise<void> {
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
    return;
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
}

/** Seitengroesse beim Durchlaufen der Blacklist. */
const BLACKLIST_PAGE_SIZE = 500;
/**
 * Obergrenze an Seiten je Lauf (Schutz vor Endlosschleife/Dauerlast).
 * 20 x 500 = 10.000 Eintraege — weit ueber jeder realistischen Blacklist.
 */
const BLACKLIST_MAX_PAGES = 20;

/**
 * Loescht alle `auth:blacklist:*`-Eintraege deren expiresAt < jetzt.
 *
 * Hintergrund (F-34): Beim Token-Revoke schreiben wir das (sub, iat)-Paar
 * mit der exp-Claim des Tokens als expiresAt. Sobald der Token ohnehin
 * abgelaufen waere, schlaegt die JWT-Signatur-Pruefung sowieso fehl —
 * der Blacklist-Eintrag waere also redundant. Wir raeumen ihn deshalb
 * im selben Cron-Slot weg wie die Audit-Events.
 *
 * Die Doc-IDs sind nach `sub` sortiert, nicht nach Ablauf — abgelaufene
 * Eintraege liegen also verstreut. Deshalb wird die komplette Range seitenweise
 * durchlaufen (statt nur die ersten 500 zu lesen) und je Seite geloescht, was
 * abgelaufen ist; geloeschte Docs verschwinden aus der Range, die Paginierung
 * laeuft ueber den letzten gelesenen Key weiter. Ende: kurze Seite = Range
 * erschoepft, oder die Seiten-Obergrenze.
 *
 * @returns Anzahl geloeschter Eintraege (fuer Tests/Logs).
 */
export async function cleanupExpiredBlacklist(): Promise<number> {
  const now = Date.now();
  let geloescht = 0;
  let fehler = 0;
  let startkey = "auth:blacklist:";

  for (let seite = 0; seite < BLACKLIST_MAX_PAGES; seite++) {
    const list = await db.list({
      startkey,
      endkey: "auth:blacklist:￰",
      include_docs: true,
      limit: BLACKLIST_PAGE_SIZE,
    });
    const toDelete: Array<{ _id: string; _rev: string; _deleted: true }> = [];
    for (const row of list.rows) {
      const doc = row.doc as { _id?: string; _rev?: string; expiresAt?: string } | undefined;
      if (!doc?._id || !doc._rev) continue;
      const exp = doc.expiresAt ? new Date(doc.expiresAt).getTime() : NaN;
      if (Number.isFinite(exp) && exp < now) {
        toDelete.push({ _id: doc._id, _rev: doc._rev, _deleted: true });
      }
    }
    if (toDelete.length > 0) {
      const bulkResult = await db.bulk({ docs: toDelete });
      const seitenFehler = bulkResult.filter((r) => r.error).length;
      fehler += seitenFehler;
      geloescht += toDelete.length - seitenFehler;
    }
    // Weniger Zeilen als angefragt (ggf. 0) -> Range ist erschoepft.
    const letzte = list.rows[list.rows.length - 1];
    if (list.rows.length < BLACKLIST_PAGE_SIZE || !letzte) break;
    // Naechste Seite beginnt beim zuletzt gelesenen Key (inklusiv). Bewusst KEIN
    // skip:1 — war genau dieses Doc eben geloescht, wuerde skip ein echtes
    // Nachbar-Doc ueberspringen. Das eine doppelt gelesene Doc ist harmlos.
    startkey = letzte.id;
  }
  if (geloescht > 0 || fehler > 0) {
    logger.info({ geloescht, fehler }, "Token-Blacklist-Cleanup fertig");
  }
  return geloescht;
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

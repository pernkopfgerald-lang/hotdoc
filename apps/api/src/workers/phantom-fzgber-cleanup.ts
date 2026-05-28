/**
 * Phantom-Fahrzeugbericht-Cleanup.
 *
 * Hintergrund: bei jedem BlaulichtSMS-Alarm bekommt jedes Fahrzeug-Tablet
 * automatisch das Einsatz-Formular angezeigt — auch Fahrzeuge die gar nicht
 * ausgerückt sind (z. B. MTF, wenn nur TLF + LFA-B fahren). Wenn der Kdt.
 * nichts ausfüllt und der Einsatz abgeschlossen ist, bleibt ein leerer
 * Fahrzeugbericht in CouchDB liegen.
 *
 * Dieser Worker säubert das auf:
 *  - Sucht abgeschlossene Einsätze, deren einsatzende ≥ PHANTOM_GRACE_HOURS h zurück liegt.
 *  - Lädt deren Fahrzeugberichte.
 *  - Berichte die ALLE Merkmale erfüllen werden gelöscht:
 *      • status="in_arbeit" (NICHT vom Kdt. abgeschlossen)
 *      • mannschaft.length === 0   AND fahrerPersonId fehlt AND fahrzeugKdtPersonId fehlt
 *      • km.gefahrenKm === 0       AND km.abfahrt+rueckkehr fehlen
 *      • geraete.length === 0
 *      • taetigkeitsbericht trim leer
 *      • oelbindemittelSaecke === 0
 *
 *  → "Fahrzeug nicht eingesetzt", Bericht ist Phantom-Artefakt vom
 *    Auto-Open-Verhalten. Sicher löschbar.
 *
 * Läuft täglich um 02:45 — vor Audio-Retention (03:00) und Audit-Retention
 * (02:30), damit alle Cleanup-Worker im selben Wartungsfenster laufen.
 */

import cron from "node-cron";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

const CRON_AUSDRUCK = "45 2 * * *";

/**
 * Gnaden-Frist in Stunden — wie lange muss ein Einsatz schon abgeschlossen sein,
 * damit wir sicher davon ausgehen können, dass das jeweilige Fahrzeug nicht mehr
 * nachträglich ausfüllen will. Konfigurierbar via ENV; Default 2 h.
 */
function phantomGraceHours(): number {
  const raw = process.env.PHANTOM_GRACE_HOURS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0.5 && n <= 168) return n;
  return 2;
}

interface PhantomResult {
  pruefte_einsaetze: number;
  pruefte_fzgber: number;
  geloescht: number;
  fehler: number;
  durationMs: number;
}

interface EinsatzMin {
  _id: string;
  status?: string;
  einsatzende?: string;
}
interface FahrzeugberichtMin {
  _id: string;
  _rev: string;
  status?: string;
  mannschaft?: unknown[];
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  km?: { abfahrt?: number; gefahrenKm?: number; rueckkehr?: number };
  geraete?: unknown[];
  taetigkeitsbericht?: string;
  oelbindemittelSaecke?: number;
}

/** Prüft ob ein Fahrzeugbericht „phantom" ist (vollständig leer). */
function isPhantom(b: FahrzeugberichtMin): boolean {
  if (b.status === "abgeschlossen") return false;
  if (Array.isArray(b.mannschaft) && b.mannschaft.length > 0) return false;
  if (b.fahrerPersonId !== undefined && b.fahrerPersonId !== null) return false;
  if (b.fahrzeugKdtPersonId !== undefined && b.fahrzeugKdtPersonId !== null) return false;
  const km = b.km ?? {};
  if ((km.gefahrenKm ?? 0) > 0) return false;
  if (km.abfahrt !== undefined && km.abfahrt !== null) return false;
  if (km.rueckkehr !== undefined && km.rueckkehr !== null) return false;
  if (Array.isArray(b.geraete) && b.geraete.length > 0) return false;
  if ((b.taetigkeitsbericht ?? "").trim().length > 0) return false;
  if ((b.oelbindemittelSaecke ?? 0) > 0) return false;
  return true;
}

export async function runPhantomCleanup(): Promise<PhantomResult> {
  const start = Date.now();
  const grace = phantomGraceHours();
  const cutoff = Date.now() - grace * 60 * 60 * 1000;
  const result: PhantomResult = {
    pruefte_einsaetze: 0,
    pruefte_fzgber: 0,
    geloescht: 0,
    fehler: 0,
    durationMs: 0,
  };

  // ─── Schritt 1: abgeschlossene Einsätze laden, deren einsatzende vor dem Cutoff liegt ───
  const einsaetzeList = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￰",
    include_docs: true,
  });
  const candidates: EinsatzMin[] = [];
  for (const row of einsaetzeList.rows) {
    const doc = row.doc as EinsatzMin | undefined;
    if (!doc) continue;
    if (doc.status !== "abgeschlossen") continue;
    if (!doc.einsatzende) continue;
    const t = new Date(doc.einsatzende).getTime();
    if (Number.isNaN(t)) continue;
    if (t > cutoff) continue;
    candidates.push(doc);
  }
  result.pruefte_einsaetze = candidates.length;
  if (candidates.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  // ─── Schritt 2: Fahrzeugberichte je Kandidat laden + auf Phantom prüfen ───
  const toDelete: Array<{ _id: string; _rev: string; _deleted: true }> = [];
  for (const e of candidates) {
    const prefix = `fzgber:${e._id.replace(/^einsatz:/, "")}:`;
    const fzList = await db.list({
      startkey: prefix,
      endkey: `${prefix}￰`,
      include_docs: true,
    });
    for (const row of fzList.rows) {
      const doc = row.doc as FahrzeugberichtMin | undefined;
      if (!doc || !doc._id || !doc._rev) continue;
      result.pruefte_fzgber += 1;
      if (isPhantom(doc)) {
        toDelete.push({ _id: doc._id, _rev: doc._rev, _deleted: true });
        logger.info(
          {
            id: doc._id,
            einsatzId: e._id,
            einsatzende: e.einsatzende,
            graceHours: grace,
          },
          "Phantom-Fahrzeugbericht erkannt — wird gelöscht",
        );
      }
    }
  }

  if (toDelete.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  // ─── Schritt 3: Bulk-Delete ───
  const bulkResult = await db.bulk({ docs: toDelete });
  for (const r of bulkResult) {
    if (r.error) {
      result.fehler += 1;
      logger.warn({ id: r.id, error: r.error, reason: r.reason }, "Phantom-Delete fehlgeschlagen");
    } else {
      result.geloescht += 1;
    }
  }

  result.durationMs = Date.now() - start;
  logger.info(result, "Phantom-Cleanup-Lauf fertig");
  return result;
}

export function startPhantomCleanupCron(): void {
  cron.schedule(CRON_AUSDRUCK, () => {
    logger.info({ cron: CRON_AUSDRUCK }, "Phantom-Cleanup-Cron tickt");
    void runPhantomCleanup().catch((err) => {
      logger.error({ err }, "Phantom-Cleanup-Lauf fehlgeschlagen");
    });
  });
  logger.info(
    {
      cron: CRON_AUSDRUCK,
      graceHours: phantomGraceHours(),
      retentionDays: env.AUDIT_RETENTION_DAYS, // nur als Kontext-Log
    },
    "Phantom-Cleanup-Cron geplant",
  );
}

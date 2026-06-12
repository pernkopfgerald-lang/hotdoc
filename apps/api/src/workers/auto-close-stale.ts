/**
 * Auto-Abschluss stale Auftraege (Inaktivitaets-Schutz).
 *
 * Hintergrund: Aufträge (Einsaetze) bleiben manchmal unabsichtlich offen —
 * der Fahrzeug-Kdt hat das Tablet weggelegt ohne abzuschließen, der
 * EL hat den Hauptauftrag vergessen zu schließen, ein Übungsleiter ist
 * ohne den Bericht zu finalisieren nach Hause. Solange diese Aufträge
 * "aktiv" sind, blockieren sie in der Statistik, hängen als Tab im
 * Florian-Status, und verhindern dass die Phantom-Cleanup-Routine
 * leere Geist-Berichte aufräumt (die Phantom-Routine läuft erst NACH
 * Einsatz-Abschluss).
 *
 * Dieser Worker:
 *  - Sucht Einsaetze mit status="aktiv" wo geaendertAm > AUTO_CLOSE_HOURS h zurückliegt
 *  - Schließt sie ab mit autoAbgeschlossen-Marker für Audit & PDF
 *  - Kaskadiert Cascade-Abschluss auf offene Fahrzeugberichte
 *
 * Default 6 h — konfigurierbar via ENV `AUTO_CLOSE_HOURS`. Wert <= 0
 * deaktiviert das Feature komplett.
 *
 * Läuft alle 30 Minuten. Cron-Ausdruck: `*\/30 * * * *`.
 */

import cron from "node-cron";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { writeAuditEvent } from "../services/audit.js";
import { vergebeBerichtNummer } from "../services/bericht-nummer.js";

const CRON_AUSDRUCK = "*/30 * * * *";
const DEFAULT_AUTO_CLOSE_HOURS = 6;

function autoCloseHours(): number {
  const raw = process.env.AUTO_CLOSE_HOURS;
  if (!raw) return DEFAULT_AUTO_CLOSE_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AUTO_CLOSE_HOURS;
  // Wert <= 0 schaltet das Feature aus
  if (n <= 0) return 0;
  // Hard cap 168 h (1 Woche) — verhindert versehentliches Disablement
  if (n > 168) return 168;
  return n;
}

interface CloseResult {
  pruefte_einsaetze: number;
  geschlossen: number;
  cascade_fzgber: number;
  fehler: number;
  durationMs: number;
}

interface EinsatzMin {
  _id: string;
  _rev: string;
  status?: string;
  geaendertAm?: string;
  erstelltAm?: string;
  alarmierungZeit?: string;
  einsatzTyp?: string;
  einsatzart?: string;
  /** AUDIT-11: bereits vergebene Berichtsnummer (Reaktivierungs-Fall). */
  berichtNummer?: string;
}

interface FahrzeugberichtMin {
  _id: string;
  _rev: string;
  einsatzId?: string;
  status?: string;
  geaendertAm?: string;
}

/**
 * Bulk-Update mit per-doc Conflict-Retry (Auto-Close-Variante).
 * Spiegelt routes/einsaetze.ts:bulkUpdateWithRetry — bewusst dupliziert
 * damit die Worker-Datei keine Abhaengigkeit zu den Routes hat (zirkular-
 * frei, einfacher zu testen).
 */
async function bulkUpdateWithRetry(
  docs: Array<Record<string, unknown>>,
): Promise<{ ok: number; failed: string[] }> {
  if (docs.length === 0) return { ok: 0, failed: [] };
  const bulkResult = await db.bulk({ docs });
  const failed: string[] = [];
  let ok = 0;
  for (let i = 0; i < bulkResult.length; i++) {
    const row = bulkResult[i];
    const sourceDoc = docs[i];
    if (!row || !sourceDoc) continue;
    if (!row.error) {
      ok += 1;
      continue;
    }
    const docId = (sourceDoc._id as string | undefined) ?? row.id;
    if (row.error !== "conflict" || !docId) {
      failed.push(docId ?? "unknown");
      continue;
    }
    try {
      const fresh = (await db.get(docId)) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...sourceDoc, _rev: fresh._rev };
      await db.insert(merged as Parameters<typeof db.insert>[0]);
      ok += 1;
    } catch (err) {
      failed.push(docId);
      logger.warn(
        { err, id: docId },
        "Auto-Close: bulkUpdateWithRetry Retry fehlgeschlagen",
      );
    }
  }
  return { ok, failed };
}

export async function runAutoCloseStale(): Promise<CloseResult> {
  const start = Date.now();
  const hours = autoCloseHours();
  const result: CloseResult = {
    pruefte_einsaetze: 0,
    geschlossen: 0,
    cascade_fzgber: 0,
    fehler: 0,
    durationMs: 0,
  };
  if (hours === 0) {
    logger.debug("Auto-Close deaktiviert (AUTO_CLOSE_HOURS<=0)");
    result.durationMs = Date.now() - start;
    return result;
  }
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoff).toISOString();

  const einsaetze = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￯",
    include_docs: true,
  });

  // Lade alle Fahrzeugberichte VORHER — wir brauchen sie sowohl fuer die
  // Stale-Pruefung (Mannschaft tippt noch im Fahrzeugbericht obwohl der
  // Einsatz-Header sich seit Stunden nicht geaendert hat) als auch fuer
  // die Kaskade unten. Eine Liste, zwei Verwendungen.
  const fzgList = await db.list({
    startkey: "fzgber:",
    endkey: "fzgber:￯",
    include_docs: true,
  });
  const allFzg = fzgList.rows
    .map((r) => r.doc as (FahrzeugberichtMin & { type?: string }) | undefined)
    .filter((d): d is NonNullable<typeof d> => !!d && d.type === "fahrzeugbericht");

  /**
   * Findet den juengsten geaendertAm aller Fahrzeugberichte eines Einsatzes.
   * Mannschaft kann ueber Stunden im Fahrzeugbericht tippen ohne den Einsatz-
   * Header zu aendern — dann darf der Einsatz NICHT auto-geschlossen werden.
   */
  function jungsterFzgTimestamp(einsatzId: string): number {
    let max = -Infinity;
    for (const f of allFzg) {
      if (f.einsatzId !== einsatzId) continue;
      if (!f.geaendertAm) continue;
      const t = new Date(f.geaendertAm).getTime();
      if (Number.isNaN(t)) continue;
      if (t > max) max = t;
    }
    return max;
  }

  const stale: EinsatzMin[] = [];
  for (const row of einsaetze.rows) {
    const doc = row.doc as (EinsatzMin & { type?: string }) | undefined;
    if (!doc) continue;
    if (doc.type !== "einsatz") continue;
    if (doc.status !== "aktiv") continue;
    // Benutze den jüngsten Zeitstempel als Aktivitätsmarker.
    const ts =
      doc.geaendertAm ?? doc.erstelltAm ?? doc.alarmierungZeit ?? null;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) continue;
    if (t > cutoff) continue;
    // Fahrzeugbericht-Aktivitaet beruecksichtigen: wenn irgendein
    // Fahrzeugbericht des Einsatzes neuer als cutoff ist, tippt die
    // Mannschaft noch — Einsatz aus stale-Liste streichen.
    const fzgMax = jungsterFzgTimestamp(doc._id);
    if (fzgMax > cutoff) continue;
    stale.push(doc);
  }
  result.pruefte_einsaetze = stale.length;
  if (stale.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  logger.info(
    {
      stale: stale.length,
      autoCloseHours: hours,
      cutoff: cutoffIso,
    },
    "Auto-Close: stale Aufträge gefunden — werden geschlossen",
  );

  const now = new Date().toISOString();

  for (const einsatz of stale) {
    const offeneFzg = allFzg.filter(
      (f) => f.einsatzId === einsatz._id && f.status === "in_arbeit",
    );
    const docsToUpdate: Array<Record<string, unknown>> = [];

    // AUDIT-11: auch der Auto-Abschluss vergibt eine echte Berichtsnummer —
    // dieselbe Nur-wenn-fehlt-Bedingung wie in POST /abschluss (Reaktivieren
    // + erneuter Abschluss zieht KEINE zweite Nummer). Vergabe-Fehler
    // blockieren den Auto-Abschluss nicht (PDF-Fallback: deriveBerichtNrFromId).
    let berichtNummer = einsatz.berichtNummer;
    if (!berichtNummer) {
      try {
        berichtNummer = await vergebeBerichtNummer(
          einsatz.einsatzart,
          einsatz.alarmierungZeit,
        );
      } catch (err) {
        logger.warn(
          { err, einsatzId: einsatz._id },
          "Auto-Close: Berichtsnummer-Vergabe fehlgeschlagen — Abschluss ohne Nummer",
        );
      }
    }

    // Einsatz schließen
    docsToUpdate.push({
      ...(einsatz as unknown as Record<string, unknown>),
      status: "abgeschlossen",
      schreibschutz: true,
      einsatzende: now,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: `inaktiv-${hours}h` as const,
      abschlussOverrideHinweis: `Auto-Abschluss nach ${hours} h Inaktivität — letzter Stand: ${einsatz.geaendertAm ?? einsatz.alarmierungZeit ?? "unbekannt"}.`,
      geaendertAm: now,
      ...(berichtNummer ? { berichtNummer } : {}),
    });

    // Kaskade: offene Fahrzeugberichte
    for (const f of offeneFzg) {
      docsToUpdate.push({
        ...(f as unknown as Record<string, unknown>),
        status: "abgeschlossen",
        autoAbgeschlossen: true,
        autoAbgeschlossenAm: now,
        autoAbgeschlossenGrund: "hauptauftrag-inaktiv" as const,
        geaendertAm: now,
      });
    }

    try {
      const { ok, failed } = await bulkUpdateWithRetry(docsToUpdate);
      if (failed.length > 0) {
        result.fehler += failed.length;
        logger.warn(
          { einsatzId: einsatz._id, failed: failed.length, failedIds: failed, total: docsToUpdate.length },
          "Auto-Close: Bulk-Update mit (auch nach Retry) verbliebenen Fehlern",
        );
        // cascade_failed-Marker am Hauptauftrag, sofern der Hauptauftrag
        // selbst durchging und nur die Fahrzeugberichte verwaisten.
        const hauptauftragFailed = failed.includes(einsatz._id);
        if (!hauptauftragFailed) {
          try {
            const fresh = (await db.get(einsatz._id)) as Record<string, unknown>;
            await db.insert({
              ...fresh,
              cascade_failed: true,
              cascade_failed_ids: failed,
              geaendertAm: new Date().toISOString(),
            } as Parameters<typeof db.insert>[0]);
          } catch (markErr) {
            logger.warn(
              { err: markErr, einsatzId: einsatz._id },
              "Auto-Close: cascade_failed-Marker konnte nicht gesetzt werden",
            );
          }
        }
      }
      if (ok > 0) {
        result.geschlossen += 1;
        result.cascade_fzgber += Math.max(0, ok - 1); // ohne den Einsatz selbst
        await writeAuditEvent({
          type: "einsatz-abschluss",
          actorUsername: "system:auto-close",
          einsatzId: einsatz._id,
          details: {
            grund: "auto-close-stale",
            inaktivStunden: hours,
            kaskadierteFahrzeugberichte: offeneFzg.length,
            ...(failed.length > 0 ? { kaskadenFehler: failed.length } : {}),
          },
        });
      }
    } catch (err) {
      result.fehler += 1;
      logger.error(
        { err, einsatzId: einsatz._id },
        "Auto-Close fehlgeschlagen für Einsatz",
      );
    }
  }

  result.durationMs = Date.now() - start;
  logger.info(result, "Auto-Close-Lauf fertig");
  return result;
}

export function startAutoCloseStaleCron(): void {
  cron.schedule(CRON_AUSDRUCK, () => {
    void runAutoCloseStale().catch((err) => {
      logger.error({ err }, "Auto-Close-Cron-Lauf fehlgeschlagen");
    });
  });
  logger.info(
    {
      cron: CRON_AUSDRUCK,
      autoCloseHours: autoCloseHours(),
    },
    "Auto-Close-Stale-Cron geplant",
  );
}

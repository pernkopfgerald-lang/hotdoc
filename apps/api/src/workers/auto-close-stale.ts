/**
 * Auto-Abschluss stale + unbefuellte Auftraege (Inaktivitaets-Schutz).
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
 * Dieser Worker fährt drei Regeln im selben Lauf:
 *
 * Regel 1 — Stale-Abschluss: Einsaetze mit status="aktiv" deren letzte
 *   Aktivität (geaendertAm, inkl. Fahrzeugberichte) länger als
 *   AUTO_CLOSE_HOURS (Default 6 h) zurückliegt werden abgeschlossen —
 *   mit Berichtsnummer (AUDIT-11). U-08: Übungen haben einen eigenen
 *   Schwellwert AUTO_CLOSE_HOURS_UEBUNG (Default 24 h) — vorab angelegte
 *   Übungen dürfen nicht vor Übungsbeginn zufallen — und bekommen beim
 *   Auto-Abschluss bewusst KEINE Berichtsnummer.
 *
 * Regel 2 — Unbefüllt-Abschluss (L-01, UNFILLED_CLOSE_MINUTES, Default 60):
 *   Poller-auto-angelegte Alarme (einsatzTyp="alarm") die nach 1 h komplett
 *   unbefüllt sind (keine User-Chronik, alle Fahrzeugberichte Phantom,
 *   Einsatz-Inhaltsfelder leer) werden OHNE Berichtsnummer geschlossen —
 *   Phantom-Alarme verbrennen keine Nummern; Reaktivieren + echter Abschluss
 *   vergibt regulär. Basis ist erstelltAm (NICHT geaendertAm: bloßes Öffnen
 *   am Tablet erzeugt Auto-Writes — einsatzort-PUT nach 1,5 s, leerer
 *   Fahrzeugbericht nach 2,5 s).
 *
 * Regel 3 — Orphan-Sweep (L-07): Fahrzeugberichte "in_arbeit" unter einem
 *   seit mehr als 1 h abgeschlossenen Einsatz (einsatzende in den letzten
 *   7 Tagen) werden mit Grund "hauptauftrag-geschlossen" nachgeschlossen.
 *
 * ENV-Wert <= 0 deaktiviert die jeweilige Regel (Regel 3 hat keinen
 * Schalter — sie repariert nur bereits abgeschlossene Einsätze).
 *
 * Läuft alle 15 Minuten (hält das 1-h-Versprechen von Regel 2 eng).
 * Cron-Ausdruck: `*\/15 * * * *`.
 */

import cron from "node-cron";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { writeAuditEvent } from "../services/audit.js";
import { vergebeBerichtNummer } from "../services/bericht-nummer.js";
import {
  isPhantom,
  type FahrzeugberichtMin as PhantomPruefFelder,
} from "./phantom-fzgber-cleanup.js";

const CRON_AUSDRUCK = "*/15 * * * *";
const DEFAULT_AUTO_CLOSE_HOURS = 6;
/** U-08: Übungen werden oft am Vortag angelegt — längerer Default. */
const DEFAULT_AUTO_CLOSE_HOURS_UEBUNG = 24;
/** L-01: Unbefüllt-Cutoff in Minuten. */
const DEFAULT_UNFILLED_CLOSE_MINUTES = 60;
/**
 * L-07: Orphan-Sweep prüft nur Einsätze deren einsatzende in den letzten
 * 7 Tagen liegt — ältere Abschlüsse liefern keine neuen Orphans mehr.
 */
const ORPHAN_FENSTER_TAGE = 7;
/** L-07: einsatzende muss mind. 1 h zurückliegen (Kdt darf noch nachtippen). */
const ORPHAN_MIN_ALTER_MS = 60 * 60 * 1000;

/** Gemeinsame Kappungslogik für die Stunden-ENVs. */
function gekappteStunden(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  // Wert <= 0 schaltet das Feature aus
  if (n <= 0) return 0;
  // Hard cap 168 h (1 Woche) — verhindert versehentliches Disablement
  if (n > 168) return 168;
  return n;
}

function autoCloseHours(): number {
  return gekappteStunden(process.env.AUTO_CLOSE_HOURS, DEFAULT_AUTO_CLOSE_HOURS);
}

/** U-08: eigener Schwellwert für Übungen — gleiche Kappungslogik. */
function autoCloseHoursUebung(): number {
  return gekappteStunden(
    process.env.AUTO_CLOSE_HOURS_UEBUNG,
    DEFAULT_AUTO_CLOSE_HOURS_UEBUNG,
  );
}

/**
 * L-01: Unbefüllt-Cutoff in Minuten — eigener Guard, unabhängig von
 * AUTO_CLOSE_HOURS. <= 0 schaltet NUR die Unbefüllt-Regel aus.
 */
function unfilledCloseMinutes(): number {
  const raw = process.env.UNFILLED_CLOSE_MINUTES;
  if (!raw) return DEFAULT_UNFILLED_CLOSE_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_UNFILLED_CLOSE_MINUTES;
  if (n <= 0) return 0;
  // Hard cap 1 Woche (in Minuten) — analog zur Stunden-Kappung
  if (n > 168 * 60) return 168 * 60;
  return n;
}

interface CloseResult {
  pruefte_einsaetze: number;
  geschlossen: number;
  /** L-01: via Unbefüllt-Regel (ohne Berichtsnummer) geschlossen. */
  unbefuellt_geschlossen: number;
  cascade_fzgber: number;
  /** L-07: via Orphan-Sweep nachgeschlossene Fahrzeugberichte. */
  orphan_fzgber: number;
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
  einsatzende?: string;
  /** AUDIT-11: bereits vergebene Berichtsnummer (Reaktivierungs-Fall). */
  berichtNummer?: string;
  // — Felder für die Unbefüllt-Prüfung (L-01) —
  chronik?: Array<{ fahrzeugId?: string; typ?: string }>;
  meldungEinsatzleitung?: string;
  zeitmarken?: Record<string, unknown>;
  beteiligteStellen?: unknown[];
  sonstigeAnwesendeFF?: { aktive?: unknown[]; sonstigeFreitext?: string };
  reservePersonIds?: unknown[];
  mannschaft?: { bereitschaft?: number; sonstige?: number };
  einsatzleiterPersonId?: number;
  bearbeiterPersonId?: number;
  brandStatistik?: unknown;
  technischeStatistik?: unknown;
  verrechnung?: { verrechenbar?: boolean };
}

/**
 * Lokale Fahrzeugbericht-Sicht: die Phantom-Prüf-Felder kommen aus
 * phantom-fzgber-cleanup.ts (damit isPhantom hier typsicher aufrufbar ist),
 * plus die Felder die dieser Worker selbst braucht.
 */
interface FahrzeugberichtMin extends PhantomPruefFelder {
  einsatzId?: string;
  geaendertAm?: string;
}

/**
 * Bulk-Update mit per-doc Conflict-Retry (Auto-Close-Variante).
 * Spiegelt routes/einsaetze.ts:bulkUpdateWithRetry — bewusst dupliziert
 * damit die Worker-Datei keine Abhaengigkeit zu den Routes hat (zirkular-
 * frei, einfacher zu testen).
 *
 * L-02: Im Conflict-Fall darf NICHT das alte sourceDoc mit frischer _rev
 * drübergebügelt werden — das würde frische User-Writes mit dem alten Stand
 * überschreiben. Stattdessen liefert `patchFor(docId, fresh)` NUR die
 * Marker-Felder, die auf den frischen Stand gemerged werden. Gibt patchFor
 * null zurück (Re-Validierung: Doc ist nicht mehr abschlusswürdig), wird
 * der Retry abgebrochen und das Doc als failed gezählt. Ohne patchFor
 * bleibt das alte Verhalten (sourceDoc gewinnt) erhalten.
 */
async function bulkUpdateWithRetry(
  docs: Array<Record<string, unknown>>,
  patchFor?: (
    docId: string,
    fresh: Record<string, unknown>,
  ) => Record<string, unknown> | null,
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
      let merged: Record<string, unknown>;
      if (patchFor) {
        const patch = patchFor(docId, fresh);
        if (patch === null) {
          // Re-Validierung negativ: der frische Stand ist nicht mehr
          // abschlusswürdig (User hat inzwischen geschrieben/geschlossen)
          // → Retry abbrechen, Doc überspringen.
          failed.push(docId);
          continue;
        }
        merged = { ...fresh, ...patch };
      } else {
        merged = { ...sourceDoc, _rev: fresh._rev };
      }
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

/** Patch + Re-Validierung pro Doc-ID für den Conflict-Retry (L-02). */
interface PatchEintrag {
  patch: Record<string, unknown>;
  /** Prüft auf dem frischen Doc ob der Abschluss noch gelten darf. */
  pruefeFresh: (fresh: Record<string, unknown>) => boolean;
}

/** Baut die patchFor-Callback aus einer Doc-ID→Patch-Map. */
function patchForAus(patches: Map<string, PatchEintrag>) {
  return (
    docId: string,
    fresh: Record<string, unknown>,
  ): Record<string, unknown> | null => {
    const eintrag = patches.get(docId);
    if (!eintrag) return null;
    if (!eintrag.pruefeFresh(fresh)) return null;
    return eintrag.patch;
  };
}

/**
 * L-01: Prüft ob ein Poller-auto-angelegter Alarm komplett unbefüllt ist.
 *
 * ALLE Bedingungen müssen gelten:
 *  1. einsatzTyp === "alarm" — nur Poller-auto-angelegte. manuell/uebung/
 *     lotsendienst tragen menschlichen Anlage-Intent und fallen nur unter
 *     die Stale-Regel.
 *  2. status "aktiv" und erstelltAm (Fallback alarmierungZeit) älter als
 *     der Unbefüllt-Cutoff. Bewusst NICHT geaendertAm: bloßes Öffnen am
 *     Tablet erzeugt Auto-Writes (einsatzort-PUT nach 1,5 s, leerer
 *     Fahrzeugbericht nach 2,5 s) und würde den Timer endlos verlängern.
 *  3. Chronik enthält nur den automatischen BlaulichtSMS-Eintrag.
 *  4. Jeder Fahrzeugbericht des Einsatzes ist Phantom (isPhantom aus
 *     phantom-fzgber-cleanup.ts — eine Definition, kein Drift).
 *  5. Alle Einsatz-Inhaltsfelder leer. einsatzort/koordinaten/pflicht-
 *     bereich werden bewusst NICHT geprüft — die befüllt der Poller selbst
 *     (Auto-Pflichtbereich via GPS-Bbox).
 */
function istUnbefuellt(
  einsatz: EinsatzMin,
  fzgberDesEinsatzes: FahrzeugberichtMin[],
  cutoffUnbefuellt: number,
): boolean {
  // 1. Nur Poller-auto-angelegte Alarme.
  if (einsatz.einsatzTyp !== "alarm") return false;
  // 2. Aktiv + alt genug (Basis erstelltAm, NICHT geaendertAm).
  if (einsatz.status !== "aktiv") return false;
  const basis = einsatz.erstelltAm ?? einsatz.alarmierungZeit;
  if (!basis) return false;
  const t = new Date(basis).getTime();
  if (Number.isNaN(t)) return false;
  if (t > cutoffUnbefuellt) return false;
  // 3. Chronik ohne User-Eintrag (nur der Auto-Eintrag vom Poller).
  const chronik = einsatz.chronik ?? [];
  const nurAutoChronik = chronik.every(
    (e) => e.fahrzeugId === "blaulichtsms" || e.typ === "auto-blaulichtsms",
  );
  if (!nurAutoChronik) return false;
  // 4. Jeder Fahrzeugbericht des Einsatzes ist Phantom.
  if (!fzgberDesEinsatzes.every((f) => isPhantom(f))) return false;
  // 5. Einsatz-Inhaltsfelder leer.
  if ((einsatz.meldungEinsatzleitung ?? "").trim().length > 0) return false;
  const zeitmarken = einsatz.zeitmarken ?? {};
  if (Object.values(zeitmarken).some((v) => v !== undefined && v !== null)) {
    return false;
  }
  if ((einsatz.beteiligteStellen ?? []).length > 0) return false;
  const sonstigeFF = einsatz.sonstigeAnwesendeFF ?? {};
  if ((sonstigeFF.aktive ?? []).length > 0) return false;
  if ((sonstigeFF.sonstigeFreitext ?? "").trim().length > 0) return false;
  if ((einsatz.reservePersonIds ?? []).length > 0) return false;
  const mannschaft = einsatz.mannschaft ?? {};
  if ((mannschaft.bereitschaft ?? 0) + (mannschaft.sonstige ?? 0) > 0) {
    return false;
  }
  if (einsatz.einsatzleiterPersonId !== undefined && einsatz.einsatzleiterPersonId !== null) {
    return false;
  }
  if (einsatz.bearbeiterPersonId !== undefined && einsatz.bearbeiterPersonId !== null) {
    return false;
  }
  if (einsatz.brandStatistik !== undefined && einsatz.brandStatistik !== null) {
    return false;
  }
  if (einsatz.technischeStatistik !== undefined && einsatz.technischeStatistik !== null) {
    return false;
  }
  if (einsatz.verrechnung?.verrechenbar === true) return false;
  return true;
}

/**
 * Findet den jüngsten geaendertAm der übergebenen Fahrzeugberichte.
 * Mannschaft kann über Stunden im Fahrzeugbericht tippen ohne den Einsatz-
 * Header zu ändern — dann darf der Einsatz NICHT auto-geschlossen werden.
 */
function jungsterFzgTimestamp(fzgber: FahrzeugberichtMin[]): number {
  let max = -Infinity;
  for (const f of fzgber) {
    if (!f.geaendertAm) continue;
    const t = new Date(f.geaendertAm).getTime();
    if (Number.isNaN(t)) continue;
    if (t > max) max = t;
  }
  return max;
}

/**
 * Führt den Abschluss eines Einsatzes samt Fahrzeugbericht-Kaskade als
 * Bulk mit Conflict-Retry aus. L-02: der Retry patcht NUR die Marker-
 * Felder auf den frischen Stand — nach Re-Validierung via pruefeFresh.
 */
async function schliesseEinsatzMitKaskade(
  einsatz: EinsatzMin,
  docsToUpdate: Array<Record<string, unknown>>,
  patches: Map<string, PatchEintrag>,
  auditDetails: Record<string, unknown>,
): Promise<{ hauptOk: boolean; kaskade: number; fehler: number }> {
  try {
    const { ok, failed } = await bulkUpdateWithRetry(
      docsToUpdate,
      patchForAus(patches),
    );
    const hauptOk = !failed.includes(einsatz._id);
    if (failed.length > 0) {
      logger.warn(
        {
          einsatzId: einsatz._id,
          failed: failed.length,
          failedIds: failed,
          total: docsToUpdate.length,
        },
        "Auto-Close: Bulk-Update mit (auch nach Retry) verbliebenen Fehlern",
      );
      // cascade_failed-Marker am Hauptauftrag, sofern der Hauptauftrag
      // selbst durchging und nur die Fahrzeugberichte verwaisten.
      if (hauptOk) {
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
    if (hauptOk) {
      await writeAuditEvent({
        type: "einsatz-abschluss",
        actorUsername: "system:auto-close",
        einsatzId: einsatz._id,
        details: {
          ...auditDetails,
          ...(failed.length > 0 ? { kaskadenFehler: failed.length } : {}),
        },
      });
    }
    return {
      hauptOk,
      kaskade: Math.max(0, ok - (hauptOk ? 1 : 0)),
      fehler: failed.length,
    };
  } catch (err) {
    logger.error(
      { err, einsatzId: einsatz._id },
      "Auto-Close fehlgeschlagen für Einsatz",
    );
    return { hauptOk: false, kaskade: 0, fehler: 1 };
  }
}

export async function runAutoCloseStale(): Promise<CloseResult> {
  const start = Date.now();
  const hours = autoCloseHours();
  const hoursUebung = autoCloseHoursUebung();
  const unbefuelltMinuten = unfilledCloseMinutes();
  const result: CloseResult = {
    pruefte_einsaetze: 0,
    geschlossen: 0,
    unbefuellt_geschlossen: 0,
    cascade_fzgber: 0,
    orphan_fzgber: 0,
    fehler: 0,
    durationMs: 0,
  };

  const jetzt = Date.now();
  const cutoffStale = jetzt - hours * 60 * 60 * 1000;
  const cutoffUebung = jetzt - hoursUebung * 60 * 60 * 1000;
  const cutoffUnbefuellt = jetzt - unbefuelltMinuten * 60 * 1000;
  const orphanFensterStart = jetzt - ORPHAN_FENSTER_TAGE * 24 * 60 * 60 * 1000;
  const orphanCutoff = jetzt - ORPHAN_MIN_ALTER_MS;

  const einsaetze = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￰",
    include_docs: true,
  });

  // L-06: KEIN Fahrzeugbericht-Vollscan mehr. Erst Einsätze scannen und
  // Kandidaten sammeln, danach die Fahrzeugberichte NUR für Kandidaten
  // gezielt per ID-Prefix (fzgber:<einsatzId>:) nachladen.
  const staleKandidaten: EinsatzMin[] = [];
  const unbefuelltKandidaten: EinsatzMin[] = [];
  const orphanKandidaten: EinsatzMin[] = [];
  for (const row of einsaetze.rows) {
    const doc = row.doc as (EinsatzMin & { type?: string }) | undefined;
    if (!doc) continue;
    if (doc.type !== "einsatz") continue;
    if (doc.status === "aktiv") {
      // Regel 1: Stale — Typ-abhängiger Schwellwert (U-08).
      const istUebung = doc.einsatzTyp === "uebung";
      const typHours = istUebung ? hoursUebung : hours;
      if (typHours > 0) {
        // Benutze den jüngsten Zeitstempel als Aktivitätsmarker.
        const ts =
          doc.geaendertAm ?? doc.erstelltAm ?? doc.alarmierungZeit ?? null;
        if (ts) {
          const t = new Date(ts).getTime();
          if (!Number.isNaN(t) && t <= (istUebung ? cutoffUebung : cutoffStale)) {
            staleKandidaten.push(doc);
          }
        }
      }
      // Regel 2: Unbefüllt (L-01) — Inhalts-Vorprüfung noch OHNE Fahrzeug-
      // berichte (leere Liste); die fzgber-Bedingung wird nach dem
      // gezielten Laden unten nochmals vollständig geprüft.
      if (unbefuelltMinuten > 0 && istUnbefuellt(doc, [], cutoffUnbefuellt)) {
        unbefuelltKandidaten.push(doc);
      }
    } else if (doc.status === "abgeschlossen" && doc.einsatzende) {
      // Regel 3: Orphan-Sweep-Kandidaten (L-07) — nur kürzlich (< 7 Tage)
      // abgeschlossene Einsätze, deren einsatzende >= 1 h zurückliegt.
      const t = new Date(doc.einsatzende).getTime();
      if (!Number.isNaN(t) && t >= orphanFensterStart && t <= orphanCutoff) {
        orphanKandidaten.push(doc);
      }
    }
  }
  const kandidatIds = new Set<string>(
    [...staleKandidaten, ...unbefuelltKandidaten].map((e) => e._id),
  );
  result.pruefte_einsaetze = kandidatIds.size;
  if (
    staleKandidaten.length === 0 &&
    unbefuelltKandidaten.length === 0 &&
    orphanKandidaten.length === 0
  ) {
    result.durationMs = Date.now() - start;
    return result;
  }

  logger.info(
    {
      stale: staleKandidaten.length,
      unbefuellt: unbefuelltKandidaten.length,
      orphanEinsaetze: orphanKandidaten.length,
      autoCloseHours: hours,
      autoCloseHoursUebung: hoursUebung,
      unbefuelltMinuten,
    },
    "Auto-Close: Kandidaten gefunden",
  );

  // Gezieltes Nachladen der Fahrzeugberichte je Kandidat (L-06) — mit
  // Cache, weil ein Einsatz gleichzeitig Stale- UND Unbefüllt-Kandidat
  // sein kann.
  const fzgCache = new Map<string, FahrzeugberichtMin[]>();
  async function ladeFzgber(einsatzId: string): Promise<FahrzeugberichtMin[]> {
    const cached = fzgCache.get(einsatzId);
    if (cached) return cached;
    const prefix = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:`;
    const liste = await db.list({
      startkey: prefix,
      endkey: `${prefix}￰`,
      include_docs: true,
    });
    const docs = liste.rows
      .map((r) => r.doc as (FahrzeugberichtMin & { type?: string }) | undefined)
      .filter((d): d is NonNullable<typeof d> => !!d && d.type === "fahrzeugbericht");
    fzgCache.set(einsatzId, docs);
    return docs;
  }

  const now = new Date().toISOString();
  const geschlossenIds = new Set<string>();

  // ─── Regel 2 zuerst: Unbefüllt-Abschluss (L-01) ───
  // Vor dem Stale-Pfad, damit ein Einsatz der beide Bedingungen erfüllt
  // den Unbefüllt-Weg nimmt (keine Berichtsnummer verbrennen).
  for (const einsatz of unbefuelltKandidaten) {
    const fzgber = await ladeFzgber(einsatz._id);
    if (!istUnbefuellt(einsatz, fzgber, cutoffUnbefuellt)) continue;
    const offeneFzg = fzgber.filter((f) => f.status === "in_arbeit");

    logger.info(
      {
        einsatzId: einsatz._id,
        unbefuelltMinuten,
        offeneFzgber: offeneFzg.length,
      },
      "Auto-Close: unbefüllter Alarm — wird ohne Berichtsnummer geschlossen",
    );

    // KEINE vergebeBerichtNummer in diesem Pfad — Phantom-Alarme verbrennen
    // keine Nummern; Reaktivieren + echter Abschluss vergibt regulär.
    const patches = new Map<string, PatchEintrag>();
    const einsatzPatch: Record<string, unknown> = {
      status: "abgeschlossen",
      schreibschutz: true,
      einsatzende: now,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: "unbefuellt-1h",
      abschlussOverrideHinweis:
        "Auto-Abschluss: Bericht wurde innerhalb 1 h nicht befuellt.",
      geaendertAm: now,
    };
    const docsToUpdate: Array<Record<string, unknown>> = [
      { ...(einsatz as unknown as Record<string, unknown>), ...einsatzPatch },
    ];
    patches.set(einsatz._id, {
      patch: einsatzPatch,
      pruefeFresh: (fresh) => {
        const f = fresh as unknown as EinsatzMin;
        // Re-Validierung (L-02): inzwischen befüllt oder geschlossen →
        // Einsatz überspringen statt frische Writes zu überschreiben.
        return f.status === "aktiv" && istUnbefuellt(f, fzgber, cutoffUnbefuellt);
      },
    });
    const fzgPatch: Record<string, unknown> = {
      status: "abgeschlossen",
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: "hauptauftrag-unbefuellt",
      geaendertAm: now,
    };
    for (const f of offeneFzg) {
      docsToUpdate.push({
        ...(f as unknown as Record<string, unknown>),
        ...fzgPatch,
      });
      patches.set(f._id, {
        patch: fzgPatch,
        pruefeFresh: (fresh) =>
          (fresh as unknown as FahrzeugberichtMin).status === "in_arbeit",
      });
    }

    const r = await schliesseEinsatzMitKaskade(einsatz, docsToUpdate, patches, {
      grund: "auto-close-unbefuellt",
      unbefuelltMinuten,
      kaskadierteFahrzeugberichte: offeneFzg.length,
    });
    if (r.hauptOk) {
      result.unbefuellt_geschlossen += 1;
      geschlossenIds.add(einsatz._id);
    }
    result.cascade_fzgber += r.kaskade;
    result.fehler += r.fehler;
  }

  // ─── Regel 1: Stale-Abschluss ───
  for (const einsatz of staleKandidaten) {
    // Bereits im Unbefüllt-Pfad geschlossen? Dann fertig.
    if (geschlossenIds.has(einsatz._id)) continue;
    const istUebung = einsatz.einsatzTyp === "uebung";
    const typHours = istUebung ? hoursUebung : hours;
    const typCutoff = istUebung ? cutoffUebung : cutoffStale;

    const fzgber = await ladeFzgber(einsatz._id);
    // Fahrzeugbericht-Aktivität berücksichtigen: wenn irgendein
    // Fahrzeugbericht des Einsatzes neuer als der Cutoff ist, tippt die
    // Mannschaft noch — Einsatz überspringen.
    if (jungsterFzgTimestamp(fzgber) > typCutoff) continue;
    const offeneFzg = fzgber.filter((f) => f.status === "in_arbeit");

    logger.info(
      {
        einsatzId: einsatz._id,
        autoCloseHours: typHours,
        einsatzTyp: einsatz.einsatzTyp ?? "alarm",
      },
      "Auto-Close: stale Auftrag gefunden — wird geschlossen",
    );

    // AUDIT-11: auch der Auto-Abschluss vergibt eine echte Berichtsnummer —
    // dieselbe Nur-wenn-fehlt-Bedingung wie in POST /abschluss (Reaktivieren
    // + erneuter Abschluss zieht KEINE zweite Nummer). Vergabe-Fehler
    // blockieren den Auto-Abschluss nicht (PDF-Fallback: deriveBerichtNrFromId).
    // U-08: Übungen bekommen beim Auto-Abschluss bewusst KEINE Nummer —
    // U-Nummern werden nur bei echtem (menschlichem) Abschluss vergeben.
    let berichtNummer = einsatz.berichtNummer;
    if (!berichtNummer && !istUebung) {
      try {
        berichtNummer = await vergebeBerichtNummer(
          einsatz.einsatzart,
          einsatz.alarmierungZeit,
          einsatz.einsatzTyp,
        );
      } catch (err) {
        logger.warn(
          { err, einsatzId: einsatz._id },
          "Auto-Close: Berichtsnummer-Vergabe fehlgeschlagen — Abschluss ohne Nummer",
        );
      }
    }

    const patches = new Map<string, PatchEintrag>();
    const einsatzPatch: Record<string, unknown> = {
      status: "abgeschlossen",
      schreibschutz: true,
      einsatzende: now,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: `inaktiv-${typHours}h`,
      abschlussOverrideHinweis: `Auto-Abschluss nach ${typHours} h Inaktivität — letzter Stand: ${einsatz.geaendertAm ?? einsatz.alarmierungZeit ?? "unbekannt"}.`,
      geaendertAm: now,
      ...(berichtNummer ? { berichtNummer } : {}),
    };
    const docsToUpdate: Array<Record<string, unknown>> = [
      { ...(einsatz as unknown as Record<string, unknown>), ...einsatzPatch },
    ];
    patches.set(einsatz._id, {
      patch: einsatzPatch,
      pruefeFresh: (fresh) => {
        const f = fresh as unknown as EinsatzMin;
        if (f.status !== "aktiv") return false;
        // Re-Validierung (L-02): geaendertAm jünger als Cutoff → User hat
        // zwischenzeitlich geschrieben → Einsatz überspringen.
        const ts = f.geaendertAm ?? f.erstelltAm ?? f.alarmierungZeit;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return !Number.isNaN(t) && t <= typCutoff;
      },
    });
    const fzgPatch: Record<string, unknown> = {
      status: "abgeschlossen",
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: "hauptauftrag-inaktiv",
      geaendertAm: now,
    };
    for (const f of offeneFzg) {
      docsToUpdate.push({
        ...(f as unknown as Record<string, unknown>),
        ...fzgPatch,
      });
      patches.set(f._id, {
        patch: fzgPatch,
        pruefeFresh: (fresh) =>
          (fresh as unknown as FahrzeugberichtMin).status === "in_arbeit",
      });
    }

    const r = await schliesseEinsatzMitKaskade(einsatz, docsToUpdate, patches, {
      grund: "auto-close-stale",
      inaktivStunden: typHours,
      kaskadierteFahrzeugberichte: offeneFzg.length,
    });
    if (r.hauptOk) {
      result.geschlossen += 1;
      geschlossenIds.add(einsatz._id);
    }
    result.cascade_fzgber += r.kaskade;
    result.fehler += r.fehler;
  }

  // ─── Regel 3: Orphan-Sweep (L-07) ───
  // Fahrzeugberichte "in_arbeit" unter einem längst abgeschlossenen Einsatz
  // hängen sonst ewig — sie entstehen z. B. wenn die Kaskade beim Abschluss
  // fehlschlug oder ein Tablet nach dem Abschluss noch einen leeren Bericht
  // angelegt hat.
  for (const einsatz of orphanKandidaten) {
    const fzgber = await ladeFzgber(einsatz._id);
    const offeneFzg = fzgber.filter((f) => f.status === "in_arbeit");
    if (offeneFzg.length === 0) continue;

    const fzgPatch: Record<string, unknown> = {
      status: "abgeschlossen",
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: "hauptauftrag-geschlossen",
      geaendertAm: now,
    };
    const patches = new Map<string, PatchEintrag>();
    const docsToUpdate: Array<Record<string, unknown>> = [];
    for (const f of offeneFzg) {
      docsToUpdate.push({
        ...(f as unknown as Record<string, unknown>),
        ...fzgPatch,
      });
      patches.set(f._id, {
        patch: fzgPatch,
        pruefeFresh: (fresh) =>
          (fresh as unknown as FahrzeugberichtMin).status === "in_arbeit",
      });
    }
    try {
      const { ok, failed } = await bulkUpdateWithRetry(
        docsToUpdate,
        patchForAus(patches),
      );
      result.orphan_fzgber += ok;
      result.fehler += failed.length;
      if (ok > 0) {
        logger.info(
          { einsatzId: einsatz._id, geschlossen: ok, einsatzende: einsatz.einsatzende },
          "Orphan-Sweep: offene Fahrzeugberichte unter abgeschlossenem Einsatz nachgeschlossen",
        );
      }
    } catch (err) {
      result.fehler += 1;
      logger.error(
        { err, einsatzId: einsatz._id },
        "Orphan-Sweep fehlgeschlagen für Einsatz",
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
      autoCloseHoursUebung: autoCloseHoursUebung(),
      unbefuelltMinuten: unfilledCloseMinutes(),
    },
    "Auto-Close-Stale-Cron geplant",
  );
}

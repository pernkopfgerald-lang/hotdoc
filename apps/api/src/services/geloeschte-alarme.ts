/**
 * Sperrliste geloeschter Alarme (`state:geloeschte-alarme`).
 *
 * Problem: Der BlaulichtSMS-Poller legt zu jedem Alarm der Dashboard-Liste
 * `einsatz:<alarmId>` an, sobald dieses Doc fehlt (db.get -> 404). Ein per
 * DELETE /api/einsaetze/:id geloeschter Einsatz hinterlaesst nur einen
 * Tombstone (ebenfalls 404) — solange der Alarm in der BlaulichtSMS-Liste
 * steht, wuerde der Poller den Einsatz samt neuem FCM-Push wieder anlegen.
 *
 * Loesung: Beim Loeschen werden die alarmId(s) des Einsatzes mit Zeitpunkt in
 * dieses eine Doc geschrieben; der Poller ueberspringt gesperrte Alarme.
 * Eintraege verfallen nach SPERRE_TAGE (BlaulichtSMS fuehrt Alarme nicht
 * ewig in der Liste) und werden beim naechsten Schreiben entfernt.
 *
 * Fail-open beim Lesen: Kann die Sperrliste nicht gelesen werden, wird der
 * Alarm trotzdem angelegt — ein verpasster echter Alarm waere schlimmer als
 * ein wieder aufgetauchter geloeschter.
 */

import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

export const GELOESCHTE_ALARME_DOC_ID = "state:geloeschte-alarme";
/** So lange bleibt eine Sperre bestehen. */
export const SPERRE_TAGE = 14;
const SPERRE_MS = SPERRE_TAGE * 24 * 60 * 60 * 1000;

interface GesperrteAlarmeDoc {
  _id: string;
  _rev?: string;
  type: "state";
  /** alarmId -> ISO-Zeitpunkt des Loeschens. */
  alarme: Record<string, string>;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

/** alarmId + alarmIds eines Einsatz-Docs (eindeutig, nur nicht-leere Strings). */
export function alarmIdsVonEinsatz(doc: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (typeof doc.alarmId === "string" && doc.alarmId) ids.add(doc.alarmId);
  if (Array.isArray(doc.alarmIds)) {
    for (const x of doc.alarmIds) if (typeof x === "string" && x) ids.add(x);
  }
  return [...ids];
}

function ohneAbgelaufene(
  alarme: Record<string, string> | undefined,
  jetztMs: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, zeit] of Object.entries(alarme ?? {})) {
    const t = Date.parse(zeit);
    if (Number.isFinite(t) && jetztMs - t < SPERRE_MS) out[id] = zeit;
  }
  return out;
}

/**
 * Traegt alarmIds in die Sperrliste ein (und entfernt dabei verfallene
 * Eintraege). Bei Revisionskonflikt wird bis zu 3x mit frischem Stand
 * wiederholt. Wirft bei endgueltigem Fehlschlag — der Aufrufer entscheidet.
 */
export async function sperreAlarme(alarmIds: string[], jetztMs: number = Date.now()): Promise<void> {
  if (alarmIds.length === 0) return;
  const zeit = new Date(jetztMs).toISOString();
  for (let versuch = 1; versuch <= 3; versuch++) {
    let rev: string | undefined;
    let bestehend: Record<string, string> = {};
    try {
      const d = (await db.get(GELOESCHTE_ALARME_DOC_ID)) as GesperrteAlarmeDoc;
      rev = d._rev;
      bestehend = d.alarme ?? {};
    } catch (err) {
      if (statusCode(err) !== 404) throw err;
    }
    const alarme = ohneAbgelaufene(bestehend, jetztMs);
    for (const id of alarmIds) alarme[id] = zeit;
    const neu: GesperrteAlarmeDoc = {
      _id: GELOESCHTE_ALARME_DOC_ID,
      ...(rev ? { _rev: rev } : {}),
      type: "state",
      alarme,
    };
    try {
      await db.insert(neu);
      return;
    } catch (err) {
      if (statusCode(err) === 409 && versuch < 3) continue;
      throw err;
    }
  }
}

/**
 * true, wenn der Alarm geloescht wurde und nicht neu angelegt werden soll.
 * Lesefehler -> false (fail-open, siehe Dateikopf).
 */
export async function istAlarmGesperrt(alarmId: string, jetztMs: number = Date.now()): Promise<boolean> {
  try {
    const d = (await db.get(GELOESCHTE_ALARME_DOC_ID)) as GesperrteAlarmeDoc;
    const zeit = d.alarme?.[alarmId];
    if (!zeit) return false;
    const t = Date.parse(zeit);
    return Number.isFinite(t) && jetztMs - t < SPERRE_MS;
  } catch (err) {
    if (statusCode(err) !== 404) {
      logger.warn(
        { alarmId, err: err instanceof Error ? err.message : String(err) },
        "Sperrliste geloeschter Alarme nicht lesbar — Alarm wird trotzdem verarbeitet",
      );
    }
    return false;
  }
}

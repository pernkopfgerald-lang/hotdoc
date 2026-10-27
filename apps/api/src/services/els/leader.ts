/**
 * Genau EINE API-Instanz fragt die ELS-Schnittstelle ab.
 *
 * Auf Fly laufen mehrere Maschinen. Die Schnittstelle erlaubt nur einen Abruf
 * pro Minute (Einheiten) bzw. alle 5 s (Einsaetze) — zwei Instanzen wuerden sich
 * gegenseitig sperren und der Stand waere je nach Instanz veraltet. Deshalb gibt
 * es eine kurze "Leihe" (`state:els-leader`) in der Datenbank: wer sie haelt,
 * pollt; die anderen lesen den gespeicherten Stand (`state:els-snapshot`).
 * Faellt der Halter aus (Maschine gestoppt), uebernimmt eine andere Instanz
 * nach Ablauf der Leihe.
 */

import { randomUUID } from "node:crypto";
import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";

const LEADER_DOC = "state:els-leader";
/** Leihe gilt 2 min und wird bei jedem Poll-Tick (<= 60 s) verlaengert. */
export const LEADER_TTL_MS = 2 * 60 * 1000;

export const INSTANZ_ID = process.env.FLY_MACHINE_ID ?? randomUUID();

interface LeaderDoc {
  _id: string;
  _rev?: string;
  type: "state";
  holder: string;
  until: number;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

/**
 * true, wenn diese Instanz die Leihe haelt (neu erworben oder verlaengert).
 * Bei Datenbankproblemen false — lieber nicht pollen als doppelt.
 */
export async function istLeader(jetztMs: number = Date.now()): Promise<boolean> {
  try {
    let rev: string | undefined;
    try {
      const d = (await db.get(LEADER_DOC)) as LeaderDoc;
      rev = d._rev;
      if (d.holder !== INSTANZ_ID && d.until > jetztMs) return false;
    } catch (err) {
      if (statusCode(err) !== 404) throw err;
    }
    const neu: LeaderDoc = {
      _id: LEADER_DOC,
      ...(rev ? { _rev: rev } : {}),
      type: "state",
      holder: INSTANZ_ID,
      until: jetztMs + LEADER_TTL_MS,
    };
    await db.insert(neu);
    return true;
  } catch (err) {
    if (statusCode(err) !== 409) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "ELS: Leihe konnte nicht geprueft werden");
    }
    return false; // 409 = eine andere Instanz war schneller
  }
}

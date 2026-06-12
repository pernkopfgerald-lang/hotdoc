/**
 * Echte laufende Berichtsnummer (AUDIT-11, Spec §12.3).
 *
 * Vergibt beim Einsatz-Abschluss eine fortlaufende Nummer im Schema
 * B26-001 / T26-001 (Prefix B/T via kategorieFuer, Jahr aus der
 * Alarmierungszeit). Der Zaehler lebt im Doc `config:bericht-counter`
 * mit Shape `{ counters: Record<string, number> }` (Key z. B. "B26").
 *
 * CouchDB kann NICHT atomar inkrementieren — deshalb Read-Modify-Write
 * mit 409-Conflict-Retry (max. 5 Versuche, Muster: bulkUpdateWithRetry
 * in routes/einsaetze.ts). Bei parallelem Abschluss zieht genau einer
 * der beiden Writer die Nummer, der andere laedt den frischen Stand und
 * bekommt die naechste. Doppelvergaben sind damit ausgeschlossen;
 * Luecken (Nummer gezogen, Abschluss danach gescheitert) sind moeglich
 * und akzeptiert.
 *
 * Hinweis: Nummernfolge = Verarbeitungsreihenfolge am Server — offline
 * nachgereichte Abschluesse bekommen ihre Nummer erst bei der Server-
 * Verarbeitung (NummerierungPanel-Text wird in AUDIT-15 angepasst).
 */

import { kategorieFuer } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

const COUNTER_DOC_ID = "config:bericht-counter";
const MAX_VERSUCHE = 5;

interface BerichtCounterDoc {
  _id: string;
  _rev?: string;
  type?: string;
  counters?: Record<string, number>;
}

/**
 * Vergibt die naechste laufende Berichtsnummer fuer Kategorie + Jahr.
 * Wirft nach MAX_VERSUCHE erfolglosen Conflict-Retries — der Caller
 * entscheidet, ob der Abschluss trotzdem (ohne Nummer) weiterlaeuft.
 */
export async function vergebeBerichtNummer(
  einsatzart: string | undefined,
  alarmierungZeit: string | undefined,
): Promise<string> {
  const prefix = kategorieFuer(einsatzart) === "brand" ? "B" : "T";
  let jahr = new Date().getFullYear();
  if (alarmierungZeit) {
    const d = new Date(alarmierungZeit);
    if (!Number.isNaN(d.getTime())) jahr = d.getFullYear();
  }
  const yy = String(jahr).slice(-2);
  const key = `${prefix}${yy}`;

  for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch++) {
    // Read: aktuellen Zaehler-Stand holen — bei 404 Doc neu anlegen.
    let counterDoc: BerichtCounterDoc;
    try {
      counterDoc = (await db.get(COUNTER_DOC_ID)) as BerichtCounterDoc;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
      counterDoc = { _id: COUNTER_DOC_ID };
    }
    const counters =
      counterDoc.counters && typeof counterDoc.counters === "object"
        ? counterDoc.counters
        : {};
    const bisher = typeof counters[key] === "number" ? counters[key] : 0;
    const n = bisher + 1;

    // Modify-Write: Conflict (409) heisst, ein paralleler Abschluss hat
    // den Zaehler zwischenzeitlich erhoeht → frisch laden und erneut.
    const updated = {
      ...counterDoc,
      type: "config",
      counters: { ...counters, [key]: n },
      geaendertAm: new Date().toISOString(),
    };
    try {
      await db.insert(updated);
      return `${prefix}${yy}-${String(n).padStart(3, "0")}`;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      logger.info(
        { key, versuch },
        "Bericht-Counter: 409-Conflict — Retry mit frischem Stand",
      );
    }
  }
  throw new Error(
    `bericht_counter_conflict: ${key} nach ${MAX_VERSUCHE} Versuchen nicht inkrementierbar`,
  );
}

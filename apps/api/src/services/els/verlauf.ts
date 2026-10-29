/**
 * Dauerhafter Verlauf der ELS-Anbindung (Diagnose).
 *
 * Das Fly-Log reicht nur wenige Minuten zurueck. Damit sich nach einem Einsatz
 * nachvollziehen laesst, was die Leitstelle fuer unsere Fahrzeuge geliefert hat
 * und was HotDoc daraus gemacht hat, landet jede Aenderung hier in der Datenbank:
 *
 *  - art "einheit":   Funkstatus / Einheitenstatus / Einsatznummer einer ELS-Einheit
 *                     hat sich geaendert (Rohwerte, wie die Schnittstelle sie liefert);
 *  - art "protokoll": Entscheidung, was mit einem Funkstatus unseres Fahrzeugs
 *                     passiert ist (ins Einsatzprotokoll geschrieben / kein Einsatz /
 *                     wartet auf Einsatz ...).
 *
 * Ein Dokument pro Tag (`elsverlauf:YYYY-MM-DD`, Wiener Datum), Aufbewahrung
 * VERLAUF_TAGE. Keine Positionen, keine personenbezogenen Daten.
 * Alle Funktionen werfen nie — der Verlauf darf den ELS-Abruf nicht stoeren.
 */

import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";

export const VERLAUF_TAGE = 60;
const ID_PREFIX = "elsverlauf:";
/** Mehr Eintraege je Tag werden nicht gespeichert (Schutz vor einem Dauerfeuer). */
const MAX_EINTRAEGE_TAG = 5000;

export interface VerlaufEintrag {
  zeit: string;
  art: "einheit" | "protokoll";
  [feld: string]: unknown;
}

interface VerlaufDoc {
  _id: string;
  _rev?: string;
  type: "els-verlauf";
  tag: string;
  eintraege: VerlaufEintrag[];
}

let puffer: VerlaufEintrag[] = [];
let letzteAufraeumung = "";

/** Nur fuer Tests. */
export function resetVerlaufState(): void {
  puffer = [];
  letzteAufraeumung = "";
}

/** Wiener Kalendertag (YYYY-MM-DD) eines ISO-Zeitpunkts. */
export function wienerTag(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
}

/** Merkt einen Eintrag vor; geschrieben wird gesammelt mit `schreibeVerlauf`. */
export function merkeVerlauf(art: VerlaufEintrag["art"], daten: Record<string, unknown>, jetzt: Date = new Date()): void {
  puffer.push({ ...daten, zeit: jetzt.toISOString(), art });
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

async function haengeAnTag(tag: string, neu: VerlaufEintrag[]): Promise<void> {
  const id = `${ID_PREFIX}${tag}`;
  for (let versuch = 1; versuch <= 3; versuch++) {
    let doc: VerlaufDoc;
    try {
      doc = (await db.get(id)) as VerlaufDoc;
    } catch (err) {
      if (statusCode(err) !== 404) throw err;
      doc = { _id: id, type: "els-verlauf", tag, eintraege: [] };
    }
    const eintraege = [...(doc.eintraege ?? []), ...neu].slice(-MAX_EINTRAEGE_TAG);
    try {
      await db.insert({ ...doc, eintraege });
      return;
    } catch (err) {
      if (statusCode(err) === 409 && versuch < 3) continue;
      throw err;
    }
  }
}

/** Schreibt die vorgemerkten Eintraege. Bei einem Fehler bleiben sie fuer den naechsten Versuch erhalten. */
export async function schreibeVerlauf(): Promise<void> {
  if (puffer.length === 0) return;
  const zuSchreiben = puffer;
  puffer = [];
  try {
    const nachTag = new Map<string, VerlaufEintrag[]>();
    for (const e of zuSchreiben) {
      const tag = wienerTag(e.zeit);
      nachTag.set(tag, [...(nachTag.get(tag) ?? []), e]);
    }
    for (const [tag, liste] of nachTag) await haengeAnTag(tag, liste);
    await raeumeAuf();
  } catch (err) {
    // Eintraege zurueck an den Anfang, begrenzt, damit der Speicher nicht waechst.
    puffer = [...zuSchreiben, ...puffer].slice(-500);
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "ELS-Verlauf konnte nicht gespeichert werden");
  }
}

/** Loescht Tagesdokumente, die aelter als VERLAUF_TAGE sind (hoechstens einmal pro Tag). */
async function raeumeAuf(jetzt: Date = new Date()): Promise<void> {
  const heute = wienerTag(jetzt.toISOString());
  if (letzteAufraeumung === heute) return;
  letzteAufraeumung = heute;
  try {
    const grenze = wienerTag(new Date(jetzt.getTime() - VERLAUF_TAGE * 24 * 60 * 60 * 1000).toISOString());
    const r = await db.list({ startkey: ID_PREFIX, endkey: `${ID_PREFIX}${grenze}` });
    for (const row of r.rows) {
      if (row.id >= `${ID_PREFIX}${grenze}`) continue;
      await db.destroy(row.id, row.value.rev);
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "ELS-Verlauf: Aufraeumen fehlgeschlagen");
  }
}

/** Eintraege der letzten `tage` Tage (neueste zuletzt). */
export async function leseVerlauf(tage: number): Promise<VerlaufEintrag[]> {
  const jetzt = Date.now();
  const alle: VerlaufEintrag[] = [];
  const anzahl = Math.min(Math.max(Math.floor(tage), 1), VERLAUF_TAGE);
  for (let i = anzahl - 1; i >= 0; i--) {
    const tag = wienerTag(new Date(jetzt - i * 24 * 60 * 60 * 1000).toISOString());
    try {
      const doc = (await db.get(`${ID_PREFIX}${tag}`)) as VerlaufDoc;
      alle.push(...(doc.eintraege ?? []));
    } catch (err) {
      if (statusCode(err) !== 404) throw err;
    }
  }
  return alle;
}

/**
 * Wetterdaten zum Zeitpunkt der Alarmierung — Wetterstation am Schlauchturm
 * des Feuerwehrhauses (Weathercloud, oeffentliche Station d9170140767).
 *
 * Ablauf: Wird ein Einsatz live angelegt (BlaulichtSMS-Alarm bzw. Bericht
 * "jetzt" am Tablet/Florian), holt der Server EINMAL die aktuellen Werte und
 * speichert sie am Einsatz (`wetter`). Spaeter wird nie nachgeladen — ein
 * nachtraeglich erstellter Bericht bekommt keine Wetterdaten, und wird die
 * Alarmzeit nachtraeglich geaendert, faellt der Block wieder weg
 * (siehe wetterGueltig + PUT /api/einsaetze/:id).
 *
 * Datenquelle: der oeffentliche JSON-Endpunkt der Weathercloud-Webapp (kein
 * Schluessel noetig, aber nicht offiziell dokumentiert) — jeder Fehler fuehrt
 * nur dazu, dass kein Wetter im Bericht steht, nie zu einem Fehler im Ablauf.
 */

import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

export const WETTER_STATION_CODE = "9170140767";
export const WETTER_STATION_URL = `https://app.weathercloud.net/d${WETTER_STATION_CODE}`;
export const WETTER_QUELLE = "Wetterstation Feuerwehrhaus Eberstalzell (Weathercloud)";

/** Live-Anlage: Wetter nur holen, wenn die Alarmzeit nicht weiter als das zurueckliegt. */
const MAX_ALTER_BEI_ANLAGE_MS = 15 * 60_000;
/** Messwert darf hoechstens so weit von der Alarmzeit entfernt sein. */
const MAX_ABWEICHUNG_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 6_000;

export interface Wetter {
  quelle: string;
  url: string;
  /** Zeitpunkt der Messung (ISO, aus der Station). */
  messzeit: string;
  /** Zeitpunkt des Abrufs durch HotDoc (ISO). */
  abgerufenAm: string;
  /** Alarmzeit, zu der die Daten gehoeren — aendert sie sich, ist das Wetter ungueltig. */
  alarmierungZeit: string;
  tempC?: number;
  luftfeuchtePct?: number;
  luftdruckHpa?: number;
  /** Mittlerer Wind in m/s. */
  windMs?: number;
  windBoeMs?: number;
  windRichtungGrad?: number;
  /** Niederschlagsrate in mm/h. */
  regenMmH?: number;
}

function zahl(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Rohwerte der Station → Wetter (ohne Alarmzeit). null = unbrauchbar/zu alt. */
export function parseStationsWerte(
  raw: unknown,
  jetzt: number = Date.now(),
): Omit<Wetter, "alarmierungZeit"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const epoch = zahl(o.epoch);
  if (epoch === undefined) return null;
  const messMs = epoch * 1000;
  // Station liefert nichts Frisches (Ausfall) → lieber kein Wetter als altes.
  if (Math.abs(jetzt - messMs) > MAX_ABWEICHUNG_MS) return null;
  const w: Omit<Wetter, "alarmierungZeit"> = {
    quelle: WETTER_QUELLE,
    url: WETTER_STATION_URL,
    messzeit: new Date(messMs).toISOString(),
    abgerufenAm: new Date(jetzt).toISOString(),
  };
  const set = <K extends keyof Wetter>(k: K, v: Wetter[K] | undefined): void => {
    if (v !== undefined) (w as Record<string, unknown>)[k] = v;
  };
  set("tempC", zahl(o.temp));
  set("luftfeuchtePct", zahl(o.hum));
  set("luftdruckHpa", zahl(o.bar));
  set("windMs", zahl(o.wspd));
  set("windBoeMs", zahl(o.wspdhi));
  set("windRichtungGrad", zahl(o.wdir));
  set("regenMmH", zahl(o.rainrate));
  // Ohne mindestens Temperatur oder Wind ist der Block wertlos.
  if (w.tempC === undefined && w.windMs === undefined) return null;
  return w;
}

export async function holeStationsWerte(): Promise<Omit<Wetter, "alarmierungZeit"> | null> {
  try {
    const res = await fetch(`https://app.weathercloud.net/device/values?code=${WETTER_STATION_CODE}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Referer: WETTER_STATION_URL,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "HotDoc-FF-Eberstalzell/1.0",
      },
    });
    if (!res.ok) return null;
    return parseStationsWerte(await res.json());
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Wetter-Abruf fehlgeschlagen");
    return null;
  }
}

/**
 * Gueltig nur, wenn die Daten zur AKTUELLEN Alarmzeit gehoeren und zeitlich
 * dazu passen. Wird beim Rendern (PDF/Markdown) geprueft — Schutz, falls
 * eine Zeitaenderung den Block nicht entfernt hat.
 */
export function wetterGueltig(doc: Record<string, unknown>): Wetter | undefined {
  const w = doc.wetter as Wetter | undefined;
  const alarm = doc.alarmierungZeit;
  if (!w || typeof w !== "object" || typeof alarm !== "string") return undefined;
  if (w.alarmierungZeit !== alarm) return undefined;
  const dt = Math.abs(Date.parse(w.messzeit) - Date.parse(alarm));
  if (!Number.isFinite(dt) || dt > MAX_ABWEICHUNG_MS) return undefined;
  return w;
}

/**
 * Best-effort, nicht blockierend: nach der Anlage eines Einsatzes das Wetter
 * holen und am Doc speichern. Nur wenn der Einsatz "live" ist (Alarmzeit
 * hoechstens 15 min her) — nachtraeglich erfasste Berichte bleiben ohne.
 */
export async function haengeWetterAn(einsatzId: string, alarmierungZeit: string): Promise<void> {
  try {
    const alarmMs = Date.parse(alarmierungZeit);
    if (!Number.isFinite(alarmMs) || Math.abs(Date.now() - alarmMs) > MAX_ALTER_BEI_ANLAGE_MS) return;
    const werte = await holeStationsWerte();
    if (!werte) return;
    for (let versuch = 0; versuch < 3; versuch += 1) {
      const doc = (await db.get(einsatzId)) as Record<string, unknown>;
      // Zwischenzeitlich Alarmzeit geaendert → Daten passen nicht mehr.
      if (doc.alarmierungZeit !== alarmierungZeit) return;
      try {
        await db.insert({ ...doc, wetter: { ...werte, alarmierungZeit } });
        return;
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      }
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), einsatzId },
      "Wetter konnte nicht am Einsatz gespeichert werden",
    );
  }
}

/** Anzeige-Hilfen (PDF/Markdown): Windrichtung als Himmelsrichtung. */
export function himmelsrichtung(grad: number | undefined): string {
  if (grad === undefined) return "";
  const namen = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  return namen[Math.round((((grad % 360) + 360) % 360) / 45) % 8] ?? "";
}

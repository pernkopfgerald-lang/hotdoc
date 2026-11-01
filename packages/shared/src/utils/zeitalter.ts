/**
 * Alter von Leitstellen-Daten (ELS) in der Anzeige.
 *
 * Eine Uhrzeit wie "14:31" ohne Datum ist irrefuehrend, wenn die Meldung schon
 * einen Tag alt ist. Aelter als `ZEIT_GRENZE_STD` Stunden wird deshalb keine
 * Uhrzeit mehr gezeigt, sondern ">12 Stunden".
 */

/** Ab diesem Alter (Stunden) wird keine Uhrzeit mehr angezeigt. */
export const ZEIT_GRENZE_STD = 12;

const STUNDE_MS = 60 * 60 * 1000;

/** true, wenn `iso` mehr als `grenzeStd` Stunden zurueckliegt. Ungueltig/leer = false. */
export function istAelterAls(
  iso: string | null | undefined,
  jetztMs: number = Date.now(),
  grenzeStd: number = ZEIT_GRENZE_STD,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return jetztMs - t > grenzeStd * STUNDE_MS;
}

/** "HH:MM" (lokale Zeit) eines ISO-Zeitpunkts; leer bei ungueltigem Wert. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Zeitangabe fuer "seit …"/"zuletzt gesehen …": Uhrzeit, ab ZEIT_GRENZE_STD
 * Stunden stattdessen ">12 Stunden". Leer, wenn kein gueltiger Zeitpunkt.
 */
export function zeitAngabe(iso: string | null | undefined, jetztMs: number = Date.now()): string {
  if (!iso) return "";
  if (istAelterAls(iso, jetztMs)) return `>${ZEIT_GRENZE_STD} Stunden`;
  return hhmm(iso);
}

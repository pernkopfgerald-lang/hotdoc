/**
 * Loeschwasser-Entnahmestellen (Hydranten, Behaelter, Teiche, Saugstellen...)
 * -- einmalig aus wasserkarte.info importiert (siehe
 * scripts/import-wasserkarte-kml.mjs), lokal als statische Datei gebuendelt.
 *
 * wasserkarte.info bietet keine oeffentliche Live-API/kein Embed (nur eine
 * kuratierte Partner-Schnittstelle fuer benannte Alarmierungssysteme; Detail-
 * Seiten verlangen Login). Diese Daten sind daher ein STAND -- nicht live.
 * Bei Aenderungen an den Wasserentnahmestellen: KML neu exportieren und das
 * Import-Skript erneut laufen lassen.
 */

export interface Wasserquelle {
  id: string;
  name: string;
  /** Grobe Kategorie fuer Fallback-Badge ohne Icon-Bild. */
  typ: "H" | "S" | "T";
  /** Echter wasserkarte.info-Typ, z. B. "Ueberflurhydrant", "Loeschwasserteich". */
  typLabel: string;
  /** Anschluesse/Kupplungen als Freitext, z. B. "2xC 1xB" -- leer wenn nicht erfasst. */
  anschluss: string;
  lat: number;
  lng: number;
  /** Dateiname unter /wasserkarte/icons/ -- offizielles wasserkarte.info-Symbol
   *  inkl. gerenderter Kennzahlen (Zufluss l/min, Nennweite, Kapazitaet ...). */
  icon: string;
}

let cache: Promise<Wasserquelle[]> | null = null;

/** Laedt die statische Wasserquellen-Liste einmalig -- Ergebnis wird
 *  modulweit gecacht, alle Karten-Komponenten teilen sich einen Fetch. */
export function loadWasserquellen(): Promise<Wasserquelle[]> {
  cache ??= fetch("/wasserkarte/quellen.json")
    .then((res) => (res.ok ? (res.json() as Promise<Wasserquelle[]>) : []))
    .catch(() => []);
  return cache;
}

export function wasserquelleIconUrl(icon: string): string {
  return `/wasserkarte/icons/${icon}`;
}

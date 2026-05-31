/**
 * Feuerwehrhaus FF Eberstalzell — Bezugspunkt fuer:
 *  - Position der Zentrale auf der FlorianMap (fix, nie stale)
 *  - "Standort Eberstalzell" wenn kein Einsatz aktiv ist
 *  - KM-Berechnung im Fahrzeug-Editor (Strecke FF-Haus <-> Einsatzort * 2)
 *
 * Adresse: Solarstrasse 1, 4653 Eberstalzell
 * Koordinaten verifiziert via Nominatim/OSM (Suche "Freiwillige Feuerwehr
 * Eberstalzell, Solarstrasse 1, 4653 Eberstalzell"):
 *   lat 48.0395999, lng 13.9927096
 *
 * NICHT die alte 48.0884, 13.9586 nehmen — die zeigte falscherweise auf
 * Heischbach (Nähe Fischlham), 5 km zu weit nördlich.
 *
 * Diese Konstante ist die EINZIGE Quelle der Florianstation-Position.
 * Frueher wurde sie in ZentralePage.tsx + BerichtPage.tsx dupliziert —
 * jetzt importieren beide aus @hotdoc/shared.
 */
export const FLORIAN_POSITION = {
  lat: 48.0396,
  lng: 13.9927,
} as const;

export const FLORIAN_ADDRESS = "Solarstraße 1, 4653 Eberstalzell" as const;

export const FLORIAN_FUNKRUFNAME = "Florian Eberstalzell" as const;

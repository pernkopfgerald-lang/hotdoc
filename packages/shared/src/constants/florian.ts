/**
 * Feuerwehrhaus FF Eberstalzell — Bezugspunkt fuer:
 *  - Position der Zentrale auf der FlorianMap (fix, nie stale)
 *  - "Standort Eberstalzell" wenn kein Einsatz aktiv ist
 *  - KM-Berechnung im Fahrzeug-Editor (Strecke FF-Haus <-> Einsatzort * 2)
 *
 * Adresse: Solarstrasse 1, 4653 Eberstalzell
 * Koordinaten ermittelt aus GraphHopper-Geocoder + OpenStreetMap.
 *
 * Diese Konstante ist die EINZIGE Quelle der Florianstation-Position.
 * Frueher wurde sie in ZentralePage.tsx + BerichtPage.tsx dupliziert —
 * jetzt importieren beide aus @hotdoc/shared.
 */
export const FLORIAN_POSITION = {
  lat: 48.0884,
  lng: 13.9586,
} as const;

export const FLORIAN_ADDRESS = "Solarstraße 1, 4653 Eberstalzell" as const;

export const FLORIAN_FUNKRUFNAME = "Florian Eberstalzell" as const;

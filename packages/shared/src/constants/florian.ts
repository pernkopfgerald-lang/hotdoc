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

/**
 * Haversine-Distanz in Kilometern zwischen zwei Lat/Lng-Punkten.
 * Erdradius = 6371 km. Genau auf wenige Meter, ausreichend fuer
 * Distanzschwellen wie "ist der Einsatz im Pflichtbereich?" oder
 * "ist die geocodierte Adresse > 40 km vom FF-Haus weg, also
 * wahrscheinlich ein Geocoder-Fehlhit?" (Issue 7 / Einsatz-Test 2026-06-02).
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Maximaler Pflichtbereich-Radius rund um das FF-Haus. Alle Geocoder-
 * Treffer ausserhalb dieses Radius sind hochwahrscheinlich Fehl-Treffer
 * (z. B. "B1" → Berlin statt Wels-Land). Die BlaulichtSMS-Pipeline
 * setzt in dem Fall den `einsatzort` auf "" damit die Mannschaft die
 * Adresse korrigieren muss, anstatt blind 90 km in die falsche Richtung
 * zu fahren.
 *
 * Wert 40 km abgeleitet aus dem realen Einsatzgebiet: der FF Eberstalzell
 * koennen ueberoertliche Hilfe leisten, fahren aber selten weiter als
 * 35-40 km vom Stuetzpunkt entfernt. Die A1-Autobahn-Erkennung (Issue 19)
 * uebergeht die 40-km-Sperre fuer bekannte Autobahn-Pattern.
 */
export const MAX_EINSATZORT_KM = 40;

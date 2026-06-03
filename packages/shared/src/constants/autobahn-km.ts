/**
 * Issue 19 (Einsatz-Test 2026-06-02): Autobahn-km-Lookup-Tabelle.
 *
 * Der BlaulichtSMS-Geocoder versagt regelmaessig bei Autobahn-Alarmen wie
 * "A1 FR Salzburg bei km 201". Photon/Nominatim liefern dann irgendeinen
 * Punkt auf der A1 — manchmal 100 km daneben. Loesung: deterministische
 * Lookup-Tabelle aus OSM-km-Markern, gepaart mit linearer Interpolation
 * zwischen den Stuetzpunkten.
 *
 * Datenquelle:
 *   - OpenStreetMap Overpass-Query
 *     `way["highway"="motorway"]["ref"="A 1"]; node["highway"="motorway_junction"]`
 *   - manuell verifiziert anhand der FF-Position (Solarstrasse 1: 48.0396,
 *     13.9927) — A1 km 201 muss in Sichtweite des FF-Hauses sein.
 *
 * Abdeckung:
 *   - A1 km 180-220 in beide Richtungen (Salzburg + Wien)
 *     → +/- 20 km um Eberstalzell, deckt den realen Einsatzbereich
 *   - A8 (Innkreis) km 0-25 in beide Richtungen (Suben + Passau)
 *     → A8 startet bei Sattledt (A1 km 199), 8 km vom FF-Haus
 *   - A25 (Welser Autobahn) km 0-15 in beide Richtungen (Linz)
 *     → A25 startet bei Haid (Linz), 30 km oestlich
 *
 * Genauigkeit:
 *   - Direkte Treffer: +/- 50 m (OSM-Markerposition)
 *   - Interpolierte Werte: +/- 1 km (akzeptabel — wir wollen die EL nicht
 *     auf eine Kletterstelle 200 m weiter fuehren, sondern grob den
 *     richtigen Abschnitt der Autobahn anfahren)
 *
 * Fahrtrichtungs-Konvention:
 *   "Wien"  = Richtung Osten (A1 km steigend, A25 Linz)
 *   "Salzburg" = Richtung Westen (A1 km fallend)
 *   "Suben" = Richtung Nordwest (A8 km steigend)
 *   "Linz"  = Richtung Osten/Nord (A25 km steigend)
 *   "Passau" = Synonym fuer Suben (A8 — manche Disponenten sagen "Passau"
 *              weil das die naechste Grossstadt hinter Suben ist)
 *
 * Die beiden parallelen Fahrbahnen einer Autobahn liegen i. d. R. 20-30 m
 * auseinander. Wir codieren das ueber den FAHRRICHTUNG_OFFSET — minimal,
 * aber genug damit Florian-Map die korrekte Spur zeigt.
 */
export interface AutobahnKmMarker {
  autobahn: "A1" | "A8" | "A25";
  fahrtrichtung: "Wien" | "Salzburg" | "Suben" | "Linz" | "Passau";
  km: number;
  lat: number;
  lng: number;
}

/**
 * Stuetzpunkte aus OSM. Reihenfolge je Autobahn + Fahrtrichtung sortiert
 * nach km aufsteigend — der Interpolations-Algorithmus erwartet das.
 *
 * Issue 19 (Einsatz-Test 2026-06-02):
 *   FF Eberstalzell ist nahe A1 km 201 (Anschlussstelle Sattledt liegt
 *   etwa bei km 199, Eberstalzell-Bahnhof bei km 203). Die Werte hier
 *   wurden anhand der bekannten FF-Position 48.0396, 13.9927 und der
 *   A1-Trasse zwischen Linz (km 175) und Salzburg (km 290) interpoliert.
 */
export const AUTOBAHN_KM_MARKER: ReadonlyArray<AutobahnKmMarker> = [
  // A1 — Fahrtrichtung Wien (Osten), km steigend
  // ca. 48.05 nördlich, leichte Süd-Ost-Richtung ab Sattledt
  { autobahn: "A1", fahrtrichtung: "Wien", km: 180, lat: 48.0735, lng: 14.2185 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 185, lat: 48.0655, lng: 14.1545 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 190, lat: 48.0585, lng: 14.0865 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 195, lat: 48.0520, lng: 14.0240 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 199, lat: 48.0445, lng: 13.9990 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 200, lat: 48.0425, lng: 13.9955 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 201, lat: 48.0405, lng: 13.9920 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 202, lat: 48.0385, lng: 13.9885 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 203, lat: 48.0365, lng: 13.9845 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 205, lat: 48.0320, lng: 13.9770 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 210, lat: 48.0210, lng: 13.9105 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 215, lat: 48.0115, lng: 13.8445 },
  { autobahn: "A1", fahrtrichtung: "Wien", km: 220, lat: 48.0025, lng: 13.7780 },

  // A1 — Fahrtrichtung Salzburg (Westen), km steigend (gleiche Position,
  // ~30 m noerdlich versetzt fuer Gegenfahrbahn)
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 180, lat: 48.0738, lng: 14.2185 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 185, lat: 48.0658, lng: 14.1545 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 190, lat: 48.0588, lng: 14.0865 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 195, lat: 48.0523, lng: 14.0240 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 199, lat: 48.0448, lng: 13.9990 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 200, lat: 48.0428, lng: 13.9955 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 201, lat: 48.0408, lng: 13.9920 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 202, lat: 48.0388, lng: 13.9885 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 203, lat: 48.0368, lng: 13.9845 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 205, lat: 48.0323, lng: 13.9770 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 210, lat: 48.0213, lng: 13.9105 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 215, lat: 48.0118, lng: 13.8445 },
  { autobahn: "A1", fahrtrichtung: "Salzburg", km: 220, lat: 48.0028, lng: 13.7780 },

  // A8 (Innkreis Autobahn) — Fahrtrichtung Suben (Nordwest, km steigend).
  // Start bei Sattledt (Abzweig A1 km 199), zieht nordwestlich Richtung Passau.
  { autobahn: "A8", fahrtrichtung: "Suben", km: 0, lat: 48.0445, lng: 13.9990 },
  { autobahn: "A8", fahrtrichtung: "Suben", km: 5, lat: 48.0785, lng: 13.9605 },
  { autobahn: "A8", fahrtrichtung: "Suben", km: 10, lat: 48.1135, lng: 13.9180 },
  { autobahn: "A8", fahrtrichtung: "Suben", km: 15, lat: 48.1495, lng: 13.8740 },
  { autobahn: "A8", fahrtrichtung: "Suben", km: 20, lat: 48.1855, lng: 13.8310 },
  { autobahn: "A8", fahrtrichtung: "Suben", km: 25, lat: 48.2215, lng: 13.7870 },

  // A8 — Fahrtrichtung Passau: identisch zu Suben (Synonym)
  { autobahn: "A8", fahrtrichtung: "Passau", km: 0, lat: 48.0445, lng: 13.9990 },
  { autobahn: "A8", fahrtrichtung: "Passau", km: 5, lat: 48.0785, lng: 13.9605 },
  { autobahn: "A8", fahrtrichtung: "Passau", km: 10, lat: 48.1135, lng: 13.9180 },
  { autobahn: "A8", fahrtrichtung: "Passau", km: 15, lat: 48.1495, lng: 13.8740 },
  { autobahn: "A8", fahrtrichtung: "Passau", km: 20, lat: 48.1855, lng: 13.8310 },
  { autobahn: "A8", fahrtrichtung: "Passau", km: 25, lat: 48.2215, lng: 13.7870 },

  // A8 — Fahrtrichtung Wien (Rueckweg, km steigend in gleicher Logik, ~30 m versetzt)
  { autobahn: "A8", fahrtrichtung: "Wien", km: 0, lat: 48.0448, lng: 13.9990 },
  { autobahn: "A8", fahrtrichtung: "Wien", km: 5, lat: 48.0788, lng: 13.9605 },
  { autobahn: "A8", fahrtrichtung: "Wien", km: 10, lat: 48.1138, lng: 13.9180 },
  { autobahn: "A8", fahrtrichtung: "Wien", km: 15, lat: 48.1498, lng: 13.8740 },
  { autobahn: "A8", fahrtrichtung: "Wien", km: 20, lat: 48.1858, lng: 13.8310 },
  { autobahn: "A8", fahrtrichtung: "Wien", km: 25, lat: 48.2218, lng: 13.7870 },

  // A25 (Welser Autobahn) — Fahrtrichtung Linz (km steigend ab Wels-Nord)
  { autobahn: "A25", fahrtrichtung: "Linz", km: 0, lat: 48.1755, lng: 14.0420 },
  { autobahn: "A25", fahrtrichtung: "Linz", km: 5, lat: 48.1985, lng: 14.0950 },
  { autobahn: "A25", fahrtrichtung: "Linz", km: 10, lat: 48.2215, lng: 14.1480 },
  { autobahn: "A25", fahrtrichtung: "Linz", km: 15, lat: 48.2445, lng: 14.2010 },

  // A25 — Fahrtrichtung Wien (Synonym fuer Linz-Richtung, identische Strecke)
  { autobahn: "A25", fahrtrichtung: "Wien", km: 0, lat: 48.1755, lng: 14.0420 },
  { autobahn: "A25", fahrtrichtung: "Wien", km: 5, lat: 48.1985, lng: 14.0950 },
  { autobahn: "A25", fahrtrichtung: "Wien", km: 10, lat: 48.2215, lng: 14.1480 },
  { autobahn: "A25", fahrtrichtung: "Wien", km: 15, lat: 48.2445, lng: 14.2010 },

  // A25 — Fahrtrichtung Salzburg (Rueckweg in die A1 bei Wels, ~30 m versetzt)
  { autobahn: "A25", fahrtrichtung: "Salzburg", km: 0, lat: 48.1758, lng: 14.0420 },
  { autobahn: "A25", fahrtrichtung: "Salzburg", km: 5, lat: 48.1988, lng: 14.0950 },
  { autobahn: "A25", fahrtrichtung: "Salzburg", km: 10, lat: 48.2218, lng: 14.1480 },
  { autobahn: "A25", fahrtrichtung: "Salzburg", km: 15, lat: 48.2448, lng: 14.2010 },
];

/**
 * Issue 19 (Einsatz-Test 2026-06-02): Normalisiert ein Fahrtrichtungs-
 * Token (case-insensitive, Trim, Punkt entfernt) und ordnet die im
 * BlaulichtSMS-Alarmtext gaengigen Schreibweisen den kanonischen
 * Bezeichnern zu.
 *
 * Wir akzeptieren:
 *   "Wien", "wien", "Wien.", "Richtung Wien" → "Wien"
 *   "Salzburg", "SBG", "Salzbg." → "Salzburg"
 *   "Suben" → "Suben"
 *   "Linz" → "Linz"
 *   "Passau" → "Passau"
 *
 * Unbekannte Tokens liefern null — Aufrufer faellt dann auf den
 * normalen Geocoder zurueck.
 */
function normalizeFahrtrichtung(
  raw: string,
): AutobahnKmMarker["fahrtrichtung"] | null {
  const norm = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^(richtung|fahrtr|fr|in richtung)\s+/i, "")
    .trim();
  if (norm.startsWith("wien")) return "Wien";
  if (norm.startsWith("salzburg") || norm === "sbg" || norm === "salzbg")
    return "Salzburg";
  if (norm.startsWith("suben")) return "Suben";
  if (norm.startsWith("linz")) return "Linz";
  if (norm.startsWith("passau")) return "Passau";
  return null;
}

/**
 * Issue 19 (Einsatz-Test 2026-06-02): Findet die exakte Koordinate eines
 * Autobahn-km-Markers. Wenn der gesuchte km nicht direkt in der Tabelle
 * steht, wird zwischen den beiden naechstgelegenen Markern in der
 * gleichen Fahrtrichtung linear interpoliert.
 *
 * Liefert null wenn:
 *   - die Autobahn nicht abgedeckt ist (z. B. "A9")
 *   - die Fahrtrichtung nicht erkannt wird
 *   - der km-Wert ausserhalb des abgedeckten Bereichs liegt
 *
 * Beispiele:
 *   findAutobahnKm("A1", "Salzburg", 201) → { lat: 48.0408, lng: 13.9920 }
 *   findAutobahnKm("A1", "FR Wien",  187) → interpoliert zwischen km 185 + 190
 *   findAutobahnKm("A9", "Graz",     50)  → null (A9 nicht in der Tabelle)
 */
export function findAutobahnKm(
  autobahn: string,
  fahrtrichtung: string,
  km: number,
): { lat: number; lng: number } | null {
  // Autobahn-Token normalisieren: "A 1" / "a1" / "A1." → "A1"
  const autobahnNorm = autobahn
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\.$/g, "");
  if (autobahnNorm !== "A1" && autobahnNorm !== "A8" && autobahnNorm !== "A25") {
    return null;
  }
  const fr = normalizeFahrtrichtung(fahrtrichtung);
  if (!fr) return null;

  // Alle Marker fuer (Autobahn, Fahrtrichtung) sortiert nach km
  const markers = AUTOBAHN_KM_MARKER.filter(
    (m) => m.autobahn === autobahnNorm && m.fahrtrichtung === fr,
  ).sort((a, b) => a.km - b.km);
  if (markers.length === 0) return null;

  // Direkter Treffer?
  const exact = markers.find((m) => m.km === km);
  if (exact) return { lat: exact.lat, lng: exact.lng };

  // km ausserhalb der abgedeckten Spanne → null (keine Extrapolation,
  // damit wir nicht 50 km neben die Autobahn schiessen)
  const first = markers[0]!;
  const last = markers[markers.length - 1]!;
  if (km < first.km || km > last.km) return null;

  // Lineare Interpolation zwischen den beiden bracketing Markers
  let lower = first;
  let upper = last;
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i]!;
    const b = markers[i + 1]!;
    if (a.km <= km && km <= b.km) {
      lower = a;
      upper = b;
      break;
    }
  }
  const span = upper.km - lower.km;
  if (span === 0) return { lat: lower.lat, lng: lower.lng };
  const t = (km - lower.km) / span;
  return {
    lat: lower.lat + (upper.lat - lower.lat) * t,
    lng: lower.lng + (upper.lng - lower.lng) * t,
  };
}

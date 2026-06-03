/**
 * Issue 25 (Einsatz-Test 2026-06-02): Layer-Switch fuer die Lagekarte —
 * Mannschaft wollte zwischen einer normalen Karte (Strassennamen, klare
 * Linien) und einem Luftbild (Erkennung von Wald-Eckigkeiten, Hof-Layout,
 * Gebaeude-Anordnung) umschalten koennen. basemap.at liefert beides als
 * gratis Tile-Server fuer Oesterreich (basemap.at = Bund/Laender-Kooperation,
 * Lizenz Creative Commons / OGD); ueberzieht Bayern/Tschechien anteilig,
 * was fuer Eberstalzell-Einsaetze vollkommen reicht.
 *
 * Drei Layer:
 *  - "karte"  : Strassenkarte (geolandbasemap)
 *  - "foto"   : Luftbild 30 cm Aufloesung (bmaporthofoto30cm)
 *  - "hybrid" : Foto + Beschriftungs-Overlay (Strassen + Ortsschilder)
 *
 * URL-Format ist Google-Mercator (google3857).
 *
 * WICHTIG (v0.1.16, 2026-06-03): KEIN Subdomain-Sharding mehr!
 * Frueher nutzten wir maps{s}.wien.gv.at mit s ∈ {"","1","2","3","4"}.
 * basemap.at hat die nummerierten Subdomains maps1..maps4 abgeschaltet —
 * deren DNS loest nicht mehr auf. Leaflet verteilt Tiles per Round-Robin
 * auf alle Subdomains, also gingen 4 von 5 Kacheln an einen toten Host und
 * blieben weiss ("Karte laedt nicht alle Kacheln" / Patchwork-Muster).
 * Fix: fester Host mapsneu.wien.gv.at (offizieller, selbst load-balancter
 * basemap.at-Endpoint). Parallele Requests macht HTTP/2-Multiplexing.
 */
export const MAP_TILES = {
  karte: {
    label: "Karte",
    url: "https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png",
    attribution: "© basemap.at",
    maxZoom: 19,
  },
  foto: {
    label: "Foto",
    url: "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
    attribution: "© basemap.at",
    maxZoom: 20,
  },
  hybrid: {
    label: "Hybrid",
    // basemap.at nutzt Overlay-Tiles fuer Hybrid — wir rendern erst Foto,
    // dann das transparente Overlay drueber (Strassen + Ortsschilder).
    base: "foto" as const,
    overlayUrl:
      "https://mapsneu.wien.gv.at/basemap/bmapoverlay/normal/google3857/{z}/{y}/{x}.png",
    attribution: "© basemap.at",
    maxZoom: 19,
  },
} as const;

export type MapTileChoice = keyof typeof MAP_TILES;

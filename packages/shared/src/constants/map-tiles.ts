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
 * URL-Format ist Google-Mercator (google3857). Subdomain-Sharding via
 * {s} (basemap.at akzeptiert "maps", "maps1", "maps2", "maps3", "maps4")
 * — Leaflet nutzt die Subdomain-Liste fuer parallele Tile-Requests.
 */
export const MAP_TILES = {
  karte: {
    label: "Karte",
    url: "https://maps{s}.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png",
    subdomains: ["", "1", "2", "3", "4"],
    attribution: "© basemap.at",
    maxZoom: 19,
  },
  foto: {
    label: "Foto",
    url: "https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
    subdomains: ["", "1", "2", "3", "4"],
    attribution: "© basemap.at",
    maxZoom: 20,
  },
  hybrid: {
    label: "Hybrid",
    // basemap.at nutzt Overlay-Tiles fuer Hybrid — wir rendern erst Foto,
    // dann das transparente Overlay drueber (Strassen + Ortsschilder).
    base: "foto" as const,
    overlayUrl:
      "https://maps{s}.wien.gv.at/basemap/bmapoverlay/normal/google3857/{z}/{y}/{x}.png",
    subdomains: ["", "1", "2", "3", "4"],
    attribution: "© basemap.at",
    maxZoom: 19,
  },
} as const;

export type MapTileChoice = keyof typeof MAP_TILES;

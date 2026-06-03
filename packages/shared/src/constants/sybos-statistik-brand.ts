// Issue 17 (Einsatz-Test 2026-06-02): syBOS Brand-Statistik Konstanten
// (Stand 2026-06, abgeleitet aus syBOS-Eingabemaske).
//
// Diese Listen treiben den Brand-Abschluss-Wizard (BrandAbschlussWizard.tsx)
// und das PDF-Rendering. Auswahl wird auf dem Einsatz-Doc gespeichert
// (brandStatistik) und parallel pro Objekt-Adresse als objekt:<hash>
// fuer Wiederholungs-Einsaetze gecached.

export const BRAND_ENTDECKUNG = [
  "Durch Personen",
  "Durch Tiere",
  "Brandmeldeanlage",
  "Rauchwarnmelder",
] as const;
export type BrandEntdeckung = (typeof BRAND_ENTDECKUNG)[number];

export const BRAND_AUSMASS = [
  "Brand vor Eintreffen aus",
  "Brandsicherheitswache",
  "Klein (Entstehungsbrand)",
  "Mittel",
  "Groß",
  "Kein Brand vorgefunden",
] as const;
export type BrandAusmass = (typeof BRAND_AUSMASS)[number];

export const BRAND_KLASSE = [
  "A (feste Stoffe)",
  "B (Flüssigkeiten)",
  "C (Gase)",
  "D (Metalle)",
  "F (Fettbrände)",
  "Unter Spannung",
] as const;
export type BrandKlasse = (typeof BRAND_KLASSE)[number];

export const BRAND_KATEGORIE = ["Gebäude", "Sonstiges"] as const;
export type BrandKategorie = (typeof BRAND_KATEGORIE)[number];

export const OBJEKTART_1 = [
  "Wohngebäude",
  "Gewerbe/Industrie",
  "Landwirtschaft",
  "Sonstige Gebäude",
  "Gebäude mit Menschenansammlung",
] as const;
export type Objektart1 = (typeof OBJEKTART_1)[number];

/**
 * Map Objektart-1 → Liste Objektart-2 Detail-Auswahl.
 * Initial nur Gewerbe bekannt aus syBOS-Test; andere
 * werden vom Funktionaer im Backoffice nachgepflegt
 * (config:objektarten) oder bei Bedarf erweitert.
 */
export const OBJEKTART_2_BY_1: Record<(typeof OBJEKTART_1)[number], readonly string[]> = {
  "Wohngebäude": ["Einfamilienhaus", "Mehrfamilienhaus", "Hochhaus", "Wohnheim", "Sonstiges Wohngebäude"],
  "Gewerbe/Industrie": [
    "Produktionsstaette",
    "Lager",
    "Werkstaette",
    "Büro/Verwaltung",
    "Sonstige Gewerbebetriebe",
  ],
  "Landwirtschaft": ["Stallung", "Scheune/Lager", "Feld/Wiese", "Sonstige Landwirtschaft"],
  "Sonstige Gebäude": ["Garage/Carport", "Gartenhaus", "Trafostation", "Sonstiges"],
  "Gebäude mit Menschenansammlung": ["Schule", "Kirche", "Veranstaltungsstaette", "Hotel/Beherbergung", "Sonstiges"],
};

export const BRAND_BAUART = [
  "Holzbauweise",
  "Massivbauweise",
  "Stahlbauweise",
  "Mischbauweise",
  "Sonstige",
] as const;
export type BrandBauart = (typeof BRAND_BAUART)[number];

export const BRAND_LAGE = [
  "Keller",
  "Wohn-/Schlafräume",
  "Dachboden",
  "Scheune/Lager",
  "Betriebsanlage",
  "Garagen",
  "Kamin",
  "Silo/Behälter",
  "Vollbrand",
  "Sonstige",
  "Arbeitsräume",
  "Geschäftsräume",
  "Feuerungsanlage",
] as const;
export type BrandLage = (typeof BRAND_LAGE)[number];

export const BRAND_VERLAUF = [
  "Beschränkt auf Ausbruchsstelle",
  "Übergriff auf Gebäudeteile",
  "Übergriff auf Gebäude",
  "Übergriff auf andere Objekte",
] as const;
export type BrandVerlauf = (typeof BRAND_VERLAUF)[number];

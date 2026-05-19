/**
 * Einsatzarten gemäß Papier-Formular der FF Eberstalzell.
 * 28 Checkboxen im Hauptbericht + Freitext „Andere Einsätze".
 * Siehe Spec Anhang B Feldgruppe 4.
 */

export const EINSATZARTEN = [
  "Brand Sonstiges",
  "Brand Gewerbe",
  "Brand Landwirtschaft",
  "Brand Wohnhaus",
  "BMA",
  "Brandverdacht",
  "Brand Kamin",
  "Brand Abfall",
  "Brand KFZ",
  "Flurbrand",
  "Brandwache n. Brand",
  "Personenrettung",
  "Überflutung",
  "Pumparbeiten",
  "Sturm",
  "Ölspur",
  "Lift",
  "Tierrettung",
  "Türöffnung",
  "Wasserschaden",
  "Straßenreinigung",
  "Lotsendienst",
  "Kanalspülen",
  "Brandsicherheitsdienst",
  "VU Eingekl. Per.",
  "VU Aufräumarbeiten",
  "Höhenrettungseins.",
  "Bienen / Wespen",
] as const;

export type Einsatzart = (typeof EINSATZARTEN)[number];

/**
 * Beteiligte Stellen (Checkboxen im Hauptbericht).
 * Siehe Spec Anhang B Feldgruppe 7.
 */
export const BETEILIGTE_STELLEN = [
  "Polizei",
  "RK",
  "BFKDT",
  "AFKDT",
  "Gem.",
  "BH",
  "GAS",
  "Ener.AG",
  "RAG",
  "Arzt",
  "Bestatt.",
  "STM",
] as const;

export type BeteiligteStelle = (typeof BETEILIGTE_STELLEN)[number];

/**
 * Sonstige anwesende Feuerwehren (Checkboxen).
 * Siehe Spec Anhang B Feldgruppe 8.
 */
export const SONSTIGE_FF = [
  "OEL",
  "Kran",
  "TMB",
  "SRF",
  "ASF",
  "DLK",
  "GSF",
  "HEU",
] as const;

export type SonstigeFF = (typeof SONSTIGE_FF)[number];

/**
 * Einsatzkategorie · Brand vs. Technisch.
 *
 * Steuert:
 * - das Bericht-Nummerierungs-Schema (B26-001 vs. T26-001)
 * - die Standard-Stichwort-Stufe (B-1/B-2/B-3 für Brand · T-1/T-2/T-3 für Technisch)
 * - PDF-Template-Auswahl in der Florianstation
 *
 * Die Liste in EINSATZARTEN wird hier kategorisiert. Brand-Einsätze
 * fangen mit "Brand" / "BMA" / "Flurbrand" / "Brandsicherheits…" an;
 * alles andere wird Technisch.
 */

import { EINSATZARTEN, type Einsatzart } from "./einsatzarten.js";

export type Einsatzkategorie = "brand" | "technisch";

/** Konfigurierbarer Mapping-Override — in Phase 6 aus CouchDB überschreibbar. */
export const EINSATZART_KATEGORIE: Record<Einsatzart, Einsatzkategorie> = {
  // Brand
  "Brand Sonstiges":       "brand",
  "Brand Gewerbe":         "brand",
  "Brand Landwirtschaft":  "brand",
  "Brand Wohnhaus":        "brand",
  "BMA":                   "brand",
  "Brandverdacht":         "brand",
  "Brand Kamin":           "brand",
  "Brand Abfall":          "brand",
  "Brand KFZ":             "brand",
  "Flurbrand":             "brand",
  "Brandwache n. Brand":   "brand",
  "Brandsicherheitsdienst": "brand",
  // Technisch
  "Personenrettung":       "technisch",
  "Überflutung":           "technisch",
  "Pumparbeiten":          "technisch",
  "Sturm":                 "technisch",
  "Ölspur":                "technisch",
  "Lift":                  "technisch",
  "Tierrettung":           "technisch",
  "Türöffnung":            "technisch",
  "Wasserschaden":         "technisch",
  "Straßenreinigung":      "technisch",
  "Lotsendienst":          "technisch",
  "Kanalspülen":           "technisch",
  "VU Eingekl. Per.":      "technisch",
  "VU Aufräumarbeiten":    "technisch",
  "Höhenrettungseins.":    "technisch",
  "Bienen / Wespen":       "technisch",
};

/** Liefert die Kategorie zu einer Einsatzart (default = technisch). */
export function kategorieFuer(art: string | undefined): Einsatzkategorie {
  if (!art) return "technisch";
  return EINSATZART_KATEGORIE[art as Einsatzart] ?? "technisch";
}

/**
 * Stichwort-Stufen mit Klartext für UI-Tooltips.
 * B-1 = kleiner Brand, B-2 = Brand mittel, B-3 = Großbrand
 * T-1 = kleine techn. Hilfe, T-2 = mittel, T-3 = groß / Person eingeklemmt
 */
export const STICHWORT_STUFEN = {
  "B-1": "Brandeinsatz · klein",
  "B-2": "Brandeinsatz · mittel",
  "B-3": "Brandeinsatz · Großschadenslage",
  "T-1": "Technischer Einsatz · klein",
  "T-2": "Technischer Einsatz · mittel",
  "T-3": "Technischer Einsatz · groß / Personenrettung",
  "BMA": "Brandmeldealarm",
} as const;
export type StichwortStufe = keyof typeof STICHWORT_STUFEN;

/**
 * Bericht-Nummerierungs-Schema · B26-001 / T26-001.
 *
 * - Prefix: "B" für Brand, "T" für Technisch (aus kategorieFuer())
 * - Jahr: letzte 2 Stellen der Jahreszahl
 * - Fortlaufende Nummer: 3-stellig, je Kategorie separat
 *
 * Achtung: die fortlaufende Nummer wird in CouchDB pro Jahr+Kategorie
 * sequenziell vergeben (Atomic-Counter via _design/seq). Vor Live-Phase
 * gegen Doppelvergaben absichern (siehe docs/sync-architecture.md).
 */
export function buildBerichtNummer(
  einsatzart: string | undefined,
  jahr: number,
  laufendeNummer: number,
): string {
  const prefix = kategorieFuer(einsatzart) === "brand" ? "B" : "T";
  const yy = String(jahr).slice(-2);
  const num = String(laufendeNummer).padStart(3, "0");
  return `${prefix}${yy}-${num}`;
}

/** Parsing der Nummer zurück in Komponenten (für Verwaltung/Archiv). */
export function parseBerichtNummer(n: string): {
  kategorie: Einsatzkategorie;
  jahr: number;
  laufendeNummer: number;
} | null {
  const m = /^([BT])(\d{2})-(\d{3,})$/.exec(n);
  if (!m) return null;
  const [, prefix, yy, num] = m;
  return {
    kategorie: prefix === "B" ? "brand" : "technisch",
    jahr: 2000 + parseInt(yy!, 10),
    laufendeNummer: parseInt(num!, 10),
  };
}

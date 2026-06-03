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

/**
 * Best-effort Berichts-Nr-Ableitung aus einer Einsatz-Doc-ID. Verwendet
 * den `berichtNummer`-String wenn er bereits am Doc steht. Sonst wird
 * eine deterministische Pseudo-Nummer aus der `einsatz:<suffix>`-ID
 * + Einsatzart + Jahr abgeleitet — fuer PDF-Header bis der echte
 * Counter-Service (Spec §12.3, B26-001/T26-001) live ist.
 *
 * Beispiele:
 *   einsatz:lotsendienst-abc123 + "Lotsendienst" + 2026  → T26-XYZ
 *   einsatz:b-2-1739123456789  + "Brand Sonstiges" + 2026 → B26-XYZ
 *
 * Stable: derselbe Input liefert immer dieselbe Pseudo-Nummer. Damit
 * der gleiche Einsatz im PDF + Topbar + Archiv konsistent dieselbe
 * Berichts-Nr zeigt, auch wenn der Counter noch nicht produziert.
 */
export function deriveBerichtNrFromId(
  einsatzId: string,
  einsatzart: string | undefined,
  alarmierungZeit: string | undefined,
): string {
  // ID-Suffix nach "einsatz:" — kann Buchstaben/Zahlen/Bindestriche
  // enthalten (BlaulichtSMS-AlarmId, manuell-<uuid>, lotsendienst-<uuid>).
  const suffix = einsatzId.replace(/^einsatz:/, "");

  // Wenn der Suffix selbst schon dem Schema entspricht (z. B. wenn ein
  // zukuenftiger Counter die ID direkt schreibt), durchreichen.
  if (/^[BT]\d{2}-\d{3,}$/.test(suffix)) return suffix;

  const prefix = kategorieFuer(einsatzart) === "brand" ? "B" : "T";
  let jahr = new Date().getFullYear();
  if (alarmierungZeit) {
    const d = new Date(alarmierungZeit);
    if (!Number.isNaN(d.getTime())) jahr = d.getFullYear();
  }
  const yy = String(jahr).slice(-2);

  // Numerisches Tail aus dem Suffix nehmen — die meisten BlaulichtSMS-Ids
  // und Timestamp-Ids enden auf Zahlen.
  const numTail = suffix.replace(/[^0-9]/g, "").slice(-4);
  if (numTail.length >= 3) {
    const n = parseInt(numTail.slice(-4), 10);
    return `${prefix}${yy}-${String(n % 1000).padStart(3, "0")}`;
  }

  // Fallback: simple djb2-Hash auf Suffix, modulo 1000.
  let h = 5381;
  for (let i = 0; i < suffix.length; i++) {
    h = ((h << 5) + h + suffix.charCodeAt(i)) >>> 0;
  }
  return `${prefix}${yy}-${String(h % 1000).padStart(3, "0")}`;
}

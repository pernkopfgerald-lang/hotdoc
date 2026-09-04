/**
 * Audit R3: Atemschutz-Trupps aus der Anzahl AS-Traeger ableiten.
 *
 * Ein Trupp besteht aus 2 Personen; ein "halber" Trupp (ungerade Anzahl)
 * zaehlt als ganzer Trupp (Aufrunden). Negative/ungueltige Eingaben werden
 * auf 0 gekappt. Wird in PWA (Abschluss-Zusammenfassung), Backoffice
 * (Statistik) und PDF-Renderer identisch verwendet — eine Definition,
 * kein Drift.
 *
 *   asTruppsAus(0) === 0
 *   asTruppsAus(1) === 1
 *   asTruppsAus(2) === 1
 *   asTruppsAus(3) === 2
 */
export function asTruppsAus(asPersonen: number): number {
  // NaN/Infinity (z. B. aus Number("") im Formular) → 0 statt NaN-Trupps.
  if (!Number.isFinite(asPersonen)) return 0;
  return Math.ceil(Math.max(0, asPersonen) / 2);
}

/**
 * Issue 20 (Einsatz-Test 2026-06-02): Helper fuer querschnittliche
 * alphabetische Sortierung in PWA + Backoffice + Backend + PDF.
 *
 * `Intl.Collator("de-AT", { numeric: true })` sortiert:
 *   - Umlaute korrekt nach Duden-Regel ("Aebermann" vor "Adler")
 *   - Zahlen natuerlich ("Bericht 2" vor "Bericht 10")
 *   - Case-insensitive
 *
 * Ausnahmen (Chronik DESC, Tabs DESC, Mannschaft nach Slot) muessen
 * weiterhin explizit so bleiben — dieser Helper ist nur fuer ASC-Listen
 * (Personen, Geraete, Auftragstypen, beteiligte Stellen, Sonstige FF).
 */

const collator = new Intl.Collator("de-AT", {
  numeric: true,
  sensitivity: "base",
});

/**
 * Sortiert ein Array kopiert (nicht in-place) alphabetisch deutsch.
 *
 * @param items   Die zu sortierende Liste
 * @param key     Optional: Selector fuer den Sortier-Schluessel (z. B. (p) => p.nachname)
 *                Wenn nicht gesetzt, wird item selbst als String verglichen.
 */
export function sortByDe<T>(items: ReadonlyArray<T>, key?: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const av = key ? key(a) : String(a);
    const bv = key ? key(b) : String(b);
    return collator.compare(av, bv);
  });
}

/**
 * Bequemer 2-Schluessel-Sortierer fuer Personen-Listen:
 * primaer Nachname, sekundaer Vorname.
 */
export function sortPersonenDe<T extends { nachname?: string; vorname?: string }>(
  personen: ReadonlyArray<T>,
): T[] {
  return [...personen].sort((a, b) => {
    const cmp = collator.compare(a.nachname ?? "", b.nachname ?? "");
    if (cmp !== 0) return cmp;
    return collator.compare(a.vorname ?? "", b.vorname ?? "");
  });
}

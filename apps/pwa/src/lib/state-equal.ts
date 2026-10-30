/**
 * Hilfen gegen unnoetige Re-Renders bei Polling.
 *
 * Problem: Ein Poll liefert bei JEDEM Tick ein frisch geparstes Objekt/Array.
 * `setState(neuesObjekt)` rendert dann die ganze Seite neu (BerichtPage und
 * ZentralePage sind riesig) und loest Effekte aus, die an der Referenz
 * haengen – auch wenn sich inhaltlich nichts geaendert hat.
 *
 * `behalteWennGleich(next)` ist ein Updater fuer setState: ist der Inhalt
 * (JSON-Vergleich) identisch, bleibt die alte Referenz und React bricht das
 * Rendern ab. Die Daten stammen aus JSON-APIs, daher ist der JSON-Vergleich
 * sicher (stabile Schluesselreihenfolge, keine Funktionen/Dates).
 */
export function inhaltGleich(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false; // nicht serialisierbar → lieber neu rendern
  }
}

/** setState-Updater: alten Wert behalten, wenn `next` inhaltlich gleich ist. */
export function behalteWennGleich<T>(next: T): (cur: T) => T {
  return (cur) => (inhaltGleich(cur, next) ? cur : next);
}

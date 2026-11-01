/**
 * Reserve-Mannschaft eines Einsatzes (`reservePersonIds`) vs. aktiv eingesetzte Personen.
 *
 * Wer als Reserve erfasst wurde, spaeter aber einen Auftrag uebernimmt und auf einem
 * weiteren Fahrzeug eingetragen wird (Mannschaft, Fahrer oder Fahrzeug-Kdt), ist
 * AKTIV und zaehlt nicht mehr als Reserve. Die gespeicherte Liste bleibt unveraendert;
 * die Anzeige (Florianstation) und das PDF rechnen die Eingesetzten heraus — so kommt
 * eine Person automatisch zurueck in die Reserve, wenn sie aus dem Fahrzeug entfernt wird.
 */

/** Minimale Sicht auf einen Fahrzeugbericht. */
export interface ReserveBericht {
  /** Von der Florianstation aus dem Hauptbericht entfernt — zaehlt nicht. */
  entferntAm?: string | undefined;
  mannschaft?: ReadonlyArray<{ personId: number }> | undefined;
  fahrerPersonId?: number | undefined;
  fahrzeugKdtPersonId?: number | undefined;
}

/** Alle Personen, die in den (nicht entfernten) Fahrzeugberichten eingetragen sind. */
export function eingesetztePersonIds(berichte: ReadonlyArray<ReserveBericht>): Set<number> {
  const s = new Set<number>();
  for (const b of berichte) {
    if (b.entferntAm) continue;
    for (const m of b.mannschaft ?? []) s.add(m.personId);
    if (typeof b.fahrerPersonId === "number") s.add(b.fahrerPersonId);
    if (typeof b.fahrzeugKdtPersonId === "number") s.add(b.fahrzeugKdtPersonId);
  }
  return s;
}

/** Reserve ohne die inzwischen Eingesetzten (Reihenfolge der gespeicherten Liste bleibt). */
export function reserveOhneEingesetzte(
  reservePersonIds: ReadonlyArray<number>,
  eingesetzt: ReadonlySet<number>,
): number[] {
  return reservePersonIds.filter((id) => !eingesetzt.has(id));
}

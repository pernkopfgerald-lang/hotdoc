/**
 * Mannschaft eines Fahrzeugberichts bearbeiten (Florianstation traegt Personal fuer
 * ein Fahrzeug ein). Reine Funktionen, damit die Platzvergabe testbar ist.
 *
 * `slot` ist die Nummer des Mannschaftsplatzes (1..MANNSCHAFT_SLOT_MAX); Fahrer und
 * Fahrzeug-Kdt haben eigene Felder und zaehlen NICHT zu den Mannschaftsplaetzen.
 */

/** Hoechste zulaessige Slot-Nummer (siehe MannschaftEintragSchema). */
export const MANNSCHAFT_SLOT_MAX = 7;

export interface MannschaftsEintrag {
  slot: number;
  personId: number;
  atemschutzAktiv?: boolean | undefined;
  atemschutzDauerMin?: number | undefined;
}

/** Anzahl nutzbarer Mannschaftsplaetze: Fahrzeug-Konfiguration, mindestens der hoechste belegte Slot. */
export function mannschaftsPlaetze(
  konfiguriert: number,
  aktuell: ReadonlyArray<MannschaftsEintrag>,
): number {
  const belegt = aktuell.reduce((max, m) => Math.max(max, m.slot), 0);
  return Math.min(MANNSCHAFT_SLOT_MAX, Math.max(konfiguriert, belegt));
}

/** Noch freie Mannschaftsplaetze. */
export function freieMannschaftsPlaetze(
  konfiguriert: number,
  aktuell: ReadonlyArray<MannschaftsEintrag>,
): number {
  return Math.max(0, mannschaftsPlaetze(konfiguriert, aktuell) - aktuell.length);
}

/**
 * Traegt Personen auf die naechsten freien Slots ein. Bereits eingetragene Personen
 * werden uebersprungen; Personen ohne freien Platz kommen in `nichtUntergebracht`.
 * Bestehende Eintraege (inkl. Atemschutz-Angaben) bleiben unveraendert.
 */
export function fuegeMannschaftHinzu(
  aktuell: ReadonlyArray<MannschaftsEintrag>,
  neuePersonen: ReadonlyArray<number>,
  konfiguriert: number,
): { mannschaft: MannschaftsEintrag[]; nichtUntergebracht: number[] } {
  const plaetze = mannschaftsPlaetze(konfiguriert, aktuell);
  const result: MannschaftsEintrag[] = aktuell.map((m) => ({ ...m }));
  const belegteSlots = new Set(result.map((m) => m.slot));
  const vorhanden = new Set(result.map((m) => m.personId));
  const nichtUntergebracht: number[] = [];
  for (const personId of neuePersonen) {
    if (vorhanden.has(personId)) continue;
    let slot = 0;
    for (let s = 1; s <= plaetze; s++) {
      if (!belegteSlots.has(s)) {
        slot = s;
        break;
      }
    }
    if (slot === 0) {
      nichtUntergebracht.push(personId);
      continue;
    }
    belegteSlots.add(slot);
    vorhanden.add(personId);
    result.push({ slot, personId, atemschutzAktiv: false });
  }
  result.sort((a, b) => a.slot - b.slot);
  return { mannschaft: result, nichtUntergebracht };
}

/** Nimmt eine Person aus der Mannschaft; alle anderen Eintraege bleiben unveraendert. */
export function entferneMannschaft(
  aktuell: ReadonlyArray<MannschaftsEintrag>,
  personId: number,
): MannschaftsEintrag[] {
  return aktuell.filter((m) => m.personId !== personId).map((m) => ({ ...m }));
}

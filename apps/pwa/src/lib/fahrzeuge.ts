import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

/**
 * Alle Einsatzfahrzeuge (ohne "zentrale" = Florianstation) in der
 * Reihenfolge der Konfiguration (kdo, tlf-a-4000, lfa-b, mtf). Aus
 * FAHRZEUGE abgeleitet statt in jeder Datei von Hand wiederholt – ein neues
 * Fahrzeug in @hotdoc/shared taucht so automatisch ueberall auf.
 */
export const FAHRZEUG_IDS: readonly FahrzeugId[] = (
  Object.keys(FAHRZEUGE) as FahrzeugId[]
).filter((id) => id !== "zentrale");

/** Type-Guard: ist `id` ein Einsatzfahrzeug (nicht die Zentrale)? */
export function istEinsatzFahrzeugId(id: string): id is FahrzeugId {
  return (FAHRZEUG_IDS as readonly string[]).includes(id);
}

import { FAHRZEUG_IDS as ALLE_FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";

/**
 * Alle echten Fahrzeuge (Schluessel von FAHRZEUGE) ohne die Einsatzzentrale
 * "zentrale" — Reihenfolge wie in @hotdoc/shared (kdo, tlf-a-4000, lfa-b, mtf).
 * Kuerzel/Namen kommen aus FAHRZEUGE[id] (abk, bezeichnung, funkrufname);
 * UI-spezifische Kurzlabels bleiben lokal, sind aber ueber
 * Record<EchteFahrzeugId, string> auf Vollstaendigkeit geprueft.
 */
export type EchteFahrzeugId = Exclude<FahrzeugId, "zentrale">;

export const FAHRZEUG_IDS: ReadonlyArray<EchteFahrzeugId> = ALLE_FAHRZEUG_IDS.filter(
  (id): id is EchteFahrzeugId => id !== "zentrale",
);

/** Wie FAHRZEUG_IDS, aber MIT "zentrale" (Florianstation) — z. B. QR-Aushang, Funkrufnamen. */
export const FAHRZEUG_IDS_MIT_ZENTRALE: ReadonlyArray<FahrzeugId> = ALLE_FAHRZEUG_IDS;

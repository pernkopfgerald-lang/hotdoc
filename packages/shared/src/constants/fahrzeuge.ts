/**
 * Fahrzeug-Stammdaten für die FF Eberstalzell.
 * Diese Konfiguration wird pro Tablet beim initialen Setup ausgewählt.
 * Siehe Spec FR-2 und Anhang A.
 */

export type FahrzeugId =
  | "kdo"
  | "tlf-a-4000"
  | "lfa-b"
  | "mtf"
  | "zentrale";

export interface FahrzeugConfig {
  id: FahrzeugId;
  /** Kurzbezeichnung im Bericht (z.B. „TLF-A 4000"). */
  bezeichnung: string;
  /** Funkrufname für Chronik und PDF (z.B. „Tank Eberstalzell"). */
  funkrufname: string;
  /** Kürzel für Karten-Marker (z.B. „TANK"). */
  abk: string;
  besatzung: {
    /** „1+N" wie im FF-Sprech, z.B. „1+7". */
    typ: string;
    /** Sitzplätze gesamt inkl. Fzg.-Kdt. + Fahrer. */
    gesamtSitzplaetze: number;
    /** Mannschaftsplätze im UI (=gesamtSitzplaetze - 2 für Kdt + Fahrer). */
    mannschaftsplaetzeZusaetzlich: number;
  };
  /** Optional: welche Anhänger können mitgenommen werden (nur MTF). */
  kannAnhaengerMitnehmen?: ReadonlyArray<"HR-Anhaenger" | "PKW-Anhaenger">;
  /** Standard-Geräte-Liste — wird in Phase 1 lokal gepflegt, in Phase 3+ aus syBOS gesynct. */
  geraeteIds: ReadonlyArray<string>;
}

export const FAHRZEUGE: Record<FahrzeugId, FahrzeugConfig> = {
  kdo: {
    id: "kdo",
    bezeichnung: "KDO",
    funkrufname: "Kommando Eberstalzell",
    abk: "KDO",
    besatzung: { typ: "1+3", gesamtSitzplaetze: 4, mannschaftsplaetzeZusaetzlich: 2 },
    geraeteIds: [],
  },
  "tlf-a-4000": {
    id: "tlf-a-4000",
    bezeichnung: "TLF-A 4000",
    funkrufname: "Tank Eberstalzell",
    abk: "TANK",
    besatzung: { typ: "1+7", gesamtSitzplaetze: 8, mannschaftsplaetzeZusaetzlich: 6 },
    geraeteIds: [],
  },
  "lfa-b": {
    id: "lfa-b",
    bezeichnung: "LFA-B",
    funkrufname: "Pumpe Eberstalzell",
    abk: "PUMPE",
    besatzung: { typ: "1+7", gesamtSitzplaetze: 8, mannschaftsplaetzeZusaetzlich: 6 },
    geraeteIds: [],
  },
  mtf: {
    id: "mtf",
    bezeichnung: "MTF",
    funkrufname: "MTF Eberstalzell",
    abk: "MTF",
    besatzung: { typ: "1+8", gesamtSitzplaetze: 9, mannschaftsplaetzeZusaetzlich: 7 },
    kannAnhaengerMitnehmen: ["HR-Anhaenger", "PKW-Anhaenger"],
    geraeteIds: [],
  },
  zentrale: {
    id: "zentrale",
    bezeichnung: "Einsatzzentrale",
    funkrufname: "Florian Eberstalzell",
    abk: "FLORIAN",
    besatzung: { typ: "-", gesamtSitzplaetze: 0, mannschaftsplaetzeZusaetzlich: 0 },
    geraeteIds: [],
  },
};

export const FAHRZEUG_IDS = Object.keys(FAHRZEUGE) as ReadonlyArray<FahrzeugId>;

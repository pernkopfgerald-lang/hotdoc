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
  /**
   * Issue 18 (Einsatz-Test 2026-06-02): KFZ-Kennzeichen erscheinen im
   * Fahrzeugbericht-PDF-Header (rechts oben, unter dem Funkrufnamen). Optional
   * im Backoffice unter "Stammdaten · Fahrzeuge" pflegbar. Bestandsberichte
   * vor v0.1.10 bleiben kompatibel weil das Feld optional ist.
   */
  kfzKennzeichen?: string;
  /**
   * Issue 18 (Einsatz-Test 2026-06-02): syBOS-Fahrzeug-ID fuer den syBOS-
   * Export bzw. fuer Materialzuordnung (Anhaenger, Gabelstapler etc.). Wird
   * gepflegt vom Funktionaer im Backoffice; Default leer fuer Bestand.
   */
  syBosId?: string;
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
    // Korrektur nach Einsatz-Test 2026-06-02: TLF-A 4000 hat real 1+8 Sitzplätze
    // (1 Kdt + 1 Fahrer + 7 Mannschaft), nicht 1+7 wie zuvor konfiguriert.
    besatzung: { typ: "1+8", gesamtSitzplaetze: 9, mannschaftsplaetzeZusaetzlich: 7 },
    geraeteIds: [],
  },
  "lfa-b": {
    id: "lfa-b",
    bezeichnung: "LFA-B",
    funkrufname: "Pumpe Eberstalzell",
    abk: "PUMPE",
    // Korrektur nach Einsatz-Test 2026-06-02: LFA-B hat real 1+8 Sitzplätze
    // (1 Kdt + 1 Fahrer + 7 Mannschaft), nicht 1+7 wie zuvor konfiguriert.
    besatzung: { typ: "1+8", gesamtSitzplaetze: 9, mannschaftsplaetzeZusaetzlich: 7 },
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

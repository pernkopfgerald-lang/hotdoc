import { describe, expect, it } from "vitest";
import {
  entferneMannschaft,
  freieMannschaftsPlaetze,
  fuegeMannschaftHinzu,
  mannschaftsPlaetze,
} from "@hotdoc/shared";

/** Florianstation traegt Personal fuer ein Fahrzeug ein: Platzvergabe. */

describe("Mannschaft eines Fahrzeugs bearbeiten", () => {
  it("leeres Fahrzeug: Personen kommen auf die Slots 1, 2, 3 …", () => {
    const r = fuegeMannschaftHinzu([], [101, 102, 103], 7);
    expect(r.mannschaft.map((m) => [m.slot, m.personId])).toEqual([[1, 101], [2, 102], [3, 103]]);
    expect(r.nichtUntergebracht).toEqual([]);
    expect(r.mannschaft.every((m) => m.atemschutzAktiv === false)).toBe(true);
  });

  it("belegte Slots bleiben samt Atemschutz-Angaben, neue fuellen die Luecken", () => {
    const aktuell = [
      { slot: 1, personId: 11, atemschutzAktiv: true, atemschutzDauerMin: 12 },
      { slot: 3, personId: 13 },
    ];
    const r = fuegeMannschaftHinzu(aktuell, [20], 7);
    expect(r.mannschaft.map((m) => [m.slot, m.personId])).toEqual([[1, 11], [2, 20], [3, 13]]);
    expect(r.mannschaft[0]).toMatchObject({ atemschutzAktiv: true, atemschutzDauerMin: 12 });
    expect(aktuell).toHaveLength(2); // Eingabe wird nicht veraendert
  });

  it("schon eingetragene Personen werden nicht doppelt eingetragen", () => {
    const r = fuegeMannschaftHinzu([{ slot: 1, personId: 11 }], [11, 12], 7);
    expect(r.mannschaft.map((m) => m.personId)).toEqual([11, 12]);
  });

  it("mehr Personen als freie Plaetze: Rest wird gemeldet (KDO hat 2 Mannschaftsplaetze)", () => {
    const r = fuegeMannschaftHinzu([{ slot: 1, personId: 11 }], [12, 13, 14], 2);
    expect(r.mannschaft.map((m) => m.personId)).toEqual([11, 12]);
    expect(r.nichtUntergebracht).toEqual([13, 14]);
  });

  it("Altdaten mit hoeherem Slot als konfiguriert: Platzzahl waechst mit, Maximum 7", () => {
    expect(mannschaftsPlaetze(2, [{ slot: 4, personId: 1 }])).toBe(4);
    expect(mannschaftsPlaetze(7, [{ slot: 9, personId: 1 }])).toBe(7);
  });

  it("freie Plaetze", () => {
    expect(freieMannschaftsPlaetze(7, [])).toBe(7);
    expect(freieMannschaftsPlaetze(2, [{ slot: 1, personId: 1 }, { slot: 2, personId: 2 }])).toBe(0);
  });

  it("Person entfernen: nur sie verschwindet, Slots der anderen bleiben", () => {
    const aktuell = [{ slot: 1, personId: 11 }, { slot: 2, personId: 12, atemschutzAktiv: true }, { slot: 3, personId: 13 }];
    const r = entferneMannschaft(aktuell, 12);
    expect(r.map((m) => [m.slot, m.personId])).toEqual([[1, 11], [3, 13]]);
    expect(entferneMannschaft(aktuell, 999)).toHaveLength(3);
  });
});

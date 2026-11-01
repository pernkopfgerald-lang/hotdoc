import { describe, expect, it } from "vitest";
import { eingesetztePersonIds, reserveOhneEingesetzte } from "@hotdoc/shared";

/** Reserve-Personen, die einen Auftrag uebernehmen, sind aktiv und nicht mehr Reserve. */

describe("Reserve vs. eingesetzte Personen", () => {
  const berichte = [
    { mannschaft: [{ personId: 11 }, { personId: 12 }], fahrerPersonId: 10, fahrzeugKdtPersonId: 13 },
    { mannschaft: [{ personId: 21 }] },
    { entferntAm: "2026-10-30T10:00:00.000Z", mannschaft: [{ personId: 99 }], fahrerPersonId: 98 },
  ];

  it("sammelt Mannschaft, Fahrer und Kdt aller Fahrzeuge, entfernte Berichte nicht", () => {
    const s = eingesetztePersonIds(berichte);
    expect([...s].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 21]);
    expect(s.has(99)).toBe(false);
    expect(s.has(98)).toBe(false);
  });

  it("Reserve-Person, die in ein weiteres Fahrzeug steigt, verschwindet aus der Reserve", () => {
    const reserve = [21, 30, 31]; // 21 hat einen Auftrag uebernommen (steht jetzt in Fahrzeug 2)
    expect(reserveOhneEingesetzte(reserve, eingesetztePersonIds(berichte))).toEqual([30, 31]);
  });

  it("kommt zurueck in die Reserve, wenn sie aus dem Fahrzeug entfernt wird", () => {
    const reserve = [21, 30];
    const ohne21 = berichte.map((b, i) => (i === 1 ? { ...b, mannschaft: [] } : b));
    expect(reserveOhneEingesetzte(reserve, eingesetztePersonIds(ohne21))).toEqual([21, 30]);
  });

  it("ohne Fahrzeugberichte bleibt die ganze Reserve; die Reihenfolge bleibt erhalten", () => {
    expect(reserveOhneEingesetzte([5, 3, 4], eingesetztePersonIds([]))).toEqual([5, 3, 4]);
  });

  it("fehlende Felder stoeren nicht", () => {
    expect(eingesetztePersonIds([{}, { mannschaft: undefined }]).size).toBe(0);
  });
});

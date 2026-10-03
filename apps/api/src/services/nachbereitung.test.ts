import { describe, expect, it } from "vitest";
import { baueNachbereitungText } from "./nachbereitung.js";
import type { BerichtDaten } from "./pdf/template.js";

const fz = (over: Record<string, unknown>) => ({
  fahrzeugId: "lfa-b",
  funkrufname: "Pumpe Eberstalzell",
  abk: "PUMPE",
  status: "abgeschlossen",
  kmGefahren: 5,
  mannschaft: [],
  geraete: [],
  oelSaecke: 0,
  taetigkeitsbericht: "",
  ...over,
});

describe("baueNachbereitungText", () => {
  it("fuehrt Geraete, Atemschutz, Oelbindemittel und Anhaenger je Fahrzeug an", () => {
    const text = baueNachbereitungText({
      fahrzeugberichte: [
        fz({
          geraete: ["Hydraulischer Rettungssatz", "Rettungszylinder", "Pressluftatmer"],
          mannschaft: [
            { name: "Max Mustermann", atemschutzAktiv: true, atemschutzDauerMin: 14 },
            { name: "Anna Gruber", atemschutzAktiv: true },
            { name: "Sepp Huber", atemschutzAktiv: false },
          ],
          oelSaecke: 2,
          anhaenger: ["HR-Anhänger"],
        }),
      ],
      staplerEingesetzt: true,
    } as unknown as BerichtDaten);
    expect(text).toContain("IN VERWENDUNG");
    expect(text).toContain("PUMPE (Pumpe Eberstalzell):");
    expect(text).toContain("Geräte: Hydraulischer Rettungssatz, Rettungszylinder, Pressluftatmer");
    expect(text).toContain("Atemschutz: 2 Träger — Max Mustermann (14 min), Anna Gruber");
    expect(text).not.toContain("Sepp Huber");
    expect(text).toContain("Ölbindemittel: 2 Säcke");
    expect(text).toContain("Anhänger: HR-Anhänger");
    expect(text).toContain("Stapler");
  });

  it("Einzahl bei einem Sack; Fahrzeuge ohne Material fehlen", () => {
    const text = baueNachbereitungText({
      fahrzeugberichte: [fz({ oelSaecke: 1 }), fz({ abk: "KDO", funkrufname: "Kommando" })],
    } as unknown as BerichtDaten);
    expect(text).toContain("1 Sack");
    expect(text).not.toContain("KDO");
  });

  it("leer, wenn nichts in Verwendung war", () => {
    expect(baueNachbereitungText({ fahrzeugberichte: [fz({})] } as unknown as BerichtDaten)).toBe("");
    expect(baueNachbereitungText({} as BerichtDaten)).toBe("");
  });
});

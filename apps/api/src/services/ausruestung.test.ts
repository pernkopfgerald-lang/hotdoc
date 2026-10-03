import { describe, expect, it } from "vitest";
import {
  findeRegeln,
  validiereAusruestung,
  wildcardMatch,
  type AusruestungsRegel,
} from "@hotdoc/shared";

const REGELN: AusruestungsRegel[] = [
  {
    id: "r1",
    stichwort: "TH VU*",
    fahrzeug: "lfa-b",
    geraete: ["hydraulischer-rettungssatz"],
    pruefart: "MUSS",
  },
  {
    id: "r2",
    stichwort: "TH VU*",
    fahrzeug: "kdo",
    geraete: ["erste-hilfe"],
    pruefart: "INFO",
  },
  {
    id: "r3",
    stichwort: "Brand*",
    fahrzeug: "tlf-a-4000",
    geraete: ["schlauchmaterial", "loeschwasser-2000"],
    pruefart: "MUSS",
  },
];

const NAMEN = {
  "hydraulischer-rettungssatz": "Hydraulischer Rettungssatz",
  "erste-hilfe": "Erste-Hilfe-Set",
};

describe("wildcardMatch", () => {
  it("passt auf Praefix, ohne Beachtung der Gross-/Kleinschreibung", () => {
    expect(wildcardMatch("TH VU*", "TH VU Person eingeklemmt")).toBe(true);
    expect(wildcardMatch("th vu*", "TH VU")).toBe(true);
  });
  it("verlangt ohne Wildcard den ganzen Text", () => {
    expect(wildcardMatch("TH VU", "TH VU Person")).toBe(false);
    expect(wildcardMatch("TH VU", "TH VU")).toBe(true);
  });
  it("kennt ? und behandelt Regex-Sonderzeichen woertlich", () => {
    expect(wildcardMatch("TH W?sser*", "TH Wasser Hochwasser")).toBe(true);
    expect(wildcardMatch("VU (Pkw)", "VU (Pkw)")).toBe(true);
    expect(wildcardMatch("A.B", "AxB")).toBe(false);
  });
  it("leeres Muster trifft nie", () => {
    expect(wildcardMatch("  ", "irgendwas")).toBe(false);
  });
});

describe("findeRegeln", () => {
  it("ignoriert pausierte, noch nicht gueltige und leere Regeln", () => {
    const heute = new Date("2026-10-03T10:00:00Z");
    const regeln: AusruestungsRegel[] = [
      { ...REGELN[0]!, id: "a", aktiv: false },
      { ...REGELN[0]!, id: "b", gueltigAb: "2026-12-01" },
      { ...REGELN[0]!, id: "c", geraete: [] },
      { ...REGELN[0]!, id: "d", gueltigAb: "2026-10-03" },
    ];
    expect(findeRegeln(regeln, "TH VU", heute).map((r) => r.id)).toEqual(["d"]);
  });
});

describe("validiereAusruestung", () => {
  it("blockiert (valid=false), wenn ein MUSS-Geraet fehlt", () => {
    const r = validiereAusruestung({
      stichwort: "TH VU Person eingeklemmt",
      ausruestungProFahrzeug: { "lfa-b": ["motorsaege"], kdo: ["erste-hilfe"] },
      regeln: REGELN,
      geraeteNamen: NAMEN,
    });
    expect(r.valid).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ fahrzeug: "lfa-b", severity: "MUSS" });
    expect(r.warnings[0]!.message).toContain("Hydraulischer Rettungssatz");
    expect(r.matchingRules.map((x) => x.id)).toEqual(["r1", "r2"]);
  });

  it("INFO warnt nur: valid bleibt true", () => {
    const r = validiereAusruestung({
      stichwort: "TH VU",
      ausruestungProFahrzeug: { "lfa-b": ["hydraulischer-rettungssatz"], kdo: ["absperrband"] },
      regeln: REGELN,
      geraeteNamen: NAMEN,
    });
    expect(r.valid).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ fahrzeug: "kdo", severity: "INFO" });
  });

  it("alles erfasst → keine Warnungen", () => {
    const r = validiereAusruestung({
      stichwort: "TH VU Person eingeklemmt",
      ausruestungProFahrzeug: { "lfa-b": ["hydraulischer-rettungssatz"], kdo: ["erste-hilfe"] },
      regeln: REGELN,
    });
    expect(r).toMatchObject({ valid: true, warnings: [] });
  });

  it("mindestens EIN Geraet der Liste genuegt", () => {
    const r = validiereAusruestung({
      stichwort: "Brand Wohnhaus",
      ausruestungProFahrzeug: { "tlf-a-4000": ["loeschwasser-2000"] },
      regeln: REGELN,
    });
    expect(r.valid).toBe(true);
  });

  it("Regel eines nicht beteiligten Fahrzeugs wird nicht geprueft", () => {
    const r = validiereAusruestung({
      stichwort: "TH VU",
      ausruestungProFahrzeug: { kdo: ["erste-hilfe"] },
      regeln: REGELN,
    });
    expect(r).toMatchObject({ valid: true, warnings: [] });
  });

  it("Bezeichnung als Freitext zaehlt als erfasst", () => {
    const r = validiereAusruestung({
      stichwort: "TH VU",
      ausruestungProFahrzeug: { "lfa-b": ["Hydraulischer Rettungssatz"] },
      regeln: REGELN,
      geraeteNamen: NAMEN,
    });
    expect(r.valid).toBe(true);
  });

  it("kein passendes Stichwort / keine Regeln → kein Check", () => {
    expect(
      validiereAusruestung({ stichwort: "Sturm", ausruestungProFahrzeug: { "lfa-b": [] }, regeln: REGELN }),
    ).toMatchObject({ valid: true, warnings: [], matchingRules: [] });
    expect(
      validiereAusruestung({ stichwort: "TH VU", ausruestungProFahrzeug: { "lfa-b": [] }, regeln: [] }).valid,
    ).toBe(true);
  });
});

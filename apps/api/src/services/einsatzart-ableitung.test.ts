import { describe, expect, it } from "vitest";
import {
  einsatzartFehlt,
  einsatzartIstPflicht,
  einsatzartMussBestaetigtWerden,
  kategorieFuer,
  leiteEinsatzartAb,
} from "@hotdoc/shared";

/** Einsatzart-Vorschlag aus ELS-Stichwort / BlaulichtSMS-Alarmtext. */

describe("leiteEinsatzartAb", () => {
  it("Einsatz vom 29.10.2026 (B1-GEB, Brand Gebäude) wird als Brand erkannt", () => {
    const art = leiteEinsatzartAb({ tycod: "B1-GEB", subTycod: "GEBÄUDE-BR", typ: "Brand Gebäude" });
    expect(art).toBe("Brand Sonstiges");
    expect(kategorieFuer(art)).toBe("brand");
  });

  it("der BlaulichtSMS-Text allein reicht (Zeile 'Brand Gebäude', 'Küchenbrand')", () => {
    const text =
      "1\nBrand Gebäude\nKüchenbrand in Fritteuse // Sprechgruppen:\nFW-WL-HAUPT\nSolarstraße 2b 4653 Eberstalzell Eberstalzell:\n@Burger King\n\nEBERSTALZELL,SPIELDORF";
    expect(kategorieFuer(leiteEinsatzartAb({ alarmText: text }))).toBe("brand");
  });

  it("genauere Brandarten aus dem ELS-Stichwort", () => {
    expect(leiteEinsatzartAb({ tycod: "B0-FREI-ABF", typ: "Brand Abfall im Freien", sub: "Brand Container im Freien" })).toBe(
      "Brand Abfall",
    );
    expect(leiteEinsatzartAb({ tycod: "B1-KAM", typ: "Kaminbrand" })).toBe("Brand Kamin");
    expect(leiteEinsatzartAb({ tycod: "B2-BMA", typ: "Brandmeldeanlage" })).toBe("BMA");
  });

  it("Straßennamen im Alarmtext zaehlen nicht als Stichwort ('Wiesenweg' ist kein Flurbrand)", () => {
    const text = "2\nBrand Gebäude\nZimmer // Sprechgruppen:\nWiesenweg 3 4653 Eberstalzell";
    expect(leiteEinsatzartAb({ alarmText: text })).toBe("Brand Sonstiges");
  });

  it("technische Einsaetze: eindeutiges Stichwort wird erkannt, sonst keine Vorgabe", () => {
    expect(leiteEinsatzartAb({ tycod: "T1-OEL", typ: "Ölspur" })).toBe("Ölspur");
    expect(leiteEinsatzartAb({ tycod: "T2-LIFT", typ: "Person im Lift" })).toBe("Lift");
    expect(leiteEinsatzartAb({ tycod: "T2-VU", typ: "Verkehrsunfall" })).toBeUndefined();
  });

  it("ein T-Code mit Brand-Wort im Text bleibt technisch (Code entscheidet)", () => {
    expect(leiteEinsatzartAb({ tycod: "T2-PER", typ: "Personenrettung", alarmText: "Person mit Brandverletzung" })).toBeUndefined();
  });

  it("ohne Hinweise: keine Vorgabe", () => {
    expect(leiteEinsatzartAb({})).toBeUndefined();
    expect(leiteEinsatzartAb({ alarmText: "Alarm" })).toBeUndefined();
  });
});

describe("Einsatzart-Pflicht", () => {
  it("fehlende Art ist bei Alarm/manuell Pflicht, bei Uebung und Lotsendienst nicht", () => {
    expect(einsatzartFehlt({ einsatzTyp: "alarm" })).toBe(true);
    expect(einsatzartFehlt({ einsatzTyp: "alarm", einsatzart: "  " })).toBe(true);
    expect(einsatzartFehlt({ einsatzTyp: "manuell" })).toBe(true);
    expect(einsatzartFehlt({ einsatzTyp: "uebung" })).toBe(false);
    expect(einsatzartFehlt({ einsatzTyp: "lotsendienst" })).toBe(false);
    expect(einsatzartIstPflicht({ einsatzTyp: "uebung" })).toBe(false);
  });

  it("automatisch vorgeschlagene Art muss bestaetigt werden, bestaetigte nicht", () => {
    expect(einsatzartMussBestaetigtWerden({ einsatzTyp: "alarm", einsatzart: "Brand Sonstiges", einsatzartAuto: true })).toBe(true);
    expect(einsatzartMussBestaetigtWerden({ einsatzTyp: "alarm", einsatzart: "Brand Sonstiges", einsatzartAuto: false })).toBe(false);
    expect(einsatzartMussBestaetigtWerden({ einsatzTyp: "alarm", einsatzart: "Ölspur" })).toBe(false);
    expect(einsatzartMussBestaetigtWerden({ einsatzTyp: "alarm" })).toBe(true);
    expect(einsatzartMussBestaetigtWerden({ einsatzTyp: "uebung", einsatzartAuto: true })).toBe(false);
  });
});

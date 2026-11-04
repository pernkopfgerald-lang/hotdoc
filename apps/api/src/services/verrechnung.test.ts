import { describe, expect, it } from "vitest";
import {
  GEBUEHREN_TEXT_STANDARD,
  TARIFORDNUNG_2026,
  TARIF_STANDARD_EINSTELLUNGEN,
  abrechnungsStunden,
  baueVerrechnung,
  berechnePosition,
  euroText,
  findeTarifPosition,
  type VerrechnungFahrzeug,
} from "@hotdoc/shared";

const pos = (nr: string) => {
  const p = findeTarifPosition(nr);
  if (!p) throw new Error(`Position ${nr} fehlt`);
  return p;
};

const fzg = (id: string, bezeichnung: string, von: string, bis: string, personen: string[], anhaenger: string[] = []): VerrechnungFahrzeug => ({
  fahrzeugId: id,
  bezeichnung,
  zeitVon: `2026-11-01T${von}:00.000Z`,
  zeitBis: `2026-11-01T${bis}:00.000Z`,
  personen: personen.map((n) => ({ key: n, name: n })),
  anhaenger,
});

describe("Tarifordnung 2026: Verzeichnis", () => {
  it("enthaelt alle 161 Positionen der Anlage I", () => {
    expect(TARIFORDNUNG_2026).toHaveLength(161);
    expect(new Set(TARIFORDNUNG_2026.map((p) => p.pos)).size).toBe(161);
  });
  it("Fahrzeugtarife stimmen mit der PDF ueberein (Stunde / Pauschal)", () => {
    expect(pos("2.01")).toMatchObject({ satzStunde: 67.7, satzPauschal: 338.5, pauschalZeitraumStd: 12 });
    expect(pos("2.04")).toMatchObject({ satzStunde: 129.8, satzPauschal: 649 });
    expect(pos("2.15")).toMatchObject({ satzStunde: 321.7, satzPauschal: 1608.5 });
    expect(pos("1.01")).toMatchObject({ einheit: "stunde", satzStunde: 34.4 });
  });
  it("Pauschaltarif der Fahrzeuge = 5 Stundensaetze (Plausibilitaet gegen Abschreibfehler)", () => {
    for (const p of TARIFORDNUNG_2026.filter((x) => x.gruppe === 2)) {
      expect(p.satzPauschal).toBeCloseTo((p.satzStunde ?? 0) * 5, 1);
    }
  });
  it("Einzelwerte aus der Tagessatz-Spalte sind Tagessaetze", () => {
    expect(pos("3.01")).toMatchObject({ einheit: "tagessatz", festbetrag: 9.1 });
    expect(pos("6.03")).toMatchObject({ einheit: "tagessatz", festbetrag: 47.1 });
    expect(pos("3.02")).toMatchObject({ einheit: "zeit", satzStunde: 17.2, satzPauschal: 86, pauschalZeitraumStd: 24 });
  });
  it("Mindestbetraege: Wohnungsoeffnung und BMA-Fehlalarm", () => {
    expect(pos("12.01").mindestbetrag).toBe(114.9);
    expect(pos("13.04").mindestbetrag).toBe(448.1);
  });
});

describe("Berechnungsgrundsaetze (Pkt. 2 Abs. 4/5)", () => {
  it("erste Stunde immer voll, weitere angefangene Stunde bis 30 Min. halb, darueber voll", () => {
    expect(abrechnungsStunden(1)).toBe(1);
    expect(abrechnungsStunden(25)).toBe(1);
    expect(abrechnungsStunden(60)).toBe(1);
    expect(abrechnungsStunden(61)).toBe(1.5);
    expect(abrechnungsStunden(90)).toBe(1.5);
    expect(abrechnungsStunden(91)).toBe(2);
    expect(abrechnungsStunden(120)).toBe(2);
    expect(abrechnungsStunden(150)).toBe(2.5);
    expect(abrechnungsStunden(0)).toBe(0);
  });

  it("Personalaufwand: 25 Min. kosten eine volle Stunde (Mindestverrechnung)", () => {
    const b = berechnePosition(pos("1.01"), { minuten: 25, menge: 1 });
    expect(b.betrag).toBe(34.4);
  });

  it("Fahrzeug 2.04: 80 Min. = 1,5 Std.; 4 Std. = 4 Std.; ab 4:01 Pauschale", () => {
    const p = pos("2.04");
    expect(berechnePosition(p, { minuten: 80 }).betrag).toBe(194.7);
    expect(berechnePosition(p, { minuten: 240 }).betrag).toBe(519.2);
    expect(berechnePosition(p, { minuten: 241 }).betrag).toBe(649);
  });

  it("Pauschale deckt 12 Std. (Pkt. 2); darueber wird neu gerechnet", () => {
    const p = pos("2.01");
    expect(berechnePosition(p, { minuten: 720 }).betrag).toBe(338.5);
    expect(berechnePosition(p, { minuten: 750 }).betrag).toBe(338.5 + 67.7);
  });

  it("Geraete-Tagessatz-Pauschale gilt 24 Std.", () => {
    const p = pos("3.02");
    expect(berechnePosition(p, { minuten: 300 }).betrag).toBe(86);
    expect(berechnePosition(p, { minuten: 1500 }).betrag).toBe(86 + 17.2);
  });

  it("nach Aufwand: Mindestbetrag gilt immer, hoehere Eingabe zaehlt", () => {
    const p = pos("12.01");
    expect(berechnePosition(p).betrag).toBe(114.9);
    expect(berechnePosition(p, { betrag: 80 }).betrag).toBe(114.9);
    expect(berechnePosition(p, { betrag: 200 }).betrag).toBe(200);
    expect(berechnePosition(pos("14.04")).betrag).toBeNull();
  });

  it("euroText: oesterreichische Schreibweise", () => {
    expect(euroText(1234.5)).toBe("1.234,50");
    expect(euroText(34.4)).toBe("34,40");
  });
});

describe("Verrechnungsblatt", () => {
  const basis = {
    einsatzTyp: "alarm",
    alarmierungZeit: "2026-11-01T11:11:00.000Z",
    einsatzende: "2026-11-01T13:00:00.000Z",
  };

  it("Fahrzeug- und Personalaufwand laut Tarif (Pumpe 80 Min., 3 Personen)", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("lfa-b", "Pumpe Eberstalzell", "12:15", "13:35", ["A", "B", "C"])],
      eingaben: { art: "nicht-hoheitlich" },
    });
    const fz = r.zeilen.find((z) => z.gruppe === "fahrzeuge");
    expect(fz).toMatchObject({ pos: "2.04", betrag: 194.7 });
    const ma = r.zeilen.find((z) => z.gruppe === "mannschaft");
    // 3 Pers. × 1,5 Std. × 34,40
    expect(ma).toMatchObject({ pos: "1.01", betrag: 154.8 });
    expect(r.summe).toBe(349.5);
    expect(r.art).toBe("nicht-hoheitlich");
    expect(r.artText).toContain("Nicht-hoheitlicher Einsatz");
  });

  it("hoheitlicher Einsatz: Kosten werden trotzdem ausgewiesen", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("kdo", "Kommando", "12:15", "12:45", ["A"])],
      eingaben: { art: "hoheitlich" },
    });
    expect(r.artText).toContain("Hoheitlicher Einsatz");
    expect(r.summe).toBe(67.7 + 34.4);
  });

  it("ohne festgelegte Verrechnungsart werden Kosten gezeigt und eine Warnung gesetzt", () => {
    const r = baueVerrechnung({ ...basis, fahrzeuge: [fzg("kdo", "Kommando", "12:15", "12:45", ["A"])] });
    expect(r.art).toBeNull();
    expect(r.summe).toBeGreaterThan(0);
    expect(r.warnungen.join(" ")).toContain("Verrechnungsart");
  });

  it("Geraete am Fahrzeug erscheinen NIE als eigene Kostenzeile", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("lfa-b", "Pumpe", "12:15", "13:15", ["A"])],
      eingaben: { art: "nicht-hoheitlich" },
    });
    // Es gibt Fahrzeug- und Mannschaftszeilen — aber keine Geraete-Position (Gruppen 3-11)
    for (const z of r.zeilen) {
      const g = Number(z.pos.split(".")[0]);
      expect(g === 1 || g === 2 || g >= 12).toBe(true);
    }
    expect(r.hinweise.join(" ")).toContain("nicht gesondert verrechnet");
  });

  it("zusaetzlich mitgefuehrtes Geraet (Zusatzposition) wird nach Tarif A verrechnet", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [],
      eingaben: { zusatz: [{ id: "1", pos: "4.04", minuten: 120 }] },
    });
    expect(r.zeilen[0]).toMatchObject({ gruppe: "zusatz", pos: "4.04", betrag: 110.2 });
    expect(r.zeilen[0]?.text).toContain("zusätzlich mitgeführt");
  });

  it("Person auf zwei Fahrzeugen wird nur EINMAL (Zeitspanne) verrechnet", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("kdo", "Kommando", "12:00", "12:30", ["X"]), fzg("lfa-b", "Pumpe", "12:20", "13:00", ["X"])],
      eingaben: {},
    });
    const ma = r.zeilen.filter((z) => z.gruppe === "mannschaft");
    expect(ma).toHaveLength(1);
    // 12:00–13:00 = 60 Min. = 1 Std.
    expect(ma[0]?.betrag).toBe(34.4);
  });

  it("nicht erforderliches Fahrzeug wird nicht verrechnet, Bereitstellung = 60 %", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("kdo", "Kommando", "12:00", "13:00", []), fzg("mtf", "MTF", "12:00", "13:00", [])],
      eingaben: { fahrzeuge: { kdo: { nichtErforderlich: true }, mtf: { nurBereitgestellt: true } } },
    });
    expect(r.zeilen.filter((z) => z.gruppe === "fahrzeuge")).toHaveLength(1);
    // MTF 2.02 = 96,50 / Std. × 60 %
    expect(r.zeilen[0]?.betrag).toBe(57.9);
    expect(r.warnungen.join(" ")).toContain("nicht erforderlich");
  });

  it("Anhaenger werden mit der Zeit des ziehenden Fahrzeugs verrechnet", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("mtf", "MTF", "12:00", "13:00", [], ["HR-Anhaenger"])],
    });
    const a = r.zeilen.find((z) => z.text.startsWith("HR-Anhänger"));
    expect(a).toMatchObject({ pos: "2.22", betrag: 55.1 });
  });

  it("Oelbindemittel (Tarif D) getrennt; ohne Tagespreis offen, mit Preis berechnet", () => {
    const offen = baueVerrechnung({ ...basis, fahrzeuge: [], oelbindemittelSaecke: 3 });
    expect(offen.zeilen[0]).toMatchObject({ gruppe: "verbrauch", pos: "14.04", betrag: null });
    expect(offen.hatOffenePositionen).toBe(true);
    const ok = baueVerrechnung({
      ...basis,
      fahrzeuge: [],
      oelbindemittelSaecke: 3,
      einstellungen: { ...TARIF_STANDARD_EINSTELLUNGEN, fahrzeugTarif: {}, anhaengerTarif: {}, verbrauchspreise: { oelbindemittelSack: 12.5 } },
    });
    expect(ok.zeilen[0]?.betrag).toBe(37.5);
    expect(ok.hatOffenePositionen).toBe(false);
  });

  it("fehlende Fahrzeugzeit: Fallback auf Einsatzdauer mit Warnung", () => {
    const f: VerrechnungFahrzeug = { fahrzeugId: "kdo", bezeichnung: "Kommando", personen: [], anhaenger: [] };
    const r = baueVerrechnung({ ...basis, fahrzeuge: [f] });
    // 11:11–13:00 = 109 Min. → 2 Std.
    expect(r.zeilen[0]?.betrag).toBe(135.4);
    expect(r.warnungen.join(" ")).toContain("Einsatzdauer");
  });

  it("Preis-Ueberschreibung aus der Konfiguration wirkt", () => {
    const r = baueVerrechnung({
      ...basis,
      fahrzeuge: [fzg("kdo", "Kommando", "12:00", "13:00", [])],
      einstellungen: { ...TARIF_STANDARD_EINSTELLUNGEN, fahrzeugTarif: { kdo: "2.01" }, anhaengerTarif: {}, preise: { "2.01": { satzStunde: 70 } } },
    });
    expect(r.zeilen[0]?.betrag).toBe(70);
  });
});

describe("Gebuehrenhinweis und Preisliste Verbrauchsmaterial", () => {
  const basis = { alarmierungZeit: "2026-11-01T11:11:00.000Z", einsatzende: "2026-11-01T13:00:00.000Z", fahrzeuge: [] as VerrechnungFahrzeug[] };

  it("Standardtext nennt Tarifordnung und Gemeinderatsbeschluss; Platzhalter-Datum loest eine Warnung aus", () => {
    const r = baueVerrechnung({ ...basis });
    expect(r.gebuehrenText).toBe(GEBUEHREN_TEXT_STANDARD);
    expect(r.gebuehrenText).toContain("Tarifordnung");
    expect(r.gebuehrenText).toContain("Gemeinderatsbeschluss der Gemeinde Eberstalzell");
    expect(r.warnungen.join(" ")).toContain("Datum des Gemeinderatsbeschlusses fehlt");
  });

  it("editierter Text mit Datum wird uebernommen, keine Warnung mehr", () => {
    const text = "Gebühren gemäß Tarifordnung 2026 sowie Gemeinderatsbeschluss Gemeinde Eberstalzell vom 18.12.2025";
    const r = baueVerrechnung({ ...basis, einstellungen: { ...TARIF_STANDARD_EINSTELLUNGEN, gebuehrenText: text } });
    expect(r.gebuehrenText).toBe(text);
    expect(r.warnungen.join(" ")).not.toContain("Gemeinderatsbeschlusses");
  });

  it("Verbrauchsmaterial aus der Preisliste: Betrag = Menge × Preis", () => {
    const r = baueVerrechnung({
      ...basis,
      eingaben: { verbrauch: [{ id: "v", pos: "14.04", text: "Bindemittel", listeId: "l1", menge: 4 }] },
      einstellungen: {
        ...TARIF_STANDARD_EINSTELLUNGEN,
        verbrauchsliste: [{ id: "l1", pos: "14.04", text: "Bindemittel", einheit: "Sack", preis: 12.5 }],
      },
    });
    expect(r.zeilen[0]).toMatchObject({ gruppe: "verbrauch", betrag: 50 });
    expect(r.zeilen[0]?.mengeText).toContain("4 Sack");
    expect(r.zeilen[0]?.tarifText).toContain("12,50 / Sack");
  });

  it("geloeschter Preislisten-Eintrag: Warnung statt Absturz", () => {
    const r = baueVerrechnung({ ...basis, eingaben: { verbrauch: [{ id: "v", pos: "14.04", text: "X", listeId: "weg" }] } });
    expect(r.warnungen.join(" ")).toContain("Preisliste nicht mehr vorhanden");
    expect(r.zeilen[0]?.betrag).toBeNull();
  });
});

describe("Zeitraum mit Datum ueberschreiben (z. B. nachtraeglich erfasster Lotsendienst)", () => {
  it("zeitVon/zeitBis mit Datum haben Vorrang vor der Fahrzeugzeit", () => {
    // Fahrzeugzeit faelschlich ueber 3 Tage (heute als Ende) → korrigiert auf 1.11. 13:00–15:15
    const f: VerrechnungFahrzeug = {
      fahrzeugId: "mtf",
      bezeichnung: "MTF",
      zeitVon: "2026-11-01T12:00:00.000Z",
      zeitBis: "2026-11-04T14:15:00.000Z",
      personen: [{ key: "a", name: "A" }],
      anhaenger: [],
    };
    const falsch = baueVerrechnung({ fahrzeuge: [f] });
    const richtig = baueVerrechnung({
      fahrzeuge: [f],
      eingaben: { fahrzeuge: { mtf: { zeitVon: "2026-11-01T12:00:00.000Z", zeitBis: "2026-11-01T14:15:00.000Z" } } },
    });
    // 2 Std. 15 Min. → 2,5 Std. × 96,50 = 241,25 (statt Pauschale bei 3 Tagen)
    expect(richtig.zeilen[0]?.betrag).toBe(241.25);
    expect(falsch.zeilen[0]?.betrag).toBeGreaterThan(richtig.zeilen[0]?.betrag ?? 0);
    expect(richtig.zeilen.find((z) => z.gruppe === "mannschaft")?.betrag).toBe(86);
  });
});


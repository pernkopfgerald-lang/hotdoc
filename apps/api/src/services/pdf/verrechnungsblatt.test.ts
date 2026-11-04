import { describe, expect, it } from "vitest";
import { baueVerrechnung, TARIF_STANDARD_EINSTELLUNGEN } from "@hotdoc/shared";
import { renderHauptberichtHtml, type BerichtDaten } from "./template.js";
import { renderBerichtMarkdown } from "./markdown.js";
import { validiereTarifordnungConfig } from "../../routes/config.js";

const TITEL = '<div class="hd-title">Verrechnungsblatt</div>';

const basis = {
  einsatzId: "einsatz:t-1",
  berichtsNummer: "T26-099",
  einsatzort: "Musterstraße 1",
  alarmierungZeit: "2026-11-01T11:11:00.000Z",
  einsatzTyp: "alarm",
  status: "abgeschlossen",
} as unknown as BerichtDaten;

const verrechnung = (art?: "hoheitlich" | "nicht-hoheitlich") =>
  baueVerrechnung({
    einsatzTyp: "alarm",
    alarmierungZeit: "2026-11-01T11:11:00.000Z",
    einsatzende: "2026-11-01T13:00:00.000Z",
    fahrzeuge: [
      {
        fahrzeugId: "lfa-b",
        bezeichnung: "Pumpe Eberstalzell",
        zeitVon: "2026-11-01T12:15:00.000Z",
        zeitBis: "2026-11-01T13:35:00.000Z",
        personen: [{ key: "a", name: "Pech Marie" }, { key: "b", name: "Kant Ine" }],
        anhaenger: [],
      },
    ],
    eingaben: art ? { art } : {},
    einstellungen: TARIF_STANDARD_EINSTELLUNGEN,
  });

describe("Verrechnungsblatt im Einsatzbericht", () => {
  it("steht am Ende des Berichts, nach den Fahrzeugblaettern und vor dem Foto-Anhang", () => {
    const d = {
      ...basis,
      verrechnung: verrechnung("nicht-hoheitlich"),
      fahrzeugberichte: [{ fahrzeugId: "lfa-b", funkrufname: "Pumpe Eberstalzell", abk: "PUMPE", status: "abgeschlossen", kmGefahren: 5, mannschaft: [], geraete: [], oelSaecke: 0, taetigkeitsbericht: "" }],
      fotos: [{ fotoId: "f1", dataUrl: "data:image/png;base64,AAAA", aufgenommenAm: "2026-11-01T12:00:00.000Z" }],
    } as unknown as BerichtDaten;
    const html = renderHauptberichtHtml(d);
    const iBlatt = html.indexOf(TITEL);
    expect(iBlatt).toBeGreaterThan(-1);
    expect(iBlatt).toBeGreaterThan(html.indexOf("Pumpe Eberstalzell"));
    expect(iBlatt).toBeLessThan(html.indexOf("Foto-Anhang"));
  });

  it("zeigt die Kosten gemaess Tarifordnung bei hoheitlichem UND nicht-hoheitlichem Einsatz", () => {
    for (const art of ["hoheitlich", "nicht-hoheitlich"] as const) {
      const html = renderHauptberichtHtml({ ...basis, verrechnung: verrechnung(art) } as BerichtDaten);
      expect(html).toContain(TITEL);
      // 2.04: 80 Min. = 1,5 Std. à 129,80 = 194,70
      expect(html).toContain("194,70");
      expect(html).toContain("Feuerwehr-Tarifordnung 2026");
    }
    expect(renderHauptberichtHtml({ ...basis, verrechnung: verrechnung("hoheitlich") } as BerichtDaten)).toContain("Hoheitlicher Einsatz");
    expect(renderHauptberichtHtml({ ...basis, verrechnung: verrechnung("nicht-hoheitlich") } as BerichtDaten)).toContain("Nicht-hoheitlicher Einsatz");
  });

  it("nennt den Grundsatz: verlastete Geraete werden nicht gesondert verrechnet", () => {
    const html = renderHauptberichtHtml({ ...basis, verrechnung: verrechnung() } as BerichtDaten);
    expect(html).toContain("nicht gesondert verrechnet");
    expect(html).toContain("Die erste Stunde wird immer voll verrechnet");
  });

  it("ohne Verrechnungsart: Blatt trotzdem vorhanden, mit Pruefhinweis", () => {
    const html = renderHauptberichtHtml({ ...basis, verrechnung: verrechnung() } as BerichtDaten);
    expect(html).toContain("noch nicht festgelegt");
    expect(html).toContain("Prüfhinweise zur Erfassung");
  });

  it("Uebungen bekommen kein Verrechnungsblatt", () => {
    const html = renderHauptberichtHtml({ ...basis, istUebung: true, verrechnung: verrechnung() } as BerichtDaten);
    expect(html).not.toContain(TITEL);
  });

  it("offene Positionen werden als offen markiert, Summe vorlaeufig", () => {
    const v = baueVerrechnung({ fahrzeuge: [], oelbindemittelSaecke: 2, einstellungen: TARIF_STANDARD_EINSTELLUNGEN });
    const html = renderHauptberichtHtml({ ...basis, verrechnung: v } as BerichtDaten);
    expect(html).toContain("vb-offen");
    expect(html).toContain("vorläufig");
  });

  it("Markdown-Export enthaelt den Abschnitt Verrechnung mit Summe", () => {
    const md = renderBerichtMarkdown({ ...basis, verrechnung: verrechnung("nicht-hoheitlich") } as BerichtDaten, { bearbeiter: undefined, reserve: [] });
    expect(md).toContain("## Verrechnung — Feuerwehr-Tarifordnung 2026");
    expect(md).toContain("2.04");
    expect(md).toContain("Summe gemäß Tarifordnung (EUR)");
  });
});

describe("config:tarifordnung — Validierung", () => {
  it("akzeptiert die Standard-Zuordnung", () => {
    expect(validiereTarifordnungConfig({}).ok).toBe(true);
  });
  it("lehnt unbekannte Tarifposition ab", () => {
    const r = validiereTarifordnungConfig({ fahrzeugTarif: { kdo: "9.99" } });
    expect(r.ok).toBe(false);
  });
  it("lehnt negative Preise ab", () => {
    expect(validiereTarifordnungConfig({ preise: { "2.01": { satzStunde: -1 } } }).ok).toBe(false);
    expect(validiereTarifordnungConfig({ verbrauchspreise: { oelbindemittelSack: -3 } }).ok).toBe(false);
  });
  it("normalisiert fehlende Teile mit den Standardwerten", () => {
    const r = validiereTarifordnungConfig({ preise: { "2.01": { satzStunde: 70 } } });
    expect(r.ok && r.data.fahrzeugTarif.kdo).toBe("2.01");
    expect(r.ok && r.data.preise["2.01"]?.satzStunde).toBe(70);
  });
});

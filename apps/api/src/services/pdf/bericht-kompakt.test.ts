import { describe, expect, it } from "vitest";
import { renderHauptberichtHtml, type BerichtDaten } from "./template.js";
import { renderBerichtMarkdown } from "./markdown.js";

const eintrag = (zeit: string, funkrufname: string, text: string, source = "fahrzeug") => ({
  zeitstempel: `2026-11-01T${zeit}:00.000Z`,
  funkrufname,
  text,
  source,
});

const basis = {
  einsatzId: "b-1",
  einsatzort: "Ort",
  alarmierungZeit: "2026-11-01T11:11:00.000Z",
  einsatzTyp: "alarm",
  status: "abgeschlossen",
  bearbeiter: "Pernkopf Gerald",
  chronik: [
    eintrag("11:15", "Kommando Eberstalzell", "Funkstatus 3: Ausgerückt (Einsatz übernommen)"),
    eintrag("11:17", "Pumpe Eberstalzell", "Funkstatus 4: Am Einsatzort eingetroffen"),
    eintrag("11:30", "Florian Eberstalzell", "Lagemeldung: Zugang über Balkon", "manuell"),
    eintrag("11:47", "Florian Eberstalzell", "Florianstation besetzt"),
  ],
} as unknown as BerichtDaten;

describe("Bericht: Statusfunk als kompakter Blocksatz", () => {
  const html = renderHauptberichtHtml(basis);

  it("setzt Funkstatus und Florianstation in EINEN kleinen Blocksatz-Absatz", () => {
    expect(html).toContain("Statusfunk:");
    expect(html).toContain("text-align:justify");
    expect(html.match(/Statusfunk:/g)).toHaveLength(1);
    // Kurzform ohne Ortsnamen: "Kommando <3> Ausgerückt"
    expect(html).toMatch(/Kommando <strong>3<\/strong> Ausgerückt/);
    expect(html).toMatch(/Pumpe <strong>4<\/strong> Am Einsatzort/);
    expect(html).toContain("Florianstation besetzt");
  });

  it("zeigt Statusmeldungen nicht mehr als eigene Zeile", () => {
    expect(html).not.toContain("Funkstatus 3: Ausgerückt");
  });

  it("laesst uebrige Chronik-Eintraege als eigene Zeile stehen", () => {
    expect(html).toContain("Lagemeldung: Zugang über Balkon");
    expect(html).toContain("Florian Eberstalzell:");
  });

  it("ohne Statusfunk kein Statusfunk-Block", () => {
    const ohne = renderHauptberichtHtml({ ...basis, chronik: [basis.chronik![2]!] } as BerichtDaten);
    expect(ohne).not.toContain("Statusfunk:");
  });

  it("fuehrt mehrzeilige Texte als Fliesstext", () => {
    const h = renderHauptberichtHtml({
      ...basis,
      chronik: [eintrag("11:11", "blaulichtsms", "0\nTüröffnung\nUnfallverdacht", "auto-blaulichtsms")],
    } as BerichtDaten);
    expect(h).toContain("0 · Türöffnung · Unfallverdacht");
  });
});

describe("Bericht: Sachbearbeiter Florianstation ist nicht ausgerückt", () => {
  it("PDF beschriftet den Bearbeiter als Sachbearbeiter Florianstation", () => {
    const html = renderHauptberichtHtml(basis);
    expect(html).toContain("Sachbearbeiter Florianstation");
    expect(html).toContain("Pernkopf Gerald");
  });

  it("Markdown nennt ihn Sachbearbeiter Florianstation (nicht ausgerückt)", () => {
    const md = renderBerichtMarkdown(basis, {
      bearbeiter: { name: "Pernkopf Gerald", syBosId: 107368 },
      reserve: [{ name: "Almhofer Martin", syBosId: 1 }],
    });
    expect(md).toContain("Sachbearbeiter Florianstation (nicht ausgerückt): Pernkopf Gerald (syBOS 107368)");
    expect(md).toContain("Reserve ohne Fahrzeug (1 Personen):");
    expect(md).not.toMatch(/^- Sachbearbeiter: /m);
  });
});

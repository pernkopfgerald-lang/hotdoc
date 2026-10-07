import { describe, expect, it } from "vitest";
import { FotoSchema } from "@hotdoc/shared";
import { renderHauptberichtHtml, type BerichtDaten } from "./pdf/template.js";
import { renderBerichtMarkdown } from "./pdf/markdown.js";

const basis = {
  _id: "foto:x:zentrale:1",
  type: "foto" as const,
  einsatzId: "einsatz:x",
  fahrzeugId: "zentrale",
  aufgenommenAm: "2026-10-07T10:00:00.000Z",
  erstelltAm: "2026-10-07T10:00:00.000Z",
  geaendertAm: "2026-10-07T10:00:00.000Z",
};

describe("FotoSchema: Bilder und PDF-Dokumente", () => {
  it("akzeptiert JPEG, PNG und PDF", () => {
    expect(FotoSchema.safeParse({ ...basis, dataUrl: "data:image/jpeg;base64,AAAA" }).success).toBe(true);
    expect(FotoSchema.safeParse({ ...basis, dataUrl: "data:image/png;base64,AAAA" }).success).toBe(true);
    expect(
      FotoSchema.safeParse({ ...basis, dataUrl: "data:application/pdf;base64,JVBERi0x", dateiName: "Lageplan.pdf" }).success,
    ).toBe(true);
  });
  it("lehnt andere Typen ab", () => {
    expect(FotoSchema.safeParse({ ...basis, dataUrl: "data:text/html;base64,AAAA" }).success).toBe(false);
    expect(FotoSchema.safeParse({ ...basis, dataUrl: "data:application/zip;base64,AAAA" }).success).toBe(false);
  });
});

describe("Bericht mit PDF-Dokumenten", () => {
  const d = {
    einsatzId: "b-1",
    einsatzort: "Ort",
    alarmierungZeit: "2026-10-07T10:00:00.000Z",
    einsatzTyp: "alarm",
    status: "abgeschlossen",
    dokumente: [{ name: "Lageplan <1>.pdf", aufgenommenAm: "2026-10-07T10:30:00.000Z", aufgenommenVon: "Florian Eberstalzell" }],
  } as unknown as BerichtDaten;

  it("listet die Dokumente im PDF-Layout (HTML-escaped)", () => {
    const html = renderHauptberichtHtml(d);
    expect(html).toContain("Angehängte Dokumente (PDF)");
    expect(html).toContain("Lageplan &lt;1&gt;.pdf");
    expect(html).toContain("Info-Mail");
  });
  it("kein Block ohne Dokumente", () => {
    expect(renderHauptberichtHtml({ ...d, dokumente: [] } as BerichtDaten)).not.toContain("Angehängte Dokumente");
  });
  it("Markdown fuehrt die Dokumente an", () => {
    const md = renderBerichtMarkdown(d, { bearbeiter: undefined, reserve: [] });
    expect(md).toContain("Dokumente (PDF, als Mail-Anhang)");
    expect(md).toContain("Lageplan");
  });
});

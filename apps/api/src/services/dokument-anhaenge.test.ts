import { describe, expect, it, vi } from "vitest";

const PDF_B64 = Buffer.from("%PDF-1.4\nHallo").toString("base64");

vi.mock("../couch/client.js", () => ({
  db: {
    list: vi.fn(async () => ({
      rows: [
        { doc: { _id: "foto:x:zentrale:1", type: "foto", dataUrl: `data:application/pdf;base64,${PDF_B64}`, dateiName: "Lageplan 1.pdf" } },
        { doc: { _id: "foto:x:zentrale:2", type: "foto", dataUrl: `data:application/pdf;base64,${PDF_B64}`, dateiName: "Lageplan 1.pdf" } },
        { doc: { _id: "foto:x:zentrale:3", type: "foto", dataUrl: `data:application/pdf;base64,${PDF_B64}` } },
        { doc: { _id: "foto:x:kdo:4", type: "foto", dataUrl: "data:image/jpeg;base64,AAAA" } },
      ],
    })),
  },
}));

describe("loadDokumentAnhaenge", () => {
  it("liefert nur PDFs, eindeutige Dateinamen und echte Bytes", async () => {
    const { loadDokumentAnhaenge } = await import("../routes/pdf.js");
    const out = await loadDokumentAnhaenge("einsatz:x");
    expect(out).toHaveLength(3);
    const namen = out.map((o) => o.filename);
    expect(new Set(namen.map((n) => n.toLowerCase())).size).toBe(3);
    expect(namen[0]).toBe("Lageplan 1.pdf");
    expect(namen.every((n) => n.toLowerCase().endsWith(".pdf"))).toBe(true);
    expect(out[0]!.content.toString("latin1")).toContain("%PDF-1.4");
    expect(out.every((o) => o.contentType === "application/pdf")).toBe(true);
  });
});

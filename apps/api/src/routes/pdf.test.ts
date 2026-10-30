import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * routes/pdf.ts: Personen werden gesammelt (db.fetch), die foto:-Docs beim
 * Abschluss nur EINMAL geladen und an loadDokumentAnhaenge weitergereicht.
 */

// Der erste Import von routes/pdf.js (Template, Renderer, …) ist auf langsamen/ausgelasteten
// Maschinen teuer — grosszuegiges Limit statt Flake.
vi.setConfig({ testTimeout: 90_000 });

const PDF_B64 = Buffer.from("%PDF-1.4\nHallo").toString("base64");

const list = vi.fn();
const get = vi.fn();
const fetchDocs = vi.fn();

vi.mock("../couch/client.js", () => ({
  db: {
    list: (...a: unknown[]) => list(...a),
    get: (...a: unknown[]) => get(...a),
    fetch: (...a: unknown[]) => fetchDocs(...a),
  },
}));
vi.mock("../services/pdf/generator.js", () => ({
  renderPdf: vi.fn(async () => Buffer.from("%PDF-FAKE")),
}));

const FZG = {
  _id: "fzgber:x:kdo",
  type: "fahrzeugbericht",
  fahrzeugId: "kdo",
  status: "abgeschlossen",
  mannschaft: [{ personId: 1 }, { personId: 2, atemschutzAktiv: true }],
  fahrerPersonId: 1,
  fahrzeugKdtPersonId: 3,
  kdtIstEinsatzleiter: true,
  km: { gefahrenKm: 4 },
  taetigkeitsbericht: "Text",
};

function personRow(id: number, nachname: string, vorname: string) {
  return {
    id: `person:${id}`,
    key: `person:${id}`,
    value: { rev: "1-a" },
    doc: { _id: `person:${id}`, syBosId: id, nachname, vorname },
  };
}

beforeEach(() => {
  list.mockReset();
  get.mockReset();
  fetchDocs.mockReset();
  list.mockImplementation(async (o: { startkey: string }) => {
    if (o.startkey.startsWith("fzgber:")) return { rows: [{ doc: FZG }] };
    if (o.startkey.startsWith("foto:")) {
      return {
        rows: [
          { doc: { _id: "foto:x:kdo:1", type: "foto", dataUrl: "data:image/jpeg;base64,AAAA", aufgenommenAm: "2026-10-30T10:00:00Z" } },
          { doc: { _id: "foto:x:kdo:2", type: "foto", dataUrl: `data:application/pdf;base64,${PDF_B64}`, dateiName: "Lageplan.pdf", aufgenommenAm: "2026-10-30T10:01:00Z" } },
        ],
      };
    }
    return { rows: [] };
  });
  get.mockRejectedValue(Object.assign(new Error("nf"), { statusCode: 404 }));
  fetchDocs.mockImplementation(async ({ keys }: { keys: string[] }) => ({
    rows: keys.map((k) => {
      const id = Number(k.slice("person:".length));
      if (id === 2) return { key: k, error: "not_found" }; // fehlende Person
      if (id === 5) return { id: k, key: k, value: { rev: "2-x", deleted: true }, doc: null }; // geloescht
      return personRow(id, `Nach${id}`, `Vor${id}`);
    }),
  }));
});

const EINSATZ = {
  _id: "einsatz:x",
  type: "einsatz",
  einsatzTyp: "alarm",
  status: "abgeschlossen",
  einsatzort: "Dorfstrasse 1",
  alarmierungZeit: "2026-10-30T09:00:00Z",
  reservePersonIds: [4, 5],
  bearbeiterPersonId: 6,
};

describe("buildBerichtMailAnhaenge", () => {
  it("laedt foto-Docs nur einmal und gibt sie weiter; Personen gesammelt", async () => {
    const { buildBerichtMailAnhaenge, loadDokumentAnhaenge } = await import("./pdf.js");
    const r = await buildBerichtMailAnhaenge("einsatz:x", EINSATZ);

    // foto:-Prefix genau einmal gelistet
    const fotoListen = list.mock.calls.filter((c) => (c[0] as { startkey: string }).startkey.startsWith("foto:"));
    expect(fotoListen).toHaveLength(1);
    expect(r.fotoDocs).toHaveLength(2);

    // Weiterreichen: kein weiteres Laden
    const dokumente = await loadDokumentAnhaenge("einsatz:x", r.fotoDocs);
    expect(dokumente).toHaveLength(1);
    expect(dokumente[0]!.filename).toBe("Lageplan.pdf");
    const fotoListenDanach = list.mock.calls.filter((c) => (c[0] as { startkey: string }).startkey.startsWith("foto:"));
    expect(fotoListenDanach).toHaveLength(1);

    // Personen nie einzeln per db.get
    expect(get.mock.calls.filter((c) => String(c[0]).startsWith("person:"))).toHaveLength(0);
    // buildBerichtDaten: 1 gesammelter Abruf (+ 1 fuer Markdown-Reserve/Bearbeiter)
    expect(fetchDocs.mock.calls.length).toBeLessThanOrEqual(2);
    const ersterAbruf = (fetchDocs.mock.calls[0]![0] as { keys: string[] }).keys;
    expect(new Set(ersterAbruf).size).toBe(ersterAbruf.length); // dedupliziert
    expect(ersterAbruf).toEqual(
      expect.arrayContaining(["person:1", "person:2", "person:3", "person:4", "person:5", "person:6"]),
    );
  });

  it("fehlende/geloeschte Personen fallen wie bisher auf Pers-<id> zurueck", async () => {
    const { buildBerichtMailAnhaenge } = await import("./pdf.js");
    const r = await buildBerichtMailAnhaenge("einsatz:x", EINSATZ);
    // Person 2 (nicht gefunden) in der Mannschaft des Fahrzeugs. Person 5 (geloescht, Reserve)
    // wird im Markdown wie bisher weggelassen (resolvePerson -> undefined).
    expect(r.markdown).toContain("Pers-2");
    expect(r.markdown).not.toContain("Pers-5");
    // gefundene Personen mit Klarnamen
    expect(r.markdown).toContain("Nach1 Vor1");
    expect(r.markdown).toContain("Nach4 Vor4");
  });

  it("scheitert der Personen-Abruf, bleibt der Bericht mit Pers-<id> erhalten", async () => {
    fetchDocs.mockRejectedValue(new Error("couch weg"));
    const { buildBerichtMailAnhaenge } = await import("./pdf.js");
    const r = await buildBerichtMailAnhaenge("einsatz:x", EINSATZ);
    expect(r.markdown).toContain("Pers-1");
    expect(r.pdf.length).toBeGreaterThan(0);
  });
});

describe("loadDokumentAnhaenge ohne zweiten Parameter", () => {
  it("laedt wie bisher selbst", async () => {
    const { loadDokumentAnhaenge } = await import("./pdf.js");
    const out = await loadDokumentAnhaenge("einsatz:x");
    expect(out).toHaveLength(1);
    expect(list.mock.calls.filter((c) => (c[0] as { startkey: string }).startkey.startsWith("foto:"))).toHaveLength(1);
  });
});

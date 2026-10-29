import { beforeEach, describe, expect, it, vi } from "vitest";

/** ELS-Verlauf: Tagesdokumente in der DB (gemockt, In-Memory). */

const docs = new Map<string, Record<string, unknown>>();
let revZ = 0;
let insertFehler = false;

vi.mock("../../couch/client.js", () => ({
  db: {
    get: vi.fn(async (id: string) => {
      const d = docs.get(id);
      if (!d) throw Object.assign(new Error("nf"), { statusCode: 404 });
      return structuredClone(d);
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      if (insertFehler) throw new Error("db weg");
      revZ += 1;
      docs.set(String(doc._id), { ...structuredClone(doc), _rev: `${revZ}-x` });
      return { ok: true, id: doc._id, rev: `${revZ}-x` };
    }),
    list: vi.fn(async ({ startkey, endkey }: { startkey: string; endkey: string }) => ({
      rows: [...docs.keys()]
        .filter((id) => id >= startkey && id <= endkey)
        .map((id) => ({ id, value: { rev: String(docs.get(id)?._rev) } })),
    })),
    destroy: vi.fn(async (id: string) => {
      docs.delete(id);
      return { ok: true };
    }),
  },
}));

import { leseVerlauf, merkeVerlauf, resetVerlaufState, schreibeVerlauf, wienerTag } from "./verlauf.js";

beforeEach(() => {
  docs.clear();
  revZ = 0;
  insertFehler = false;
  resetVerlaufState();
});

describe("ELS-Verlauf", () => {
  it("wienerTag nimmt die Wiener Ortszeit", () => {
    expect(wienerTag("2026-10-29T23:30:00.000Z")).toBe("2026-10-30");
    expect(wienerTag("2026-10-29T08:45:00.000Z")).toBe("2026-10-29");
  });

  it("schreibt vorgemerkte Eintraege ins Tagesdokument und haengt weitere an", async () => {
    const t = new Date();
    merkeVerlauf("einheit", { unid: "1", status: { von: "", nach: "3" } }, t);
    await schreibeVerlauf();
    merkeVerlauf("protokoll", { ergebnis: "geschrieben" }, t);
    await schreibeVerlauf();

    const doc = docs.get(`elsverlauf:${wienerTag(t.toISOString())}`);
    const eintraege = (doc?.eintraege ?? []) as Array<{ art: string }>;
    expect(eintraege.map((e) => e.art)).toEqual(["einheit", "protokoll"]);
    expect((await leseVerlauf(1)).length).toBe(2);
  });

  it("schreibt ohne Eintraege nichts", async () => {
    await schreibeVerlauf();
    expect(docs.size).toBe(0);
  });

  it("verliert bei einem DB-Fehler nichts und wirft nicht", async () => {
    insertFehler = true;
    merkeVerlauf("einheit", { unid: "1" });
    await expect(schreibeVerlauf()).resolves.toBeUndefined();
    expect(docs.size).toBe(0);

    insertFehler = false;
    await schreibeVerlauf();
    expect(docs.size).toBe(1);
    expect((await leseVerlauf(1)).length).toBe(1);
  });

  it("loescht Tagesdokumente, die aelter als 60 Tage sind", async () => {
    docs.set("elsverlauf:2020-01-01", { _id: "elsverlauf:2020-01-01", _rev: "1-a", eintraege: [] });
    merkeVerlauf("einheit", { unid: "1" });
    await schreibeVerlauf();
    expect(docs.has("elsverlauf:2020-01-01")).toBe(false);
    expect([...docs.keys()].some((id) => id === `elsverlauf:${wienerTag(new Date().toISOString())}`)).toBe(true);
  });
});

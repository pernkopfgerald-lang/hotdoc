import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mango-Indizes: Definitionen sind konsistent und ensureDatabase legt alle an
 * — ein fehlschlagender createIndex darf den Start nie blockieren.
 */

const createIndex = vi.fn();

vi.mock("nano", () => {
  const dbHandle = { createIndex: (...a: unknown[]) => createIndex(...a) };
  return {
    default: () => ({
      info: async () => ({}),
      db: {
        use: () => dbHandle,
        get: async () => ({}),
        create: async () => ({}),
      },
    }),
  };
});

vi.mock("../config.js", () => ({
  env: {
    COUCH_URL: "http://localhost:5984",
    COUCH_USER: "u",
    COUCH_PASS: "p",
    COUCH_DB: "hotdoc",
  },
}));

beforeEach(() => {
  createIndex.mockReset();
  createIndex.mockResolvedValue({ result: "created" });
});

describe("MANGO_INDIZES", () => {
  it("hat eindeutige Namen/ddocs und beginnt jeden Index mit `type`", async () => {
    const { MANGO_INDIZES } = await import("./indizes.js");
    const defs = Object.values(MANGO_INDIZES);
    expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
    expect(new Set(defs.map((d) => d.ddoc)).size).toBe(defs.length);
    for (const d of defs) expect(d.fields[0]).toBe("type");
  });

  it("deckt die Selektoren der heissen Pfade ab (alle Indexfelder im Selektor)", async () => {
    const { MANGO_INDIZES: I } = await import("./indizes.js");
    expect(I.typeAlarmierungZeit.fields).toEqual(["type", "alarmierungZeit"]); // els-poller
    expect(I.typeStatusEinsatzende.fields).toEqual(["type", "status", "einsatzende"]); // orphan
    expect(I.typeStatusHauptabschlussAm.fields).toEqual(["type", "status", "hauptabschlussAm"]); // gnadenfrist
    expect(I.typeUsername.fields).toEqual(["type", "username"]); // login
  });

  it("useIndex liefert [ddoc, name]", async () => {
    const { MANGO_INDIZES, useIndex } = await import("./indizes.js");
    expect(useIndex(MANGO_INDIZES.typeUsername)).toEqual(["idx-type-username", "type-username"]);
  });
});

describe("ensureDatabase / ensureMangoIndizes", () => {
  it("legt alle Indizes an", async () => {
    const { ensureDatabase } = await import("./client.js");
    const { MANGO_INDIZES } = await import("./indizes.js");
    await ensureDatabase();
    const angelegt = createIndex.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(angelegt.sort()).toEqual(Object.values(MANGO_INDIZES).map((d) => d.name).sort());
  });

  it("wirft nicht, wenn einzelne Indizes fehlschlagen, und legt die uebrigen trotzdem an", async () => {
    const { ensureDatabase } = await import("./client.js");
    const { MANGO_INDIZES } = await import("./indizes.js");
    createIndex.mockRejectedValueOnce(new Error("boom"));
    await expect(ensureDatabase()).resolves.toBeUndefined();
    expect(createIndex).toHaveBeenCalledTimes(Object.values(MANGO_INDIZES).length);
  });
});

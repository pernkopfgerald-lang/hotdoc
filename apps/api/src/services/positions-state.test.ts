import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Positionen: Persistenz-Drosselung (max. 1 Schreibvorgang / 30 s je Fahrzeug),
 * GET aus dem RAM, DB-Lesen nur bei Kaltstart / leerem RAM / 30-s-Sicherheitsnetz.
 */

const get = vi.fn();
const insert = vi.fn();
const fetchDocs = vi.fn();

vi.mock("../couch/client.js", () => ({
  db: {
    get: (...a: unknown[]) => get(...a),
    insert: (...a: unknown[]) => insert(...a),
    fetch: (...a: unknown[]) => fetchDocs(...a),
  },
}));

const T0 = new Date("2026-10-30T12:00:00Z");

function ping(fahrzeugId: "kdo" | "mtf", lat = 48.04, ts = new Date().toISOString()) {
  return { fahrzeugId, lat, lng: 13.99, ts } as const;
}

async function lade() {
  vi.resetModules();
  return import("./positions-state.js");
}

/** Lässt fire-and-forget-Persistenz (get -> insert) durchlaufen. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  get.mockReset();
  insert.mockReset();
  fetchDocs.mockReset();
  get.mockRejectedValue(Object.assign(new Error("nf"), { statusCode: 404 }));
  insert.mockResolvedValue({ ok: true, rev: "1-a" });
  fetchDocs.mockResolvedValue({ rows: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("setPing: Persistenz gedrosselt", () => {
  it("schreibt hoechstens alle 30 s je Fahrzeug, der RAM bleibt bei jedem Ping aktuell", async () => {
    const m = await lade();
    m.setPing(ping("kdo", 1));
    await flush();
    expect(insert).toHaveBeenCalledTimes(1);

    // 5 weitere Pings im 4-s-Takt (bis +20 s): kein weiterer Schreibvorgang
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(new Date(T0.getTime() + i * 4000));
      m.setPing(ping("kdo", 1 + i, new Date().toISOString()));
      await flush();
    }
    expect(insert).toHaveBeenCalledTimes(1);

    // RAM-Stand ist der neueste Ping
    const alle = await m.getAllPings();
    expect(alle.find((p) => p.fahrzeugId === "kdo")?.lat).toBe(6);

    // nach 30 s wieder ein Schreibvorgang
    vi.setSystemTime(new Date(T0.getTime() + 31_000));
    m.setPing(ping("kdo", 99, new Date().toISOString()));
    await flush();
    expect(insert).toHaveBeenCalledTimes(2);
    expect((insert.mock.calls[1]?.[0] as { lat: number }).lat).toBe(99);
  });

  it("drosselt je Fahrzeug getrennt", async () => {
    const m = await lade();
    m.setPing(ping("kdo"));
    m.setPing(ping("mtf"));
    await flush();
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

describe("getAllPings: aus dem RAM", () => {
  it("liest beim Kaltstart genau einmal aus der DB und danach 30 s lang nicht mehr", async () => {
    const m = await lade();
    fetchDocs.mockResolvedValue({
      rows: [
        {
          doc: {
            _id: "position:kdo",
            _rev: "3-x",
            type: "position",
            fahrzeugId: "kdo",
            lat: 48.1,
            lng: 14.0,
            ts: new Date(T0.getTime() - 60_000).toISOString(),
          },
        },
      ],
    });
    const a = await m.getAllPings();
    expect(a).toHaveLength(1);
    expect(fetchDocs).toHaveBeenCalledTimes(1);

    // Pings kommen rein, GETs im 3-s-Takt: keine weiteren DB-Reads
    for (let i = 1; i <= 8; i++) {
      vi.setSystemTime(new Date(T0.getTime() + i * 3000));
      m.setPing(ping("mtf", 48 + i / 100, new Date().toISOString()));
      await m.getAllPings();
    }
    expect(fetchDocs).toHaveBeenCalledTimes(1);

    // nach 30 s: Sicherheitsnetz liest einmal
    vi.setSystemTime(new Date(T0.getTime() + 31_000));
    m.setPing(ping("mtf", 48.5, new Date().toISOString()));
    await m.getAllPings();
    expect(fetchDocs).toHaveBeenCalledTimes(2);
  });

  it("liest bei leerem RAM erneut (gedrosselt auf 10 s), nicht bei jedem GET", async () => {
    const m = await lade();
    await m.getAllPings(); // Kaltstart-Read, nichts da
    expect(fetchDocs).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(T0.getTime() + 3000));
    await m.getAllPings();
    vi.setSystemTime(new Date(T0.getTime() + 6000));
    await m.getAllPings();
    expect(fetchDocs).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(T0.getTime() + 11_000));
    await m.getAllPings();
    expect(fetchDocs).toHaveBeenCalledTimes(2);
  });

  it("teilt einen laufenden DB-Read zwischen parallelen GETs", async () => {
    const m = await lade();
    let fertig: (v: unknown) => void = () => undefined;
    fetchDocs.mockReturnValue(new Promise((r) => (fertig = r)));
    const p = [m.getAllPings(), m.getAllPings(), m.getAllPings()];
    fertig({ rows: [] });
    await Promise.all(p);
    expect(fetchDocs).toHaveBeenCalledTimes(1);
  });

  it("neuerer persistierter Stand (z. B. andere Instanz) gewinnt gegen aelteren RAM-Stand", async () => {
    const m = await lade();
    m.setPing(ping("kdo", 1, new Date(T0.getTime() - 120_000).toISOString()));
    fetchDocs.mockResolvedValue({
      rows: [
        {
          doc: {
            type: "position",
            fahrzeugId: "kdo",
            lat: 2,
            lng: 14,
            ts: new Date(T0.getTime() - 10_000).toISOString(),
          },
        },
      ],
    });
    const alle = await m.getAllPings();
    expect(alle.find((p) => p.fahrzeugId === "kdo")?.lat).toBe(2);
  });

  it("antwortet bei DB-Fehler aus dem RAM", async () => {
    const m = await lade();
    m.setPing(ping("kdo", 7));
    fetchDocs.mockRejectedValue(new Error("couch weg"));
    const alle = await m.getAllPings();
    expect(alle).toHaveLength(1);
    expect(alle[0]?.lat).toBe(7);
  });

  it("sortiert Pings aelter als 5 min aus", async () => {
    const m = await lade();
    m.setPing(ping("kdo", 7, new Date(T0.getTime() - 6 * 60_000).toISOString()));
    expect(await m.getAllPings()).toHaveLength(0);
  });
});

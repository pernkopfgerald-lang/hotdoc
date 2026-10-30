import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthResult } from "./health.js";

/**
 * Health: 15-s-Cache mit geteiltem laufendem Abruf + oeffentliche Kurzsicht
 * ohne IP/Fehlertexte/Zaehler.
 */

const couchGet = vi.fn();
const dbList = vi.fn();
const blsState = vi.fn();

vi.mock("../config.js", () => ({
  env: {
    COUCH_DB: "hotdoc",
    COUCH_URL: "http://localhost:5984",
    COUCH_USER: "u",
    COUCH_PASS: "p",
    BLAULICHTSMS_POLL_INTERVAL_SEC: 15,
    ELS_UNITS_POLL_SEC: 65,
    ELS_EVENTS_POLL_SEC: 15,
    FCM_SERVICE_ACCOUNT_JSON: undefined,
    FCM_SERVER_KEY: undefined,
  },
  hasBlaulichtSMS: () => false,
  hasSyBos: () => false,
  hasEls: () => false,
}));
vi.mock("../couch/client.js", () => ({
  couch: { db: { get: (...a: unknown[]) => couchGet(...a) } },
  db: { list: (...a: unknown[]) => dbList(...a) },
}));
vi.mock("./els/client.js", () => ({ getTokenHinweis: () => null }));
vi.mock("./els/state.js", () => ({ getElsPollStand: () => ({}), holeSnapshot: async () => null }));
vi.mock("./state.js", () => ({
  getBlaulichtSmsState: () => blsState(),
  getSyBosState: () => ({ lastSyncAt: "x" }),
}));
vi.mock("./worker-state.js", () => ({ readWorkerState: async () => null }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
  couchGet.mockReset();
  dbList.mockReset();
  couchGet.mockResolvedValue({ doc_count: 5 });
  dbList.mockResolvedValue({ rows: [] });
  blsState.mockReset();
  blsState.mockReturnValue({ lastPollAt: "x" });
  // countActiveTablets nutzt fetch (_active_tasks)
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("collectHealthCached", () => {
  it("fuehrt die Probes nur einmal je 15 s aus", async () => {
    const { collectHealthCached } = await import("./health.js");
    const a = await collectHealthCached();
    const b = await collectHealthCached();
    expect(b).toBe(a);
    expect(couchGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-30T12:00:14Z"));
    await collectHealthCached();
    expect(couchGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-30T12:00:16Z"));
    const c = await collectHealthCached();
    expect(couchGet).toHaveBeenCalledTimes(2);
    expect(c).not.toBe(a);
  });

  it("teilt einen laufenden Abruf zwischen parallelen Aufrufern", async () => {
    let freigeben: (v: unknown) => void = () => undefined;
    couchGet.mockReturnValue(new Promise((r) => (freigeben = r)));
    const { collectHealthCached } = await import("./health.js");
    const p1 = collectHealthCached();
    const p2 = collectHealthCached();
    const p3 = collectHealthCached();
    // Zeit fuer die vorgelagerten awaits (checkEls/…) geben
    await vi.advanceTimersByTimeAsync(10);
    freigeben({ doc_count: 1 });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
    expect(couchGet).toHaveBeenCalledTimes(1);
  });

  it("cached Fehler nicht: wirft collectHealth, probiert der naechste Aufruf neu", async () => {
    blsState.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const { collectHealthCached } = await import("./health.js");
    await expect(collectHealthCached()).rejects.toThrow("boom");
    const ok = await collectHealthCached();
    expect(ok.items.length).toBeGreaterThan(0);
    expect(couchGet).toHaveBeenCalledTimes(1);
  });

  it("cached auch den Fehlerzustand eines Dienstes (kein Probe-Hagel bei Ausfall)", async () => {
    couchGet.mockRejectedValueOnce(new Error("kaputt"));
    const { collectHealthCached } = await import("./health.js");
    const a = await collectHealthCached();
    expect(a.items.find((i) => i.key === "couch")?.state).toBe("error");
    await collectHealthCached();
    expect(couchGet).toHaveBeenCalledTimes(1);
  });
});

describe("reduziereHealthFuerOeffentlich", () => {
  it("entfernt Metriken, Fehlertexte und Zaehler; behaelt key/name/state", async () => {
    const { reduziereHealthFuerOeffentlich } = await import("./health.js");
    const voll: HealthResult = {
      checkedAt: "2026-10-30T12:00:00.000Z",
      items: [
        {
          key: "sybos" as const,
          name: "syBOS",
          sub: "Personal & Material",
          state: "error" as const,
          detail: "Letzter Sync fehlgeschlagen: 403 Falsche IP · Egress-IP: 203.0.113.7",
          metrics: { egressIp: "203.0.113.7", personalCount: 12 },
        },
        { key: "couch" as const, name: "CouchDB", sub: "x", state: "ok" as const, detail: "5 Dokumente", metrics: { docCount: 5 } },
      ],
    };
    const r = reduziereHealthFuerOeffentlich(voll);
    expect(r.checkedAt).toBe(voll.checkedAt);
    expect(r.items).toEqual([
      { key: "sybos", name: "syBOS", sub: "", state: "error", detail: "Gestört" },
      { key: "couch", name: "CouchDB", sub: "", state: "ok", detail: "Betriebsbereit" },
    ]);
    const text = JSON.stringify(r);
    expect(text).not.toContain("203.0.113.7");
    expect(text).not.toContain("metrics");
    // Das Original bleibt unveraendert (Cache-Objekt!)
    expect(voll.items[0]).toHaveProperty("metrics");
  });
});

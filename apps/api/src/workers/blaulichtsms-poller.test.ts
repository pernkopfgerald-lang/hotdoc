import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BlaulichtSMS-Poller: ein geloeschter Einsatz (Tombstone -> 404) wird nicht
 * erneut angelegt, solange der Alarm in der Liste steht (Sperrliste).
 */

const docs = new Map<string, Record<string, unknown>>();
const insertCalls: Record<string, unknown>[] = [];
const push = vi.fn(async () => ({ versendet: 0, fehlgeschlagen: 0, uebersprungen: 0 }));
const listAlarms = vi.fn();
let sperrlisteLesefehler = false;

const ALARM = {
  alarmId: "bls-77",
  alarmDate: new Date().toISOString(),
  alarmText: "B2 Brand Wohnhaus",
  geolocation: { address: "Dorfstrasse 1, Eberstalzell", coordinates: { lat: 48.04, lng: 13.99 } },
};

async function lade() {
  vi.resetModules();
  vi.doMock("../couch/client.js", () => ({
    db: {
      get: vi.fn(async (id: string) => {
        if (id === "state:geloeschte-alarme" && sperrlisteLesefehler) {
          throw Object.assign(new Error("couch kaputt"), { statusCode: 500 });
        }
        const d = docs.get(id);
        if (!d) throw Object.assign(new Error("nf"), { statusCode: 404 });
        return structuredClone(d);
      }),
      insert: vi.fn(async (doc: Record<string, unknown>) => {
        docs.set(String(doc._id), structuredClone(doc));
        insertCalls.push(structuredClone(doc));
        return { ok: true, id: doc._id, rev: "1-x" };
      }),
      find: vi.fn(async () => ({ docs: [] })),
    },
  }));
  vi.doMock("../services/blaulichtsms/client.js", () => ({
    listAlarms: (...a: unknown[]) => listAlarms(...a),
  }));
  vi.doMock("../services/fcm.js", () => ({ pushAlarm: push }));
  vi.doMock("../services/wetter.js", () => ({ haengeWetterAn: vi.fn(async () => undefined) }));
  vi.doMock("../services/state.js", () => ({ recordBlaulichtSmsPoll: vi.fn() }));
  vi.doMock("../routes/geocoding.js", () => ({ isInEberstalzell: () => false }));
  return import("./blaulichtsms-poller.js");
}

beforeEach(() => {
  docs.clear();
  insertCalls.length = 0;
  push.mockClear();
  listAlarms.mockReset();
  listAlarms.mockResolvedValue([ALARM]);
  sperrlisteLesefehler = false;
});

describe("BlaulichtSMS-Poller: geloeschte Einsaetze", () => {
  it("legt einen neuen Alarm an und pusht", async () => {
    const { pollOnce } = await lade();
    const r = await pollOnce();
    expect(r.neu).toBe(1);
    expect(docs.has("einsatz:bls-77")).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("legt einen gesperrten (zuvor geloeschten) Alarm NICHT erneut an und pusht nicht", async () => {
    docs.set("state:geloeschte-alarme", {
      _id: "state:geloeschte-alarme",
      type: "state",
      alarme: { "bls-77": new Date().toISOString() },
    });
    const { pollOnce } = await lade();
    const r = await pollOnce();
    expect(r.neu).toBe(0);
    expect(docs.has("einsatz:bls-77")).toBe(false);
    expect(insertCalls).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("andere Alarme sind von der Sperre nicht betroffen", async () => {
    docs.set("state:geloeschte-alarme", {
      _id: "state:geloeschte-alarme",
      type: "state",
      alarme: { "bls-ANDERER": new Date().toISOString() },
    });
    const { pollOnce } = await lade();
    expect((await pollOnce()).neu).toBe(1);
  });

  it("abgelaufene Sperre (> 14 Tage) gilt nicht mehr", async () => {
    docs.set("state:geloeschte-alarme", {
      _id: "state:geloeschte-alarme",
      type: "state",
      alarme: { "bls-77": new Date(Date.now() - 15 * 86_400_000).toISOString() },
    });
    const { pollOnce } = await lade();
    expect((await pollOnce()).neu).toBe(1);
  });

  it("ist die Sperrliste nicht lesbar, wird der Alarm trotzdem angelegt (fail-open)", async () => {
    sperrlisteLesefehler = true;
    const { pollOnce } = await lade();
    expect((await pollOnce()).neu).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("liest die Sperrliste nicht, wenn der Einsatz schon existiert", async () => {
    docs.set("einsatz:bls-77", { _id: "einsatz:bls-77", type: "einsatz" });
    sperrlisteLesefehler = true; // wuerde bei Lesen warnen
    const { pollOnce } = await lade();
    const r = await pollOnce();
    expect(r.neu).toBe(0);
    expect(insertCalls).toHaveLength(0);
  });
});

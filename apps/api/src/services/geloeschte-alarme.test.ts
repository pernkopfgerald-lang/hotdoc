import { beforeEach, describe, expect, it, vi } from "vitest";

/** Sperrliste geloeschter Alarme: schreiben, pruefen, verfallen, Konflikte. */

const store = new Map<string, Record<string, unknown>>();
let konflikte = 0;
let leseFehler: Error | null = null;

vi.mock("../couch/client.js", () => ({
  db: {
    get: vi.fn(async (id: string) => {
      if (leseFehler) throw leseFehler;
      const d = store.get(id);
      if (!d) throw Object.assign(new Error("nf"), { statusCode: 404 });
      return structuredClone(d);
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      if (konflikte > 0) {
        konflikte--;
        throw Object.assign(new Error("conflict"), { statusCode: 409 });
      }
      store.set(String(doc._id), structuredClone(doc));
      return { ok: true };
    }),
  },
}));

const T0 = Date.parse("2026-10-30T12:00:00Z");
const TAG = 24 * 60 * 60 * 1000;

beforeEach(() => {
  store.clear();
  konflikte = 0;
  leseFehler = null;
});

describe("alarmIdsVonEinsatz", () => {
  it("sammelt alarmId + alarmIds eindeutig", async () => {
    const { alarmIdsVonEinsatz } = await import("./geloeschte-alarme.js");
    expect(alarmIdsVonEinsatz({ alarmId: "a1", alarmIds: ["a1", "a2", "", 5] })).toEqual(["a1", "a2"]);
    expect(alarmIdsVonEinsatz({})).toEqual([]);
    expect(alarmIdsVonEinsatz({ alarmId: "x" })).toEqual(["x"]);
  });
});

describe("sperreAlarme / istAlarmGesperrt", () => {
  it("sperrt Alarme und erkennt sie", async () => {
    const m = await import("./geloeschte-alarme.js");
    expect(await m.istAlarmGesperrt("a1", T0)).toBe(false);
    await m.sperreAlarme(["a1", "a2"], T0);
    expect(await m.istAlarmGesperrt("a1", T0 + 1000)).toBe(true);
    expect(await m.istAlarmGesperrt("a2", T0 + 1000)).toBe(true);
    expect(await m.istAlarmGesperrt("a3", T0 + 1000)).toBe(false);
  });

  it("die Sperre verfaellt nach 14 Tagen und wird beim naechsten Schreiben entfernt", async () => {
    const m = await import("./geloeschte-alarme.js");
    await m.sperreAlarme(["alt"], T0);
    expect(await m.istAlarmGesperrt("alt", T0 + 13 * TAG)).toBe(true);
    expect(await m.istAlarmGesperrt("alt", T0 + 15 * TAG)).toBe(false);
    await m.sperreAlarme(["neu"], T0 + 15 * TAG);
    const doc = store.get(m.GELOESCHTE_ALARME_DOC_ID) as { alarme: Record<string, string> };
    expect(Object.keys(doc.alarme)).toEqual(["neu"]);
  });

  it("behaelt bestehende Eintraege beim Hinzufuegen", async () => {
    const m = await import("./geloeschte-alarme.js");
    await m.sperreAlarme(["a1"], T0);
    await m.sperreAlarme(["a2"], T0 + TAG);
    const doc = store.get(m.GELOESCHTE_ALARME_DOC_ID) as { alarme: Record<string, string> };
    expect(Object.keys(doc.alarme).sort()).toEqual(["a1", "a2"]);
  });

  it("wiederholt bei Revisionskonflikt (409) und wirft nach 3 Fehlversuchen", async () => {
    const m = await import("./geloeschte-alarme.js");
    konflikte = 2;
    await m.sperreAlarme(["a1"], T0);
    expect(await m.istAlarmGesperrt("a1", T0)).toBe(true);
    konflikte = 3;
    await expect(m.sperreAlarme(["a2"], T0)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("Lesefehler -> nicht gesperrt (fail-open)", async () => {
    const m = await import("./geloeschte-alarme.js");
    await m.sperreAlarme(["a1"], T0);
    leseFehler = Object.assign(new Error("boom"), { statusCode: 500 });
    expect(await m.istAlarmGesperrt("a1", T0)).toBe(false);
  });

  it("leere Liste schreibt nichts", async () => {
    const m = await import("./geloeschte-alarme.js");
    await m.sperreAlarme([], T0);
    expect(store.size).toBe(0);
  });
});

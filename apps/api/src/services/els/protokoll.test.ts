import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FahrzeugFunkstatus } from "./logik.js";

/** Statusfunk -> Einsatzchronik. DB gemockt (In-Memory mit _rev/409-Verhalten). */

const docs = new Map<string, Record<string, unknown>>();
let revZ = 0;
let konfliktBeimNaechstenInsert = false;

vi.mock("../../couch/client.js", () => ({
  db: {
    find: vi.fn(async () => ({
      docs: [...docs.values()].filter((d) => d.status === "aktiv").map((d) => structuredClone(d)),
    })),
    get: vi.fn(async (id: string) => {
      const d = docs.get(id);
      if (!d) throw Object.assign(new Error("nf"), { statusCode: 404 });
      return structuredClone(d);
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      if (konfliktBeimNaechstenInsert) {
        konfliktBeimNaechstenInsert = false;
        throw Object.assign(new Error("c"), { statusCode: 409 });
      }
      revZ += 1;
      docs.set(String(doc._id), { ...structuredClone(doc), _rev: `${revZ}-x` });
      return { ok: true, id: doc._id, rev: `${revZ}-x` };
    }),
  },
}));

import { dokumentiereStatus, resetProtokollState } from "./protokoll.js";

const T0 = Date.parse("2026-10-27T12:00:00.000Z");

function st(over: Partial<FahrzeugFunkstatus> = {}): FahrzeugFunkstatus {
  return {
    fahrzeugId: "tlf-a-4000",
    callname: "TANK",
    status: "3",
    unitStatus: "FW",
    since: new Date(T0 + 60_000).toISOString(),
    lat: null,
    lng: null,
    num1: "E100",
    ...over,
  };
}

function einsatz(over: Record<string, unknown> = {}): void {
  docs.set("einsatz:x", {
    _id: "einsatz:x",
    _rev: "1-a",
    type: "einsatz",
    status: "aktiv",
    schreibschutz: false,
    alarmId: "bls-1",
    alarmIds: ["bls-1", "els-E100"],
    alarmierungZeit: new Date(T0).toISOString(),
    chronik: [],
    ...over,
  });
}

function chronik(): Array<Record<string, unknown>> {
  return (docs.get("einsatz:x")?.chronik ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  docs.clear();
  resetProtokollState();
  konfliktBeimNaechstenInsert = false;
});

describe("Statusfunk ins Einsatzprotokoll", () => {
  it("schreibt den Statuswechsel mit Meldezeit, Fahrzeug und Text in die Chronik", async () => {
    einsatz();
    const n = await dokumentiereStatus([st()], T0 + 90_000);
    expect(n).toBe(1);
    expect(chronik()).toHaveLength(1);
    expect(chronik()[0]).toMatchObject({
      zeitstempel: new Date(T0 + 60_000).toISOString(),
      funkrufname: "Tank Eberstalzell",
      fahrzeugId: "tlf-a-4000",
      source: "fahrzeug",
      text: "Funkstatus 3: Ausgerückt (Einsatz übernommen)",
    });
  });

  it("dokumentiert jede Änderung: ausgerückt, am Einsatzort, Sprechwunsch, eingerückt", async () => {
    einsatz();
    await dokumentiereStatus([st({ status: "3", since: new Date(T0 + 60_000).toISOString() })], T0 + 61_000);
    await dokumentiereStatus([st({ status: "4", since: new Date(T0 + 600_000).toISOString() })], T0 + 601_000);
    await dokumentiereStatus([st({ status: "5", since: new Date(T0 + 1_200_000).toISOString() })], T0 + 1_201_000);
    // Nach dem Einsatz meldet die Einheit keine Einsatznummer mehr
    await dokumentiereStatus(
      [st({ status: "2", num1: "", since: new Date(T0 + 3_000_000).toISOString() })],
      T0 + 3_001_000,
    );
    expect(chronik().map((c) => c.text)).toEqual([
      "Funkstatus 3: Ausgerückt (Einsatz übernommen)",
      "Funkstatus 4: Am Einsatzort eingetroffen",
      "Funkstatus 5: Sprechwunsch",
      "Funkstatus 2: Eingerückt (einsatzbereit auf Wache)",
    ]);
  });

  it("schreibt bei unverändertem Status nichts doppelt (auch nicht nach Neustart)", async () => {
    einsatz();
    await dokumentiereStatus([st()], T0 + 90_000);
    await dokumentiereStatus([st()], T0 + 150_000);
    expect(chronik()).toHaveLength(1);
    resetProtokollState(); // simuliert Neustart: Stand weg, Chronik bleibt
    await dokumentiereStatus([st()], T0 + 200_000);
    expect(chronik()).toHaveLength(1);
  });

  it("nach 'eingerückt' wird die Merkung beendet: spätere Meldungen ohne Einsatznummer landen nirgends", async () => {
    einsatz();
    await dokumentiereStatus([st({ status: "3" })], T0 + 90_000);
    await dokumentiereStatus([st({ status: "2", num1: "", since: new Date(T0 + 900_000).toISOString() })], T0 + 901_000);
    await dokumentiereStatus([st({ status: "5", num1: "", since: new Date(T0 + 1_000_000).toISOString() })], T0 + 1_001_000);
    expect(chronik().map((c) => c.text)).toHaveLength(2);
  });

  it("Wache ohne Einsatz (nie beteiligt) schreibt nichts", async () => {
    einsatz();
    const n = await dokumentiereStatus([st({ status: "2", num1: "" })], T0 + 90_000);
    expect(n).toBe(0);
    expect(chronik()).toHaveLength(0);
  });

  it("holt nach, wenn der HotDoc-Einsatz erst nach dem Statuswechsel verknüpft wird", async () => {
    einsatz({ alarmIds: ["bls-1"] }); // ELS-Nummer noch nicht vermerkt
    expect(await dokumentiereStatus([st()], T0 + 90_000)).toBe(0);
    docs.get("einsatz:x")!.alarmIds = ["bls-1", "els-E100"]; // Verknüpfung erfolgt
    expect(await dokumentiereStatus([st()], T0 + 150_000)).toBe(1);
    expect(chronik()).toHaveLength(1);
  });

  it("ignoriert Meldungen, die deutlich vor der Alarmierung liegen", async () => {
    einsatz();
    const n = await dokumentiereStatus([st({ since: new Date(T0 - 3_600_000).toISOString() })], T0 + 90_000);
    expect(n).toBe(0);
  });

  it("schreibt nicht in abgeschlossene oder gesperrte Einsätze", async () => {
    einsatz({ schreibschutz: true });
    expect(await dokumentiereStatus([st()], T0 + 90_000)).toBe(0);
    docs.clear();
    resetProtokollState();
    einsatz({ status: "abgeschlossen" });
    expect(await dokumentiereStatus([st()], T0 + 90_000)).toBe(0);
    expect(chronik()).toHaveLength(0);
  });

  it("wiederholt bei Schreibkonflikt (409) einmal mit frischem Stand", async () => {
    einsatz();
    konfliktBeimNaechstenInsert = true;
    expect(await dokumentiereStatus([st()], T0 + 90_000)).toBe(1);
    expect(chronik()).toHaveLength(1);
  });

  it("mehrere Fahrzeuge getrennt, bereits vorhandene Chronik bleibt erhalten", async () => {
    einsatz({ chronik: [{ id: "a", zeitstempel: "2026-10-27T12:00:00.000Z", text: "Alarm" }] });
    await dokumentiereStatus(
      [st(), st({ fahrzeugId: "lfa-b", callname: "PUMPE", status: "4" })],
      T0 + 90_000,
    );
    expect(chronik().map((c) => c.fahrzeugId ?? "-")).toEqual(["-", "tlf-a-4000", "lfa-b"]);
  });

  it("Fehler beim DB-Zugriff wirft nie", async () => {
    einsatz();
    const { db } = await import("../../couch/client.js");
    (db.find as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    await expect(dokumentiereStatus([st()], T0 + 90_000)).resolves.toBe(0);
  });
});

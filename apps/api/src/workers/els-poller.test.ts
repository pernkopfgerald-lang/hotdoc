import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ELS-Poller: Verknuepfen / Selbst-Anlegen / Ueberspringen. DB, ELS-Client,
 * Push und Wetter sind gemockt.
 */

const docs = new Map<string, Record<string, unknown>>();
const insertCalls: Record<string, unknown>[] = [];
const push = vi.fn(async () => ({ versendet: 0, fehlgeschlagen: 0, uebersprungen: 0 }));
const holeEventsRoh = vi.fn();
const holeUnitsRoh = vi.fn();

function jetztMinus(sec: number): string {
  // ELS liefert Wiener Ortszeit ohne Zone — hier in dieser Form erzeugen.
  const d = new Date(Date.now() - sec * 1000);
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
  return f; // "2026-10-27 13:30:00"
}

function eventRoh(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    num_1: "E100",
    exercise: "N",
    not_publish: "N",
    tycod: "T1",
    typ_eng: "Technische Hilfeleistung",
    sub_eng: "Fahrzeugbergung",
    event_alarmtext: "Auto im Graben",
    location: "Dorfstrasse 1 Eberstalzell",
    create_time: jetztMinus(400),
    firstdispatch_time: jetztMinus(300),
    latitude: 48.0,
    longitude: 14.0,
    caller_name: "Geheim Person",
    caller_number: "+43 1 2345",
    ...over,
  };
}

async function lade() {
  vi.resetModules();
  vi.doMock("../couch/client.js", () => ({
    db: {
      find: vi.fn(async () => ({ docs: [...docs.values()].map((d) => structuredClone(d)) })),
      get: vi.fn(async (id: string) => {
        const d = docs.get(id);
        if (!d) throw Object.assign(new Error("nf"), { statusCode: 404 });
        return structuredClone(d);
      }),
      insert: vi.fn(async (doc: Record<string, unknown>) => {
        const id = String(doc._id);
        if (docs.has(id) && docs.get(id)?._rev !== doc._rev && !doc._rev && !doc.alarmIds) {
          throw Object.assign(new Error("conflict"), { statusCode: 409 });
        }
        docs.set(id, structuredClone(doc));
        insertCalls.push(structuredClone(doc));
        return { ok: true, id, rev: "1-x" };
      }),
    },
  }));
  vi.doMock("../services/els/client.js", () => ({ holeEventsRoh, holeUnitsRoh }));
  vi.doMock("../services/fcm.js", () => ({ pushAlarm: push }));
  vi.doMock("../services/wetter.js", () => ({ haengeWetterAn: vi.fn(async () => undefined) }));
  vi.doMock("../routes/geocoding.js", () => ({ isInEberstalzell: () => false }));
  vi.stubEnv("ELS_REGISTER_TOKEN", "x");
  vi.stubEnv("ELS_STATION_ID", "1");
  vi.stubEnv("ELS_AUTOSTART", "1");
  vi.stubEnv("ELS_AUTOSTART_GRACE_SEC", "120");
  const poller = await import("./els-poller.js");
  const state = await import("../services/els/state.js");
  return { poller, state };
}

/** Nur Einsatz-Dokumente zaehlen (daneben liegen Sperre und Stand der ELS-Anbindung). */
function einsatzAnzahl(): number {
  return [...docs.keys()].filter((k) => k.startsWith("einsatz:")).length;
}

function vorhandenerEinsatz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "einsatz:bls-1",
    type: "einsatz",
    einsatzTyp: "alarm",
    status: "aktiv",
    alarmId: "bls-1",
    alarmIds: ["bls-1"],
    alarmierungZeit: new Date(Date.now() - 290_000).toISOString(),
    einsatzort: "",
    chronik: [],
    ...over,
  };
}

beforeEach(() => {
  docs.clear();
  insertCalls.length = 0;
  push.mockClear();
  holeEventsRoh.mockReset();
  holeUnitsRoh.mockReset();
});

describe("ELS-Poller: Einsaetze", () => {
  it("legt nach Ablauf der Wartezeit einen Einsatz an (ohne Anruferdaten) und schickt Push", async () => {
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    const { poller, state } = await lade();
    await poller.pollEventsOnce();
    const doc = docs.get("einsatz:els-E100");
    expect(doc).toBeTruthy();
    expect(doc).toMatchObject({
      type: "einsatz",
      einsatzTyp: "alarm",
      status: "aktiv",
      alarmId: "els-E100",
      alarmIds: ["els-E100"],
      einsatzort: "Dorfstrasse 1 Eberstalzell",
      koordinaten: { lat: 48, lng: 14 },
    });
    expect(String(doc?.alarmierungText)).toContain("Technische Hilfeleistung");
    expect(JSON.stringify(doc)).not.toContain("Geheim Person");
    expect(JSON.stringify(doc)).not.toContain("2345");
    expect(push).toHaveBeenCalledTimes(1);
    expect(state.getElsPollStand().angelegt).toBe(1);
  });

  it("legt VOR Ablauf der Wartezeit nichts an", async () => {
    holeEventsRoh.mockResolvedValue([eventRoh({ firstdispatch_time: jetztMinus(30) })]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    expect(einsatzAnzahl()).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("legt nicht doppelt an: zweiter Poll findet den Einsatz schon", async () => {
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    await poller.pollEventsOnce();
    expect(insertCalls.filter((d) => d._id === "einsatz:els-E100")).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("verknuepft mit einem vorhandenen (BlaulichtSMS-)Einsatz statt einen zweiten anzulegen", async () => {
    docs.set(
      "einsatz:bls-1",
      vorhandenerEinsatz({ koordinaten: { lat: 48.0005, lng: 14.0005 }, einsatzort: "Eigene Eingabe" }),
    );
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    const { poller, state } = await lade();
    await poller.pollEventsOnce();
    expect(docs.has("einsatz:els-E100")).toBe(false);
    const d = docs.get("einsatz:bls-1") as { alarmIds: string[]; einsatzort: string; chronik: unknown[] };
    expect(d.alarmIds).toEqual(["bls-1", "els-E100"]);
    expect(d.einsatzort).toBe("Eigene Eingabe"); // vorhandene Eingabe bleibt
    expect(d.chronik).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
    expect(state.getElsPollStand().verknuepft).toBe(1);
  });

  it("verknuepft auch VOR Ablauf der Wartezeit und ergaenzt leeren Einsatzort", async () => {
    docs.set(
      "einsatz:bls-1",
      vorhandenerEinsatz({ einsatzort: "", koordinaten: { lat: 48.0002, lng: 14.0002 } }),
    );
    holeEventsRoh.mockResolvedValue([eventRoh({ firstdispatch_time: jetztMinus(20) })]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    expect(docs.has("einsatz:els-E100")).toBe(false);
    const d = docs.get("einsatz:bls-1") as { alarmIds: string[]; einsatzort: string };
    expect(d.alarmIds).toEqual(["bls-1", "els-E100"]);
    expect(d.einsatzort).toBe("Dorfstrasse 1 Eberstalzell");
  });

  it("ergaenzt fehlende Koordinaten, wenn der Einsatzort-Text uebereinstimmt", async () => {
    docs.set("einsatz:bls-1", vorhandenerEinsatz({ einsatzort: "dorfstrasse 1  eberstalzell" }));
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    const d = docs.get("einsatz:bls-1") as { alarmIds: string[]; koordinaten: { lat: number; lng: number } };
    expect(d.alarmIds).toContain("els-E100");
    expect(d.koordinaten).toEqual({ lat: 48, lng: 14 });
  });

  it("ohne Koordinaten und ohne gleichen Ort gibt es keine Zuordnung", async () => {
    docs.set("einsatz:bls-1", vorhandenerEinsatz({ einsatzort: "irgendwo" }));
    holeEventsRoh.mockResolvedValue([eventRoh({ firstdispatch_time: jetztMinus(20) })]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    expect((docs.get("einsatz:bls-1") as { alarmIds: string[] }).alarmIds).toEqual(["bls-1"]);
    expect(docs.has("einsatz:els-E100")).toBe(false);
  });

  it("ueberspringt Uebungen, 'nicht veroeffentlichen', beendete und nicht alarmierte Einsaetze", async () => {
    holeEventsRoh.mockResolvedValue([
      eventRoh({ num_1: "U1", exercise: "Y" }),
      eventRoh({ num_1: "N1", not_publish: "Y" }),
      eventRoh({ num_1: "F1", free_time: jetztMinus(10) }),
      eventRoh({ num_1: "K1", firstdispatch_time: "" }),
    ]);
    const { poller, state } = await lade();
    await poller.pollEventsOnce();
    expect(einsatzAnzahl()).toBe(0);
    expect(state.getElsPollStand().eventsOffen).toBe(0);
  });

  it("ELS_AUTOSTART=0: nie selbst anlegen, aber weiter verknuepfen", async () => {
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    const { poller } = await lade();
    vi.stubEnv("ELS_AUTOSTART", "0");
    const { env } = await import("../config.js");
    (env as { ELS_AUTOSTART: string }).ELS_AUTOSTART = "0";
    await poller.pollEventsOnce();
    expect(einsatzAnzahl()).toBe(0);
  });

  it("legt keine Einsaetze an, die schon laenger als 6 h laufen", async () => {
    holeEventsRoh.mockResolvedValue([eventRoh({ firstdispatch_time: jetztMinus(7 * 3600) })]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    expect(einsatzAnzahl()).toBe(0);
  });

  it("Fehler beim Abruf: wird festgehalten, nichts angelegt, kein Wurf", async () => {
    holeEventsRoh.mockRejectedValue(new Error("ELS down"));
    const { poller, state } = await lade();
    await expect(poller.pollEventsOnce()).resolves.toBeUndefined();
    expect(state.getElsPollStand().eventsLastError).toBe("ELS down");
    expect(einsatzAnzahl()).toBe(0);
  });
});

describe("ELS-Poller: nur eine Instanz fragt ab", () => {
  it("fragt nicht ab, solange eine andere Instanz die Leihe hält", async () => {
    docs.set("state:els-leader", { _id: "state:els-leader", type: "state", holder: "andere-instanz", until: Date.now() + 60_000 });
    holeEventsRoh.mockResolvedValue([eventRoh()]);
    holeUnitsRoh.mockResolvedValue([{ unid: "1", callname: "TANK", status_florianstation: "3" }]);
    const { poller } = await lade();
    await poller.pollEventsOnce();
    await poller.pollUnitsOnce();
    expect(holeEventsRoh).not.toHaveBeenCalled();
    expect(holeUnitsRoh).not.toHaveBeenCalled();
    expect(einsatzAnzahl()).toBe(0);
  });

  it("übernimmt, wenn die Leihe der anderen Instanz abgelaufen ist", async () => {
    docs.set("state:els-leader", { _id: "state:els-leader", type: "state", holder: "andere-instanz", until: Date.now() - 1000 });
    holeUnitsRoh.mockResolvedValue([{ unid: "1", callname: "TANK", status_florianstation: "3" }]);
    const { poller } = await lade();
    await poller.pollUnitsOnce();
    expect(holeUnitsRoh).toHaveBeenCalledTimes(1);
    expect((docs.get("state:els-leader") as { holder: string }).holder).not.toBe("andere-instanz");
  });

  it("legt den Einheiten-Stand gemeinsam ab, damit andere Instanzen ihn lesen", async () => {
    holeUnitsRoh.mockResolvedValue([{ unid: "1", callname: "TANK", status_florianstation: "4", latitude: 48.1, longitude: 14.2 }]);
    const { poller, state } = await lade();
    await poller.pollUnitsOnce();
    const doc = docs.get("state:els-snapshot") as { snapshot: { status: Array<{ fahrzeugId: string }> } };
    expect(doc.snapshot.status[0]?.fahrzeugId).toBe("tlf-a-4000");
    const geteilt = await state.holeSnapshot();
    expect(geteilt?.status).toHaveLength(1);
  });
});

describe("ELS-Poller: Einheiten", () => {
  it("uebernimmt Funkstatus und Position unserer Fahrzeuge", async () => {
    holeUnitsRoh.mockResolvedValue([
      { unid: "1", callname: "TANK", status_florianstation: "4", latitude: 48.1, longitude: 14.2, lastStatusTimestamp: "2026-10-27 13:00:00" },
      { unid: "2", callname: "Fremdes Fahrzeug", status_florianstation: "1" },
    ]);
    const { poller, state } = await lade();
    await poller.pollUnitsOnce();
    const snap = state.getElsSnapshot();
    expect(snap?.status).toHaveLength(1);
    expect(snap?.status[0]).toMatchObject({ fahrzeugId: "tlf-a-4000", status: "4", lat: 48.1, lng: 14.2 });
    expect(snap?.nichtZugeordnet.map((u) => u.callname)).toEqual(["Fremdes Fahrzeug"]);
    expect(state.getElsPollStand().unitsLastError).toBeNull();
  });

  it("schreibt Statuswechsel unserer Fahrzeuge ins Protokoll des verknüpften Einsatzes", async () => {
    docs.set(
      "einsatz:bls-1",
      vorhandenerEinsatz({ alarmIds: ["bls-1", "els-E100"], alarmierungZeit: new Date(Date.now() - 600_000).toISOString() }),
    );
    holeUnitsRoh.mockResolvedValue([
      {
        unid: "1",
        callname: "TANK",
        status_florianstation: "4",
        num_1: "E100",
        lastStatusTimestamp: jetztMinus(60),
      },
    ]);
    const { poller } = await lade();
    await poller.pollUnitsOnce();
    const chronik = (docs.get("einsatz:bls-1") as { chronik: Array<{ text: string; fahrzeugId: string }> }).chronik;
    expect(chronik).toHaveLength(1);
    expect(chronik[0]).toMatchObject({ fahrzeugId: "tlf-a-4000", text: "Funkstatus 4: Am Einsatzort eingetroffen" });
  });

  it("Fehler beim Abruf lassen den letzten Stand stehen", async () => {
    holeUnitsRoh.mockResolvedValueOnce([{ unid: "1", callname: "MTF", status_florianstation: "2" }]);
    const { poller, state } = await lade();
    await poller.pollUnitsOnce();
    holeUnitsRoh.mockRejectedValueOnce(new Error("timeout"));
    await poller.pollUnitsOnce();
    expect(state.getElsSnapshot()?.status[0]?.fahrzeugId).toBe("mtf");
    expect(state.getElsPollStand().unitsLastError).toBe("timeout");
  });
});

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-Tests (echter Express-Stack, DB gemockt):
 *  - PUT /api/einsaetze/:id verwirft `chronik` und `fahrzeugPositionen` aus dem
 *    Body (nicht mehr in der Allowlist), erlaubte Felder werden gespeichert.
 *  - DELETE /api/einsaetze/:id traegt die alarmId(s) in die Sperrliste ein,
 *    BEVOR der Tombstone geschrieben wird.
 */

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const docs = new Map<string, Record<string, unknown>>();
const writeLog: Array<{ id: string; deleted: boolean }> = [];
let revZaehler = 1;

function speichere(doc: Record<string, unknown>): void {
  docs.set(String(doc._id), structuredClone({ ...doc, _rev: `${revZaehler++}-x` }));
  writeLog.push({ id: String(doc._id), deleted: doc._deleted === true });
}

vi.mock("../couch/client.js", () => ({
  db: {
    get: vi.fn(async (id: string) => {
      const d = docs.get(id);
      if (!d || d._deleted) throw Object.assign(new Error("nf"), { statusCode: 404 });
      return structuredClone(d);
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      if (doc._deleted === true) {
        writeLog.push({ id: String(doc._id), deleted: true });
        docs.delete(String(doc._id));
      } else speichere(doc);
      return { ok: true, id: doc._id, rev: "9-x" };
    }),
    bulk: vi.fn(async ({ docs: list }: { docs: Array<Record<string, unknown>> }) => {
      for (const d of list) {
        if (d._deleted === true) {
          writeLog.push({ id: String(d._id), deleted: true });
          docs.delete(String(d._id));
        } else speichere(d);
      }
      return list.map((d) => ({ id: d._id, ok: true }));
    }),
    list: vi.fn(async (o: { startkey: string }) => {
      const rows = [...docs.values()]
        .filter((d) => String(d._id).startsWith(o.startkey))
        .map((d) => ({ id: d._id, doc: structuredClone(d) }));
      return { rows };
    }),
    find: vi.fn(async () => ({ docs: [] })),
  },
}));
vi.mock("../services/auth/jwt.js", () => ({
  verifySession: vi.fn(async () => ({ sub: "u1", username: "tester", rolle: "admin" })),
}));
vi.mock("../services/audit.js", () => ({ writeAuditEvent: vi.fn(async () => undefined) }));
vi.mock("../lib/mailer.js", () => ({ sendMailWithAttachments: vi.fn(async () => undefined) }));
vi.mock("../services/wetter.js", () => ({
  haengeWetterAn: vi.fn(async () => undefined),
  wetterGueltig: () => null,
}));
vi.mock("./pdf.js", () => ({
  buildBerichtMailAnhaenge: vi.fn(),
  loadDokumentAnhaenge: vi.fn(async () => []),
}));
vi.mock("../services/bericht-nummer.js", () => ({ vergebeBerichtNummer: vi.fn() }));

const CHRONIK = [
  {
    id: "c1",
    zeitstempel: "2026-10-30T10:00:00.000Z",
    fahrzeugId: "blaulichtsms",
    typ: "auto-blaulichtsms",
    transkript: "Alarm",
    transkriptStatus: "verfuegbar",
  },
];

function einsatzDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "einsatz:bls-1",
    type: "einsatz",
    einsatzTyp: "alarm",
    alarmId: "bls-1",
    alarmIds: ["bls-1", "bls-2"],
    einsatzort: "Alt 1",
    alarmierungZeit: "2026-10-30T10:00:00.000Z",
    zeitmarken: {},
    beteiligteStellen: [],
    sonstigeAnwesendeFF: { aktive: [] },
    mannschaft: { bereitschaft: 0, sonstige: 0 },
    oelbindemittel: { verwendet: false, gesamtSaecke: 0 },
    meldungEinsatzleitung: "",
    reaktivierungen: [],
    schreibschutz: false,
    status: "aktiv",
    fahrzeugPositionen: [],
    chronik: CHRONIK,
    erstelltAm: "2026-10-30T10:00:00.000Z",
    geaendertAm: "2026-10-30T10:00:00.000Z",
    ...over,
  };
}

let server: Server;
let base = "";

beforeAll(async () => {
  const { einsaetzeRouter } = await import("./einsaetze.js");
  const app = express();
  app.use(express.json());
  app.use(einsaetzeRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  docs.clear();
  writeLog.length = 0;
  revZaehler = 1;
  speichere(einsatzDoc());
  writeLog.length = 0;
});

const H = { "Content-Type": "application/json", Authorization: "Bearer x" };

describe("PUT /api/einsaetze/:id", () => {
  it("uebernimmt erlaubte Felder, verwirft chronik und fahrzeugPositionen", async () => {
    const res = await fetch(`${base}/api/einsaetze/${encodeURIComponent("einsatz:bls-1")}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({
        einsatzort: "Neu 5",
        chronik: [],
        fahrzeugPositionen: [{ fahrzeugId: "kdo", lat: 1, lng: 2, timestamp: "2026-10-30T10:01:00.000Z" }],
      }),
    });
    expect(res.status).toBe(200);
    const gespeichert = docs.get("einsatz:bls-1") as Record<string, unknown>;
    expect(gespeichert.einsatzort).toBe("Neu 5");
    // Chronik NICHT ueberschrieben, Positionen NICHT gesetzt
    expect(gespeichert.chronik).toEqual(CHRONIK);
    expect(gespeichert.fahrzeugPositionen).toEqual([]);
  });
});

describe("DELETE /api/einsaetze/:id", () => {
  it("sperrt die alarmIds VOR dem Tombstone und loescht den Einsatz", async () => {
    const res = await fetch(`${base}/api/einsaetze/${encodeURIComponent("einsatz:bls-1")}`, {
      method: "DELETE",
      headers: H,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const sperr = docs.get("state:geloeschte-alarme") as { alarme: Record<string, string> } | undefined;
    expect(sperr).toBeDefined();
    expect(Object.keys(sperr!.alarme).sort()).toEqual(["bls-1", "bls-2"]);
    expect(docs.has("einsatz:bls-1")).toBe(false);

    // Reihenfolge: Sperrliste geschrieben, dann Tombstone
    const iSperre = writeLog.findIndex((w) => w.id === "state:geloeschte-alarme");
    const iTomb = writeLog.findIndex((w) => w.id === "einsatz:bls-1" && w.deleted);
    expect(iSperre).toBeGreaterThanOrEqual(0);
    expect(iTomb).toBeGreaterThan(iSperre);
  });

  it("loescht trotzdem, wenn die Sperrliste nicht geschrieben werden kann", async () => {
    const { db } = await import("../couch/client.js");
    const origInsert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const impl = origInsert.getMockImplementation()!;
    origInsert.mockImplementation(async (doc: Record<string, unknown>) => {
      if (doc._id === "state:geloeschte-alarme") {
        throw Object.assign(new Error("couch kaputt"), { statusCode: 500 });
      }
      return impl(doc);
    });
    try {
      const res = await fetch(`${base}/api/einsaetze/${encodeURIComponent("einsatz:bls-1")}`, {
        method: "DELETE",
        headers: H,
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      expect(docs.has("einsatz:bls-1")).toBe(false);
    } finally {
      origInsert.mockImplementation(impl);
    }
  });
});

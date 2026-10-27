import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Token-Verwaltung + Abrufe gegen einen lokalen Fake-ELS-Server. Die Datenbank
 * ist ein In-Memory-Mock (mit _rev/404/409-Verhalten wie nano).
 */

const store = new Map<string, Record<string, unknown>>();
let revZaehler = 0;

function dbMock() {
  const fehler = (statusCode: number) => Object.assign(new Error("db"), { statusCode });
  return {
    get: vi.fn(async (id: string) => {
      const d = store.get(id);
      if (!d) throw fehler(404);
      return structuredClone(d);
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      const id = String(doc._id);
      const alt = store.get(id);
      if (alt && alt._rev !== doc._rev) throw fehler(409);
      revZaehler += 1;
      const rev = `${revZaehler}-x`;
      store.set(id, { ...structuredClone(doc), _rev: rev });
      return { ok: true, id, rev };
    }),
  };
}

function jwt(expSec: number): string {
  const p = Buffer.from(JSON.stringify({ exp: expSec })).toString("base64url");
  return `h.${p}.s`;
}

let server: Server;
let baseUrl = "";
const calls = { register: 0, renew: 0, units: 0, events: 0 };
let letzterRegisterBody: Record<string, unknown> = {};
let accessGueltig = "";
let refreshGueltig = "";
let naechsterAccessExp = 0;
let registerStatus = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (status: number, obj: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "POST" && req.url === "/API/client/register") {
        calls.register += 1;
        letzterRegisterBody = JSON.parse(body);
        if (registerStatus !== 200) return json(registerStatus, {});
        accessGueltig = jwt(naechsterAccessExp);
        refreshGueltig = `refresh-${calls.register}`;
        return json(200, { access_token: accessGueltig, refresh_token: refreshGueltig, valid_until: "2030-01-01 00:00:00" });
      }
      if (req.method === "POST" && req.url === "/API/client/renew") {
        calls.renew += 1;
        if (JSON.parse(body).refresh_token !== refreshGueltig) return json(404, {});
        accessGueltig = jwt(naechsterAccessExp);
        return json(200, { access_token: accessGueltig, valid_until: "2030-01-01 00:00:00" });
      }
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${accessGueltig}`) return json(401, { statusCode: 401 });
      if (req.url === "/API/v1/export/units") {
        calls.units += 1;
        return json(200, { unit: [{ unid: "1", callname: "TANK" }] });
      }
      if (req.url === "/API/v1/export/events") {
        calls.events += 1;
        return json(200, { event: { num_1: "E1" } });
      }
      json(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function ladeClient() {
  vi.resetModules();
  vi.doMock("../../couch/client.js", () => ({ db: dbMock() }));
  vi.stubEnv("ELS_API_URL", baseUrl);
  vi.stubEnv("ELS_REGISTER_TOKEN", "register-geheim");
  vi.stubEnv("ELS_STATION_ID", "414105");
  vi.stubEnv("ELS_SYSTEM_NAME", "HotDoc");
  return import("./client.js");
}

beforeEach(() => {
  store.clear();
  calls.register = calls.renew = calls.units = calls.events = 0;
  registerStatus = 200;
  naechsterAccessExp = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
  accessGueltig = "";
  refreshGueltig = "";
});

describe("ELS-Client: Token", () => {
  it("registriert beim ersten Mal genau einmal und schickt Register-Token, Station und System", async () => {
    const c = await ladeClient();
    const t1 = await c.getAccessToken();
    const t2 = await c.getAccessToken();
    expect(t1).toBe(t2);
    expect(calls.register).toBe(1);
    expect(letzterRegisterBody).toEqual({ register_token: "register-geheim", station_id: "414105", system: "HotDoc" });
  });

  it("parallele Aufrufe loesen nur EINEN Register-Aufruf aus", async () => {
    const c = await ladeClient();
    await Promise.all([c.getAccessToken(), c.getAccessToken(), c.getAccessToken()]);
    expect(calls.register).toBe(1);
  });

  it("nach einem Neustart werden gespeicherte Token weiterverwendet (kein erneutes Register)", async () => {
    const c1 = await ladeClient();
    await c1.getAccessToken();
    expect(calls.register).toBe(1);
    const c2 = await ladeClient(); // frischer Prozess, gleiche DB
    const t = await c2.getAccessToken();
    expect(t).toBe(accessGueltig);
    expect(calls.register).toBe(1);
    expect(calls.renew).toBe(0);
  });

  it("erneuert per Refresh-Token, wenn der Access-Token bald ablaeuft (kein neues Register)", async () => {
    naechsterAccessExp = Math.floor(Date.now() / 1000) + 3600; // nur noch 1 h
    const c = await ladeClient();
    await c.getAccessToken();
    expect(calls.register).toBe(1);
    naechsterAccessExp = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
    // Zweiter Aufruf: Access laeuft in < 24 h ab -> renew. Die Refresh-Sperre
    // (60 min) gilt erst nach einer Nutzung, hier die erste.
    const t = await c.getAccessToken();
    expect(calls.renew).toBe(1);
    expect(calls.register).toBe(1);
    expect(t).toBe(accessGueltig);
  });

  it("speichert die Register-Sperre (60 min) auch bei Fehlschlag und wiederholt nicht sofort", async () => {
    registerStatus = 404;
    const c = await ladeClient();
    await expect(c.getAccessToken()).rejects.toThrow();
    expect(calls.register).toBe(1);
    await expect(c.getAccessToken()).rejects.toThrow(/gesperrt/);
    expect(calls.register).toBe(1); // zweiter Versuch geht gar nicht erst raus
    expect(c.getTokenHinweis()).not.toBe("");
  });
});

describe("ELS-Client: Abrufe", () => {
  it("holt Einheiten und Einsaetze (auch als Einzelobjekt) mit Bearer-Token", async () => {
    const c = await ladeClient();
    expect(await c.holeUnitsRoh()).toEqual([{ unid: "1", callname: "TANK" }]);
    expect(await c.holeEventsRoh()).toEqual([{ num_1: "E1" }]);
  });

  it("haelt das Abruf-Limit ein (units: 60 s)", async () => {
    const c = await ladeClient();
    await c.holeUnitsRoh();
    await expect(c.holeUnitsRoh()).rejects.toThrow(/Limit/);
    expect(calls.units).toBe(1);
  });

  it("bei 401 wird der Token genau einmal erneuert und der Abruf wiederholt", async () => {
    const c = await ladeClient();
    await c.getAccessToken(); // register
    accessGueltig = jwt(naechsterAccessExp + 5); // Server hat den Token entwertet
    const r = await c.holeEventsRoh();
    expect(r).toEqual([{ num_1: "E1" }]);
    expect(calls.renew).toBe(1);
    expect(calls.events).toBe(1);
  });
});

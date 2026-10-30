import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FCM-Push: paralleler Versand mit Obergrenze, Timeout-Signal an jedem fetch,
 * unveraenderte Rueckgabe/Stale-Behandlung. DB, Config und fetch sind gemockt.
 */

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const geraete: Array<Record<string, unknown>> = [];
const stored = new Map<string, Record<string, unknown>>();
const insertCalls: Array<Record<string, unknown>> = [];

vi.mock("../config.js", () => ({
  env: {
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "x@y.iam.gserviceaccount.com",
      private_key: privateKey,
      project_id: "proj",
    }),
  },
}));

vi.mock("../couch/client.js", () => ({
  db: {
    list: vi.fn(async () => ({ rows: geraete.map((doc) => ({ doc })) })),
    get: vi.fn(async (id: string) => {
      const d = stored.get(id);
      if (!d) throw Object.assign(new Error("missing"), { statusCode: 404 });
      return d;
    }),
    insert: vi.fn(async (doc: Record<string, unknown>) => {
      insertCalls.push(doc);
      return { ok: true };
    }),
  },
}));

function mkDevices(n: number): void {
  geraete.length = 0;
  stored.clear();
  for (let i = 0; i < n; i++) {
    const d = { _id: `device:${i}`, type: "device", fahrzeugId: "tlf", fcmToken: `tok-${i}` };
    geraete.push(d);
    stored.set(d._id, d);
  }
}

const tokenAntwort = () =>
  new Response(JSON.stringify({ access_token: "AT", expires_in: 3600 }), { status: 200 });

async function lade() {
  vi.resetModules();
  return import("./fcm.js");
}

beforeEach(() => {
  insertCalls.length = 0;
  vi.unstubAllGlobals();
});

describe("mitBegrenzterParallelitaet", () => {
  it("haelt die Obergrenze ein und behaelt die Reihenfolge", async () => {
    const { mitBegrenzterParallelitaet } = await lade();
    let aktiv = 0;
    let maxAktiv = 0;
    const res = await mitBegrenzterParallelitaet([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      aktiv++;
      maxAktiv = Math.max(maxAktiv, aktiv);
      await new Promise((r) => setTimeout(r, 5));
      aktiv--;
      if (n === 4) throw new Error("boom");
      return n * 2;
    });
    expect(maxAktiv).toBe(3);
    expect(res.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([
      2, 4, 6, "x", 10, 12, 14,
    ]);
  });
});

describe("pushAlarm", () => {
  it("sendet parallel (max. 10 gleichzeitig), zaehlt korrekt und setzt ein Timeout-Signal", async () => {
    mkDevices(25);
    let aktiv = 0;
    let maxAktiv = 0;
    const signale: Array<AbortSignal | null | undefined> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        signale.push(init?.signal);
        if (String(url).includes("token")) return tokenAntwort();
        aktiv++;
        maxAktiv = Math.max(maxAktiv, aktiv);
        await new Promise((r) => setTimeout(r, 10));
        aktiv--;
        const body = JSON.parse(String(init?.body)) as { message: { token: string } };
        // tok-3 -> 500, alle anderen ok
        return body.message.token === "tok-3"
          ? new Response("kaputt", { status: 500 })
          : new Response("{}", { status: 200 });
      }),
    );
    const { pushAlarm } = await lade();
    const r = await pushAlarm([], { data: { a: "b" } });
    expect(r).toEqual({ versendet: 24, fehlgeschlagen: 1, uebersprungen: 0 });
    expect(maxAktiv).toBeGreaterThan(1);
    expect(maxAktiv).toBeLessThanOrEqual(10);
    // Token-Request + 25 Sends: jeder fetch hat ein AbortSignal
    expect(signale.length).toBe(26);
    expect(signale.every((s) => s instanceof AbortSignal)).toBe(true);
    // 500 ist kein Stale-Grund
    expect(insertCalls).toHaveLength(0);
  });

  it("markiert Devices bei 404/UNREGISTERED als stale", async () => {
    mkDevices(3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("token")) return tokenAntwort();
        const body = JSON.parse(String(init?.body)) as { message: { token: string } };
        if (body.message.token === "tok-1") return new Response("nope", { status: 404 });
        if (body.message.token === "tok-2") return new Response("UNREGISTERED", { status: 400 });
        return new Response("{}", { status: 200 });
      }),
    );
    const { pushAlarm } = await lade();
    const r = await pushAlarm([], { data: {} });
    expect(r).toEqual({ versendet: 1, fehlgeschlagen: 2, uebersprungen: 0 });
    expect(insertCalls.map((d) => d._id).sort()).toEqual(["device:1", "device:2"]);
    expect(insertCalls.every((d) => d.stale === true)).toBe(true);
  });

  it("holt bei 401 genau einmal einen neuen Token und wiederholt (auch parallel)", async () => {
    mkDevices(6);
    let tokenAbrufe = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("token")) {
          tokenAbrufe++;
          return new Response(
            JSON.stringify({ access_token: `AT${tokenAbrufe}`, expires_in: 3600 }),
            { status: 200 },
          );
        }
        const auth = (init?.headers as Record<string, string>).Authorization;
        await new Promise((r) => setTimeout(r, 5));
        // Der erste Token (AT1) gilt als abgelaufen
        return auth === "Bearer AT1"
          ? new Response("expired", { status: 401 })
          : new Response("{}", { status: 200 });
      }),
    );
    const { pushAlarm } = await lade();
    const r = await pushAlarm([], { data: {} });
    expect(r).toEqual({ versendet: 6, fehlgeschlagen: 0, uebersprungen: 0 });
    // 1x initial + 1x Refresh (nicht 1x je Device)
    expect(tokenAbrufe).toBe(2);
  });

  it("zaehlt alle als fehlgeschlagen, wenn der OAuth-Request abbricht (Timeout)", async () => {
    mkDevices(4);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    );
    const { pushAlarm } = await lade();
    const r = await pushAlarm([], { data: {} });
    expect(r).toEqual({ versendet: 0, fehlgeschlagen: 4, uebersprungen: 0 });
  });

  it("zaehlt ein abgebrochenes Send als fehlgeschlagen, die anderen laufen weiter", async () => {
    mkDevices(3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("token")) return tokenAntwort();
        const body = JSON.parse(String(init?.body)) as { message: { token: string } };
        if (body.message.token === "tok-0") throw new DOMException("timeout", "TimeoutError");
        return new Response("{}", { status: 200 });
      }),
    );
    const { pushAlarm } = await lade();
    const r = await pushAlarm([], { data: {} });
    expect(r).toEqual({ versendet: 2, fehlgeschlagen: 1, uebersprungen: 0 });
  });
});

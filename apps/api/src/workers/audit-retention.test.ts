import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit-Retention: Der Blacklist-Cleanup laeuft IMMER (auch ohne alte
 * Audit-Events) und durchlaeuft die ganze Blacklist seitenweise, nicht nur
 * die ersten 500 Eintraege nach `sub`.
 */

interface Doc {
  _id: string;
  _rev: string;
  expiresAt?: string;
  [k: string]: unknown;
}

const store = new Map<string, Doc>();
const listCalls: Array<Record<string, unknown>> = [];

vi.mock("../config.js", () => ({ env: { AUDIT_RETENTION_DAYS: 365 } }));

vi.mock("../couch/client.js", () => ({
  db: {
    // Verhaelt sich wie CouchDB _all_docs: sortiert nach _id, inklusiver startkey,
    // exklusiv-genug endkey, limit.
    list: vi.fn(async (opts: { startkey: string; endkey: string; limit?: number }) => {
      listCalls.push(opts);
      if (opts.startkey.startsWith("audit:")) {
        return { rows: [] };
      }
      const ids = [...store.keys()]
        .filter((id) => id >= opts.startkey && id <= opts.endkey)
        .sort();
      const rows = ids.slice(0, opts.limit ?? ids.length).map((id) => ({
        id,
        key: id,
        value: { rev: store.get(id)!._rev },
        doc: store.get(id),
      }));
      return { rows };
    }),
    bulk: vi.fn(async ({ docs }: { docs: Array<{ _id: string; _deleted?: boolean }> }) => {
      for (const d of docs) if (d._deleted) store.delete(d._id);
      return docs.map((d) => ({ id: d._id, ok: true }));
    }),
  },
}));

const VERGANGEN = new Date(Date.now() - 86_400_000).toISOString();
const ZUKUNFT = new Date(Date.now() + 86_400_000).toISOString();

function put(id: string, expiresAt: string | undefined): void {
  store.set(id, { _id: id, _rev: "1-a", ...(expiresAt ? { expiresAt } : {}) });
}

async function lade() {
  return import("./audit-retention.js");
}

beforeEach(() => {
  store.clear();
  listCalls.length = 0;
});

describe("runAuditRetention", () => {
  it("raeumt die Blacklist auch dann auf, wenn es keine alten Audit-Events gibt", async () => {
    put("auth:blacklist:user:a:1", VERGANGEN);
    put("auth:blacklist:user:b:2", ZUKUNFT);
    const { runAuditRetention } = await lade();
    const r = await runAuditRetention();
    expect(r.geprueft).toBe(0);
    expect([...store.keys()]).toEqual(["auth:blacklist:user:b:2"]);
  });

  it("wirft nicht, wenn der Blacklist-Cleanup scheitert (eigener try/catch)", async () => {
    const { db } = await import("../couch/client.js");
    const listMock = db.list as unknown as ReturnType<typeof vi.fn>;
    listMock.mockResolvedValueOnce({ rows: [] }); // Audit-Teil: nichts zu loeschen
    listMock.mockRejectedValueOnce(new Error("couch weg")); // Blacklist-Teil scheitert
    const { runAuditRetention } = await lade();
    await expect(runAuditRetention()).resolves.toMatchObject({ geprueft: 0 });
  });
});

describe("cleanupExpiredBlacklist", () => {
  it("findet abgelaufene Eintraege auch hinter den ersten 500 (Sortierung nach sub)", async () => {
    // 700 gueltige Eintraege (sub "a…" sortiert vorn) + 3 abgelaufene (sub "z…").
    for (let i = 0; i < 700; i++) put(`auth:blacklist:a${String(i).padStart(4, "0")}:1`, ZUKUNFT);
    put("auth:blacklist:z1:1", VERGANGEN);
    put("auth:blacklist:z2:1", VERGANGEN);
    put("auth:blacklist:z3:1", VERGANGEN);
    const { cleanupExpiredBlacklist } = await lade();
    const n = await cleanupExpiredBlacklist();
    expect(n).toBe(3);
    expect(store.size).toBe(700);
    expect([...store.keys()].some((k) => k.includes(":z"))).toBe(false);
  });

  it("verpasst keinen Nachbarn, wenn der letzte Eintrag einer Seite geloescht wird", async () => {
    // 500 abgelaufene (genau eine volle Seite, der letzte wird geloescht) + 5 weitere
    // abgelaufene dahinter + 1 gueltiger.
    for (let i = 0; i < 505; i++) put(`auth:blacklist:e${String(i).padStart(4, "0")}:1`, VERGANGEN);
    put("auth:blacklist:g:1", ZUKUNFT);
    const { cleanupExpiredBlacklist } = await lade();
    const n = await cleanupExpiredBlacklist();
    expect(n).toBe(505);
    expect([...store.keys()]).toEqual(["auth:blacklist:g:1"]);
  });

  it("ignoriert Eintraege ohne/mit kaputtem expiresAt", async () => {
    put("auth:blacklist:x:1", undefined);
    put("auth:blacklist:y:1", "kein-datum");
    const { cleanupExpiredBlacklist } = await lade();
    expect(await cleanupExpiredBlacklist()).toBe(0);
    expect(store.size).toBe(2);
  });

  it("bricht nach der Seiten-Obergrenze ab (keine Endlosschleife)", async () => {
    // Mock liefert immer eine volle Seite mit immer demselben, gueltigen Eintrag.
    const { db } = await import("../couch/client.js");
    const voll = Array.from({ length: 500 }, (_, i) => ({
      id: `auth:blacklist:q${i}:1`,
      key: `auth:blacklist:q${i}:1`,
      value: { rev: "1-a" },
      doc: { _id: `auth:blacklist:q${i}:1`, _rev: "1-a", expiresAt: ZUKUNFT },
    }));
    const listMock = db.list as unknown as ReturnType<typeof vi.fn>;
    listMock.mockReset();
    listMock.mockResolvedValue({ rows: voll });
    const { cleanupExpiredBlacklist } = await lade();
    expect(await cleanupExpiredBlacklist()).toBe(0);
    expect(listMock).toHaveBeenCalledTimes(20);
  });
});

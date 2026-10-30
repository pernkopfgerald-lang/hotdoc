import { beforeEach, describe, expect, it, vi } from "vitest";

/** Bootstrap: Existenzpruefung per _all_docs-Range (limit 1), kein Mango-Scan. */

const list = vi.fn();
const find = vi.fn();
const insert = vi.fn(async () => ({ ok: true }));

vi.mock("../../couch/client.js", () => ({
  db: {
    list: (...a: unknown[]) => list(...a),
    find: (...a: unknown[]) => find(...a),
    insert: (...a: unknown[]) => insert(...(a as [])),
  },
}));
vi.mock("../../config.js", () => ({
  env: {
    NODE_ENV: "test",
    BOOTSTRAP_ADMIN_USERNAME: "admin",
    BOOTSTRAP_ADMIN_PASSWORD: "geheim-geheim-1",
  },
}));
vi.mock("./password.js", () => ({ hashPassword: async () => "hash" }));

beforeEach(() => {
  list.mockReset();
  find.mockReset();
  insert.mockClear();
});

describe("bootstrapInitialAdminIfMissing", () => {
  it("legt nichts an, wenn schon ein user:-Dokument existiert (nur list, nie find)", async () => {
    list.mockResolvedValue({ rows: [{ id: "user:abc" }] });
    const { bootstrapInitialAdminIfMissing } = await import("./bootstrap.js");
    await bootstrapInitialAdminIfMissing();
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toMatchObject({ startkey: "user:", limit: 1 });
    expect(list.mock.calls[0]?.[0]).not.toHaveProperty("include_docs");
    expect(find).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("legt den Admin an, wenn kein Benutzer existiert", async () => {
    list.mockResolvedValue({ rows: [] });
    const { bootstrapInitialAdminIfMissing } = await import("./bootstrap.js");
    await bootstrapInitialAdminIfMissing();
    expect(find).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const doc = (insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(doc).toMatchObject({ type: "benutzer", username: "admin", rolle: "admin" });
    expect(String(doc._id)).toMatch(/^user:/);
  });
});

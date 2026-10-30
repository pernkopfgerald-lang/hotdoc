import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySession = vi.fn();
vi.mock("../services/auth/jwt.js", () => ({ verifySession: (...a: unknown[]) => verifySession(...a) }));

beforeEach(() => verifySession.mockReset());

const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {} });

describe("getOptionalSession", () => {
  it("liefert null ohne Header, ohne Bearer und bei ungueltigem Token (kein Fehler)", async () => {
    const { getOptionalSession } = await import("./auth-middleware.js");
    verifySession.mockResolvedValue(null);
    expect(await getOptionalSession(req())).toBeNull();
    expect(await getOptionalSession(req("Basic abc"))).toBeNull();
    expect(await getOptionalSession(req("Bearer kaputt"))).toBeNull();
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it("liefert die Session bei gueltigem Token und beachtet die Mindestrolle", async () => {
    const { getOptionalSession } = await import("./auth-middleware.js");
    verifySession.mockResolvedValue({ sub: "u1", rolle: "funktionaer" });
    expect(await getOptionalSession(req("Bearer ok"), "funktionaer")).toMatchObject({ sub: "u1" });
    expect(await getOptionalSession(req("bearer ok"), "admin")).toBeNull();
    verifySession.mockResolvedValue({ sub: "t1", rolle: "mannschaft" });
    expect(await getOptionalSession(req("Bearer ok"), "funktionaer")).toBeNull();
    expect(await getOptionalSession(req("Bearer ok"))).toMatchObject({ sub: "t1" });
  });
});

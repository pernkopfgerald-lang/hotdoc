import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./jwt.js";

describe("JWT session token", () => {
  it("round-trip: signed token kann verifiziert werden", async () => {
    const { token } = await signSession({
      sub: "user:42",
      username: "gerald",
      rolle: "funktionaer",
    });
    expect(token.split(".")).toHaveLength(3);
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user:42");
    expect(payload?.username).toBe("gerald");
    expect(payload?.rolle).toBe("funktionaer");
  });

  it("gibt null bei manipuliertem Token", async () => {
    const { token } = await signSession({
      sub: "user:1",
      username: "x",
      rolle: "admin",
    });
    const broken = token.slice(0, -3) + "abc";
    expect(await verifySession(broken)).toBeNull();
  });

  it("gibt null bei nicht-existentem Token", async () => {
    expect(await verifySession("garbage")).toBeNull();
  });

  it("transport für tablet inkl. fahrzeugId", async () => {
    const { token } = await signSession({
      sub: "tablet:xyz",
      username: "tablet:lfa-b",
      rolle: "mannschaft",
      fahrzeugId: "lfa-b",
    });
    const p = await verifySession(token);
    expect(p?.fahrzeugId).toBe("lfa-b");
  });
});

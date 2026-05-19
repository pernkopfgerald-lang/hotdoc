import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("hashes + verifies correctly", async () => {
    const hash = await hashPassword("supersecret12345");
    expect(hash).not.toBe("supersecret12345");
    expect(await verifyPassword("supersecret12345", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("a-long-correct-password");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

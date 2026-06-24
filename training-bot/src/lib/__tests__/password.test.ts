import { describe, it, expect } from "vitest";
import { hash, compare } from "@/lib/password";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hashed = await hash("testpassword123");
    expect(hashed).toContain(":");
    expect(hashed.length).toBeGreaterThan(32);

    const valid = await compare("testpassword123", hashed);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hashed = await hash("correctpassword");
    const valid = await compare("wrongpassword", hashed);
    expect(valid).toBe(false);
  });

  it("produces different hashes for same password", async () => {
    const h1 = await hash("samepassword");
    const h2 = await hash("samepassword");
    expect(h1).not.toBe(h2);
  });
});

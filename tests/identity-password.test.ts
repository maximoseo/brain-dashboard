import { describe, expect, it } from "vitest";
import { hashIdentityPassword, verifyIdentityPassword } from "@/lib/identity-provider";

describe("identity password hashing", () => {
  it("verifies a password against its own bcrypt hash", async () => {
    const hash = await hashIdentityPassword("a-strong-unique-password");
    expect(await verifyIdentityPassword("a-strong-unique-password", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashIdentityPassword("a-strong-unique-password");
    expect(await verifyIdentityPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects any password when no hash has been provisioned", async () => {
    expect(await verifyIdentityPassword("anything", null)).toBe(false);
  });

  it("produces a different hash each time (bcrypt salt), both still verify", async () => {
    const hashA = await hashIdentityPassword("same-password-both-times");
    const hashB = await hashIdentityPassword("same-password-both-times");
    expect(hashA).not.toBe(hashB);
    expect(await verifyIdentityPassword("same-password-both-times", hashA)).toBe(true);
    expect(await verifyIdentityPassword("same-password-both-times", hashB)).toBe(true);
  });
});

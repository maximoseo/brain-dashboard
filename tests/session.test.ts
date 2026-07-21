import { describe, expect, it } from "vitest";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "@/lib/session";

const secret = "a-secure-session-secret-that-is-long-enough";
const now = new Date("2026-07-21T09:30:00.000Z");

describe("signed sessions", () => {
  it("accepts a valid signed, unexpired token", () => {
    const { token, payload } = createSessionToken(secret, now, "8cc6cc75-bba7-4204-8c9c-d17fd6fe1404");
    expect(verifySessionToken(token, secret, new Date(now.getTime() + 1_000))).toEqual(payload);
  });

  it("rejects any payload or signature modification", () => {
    const { token } = createSessionToken(secret, now);
    const [payload, signature] = token.split(".");
    expect(verifySessionToken(`${payload}x.${signature}`, secret, now)).toBeNull();
    expect(verifySessionToken(`${payload}.${signature.slice(0, -1)}x`, secret, now)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const { token } = createSessionToken(secret, now);
    expect(verifySessionToken(token, secret, new Date(now.getTime() + SESSION_TTL_SECONDS * 1_000))).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { authorizeRead, authorizeWrite } from "@/lib/api-auth";
import { resetEnvForTests } from "@/lib/env";

const keys = {
  read: "read-key-that-is-at-least-thirty-two-characters",
  sync: "sync-key-that-is-at-least-thirty-two-characters",
  memory: "memory-key-that-is-at-least-thirty-two-characters",
};

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-role-key-long-enough";
  process.env.BRAIN_ACCESS_PASSWORD = "strong-password";
  process.env.BRAIN_SESSION_SECRET = "session-secret-that-is-at-least-thirty-two-characters";
  process.env.BRAIN_API_READ_KEY = keys.read;
  process.env.BRAIN_SYNC_WRITE_KEY = keys.sync;
  process.env.BRAIN_MEMORY_WRITE_KEY = keys.memory;
  resetEnvForTests();
});

afterEach(() => resetEnvForTests());

describe("scoped API credentials", () => {
  it("does not accept credentials in query strings", async () => {
    const result = await authorizeRead(new NextRequest(`https://brain.example/api/inventory?key=${keys.read}`));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("cache-control")).toContain("private, no-store");
    }
  });

  it("accepts the read bearer token only for reads", async () => {
    const req = new NextRequest("https://brain.example/api/inventory", { headers: { Authorization: `Bearer ${keys.read}` } });
    expect((await authorizeRead(req)).ok).toBe(true);
    const write = await authorizeWrite(req, "sync:write");
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.response.status).toBe(403);
  });

  it("keeps sync and memory write scopes separate", async () => {
    const req = new NextRequest("https://brain.example/api/sync", { headers: { Authorization: `Bearer ${keys.sync}` } });
    expect((await authorizeWrite(req, "sync:write")).ok).toBe(true);
    const memory = await authorizeWrite(req, "memory:write");
    expect(memory.ok).toBe(false);
    if (!memory.ok) expect(memory.response.status).toBe(403);
  });
});

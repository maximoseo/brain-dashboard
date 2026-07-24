import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authorizeRead = vi.fn();
const authorizeWrite = vi.fn();
const verifyActiveSession = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const order = vi.fn();
const limit = vi.fn();
const insert = vi.fn();
const update = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  authorizeRead,
  authorizeWrite,
}));

vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return { ...actual, verifyActiveSession };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getSupabaseAdmin: () => ({ from, rpc }),
  };
});

function query(result: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = { select, eq, order, limit, insert, update };
  select.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  order.mockReturnValue(chain);
  limit.mockReturnValue(chain);
  insert.mockResolvedValue({ data: null, error: null });
  update.mockReturnValue(chain);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-role-key-long-enough";
  process.env.BRAIN_ACCESS_PASSWORD = "strong-password";
  process.env.BRAIN_SESSION_SECRET = "session-secret-that-is-at-least-thirty-two-characters";
  process.env.BRAIN_API_READ_KEY = "read-key-that-is-at-least-thirty-two-characters";
  process.env.BRAIN_SYNC_WRITE_KEY = "sync-key-that-is-at-least-thirty-two-characters";
  process.env.BRAIN_MEMORY_WRITE_KEY = "memory-key-that-is-at-least-thirty-two-characters";
  process.env.CRON_SECRET = "cron-secret";
  process.env.DASHBOARD_PROBE_ALLOWED_HOSTS = "dash.example";
  authorizeRead.mockResolvedValue({ ok: true, auth: { method: "session", actor: "operator", scope: "read" } });
  authorizeWrite.mockResolvedValue({ ok: true, auth: { method: "bearer", actor: "service:sync:write", scope: "sync:write" } });
  verifyActiveSession.mockResolvedValue(null);
  from.mockImplementation((table: string) => {
    if (table === "brain_dashboards") {
      return query({ data: [{ id: "dash-1", name: "Dash", url: "https://dash.example", status: "offline" }], error: null });
    }
    return query();
  });
  rpc.mockImplementation((name: string) => {
    if (name === "brain_validate_sync") return Promise.resolve({ data: { status: "accepted" }, error: null });
    if (name === "brain_sync_inventory") return Promise.resolve({ data: { received: 1, added: 1, updated: 0, stale: 0 }, error: null });
    if (name === "brain_schema_version") return Promise.resolve({ data: 3, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe("review follow-up hardening", () => {
  it("keeps public readiness details behind read authorization while liveness stays public", async () => {
    const { GET } = await import("@/app/api/health/route");
    const live = await GET(new NextRequest("https://brain.example/api/health?mode=live"));
    expect(live.status).toBe(200);

    authorizeRead.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
    const ready = await GET(new NextRequest("https://brain.example/api/health"));
    expect(ready.status).toBe(401);
    expect(rpc).not.toHaveBeenCalledWith("brain_schema_version");
  });

  it("requires agent-bound sync snapshot metadata before mutating inventory", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(new NextRequest("https://brain.example/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bot: "agent-1", assets: [{ type: "skill", name: "Research skill" }] }),
    }));
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalledWith("brain_sync_inventory", expect.anything());
  });

  it("validates sync snapshot metadata before applying inventory", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(new NextRequest("https://brain.example/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bot: "agent-1",
        credential_hash: "a".repeat(64),
        snapshot_uuid: "11111111-1111-4111-8111-111111111111",
        sequence: 7,
        digest: "b".repeat(64),
        destructive: false,
        assets: [{ type: "skill", name: "Research skill" }],
      }),
    }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("brain_validate_sync", expect.objectContaining({
      p_bot_name: "agent-1",
      p_credential_hash: "a".repeat(64),
      p_sequence: 7,
      p_digest: "b".repeat(64),
      p_asset_count: 1,
      p_is_destructive: false,
    }));
    expect(rpc).toHaveBeenCalledWith("brain_sync_inventory", expect.anything());
  });

  it("rejects replay or stale sync snapshots before applying inventory", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "brain_validate_sync") return Promise.resolve({ data: { status: "rejected_replay", detail: { reason: "duplicate_snapshot_uuid" } }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(new NextRequest("https://brain.example/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bot: "agent-1",
        credential_hash: "a".repeat(64),
        snapshot_uuid: "11111111-1111-4111-8111-111111111111",
        sequence: 7,
        digest: "b".repeat(64),
        assets: [{ type: "skill", name: "Research skill" }],
      }),
    }));
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalledWith("brain_sync_inventory", expect.anything());
  });

  it("probes all registered dashboards and refuses automatic redirects", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://dash.example/next" } })) as typeof fetch;
    const { POST } = await import("@/app/api/probe/route");
    const res = await POST(new NextRequest("https://brain.example/api/probe", { method: "POST", headers: { authorization: "Bearer cron-secret" } }));
    expect(res.status).toBe(200);
    expect(eq).not.toHaveBeenCalledWith("status", "live");
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "manual" }));
  });
});

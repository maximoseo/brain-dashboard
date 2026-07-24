import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authorizeRead = vi.fn();
const from = vi.fn();
const select = vi.fn();
const order = vi.fn();
const limit = vi.fn();
const eq = vi.fn();
const lt = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  authorizeRead,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

function chain(result: unknown = { data: [], error: null }) {
  const query: Record<string, unknown> = { select, order, limit, eq, lt };
  select.mockReturnValue(query);
  order.mockReturnValue(query);
  limit.mockReturnValue(query);
  eq.mockReturnValue(query);
  lt.mockReturnValue(query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeRead.mockResolvedValue({ ok: true, auth: { method: "session", actor: "operator", scope: "read" } });
  from.mockImplementation(() => chain());
});

describe("activity API", () => {
  it("requires read authorization before touching activity data", async () => {
    authorizeRead.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
    const { GET } = await import("@/app/api/activity/route");
    const res = await GET(new NextRequest("https://brain.example/api/activity"));
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("queries brain_activity with a bounded limit", async () => {
    const { GET } = await import("@/app/api/activity/route");
    const res = await GET(new NextRequest("https://brain.example/api/activity?limit=25"));
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("brain_activity");
    expect(limit).toHaveBeenCalledWith(100);
    expect(limit).toHaveBeenCalledWith(25);
  });

  it("rejects unbounded activity limits", async () => {
    const { GET } = await import("@/app/api/activity/route");
    const res = await GET(new NextRequest("https://brain.example/api/activity?limit=1000"));
    expect(res.status).toBe(422);
  });
});

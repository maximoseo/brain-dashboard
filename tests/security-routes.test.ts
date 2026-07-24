import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authorizeRead = vi.fn();
const verifyActiveSession = vi.fn();
const revokeSession = vi.fn();
const rpc = vi.fn();
const sendAlert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  authorizeRead,
  authorizeWrite: vi.fn(),
}));

vi.mock("@/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return {
    ...actual,
    verifyActiveSession,
    revokeSession,
  };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    getSupabaseAdmin: () => ({ rpc }),
  };
});

vi.mock("@/lib/telegram-alert", () => ({
  sendAlert,
}));

beforeEach(() => {
  vi.clearAllMocks();
  authorizeRead.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) });
  verifyActiveSession.mockResolvedValue(null);
  revokeSession.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
  sendAlert.mockResolvedValue(true);
});

describe("security route hardening", () => {
  it("uses a __Host-prefixed session cookie", async () => {
    const { SESSION_COOKIE } = await import("@/lib/session");
    expect(SESSION_COOKIE).toBe("__Host-brain_session");
  });

  it("rejects cross-origin session DELETE requests", async () => {
    const { DELETE } = await import("@/app/api/auth/session/route");
    const res = await DELETE(new NextRequest("https://brain.example/api/auth/session", {
      method: "DELETE",
      headers: { origin: "https://evil.example" },
    }));
    expect(res.status).toBe(403);
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("requires read authorization for the overview API", async () => {
    const { GET } = await import("@/app/api/overview/route");
    const res = await GET(new NextRequest("https://brain.example/api/overview"));
    expect(res.status).toBe(401);
    expect(authorizeRead).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated alert submissions before sending notifications", async () => {
    const { POST } = await import("@/app/api/alert/route");
    const res = await POST(new NextRequest("https://brain.example/api/alert", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://brain.example" },
      body: JSON.stringify({ severity: "error", title: "Client error", details: "Boom" }),
    }));
    expect(res.status).toBe(401);
    expect(verifyActiveSession).toHaveBeenCalledTimes(1);
    expect(sendAlert).not.toHaveBeenCalled();
  });
});

import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

const PROBE_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function constantTimeEqual(value: string, expected: string): boolean {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Only probe hosts explicitly allowlisted — prevents SSRF.
function isAllowedHost(hostname: string): boolean {
  const allowlist = (process.env.DASHBOARD_PROBE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;
  const host = hostname.toLowerCase();
  // Strict allowlist: exact host OR `*.allowed` for subdomains. Bare suffix matches
  // like `attacker.example.com` against `example.com` are explicit and intended.
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// Block private/loopback/link-local IPs (defense in depth beyond allowlist).
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith("169.254.")) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) are bracketed in URLs.
  if (/^\[fd[0-9a-f]{2}:/i.test(h) || /^\[fe80:/i.test(h)) return true;
  // IPv6 mapped/compat IPv4 (::ffff:127.0.0.1, ::127.0.0.1) are bracketed.
  if (/^\[(::ffff:0?\.0?\.0?\.0?|\ufff0::|::ffff:)/i.test(h)) return true;
  return false;
}

interface ProbeResult {
  dashboard_id: string;
  status: "online" | "degraded" | "offline" | "auth_required" | "dns_error" | "tls_error" | "timeout";
  http_status: number | null;
  latency_ms: number | null;
  detail: Record<string, unknown>;
}

interface FetchAttempt {
  url: string;
  started: number;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
}

async function attemptFetch(attempt: FetchAttempt): Promise<Response> {
  return fetch(attempt.url, {
    method: "GET",
    redirect: "manual",
    signal: attempt.controller.signal,
    headers: { "User-Agent": "BrainDashboard-Probe/1.0" },
  });
}

async function probeDashboard(url: string): Promise<Omit<ProbeResult, "dashboard_id">> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "dns_error", http_status: null, latency_ms: null, detail: { error: "invalid_url" } };
  }
  if (parsed.protocol !== "https:") {
    return { status: "dns_error", http_status: null, latency_ms: null, detail: { error: "https_required" } };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { status: "dns_error", http_status: null, latency_ms: null, detail: { error: "private_host_blocked" } };
  }
  if (!isAllowedHost(parsed.hostname)) {
    return { status: "dns_error", http_status: null, latency_ms: null, detail: { error: "host_not_allowlisted" } };
  }

  const started = Date.now();
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await attemptFetch({ url: currentUrl, started, controller, timer });
      const httpStatus = response.status;
      // Follow redirects manually so we re-validate every host.
      if (httpStatus >= 300 && httpStatus < 400) {
        clearTimeout(timer);
        if (hop === MAX_REDIRECTS) {
          return {
            status: "degraded",
            http_status: httpStatus,
            latency_ms: Date.now() - started,
            detail: { error: "redirect_limit" },
          };
        }
        const location = response.headers.get("location");
        if (!location) {
          return {
            status: "degraded",
            http_status: httpStatus,
            latency_ms: Date.now() - started,
            detail: { error: "redirect_without_location" },
          };
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return {
            status: "degraded",
            http_status: httpStatus,
            latency_ms: Date.now() - started,
            detail: { error: "redirect_invalid_location" },
          };
        }
        if (nextUrl.protocol !== "https:") {
          return {
            status: "degraded",
            http_status: httpStatus,
            latency_ms: Date.now() - started,
            detail: { error: "redirect_https_only" },
          };
        }
        if (isPrivateHost(nextUrl.hostname) || !isAllowedHost(nextUrl.hostname)) {
          return {
            status: "degraded",
            http_status: httpStatus,
            latency_ms: Date.now() - started,
            detail: { error: "redirect_target_blocked" },
          };
        }
        // Consume the body to avoid leaking sockets; we only need headers here.
        await response.body?.cancel().catch(() => undefined);
        currentUrl = nextUrl.toString();
        continue;
      }

      const latency = Date.now() - started;
      if (httpStatus >= 200 && httpStatus < 400) {
        return { status: "online", http_status: httpStatus, latency_ms: latency, detail: {} };
      }
      if (httpStatus === 401 || httpStatus === 403) {
        return { status: "auth_required", http_status: httpStatus, latency_ms: latency, detail: {} };
      }
      if (httpStatus >= 500) {
        return { status: "offline", http_status: httpStatus, latency_ms: latency, detail: {} };
      }
      return { status: "degraded", http_status: httpStatus, latency_ms: latency, detail: {} };
    } catch (err) {
      clearTimeout(timer);
      const latency = Date.now() - started;
      const message = err instanceof Error ? err.message : "unknown";
      if (message.includes("abort") || message.includes("timeout")) {
        return { status: "timeout", http_status: null, latency_ms: latency, detail: { error: "timeout" } };
      }
      if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
        return { status: "dns_error", http_status: null, latency_ms: latency, detail: { error: "dns" } };
      }
      if (message.includes("CERT") || message.includes("TLS") || message.includes("SSL")) {
        return { status: "tls_error", http_status: null, latency_ms: latency, detail: { error: "tls" } };
      }
      return { status: "offline", http_status: null, latency_ms: latency, detail: { error: message.slice(0, 200) } };
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable: hop count exhausted without a non-redirect response.
  return { status: "degraded", http_status: null, latency_ms: Date.now() - started, detail: { error: "redirect_loop_or_limit" } };
}

interface CronAuthOk {
  ok: true;
}
interface CronAuthFail {
  ok: false;
  response: import("next/server").NextResponse;
}
type CronAuth = CronAuthOk | CronAuthFail;

function authorizeCronRequest(req: NextRequest): CronAuth {
  const env = getServerEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32) {
    const id = requestId(req);
    return {
      ok: false,
      response: jsonPrivate({ error: "cron_unconfigured", requestId: id }, { status: 503 }),
    };
  }
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!header || !constantTimeEqual(header, cronSecret)) {
    const id = requestId(req);
    return {
      ok: false,
      response: jsonPrivate({ error: "unauthorized", requestId: id }, { status: 401 }),
    };
  }
  return { ok: true };
}

interface DashboardRow {
  id: string;
  name: string;
  url: string;
  status: string;
}

async function runProbeSweep(id: string) {
  const db = getSupabaseAdmin();
  const { data: dashboards, error } = await db
    .from("brain_dashboards")
    .select("id, name, url, status")
    .eq("status", "live");
  if (error) {
    return jsonPrivate(
      { error: "db_unavailable", requestId: id },
      { status: 503 },
    );
  }

  const results: ProbeResult[] = [];
  for (const dash of (dashboards ?? []) as DashboardRow[]) {
    const probe = await probeDashboard(dash.url);
    results.push({ dashboard_id: dash.id, ...probe });

    // Persist the raw probe outcome for audit and trend analysis.
    await db.from("brain_dashboard_probes").insert({
      dashboard_id: dash.id,
      status: probe.status,
      http_status: probe.http_status,
      latency_ms: probe.latency_ms,
      detail: probe.detail,
    });

    // Promote/demote the dashboard status using the last 3 probes.
    const { data: recent } = await db
      .from("brain_dashboard_probes")
      .select("status")
      .eq("dashboard_id", dash.id)
      .order("probed_at", { ascending: false })
      .limit(3);

    const statuses = (recent ?? []).map((r: { status: string }) => r.status);
    const allOffline = statuses.length >= 3 && statuses.every(
      (s: string) => s === "offline" || s === "dns_error" || s === "timeout",
    );
    const anyDegraded = statuses.some(
      (s: string) => s === "degraded" || s === "tls_error" || s === "auth_required",
    );

    let newStatus = "live";
    if (allOffline) newStatus = "offline";
    else if (anyDegraded) newStatus = "degraded";

    if (newStatus !== dash.status) {
      await db.from("brain_dashboards").update({ status: newStatus }).eq("id", dash.id);
    }
  }

  return jsonPrivate({
    ok: true,
    probed: results.length,
    results: results.map((r) => ({
      id: r.dashboard_id,
      status: r.status,
      http: r.http_status,
      ms: r.latency_ms,
    })),
    requestId: id,
  });
}

// Vercel cron sends GET. Earlier contracts exported only POST and the schedule
// was effectively dead. Both methods now require the same `CRON_SECRET` bearer.
export async function GET(req: NextRequest) {
  const id = requestId(req);
  try {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) return auth.response;
    return await runProbeSweep(id);
  } catch (error) {
    return serverError(req, "/api/probe", error);
  }
}

export async function POST(req: NextRequest) {
  const id = requestId(req);
  try {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) return auth.response;
    return await runProbeSweep(id);
  } catch (error) {
    return serverError(req, "/api/probe", error);
  }
}

import { NextRequest } from "next/server";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

const PROBE_TIMEOUT_MS = 10_000;

// Only probe hosts explicitly allowlisted — prevents SSRF.
function isAllowedHost(hostname: string): boolean {
  const allowlist = (process.env.DASHBOARD_PROBE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;
  const host = hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// Block private/loopback/link-local IPs (defense in depth beyond allowlist).
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith("169.254.") || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  return false;
}

interface ProbeResult {
  dashboard_id: string;
  status: "online" | "degraded" | "offline" | "auth_required" | "dns_error" | "tls_error" | "timeout";
  http_status: number | null;
  latency_ms: number | null;
  detail: Record<string, unknown>;
}

async function probeDashboard(url: string): Promise<Omit<ProbeResult, "dashboard_id">> {
  const started = Date.now();
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "BrainDashboard-Probe/1.0" },
    });
    const latency = Date.now() - started;
    const httpStatus = response.status;

    if (httpStatus >= 300 && httpStatus < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "degraded", http_status: httpStatus, latency_ms: latency, detail: { error: "redirect_without_location" } };
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, parsed);
      } catch {
        return { status: "dns_error", http_status: httpStatus, latency_ms: latency, detail: { error: "invalid_redirect" } };
      }
      if (redirectUrl.protocol !== "https:" || isPrivateHost(redirectUrl.hostname) || !isAllowedHost(redirectUrl.hostname)) {
        return { status: "dns_error", http_status: httpStatus, latency_ms: latency, detail: { error: "blocked_redirect" } };
      }
      return { status: "degraded", http_status: httpStatus, latency_ms: latency, detail: { redirect: redirectUrl.origin } };
    }

    if (httpStatus >= 200 && httpStatus < 300) {
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

export async function POST(req: NextRequest) {
  const id = requestId(req);
  try {
    // Auth: CRON_SECRET bearer
    getServerEnv();
    const cronSecret = process.env.CRON_SECRET ?? "";
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!cronSecret || bearer !== cronSecret) {
      return jsonPrivate({ error: "unauthorized", requestId: id }, { status: 401 });
    }

    const db = getSupabaseAdmin();
    const { data: dashboards, error } = await db
      .from("brain_dashboards")
      .select("id, name, url, status");

    if (error) {
      return jsonPrivate({ error: "db_unavailable", detail: error.message, requestId: id }, { status: 503 });
    }

    const results: ProbeResult[] = [];
    for (const dash of dashboards ?? []) {
      const probe = await probeDashboard(dash.url);
      results.push({ dashboard_id: dash.id, ...probe });

      // Store probe result
      await db.from("brain_dashboard_probes").insert({
        dashboard_id: dash.id,
        status: probe.status,
        http_status: probe.http_status,
        latency_ms: probe.latency_ms,
        detail: probe.detail,
      });

      // Update dashboard status based on last 3 probes
      const { data: recent } = await db
        .from("brain_dashboard_probes")
        .select("status")
        .eq("dashboard_id", dash.id)
        .order("probed_at", { ascending: false })
        .limit(3);

      const statuses = (recent ?? []).map((r: { status: string }) => r.status);
      const allOffline = statuses.length >= 3 && statuses.every((s: string) => s === "offline" || s === "dns_error" || s === "timeout");
      const anyDegraded = statuses.some((s: string) => s === "degraded" || s === "tls_error");

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
      results: results.map((r) => ({ id: r.dashboard_id, status: r.status, http: r.http_status, ms: r.latency_ms })),
      requestId: id,
    });
  } catch (error) {
    return serverError(req, "/api/probe", error);
  }
}

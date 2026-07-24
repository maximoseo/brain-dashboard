import { NextRequest } from "next/server";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const admin = getSupabaseAdmin();
    const [{ data, error }, { data: probes, error: probeError }] = await Promise.all([
      admin.from("brain_dashboards").select("*").order("name").limit(500),
      admin.from("brain_dashboard_probes").select("dashboard_id,status,http_status,latency_ms,probed_at").order("probed_at", { ascending: false }).limit(1000),
    ]);
    if (error) throw new Error(`Dashboard query failed: ${error.message}`);
    if (probeError) throw new Error(`Dashboard probe query failed: ${probeError.message}`);

    const leaseSeconds = Math.min(3600, Math.max(60, Number(process.env.BRAIN_DASHBOARD_LEASE_SECONDS) || 300));
    const cutoff = Date.now() - leaseSeconds * 1000;
    const latestProbe = new Map<string, NonNullable<typeof probes>[number]>();
    for (const probe of probes ?? []) if (!latestProbe.has(probe.dashboard_id)) latestProbe.set(probe.dashboard_id, probe);

    const dashboards = (data ?? []).map((dashboard) => {
      const probe = latestProbe.get(dashboard.id);
      const observedAt = probe?.probed_at ?? null;
      const fresh = observedAt ? new Date(observedAt).getTime() >= cutoff : false;
      const status = !fresh ? "degraded" : probe?.status === "online" || probe?.status === "auth_required" ? "live" : probe?.status === "degraded" ? "degraded" : "offline";
      return { ...dashboard, source_status: dashboard.status, status, observed_at: observedAt,
        status_reason: !probe ? "no_probe" : !fresh ? "probe_lease_expired" : probe.status,
        lease_seconds: leaseSeconds, http_status: probe?.http_status ?? null, latency_ms: probe?.latency_ms ?? null };
    });
    return jsonPrivate({ dashboards, expectedDashboardCount: 16, registeredDashboardCount: dashboards.length });
  } catch (error) {
    return serverError(req, "/api/dashboards", error);
  }
}

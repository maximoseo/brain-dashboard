"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatRelative, isStale, normalizeStatus } from "@/lib/presentation";
import type { Agent, Asset, Dashboard, InventoryResponse, ProcessRecord } from "@/types/domain";

interface AgentsResponse { bots?: Agent[]; agents?: Agent[] }
interface DashboardsResponse { dashboards?: Dashboard[] }
interface ProcessesResponse { processes?: ProcessRecord[] }

// Heartbeat and probe SLAs. Past these, agents and dashboards are flagged as
// stale even if their persisted `status` is still "online"/"live".
const AGENT_HEARTBEAT_SLA_HOURS = 24;
const DASHBOARD_PROBE_SLA_HOURS = 6;

function hoursAgo(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / 3_600_000;
}

function freshTimestamp(iso: string | null | undefined, slaHours: number, now: number): {
  label: string;
  tone: "ok" | "warn" | "stale";
} {
  if (!iso) return { label: "no signal", tone: "stale" };
  const hours = hoursAgo(iso, now);
  if (hours === null) return { label: "no signal", tone: "stale" };
  if (hours <= slaHours) return { label: `${formatRelative(iso)} (within ${slaHours}h)`, tone: "ok" };
  if (hours <= slaHours * 3) return { label: `${formatRelative(iso)} (over SLA)`, tone: "warn" };
  return { label: `${formatRelative(iso)} (stale)`, tone: "stale" };
}

export function OverviewView() {
  const inventory = useApi<InventoryResponse>("/api/inventory?summary=true&pageSize=24");
  const agentsResponse = useApi<AgentsResponse>("/api/bots");
  const dashboardsResponse = useApi<DashboardsResponse>("/api/dashboards");
  const processesResponse = useApi<ProcessesResponse>("/api/processes");

  const assets: Asset[] = inventory.data?.items ?? inventory.data?.data ?? inventory.data?._all ?? [];
  const agents = agentsResponse.data?.agents ?? agentsResponse.data?.bots ?? [];
  const dashboards = dashboardsResponse.data?.dashboards ?? [];
  const processes = processesResponse.data?.processes ?? [];
  const loading = inventory.loading && agentsResponse.loading && dashboardsResponse.loading;
  const errors = [inventory.error, agentsResponse.error, dashboardsResponse.error, processesResponse.error].filter(Boolean) as string[];

  if (loading) return <LoadingState label="Loading ecosystem health…" />;
  if (errors.length === 4) return <ErrorState message={errors[0]} onRetry={() => { inventory.reload(); agentsResponse.reload(); dashboardsResponse.reload(); processesResponse.reload(); }} />;

  // Pin a single "now" so relative labels and the freshness timestamp agree.
  const now = Date.now();

  // Healthy means: persisted status is up AND recent heartbeat/probe is
  // within the SLA. Persisted "online"/"live" alone is not enough.
  const healthyAgents = agents.filter((agent) => {
    const status = normalizeStatus(agent.status);
    if (!["online", "healthy", "active"].includes(status)) return false;
    const hours = hoursAgo(agent.last_seen, now);
    return hours !== null && hours <= AGENT_HEARTBEAT_SLA_HOURS;
  }).length;
  const onlineDashboards = dashboards.filter((dashboard) => {
    const status = normalizeStatus(dashboard.status);
    if (!["online", "healthy", "active", "ok", "live"].includes(status)) return false;
    const hours = hoursAgo(dashboard.updated_at ?? undefined, now);
    return hours === null ? status === "live" : hours <= DASHBOARD_PROBE_SLA_HOURS;
  }).length;

  const staleAssets = inventory.data?.summary?.stale ?? assets.filter((asset) => isStale(asset.updated_at ?? asset.created_at)).length;
  const activeMcp = inventory.data?.summary?.activeMcp ?? assets.filter((asset) => asset.type === "mcp" && asset.enabled !== false).length;
  const publishedProcesses = processes.length;

  // Pick the most recent timestamp across the four data sources as the "last updated" indicator.
  const lastUpdated = useMemo(() => {
    const candidates: (string | null | undefined)[] = [
      assets[0]?.updated_at,
      agents[0]?.last_seen,
      processes[0]?.updated_at,
    ];
    let latest: number | null = null;
    for (const c of candidates) {
      const t = c ? new Date(c).getTime() : NaN;
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
    return latest;
  }, [assets, agents, processes]);
  const lastUpdatedLabel = lastUpdated ? `Updated ${formatRelative(new Date(lastUpdated).toISOString())}` : "Awaiting first sync";

  // Identify the cards that need operator attention.
  const staleAgents = agents
    .map((agent) => {
      const status = normalizeStatus(agent.status);
      const stale = !["online", "healthy", "active"].includes(status) || (hoursAgo(agent.last_seen, now) ?? Infinity) > AGENT_HEARTBEAT_SLA_HOURS;
      return { agent, status, stale };
    })
    .filter((row) => row.stale)
    .slice(0, 3);
  const assetAttention = assets.filter((asset) => isStale(asset.updated_at ?? asset.created_at)).slice(0, 4);

  const cards: Array<{ label: string; value: number; note: string; href: string; icon: IconName; tone: string }> = [
    { label: "Total capabilities", value: inventory.data?.total ?? inventory.data?.count ?? assets.length, note: "Across the connected ecosystem", href: "/inventory", icon: "box", tone: "violet" },
    { label: "Healthy agents", value: healthyAgents, note: `${agents.length} registered · SLA ${AGENT_HEARTBEAT_SLA_HOURS}h`, href: "/agents", icon: "agent", tone: "green" },
    { label: "Stale records", value: staleAssets, note: "Not verified in the last 30 days", href: "/inventory?freshness=stale", icon: "alert", tone: staleAssets > 0 ? "amber" : "green" },
    { label: "Active MCP servers", value: activeMcp, note: "Enabled integration endpoints", href: "/inventory?type=mcp", icon: "server", tone: "blue" },
    { label: "Dashboards online", value: onlineDashboards, note: `${dashboards.length} registered · probe SLA ${DASHBOARD_PROBE_SLA_HOURS}h`, href: "/dashboards", icon: "dashboard", tone: "green" },
    { label: "Published processes", value: publishedProcesses, note: `${processes.length} operational runbooks`, href: "/processes", icon: "process", tone: "violet" },
  ];

  return (
    <>
      <PageHeader eyebrow="Operations" title="Ecosystem overview" description="Monitor capability coverage, agent health, and operational freshness across your workspace." actions={<Link className="button primary" href="/inventory"><Icon name="box" size={17} />Explore inventory</Link>} />
      {errors.length > 0 && <InlineNotice>Some sources are unavailable. Available data is shown; refresh the affected view to try again.</InlineNotice>}

      <section aria-labelledby="health-title">
        <div className="section-heading"><div><p className="eyebrow">At a glance</p><h2 id="health-title">Workspace health</h2></div><span className="section-meta" aria-live="polite">{lastUpdatedLabel}</span></div>
        <div className="health-grid">
          {cards.map((card) => (
            <Link className="health-card" href={card.href} key={card.label}>
              <span className={`health-icon ${card.tone}`}><Icon name={card.icon} size={20} /></span>
              <span className="health-value">{card.value.toLocaleString("en-US")}</span>
              <strong>{card.label}</strong><small>{card.note}</small>
              <span className="card-link">View details <Icon name="arrow" size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      <div className="overview-columns">
        <section className="panel" aria-labelledby="attention-title">
          <div className="panel-header"><div><p className="eyebrow">Review queue</p><h2 id="attention-title">Needs attention</h2></div><Link href="/inventory?freshness=stale">View all</Link></div>
          {staleAgents.length === 0 && assetAttention.length === 0 ? (
            <EmptyState icon="check" title="Everything looks current" description="No stale capabilities or unhealthy agents need review." />
          ) : (
            <div className="list-stack">
              {staleAgents.map(({ agent, status }) => {
                const fresh = freshTimestamp(agent.last_seen, AGENT_HEARTBEAT_SLA_HOURS, now);
                return (
                  <Link className="list-row" href="/agents" key={agent.id}>
                    <span className={`status-indicator ${fresh.tone === "ok" ? "warning" : "danger"}`} />
                    <span>
                      <strong>{agent.name}</strong>
                      <small>Status: {status} · Last signal {fresh.label}</small>
                    </span>
                    <Icon name="chevron" size={17} />
                  </Link>
                );
              })}
              {assetAttention.map((asset) => (
                <Link className="list-row" href={`/inventory?search=${encodeURIComponent(asset.name)}`} key={asset.id}>
                  <span className="status-indicator warning" />
                  <span>
                    <strong>{asset.name}</strong>
                    <small>Last verified {formatRelative(asset.updated_at ?? asset.created_at)}</small>
                  </span>
                  <Icon name="chevron" size={17} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="coverage-title">
          <div className="panel-header"><div><p className="eyebrow">Coverage</p><h2 id="coverage-title">Capabilities by type</h2></div><Link href="/inventory">Full catalog</Link></div>
          <div className="coverage-list">
            {(["skill", "plugin", "cli", "mcp", "design"] as const).map((type) => {
              const count = inventory.data?.summary?.byType[type] ?? assets.filter((asset) => asset.type === type).length;
              const total = inventory.data?.total ?? assets.length;
              const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
              const safePercentage = Math.max(0, Math.min(100, percentage));
              const labelType = type === "cli" ? "CLI tools" : type === "mcp" ? "MCP servers" : `${type[0].toUpperCase()}${type.slice(1)}s`;
              return (
                <div className="coverage-row" key={type}>
                  <div><strong>{labelType}</strong><span>{count}</span></div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`${labelType} — ${count} of ${total} capabilities`}
                    aria-valuenow={safePercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${safePercentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

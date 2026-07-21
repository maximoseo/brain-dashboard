"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatRelative, isStale, normalizeStatus } from "@/lib/presentation";
import type { Agent, Asset, Dashboard, InventoryResponse, ProcessRecord } from "@/types/domain";

interface AgentsResponse { bots?: Agent[]; agents?: Agent[] }
interface DashboardsResponse { dashboards?: Dashboard[] }
interface ProcessesResponse { processes?: ProcessRecord[] }

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

  const healthyAgents = agents.filter((agent) => ["online", "healthy", "active"].includes(normalizeStatus(agent.status))).length;
  const staleAssets = inventory.data?.summary?.stale ?? assets.filter((asset) => isStale(asset.updated_at ?? asset.created_at)).length;
  const onlineDashboards = dashboards.filter((dashboard) => ["online", "healthy", "active", "ok", "live"].includes(normalizeStatus(dashboard.status))).length;
  const activeMcp = inventory.data?.summary?.activeMcp ?? assets.filter((asset) => asset.type === "mcp" && asset.enabled !== false).length;
  const publishedProcesses = processes.filter((process) => normalizeStatus(process.status, "published") === "published").length;

  const cards: Array<{ label: string; value: number; note: string; href: string; icon: IconName; tone: string }> = [
    { label: "Total capabilities", value: inventory.data?.total ?? inventory.data?.count ?? assets.length, note: "Across the connected ecosystem", href: "/inventory", icon: "box", tone: "violet" },
    { label: "Healthy agents", value: healthyAgents, note: `${agents.length} registered agents`, href: "/agents", icon: "agent", tone: "green" },
    { label: "Stale records", value: staleAssets, note: "Not verified in the last 30 days", href: "/inventory?freshness=stale", icon: "alert", tone: staleAssets > 0 ? "amber" : "green" },
    { label: "Active MCP servers", value: activeMcp, note: "Enabled integration endpoints", href: "/inventory?type=mcp", icon: "server", tone: "blue" },
    { label: "Dashboards online", value: onlineDashboards, note: `${dashboards.length} registered dashboards`, href: "/dashboards", icon: "dashboard", tone: "green" },
    { label: "Published processes", value: publishedProcesses, note: `${processes.length} operational runbooks`, href: "/processes", icon: "process", tone: "violet" },
  ];

  const agentAttention = agents.filter((agent) => !["online", "healthy", "active"].includes(normalizeStatus(agent.status))).slice(0, 3);
  const assetAttention = assets.filter((asset) => isStale(asset.updated_at ?? asset.created_at)).slice(0, 4);

  return (
    <>
      <PageHeader eyebrow="Operations" title="Ecosystem overview" description="Monitor capability coverage, agent health, and operational freshness across your workspace." actions={<Link className="button primary" href="/inventory"><Icon name="box" size={17} />Explore inventory</Link>} />
      {errors.length > 0 && <InlineNotice>Some sources are unavailable. Available data is shown; refresh the affected view to try again.</InlineNotice>}

      <section aria-labelledby="health-title">
        <div className="section-heading"><div><p className="eyebrow">At a glance</p><h2 id="health-title">Workspace health</h2></div><span className="section-meta" aria-live="polite">Updated just now</span></div>
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
          {agentAttention.length === 0 && assetAttention.length === 0 ? (
            <EmptyState icon="check" title="Everything looks current" description="No stale capabilities or unhealthy agents need review." />
          ) : (
            <div className="list-stack">
              {agentAttention.map((agent) => <Link className="list-row" href="/agents" key={agent.id}><span className="status-indicator danger" /><span><strong>{agent.name}</strong><small>Agent status: {normalizeStatus(agent.status)}</small></span><Icon name="chevron" size={17} /></Link>)}
              {assetAttention.map((asset) => <Link className="list-row" href={`/inventory?search=${encodeURIComponent(asset.name)}`} key={asset.id}><span className="status-indicator warning" /><span><strong>{asset.name}</strong><small>Last verified {formatRelative(asset.updated_at ?? asset.created_at)}</small></span><Icon name="chevron" size={17} /></Link>)}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="coverage-title">
          <div className="panel-header"><div><p className="eyebrow">Coverage</p><h2 id="coverage-title">Capabilities by type</h2></div><Link href="/inventory">Full catalog</Link></div>
          <div className="coverage-list">
            {["skill", "plugin", "cli", "mcp", "design"].map((type) => {
              const count = inventory.data?.summary?.byType[type] ?? assets.filter((asset) => asset.type === type).length;
              const percentage = assets.length ? Math.round(count / assets.length * 100) : 0;
              return <div className="coverage-row" key={type}><div><strong>{type === "cli" ? "CLI tools" : type === "mcp" ? "MCP servers" : `${type[0].toUpperCase()}${type.slice(1)}s`}</strong><span>{count}</span></div><div className="progress" aria-label={`${percentage}% of capabilities`}><span style={{ width: `${percentage}%` }} /></div></div>;
            })}
          </div>
        </section>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate, formatRelative } from "@/lib/presentation";
import type { Agent, Asset, InventoryResponse, ProcessRecord } from "@/types/domain";

interface AgentsResponse { bots?: Agent[]; agents?: Agent[] }
interface ProcessesResponse { processes?: ProcessRecord[] }
interface ActivityEvent { id: string; title: string; description: string; time: string; href: string; icon: IconName; type: string }

export function ActivityView() {
  // Request a larger, time-sorted page so the activity timeline is not
  // silently truncated by the inventory default (which sorts by name).
  const inventory = useApi<InventoryResponse>("/api/inventory?pageSize=50&sort=updated_at&direction=desc");
  const agentsResponse = useApi<AgentsResponse>("/api/bots");
  const processesResponse = useApi<ProcessesResponse>("/api/processes");
  const loading = inventory.loading && agentsResponse.loading && processesResponse.loading;
  const errors = [inventory.error, agentsResponse.error, processesResponse.error].filter(Boolean) as string[];
  if (loading) return <LoadingState label="Loading activity…" />;
  if (errors.length === 3) return <ErrorState message={errors[0]} onRetry={() => { inventory.reload(); agentsResponse.reload(); processesResponse.reload(); }} />;

  const assets: Asset[] = inventory.data?.items ?? inventory.data?.data ?? inventory.data?._all ?? [];
  const agents = agentsResponse.data?.agents ?? agentsResponse.data?.bots ?? [];
  const processes = processesResponse.data?.processes ?? [];
  const events: ActivityEvent[] = [
    ...assets.filter((asset) => asset.updated_at ?? asset.created_at).map((asset) => ({ id: `asset-${asset.id}`, title: asset.name, description: `${asset.type.toUpperCase()} capability updated by ${asset.owner || "an unknown owner"}.`, time: (asset.updated_at ?? asset.created_at) as string, href: `/inventory?search=${encodeURIComponent(asset.name)}`, icon: "box" as IconName, type: "Inventory" })),
    ...agents.filter((agent) => agent.last_seen).map((agent) => ({ id: `agent-${agent.id}`, title: `${agent.name} reported in`, description: `Agent status is ${agent.status || "unknown"}.`, time: agent.last_seen as string, href: "/agents", icon: "agent" as IconName, type: "Agent" })),
    ...processes.filter((process) => process.updated_at).map((process) => ({ id: `process-${process.id}`, title: process.title, description: "Process documentation was updated.", time: process.updated_at as string, href: "/processes", icon: "process" as IconName, type: "Process" })),
  ]
    .filter((event) => !Number.isNaN(new Date(event.time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 50);

  return (
    <>
      <PageHeader eyebrow="Operational timeline" title="Activity" description="Review recent capability updates, agent signals, and process changes across the workspace." actions={<button className="button secondary" type="button" onClick={() => { inventory.reload(); agentsResponse.reload(); processesResponse.reload(); }}><Icon name="refresh" size={17} />Refresh</button>} />
      {errors.length > 0 && <InlineNotice>Activity is incomplete because one or more data sources could not be reached.</InlineNotice>}
      {events.length === 0 ? <EmptyState icon="activity" title="No recent activity" description="Agent signals and registry updates will appear here when timestamped activity is available." /> : <ol className="activity-timeline">{events.map((event) => <li key={event.id}><span className="timeline-icon"><Icon name={event.icon} size={18} /></span><Link href={event.href}><div className="activity-header"><span className="type-badge">{event.type}</span><time dateTime={event.time} title={formatDate(event.time)}>{formatRelative(event.time)}</time></div><h2>{event.title}</h2><p>{event.description}</p></Link></li>)}</ol>}
    </>
  );
}

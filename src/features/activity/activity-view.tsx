"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate, formatRelative, titleCase } from "@/lib/presentation";

interface ActivityEvent {
  id: number;
  event_type: string;
  actor: string;
  summary: string;
  detail?: Record<string, unknown>;
  created_at: string;
}

interface ActivityResponse { events?: ActivityEvent[]; nextCursor?: number | null }

function iconForEvent(type: string): IconName {
  const normalized = type.toLowerCase();
  if (normalized.includes("agent") || normalized.includes("bot")) return "agent";
  if (normalized.includes("process") || normalized.includes("workflow")) return "process";
  if (normalized.includes("dashboard")) return "dashboard";
  if (normalized.includes("memory") || normalized.includes("knowledge")) return "memory";
  if (normalized.includes("sync") || normalized.includes("inventory")) return "box";
  return "activity";
}

function eventDetail(detail?: Record<string, unknown>) {
  if (!detail || Object.keys(detail).length === 0) return "No additional detail was recorded.";
  const entries = Object.entries(detail).slice(0, 3).map(([key, value]) => `${titleCase(key)}: ${String(value).slice(0, 90)}`);
  return entries.join(" · ");
}

export function ActivityView() {
  const response = useApi<ActivityResponse>("/api/activity");
  if (response.loading) return <LoadingState label="Loading activity…" />;
  if (response.error) return <ErrorState message={response.error} onRetry={response.reload} />;
  const events = response.data?.events ?? [];

  return (
    <>
      <PageHeader eyebrow="Operational timeline" title="Activity" description="Review recorded workspace events from the activity ledger." actions={<button className="button secondary" type="button" onClick={response.reload}><Icon name="refresh" size={17} />Refresh</button>} />
      <div className="results-announcement sr-only" role="status" aria-live="polite">{events.length} activity events loaded.</div>
      {events.length === 0 ? <EmptyState icon="activity" title="No recent activity" description="Agent signals, sync operations, and registry changes will appear here when the activity ledger records events." /> : <ol className="activity-timeline">{events.map((event) => <li key={event.id}><span className="timeline-icon"><Icon name={iconForEvent(event.event_type)} size={18} /></span><article><div className="activity-header"><span className="type-badge">{titleCase(event.event_type)}</span><time dateTime={event.created_at} title={formatDate(event.created_at)}>{formatRelative(event.created_at)}</time></div><h2>{event.summary}</h2><p>{eventDetail(event.detail)}</p><small className="section-meta">Actor: {event.actor || "system"}</small></article></li>)}</ol>}
    </>
  );
}

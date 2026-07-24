"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate, formatRelative, isSafeExternalUrl, normalizeStatus, titleCase } from "@/lib/presentation";
import type { Agent } from "@/types/domain";

interface AgentsResponse { bots?: Agent[]; agents?: Agent[] }

export function AgentsView() {
  const response = useApi<AgentsResponse>("/api/bots");
  if (response.loading) return <LoadingState label="Loading agents…" />;
  if (response.error) return <ErrorState message={response.error} onRetry={response.reload} />;
  const agents = response.data?.agents ?? response.data?.bots ?? [];
  const online = agents.filter((agent) => ["online", "healthy", "active"].includes(normalizeStatus(agent.status))).length;

  return (
    <>
      <PageHeader eyebrow="Fleet health" title="Agents" description="Track runtime health, model assignments, and recent signals from every connected agent." actions={<button className="button secondary" type="button" onClick={response.reload}><Icon name="refresh" size={17} />Refresh</button>} />
      <div className="summary-strip" role="status" aria-live="polite"><div><span className="summary-value">{agents.length}</span><span>Registered</span></div><div><span className="summary-value success-text">{online}</span><span>Healthy</span></div><div><span className="summary-value warning-text">{agents.length - online}</span><span>Needs attention</span></div></div>
      {agents.length === 0 ? <EmptyState icon="agent" title="No agents registered" description="Connect an agent and complete its first inventory sync to see fleet health here." /> : (
        <div className="entity-grid">
          {agents.map((agent) => {
            const status = normalizeStatus(agent.status);
            const healthy = ["online", "healthy", "active"].includes(status);
            return (
              <article className="entity-card agent-card" key={agent.id}>
                <div className="entity-card-header"><span className="entity-icon"><Icon name="agent" size={22} /></span><span className={`status-badge ${healthy ? "success" : status === "offline" ? "danger" : "warning"}`}><span className="status-indicator" aria-hidden="true" />{titleCase(status)}</span></div>
                <div><h2>{agent.name}</h2><p className="entity-subtitle">{titleCase(agent.kind || "agent")}</p></div>
                <dl className="entity-details stacked"><div><dt>Model</dt><dd>{agent.model || "Not reported"}</dd></div><div><dt>Last signal</dt><dd title={formatDate(agent.last_seen)}>{formatRelative(agent.last_seen)}</dd></div><div><dt>Runtime endpoint</dt><dd>{isSafeExternalUrl(agent.base_url) ? <a className="external-link" href={agent.base_url} target="_blank" rel="noopener noreferrer" aria-label={`Open endpoint for ${agent.name} in a new tab`}>Open endpoint <span className="sr-only">in a new tab</span> <Icon name="external" size={14} /></a> : "Not available"}</dd></div></dl>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

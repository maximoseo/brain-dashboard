"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { isSafeExternalUrl, normalizeStatus, titleCase } from "@/lib/presentation";
import type { Dashboard } from "@/types/domain";

interface DashboardsResponse { dashboards?: Dashboard[] }

export function DashboardsView() {
  const response = useApi<DashboardsResponse>("/api/dashboards");
  if (response.loading) return <LoadingState label="Loading dashboards…" />;
  if (response.error) return <ErrorState message={response.error} onRetry={response.reload} />;
  const dashboards = response.data?.dashboards ?? [];

  return (
    <>
      <PageHeader eyebrow="Service directory" title="Dashboards" description="Open trusted operational dashboards and review their ownership and availability." actions={<button className="button secondary" type="button" onClick={response.reload}><Icon name="refresh" size={17} />Check status</button>} />
      {dashboards.length === 0 ? <EmptyState icon="dashboard" title="No dashboards registered" description="Registered service dashboards will appear here with their health and ownership details." /> : (
        <div className="entity-grid">
          {dashboards.map((dashboard) => {
            const status = normalizeStatus(dashboard.status);
            const healthy = ["online", "healthy", "active", "ok", "live"].includes(status);
            const safeUrl = isSafeExternalUrl(dashboard.url);
            return (
              <article className="entity-card dashboard-card" key={dashboard.id}>
                <div className="entity-card-header"><span className="entity-icon"><Icon name="dashboard" size={22} /></span><span className={`status-badge ${healthy ? "success" : status === "offline" ? "danger" : "warning"}`}><span className="status-indicator" aria-hidden="true" />{titleCase(status)}</span></div>
                <div><p className="eyebrow">{dashboard.category || "Operations"}</p><h2>{dashboard.name}</h2><p className="entity-subtitle">Owned by {dashboard.owner || "Unassigned"}</p></div>
                {safeUrl ? <a className="button primary full-width" href={dashboard.url} target="_blank" rel="noopener noreferrer" aria-label={`Open dashboard ${dashboard.name} in a new tab`}>Open dashboard <span className="sr-only">in a new tab</span> <Icon name="external" size={16} /></a> : <span className="button disabled full-width" aria-disabled="true">URL unavailable</span>}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

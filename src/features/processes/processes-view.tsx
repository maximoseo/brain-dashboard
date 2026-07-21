"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate, normalizeStatus, titleCase } from "@/lib/presentation";
import type { ProcessRecord } from "@/types/domain";

interface ProcessesResponse { processes?: ProcessRecord[] }

export function ProcessesView() {
  const response = useApi<ProcessesResponse>("/api/processes");
  if (response.loading) return <LoadingState label="Loading processes…" />;
  if (response.error) return <ErrorState message={response.error} onRetry={response.reload} />;
  const processes = response.data?.processes ?? [];

  return (
    <>
      <PageHeader eyebrow="Operational playbooks" title="Processes" description="Browse reviewed runbooks and repeatable workflows for operating the agent ecosystem." actions={<button className="button secondary" type="button" onClick={response.reload}><Icon name="refresh" size={17} />Refresh</button>} />
      {processes.length === 0 ? <EmptyState icon="process" title="No processes published" description="Documented runbooks will appear here after they are added to the process registry." /> : <div className="process-list">{processes.map((process) => { const status = normalizeStatus(process.status, "published"); return <article className="process-card" id={process.slug} key={process.id}><div className="process-main"><div className="process-title-row"><span className="entity-icon"><Icon name="process" size={20} /></span><div><h2>{process.title}</h2><p>{process.description || process.body?.slice(0, 180) || "No summary provided."}</p></div></div>{process.tags && process.tags.length > 0 && <div className="tag-list" aria-label="Process tags">{process.tags.map((tag) => <span className="type-badge" key={tag}>{tag}</span>)}</div>}</div><dl className="process-meta"><div><dt>Status</dt><dd><span className={`status-badge ${status === "published" ? "success" : "warning"}`}>{titleCase(status)}</span></dd></div><div><dt>Owner</dt><dd>{process.owner || "Unassigned"}</dd></div><div><dt>Last reviewed</dt><dd>{formatDate(process.updated_at, { month: "short", day: "numeric", year: "numeric" })}</dd></div></dl></article>; })}</div>}
    </>
  );
}

"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/presentation";
import type { MemoryFact } from "@/types/domain";

interface MemoryResponse { facts?: MemoryFact[] }

export function MemoryView() {
  const response = useApi<MemoryResponse>("/api/memory?scope=global");
  if (response.loading) return <LoadingState label="Loading memory facts…" />;
  if (response.error) return <ErrorState message={response.error} onRetry={response.reload} />;
  const facts = response.data?.facts ?? [];

  return (
    <>
      <PageHeader eyebrow="Durable context" title="Memory" description="Review long-lived facts shared by connected agents across the global workspace scope." actions={<button className="button secondary" type="button" onClick={response.reload}><Icon name="refresh" size={17} />Refresh</button>} />
      {facts.length === 0 ? <EmptyState icon="memory" title="No memory facts saved" description="Facts written by connected agents to the global scope will appear here." /> : <div className="entity-grid">{facts.map((fact) => <article className="entity-card memory-card" key={fact.id}><div className="entity-card-header"><span className="entity-icon"><Icon name="memory" size={21} /></span><span className="type-badge">{fact.scope || "global"}</span></div><h2>{fact.key}</h2><pre>{fact.value}</pre><dl className="entity-details"><div><dt>Source</dt><dd>{fact.source || "Unknown"}</dd></div><div><dt>Updated</dt><dd>{formatDate(fact.updated_at, { month: "short", day: "numeric", year: "numeric" })}</dd></div></dl></article>)}</div>}
    </>
  );
}

"use client";

import { FormEvent, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { isSafeExternalUrl, titleCase } from "@/lib/presentation";
import type { KnowledgeResult } from "@/types/domain";

interface SourceOutcome {
  source: string;
  status: "ok" | "unconfigured" | "failed";
  count: number;
  latencyMs: number;
  error?: string;
}

interface KnowledgeResponse { results?: KnowledgeResult[]; count?: number; sources?: SourceOutcome[]; error?: string }

function sourceTone(status: SourceOutcome["status"]) {
  if (status === "ok") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export function KnowledgeView() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [sources, setSources] = useState<SourceOutcome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (!value) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setSubmitted(value); setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/knowledge?q=${encodeURIComponent(value)}`, { signal: controller.current.signal, cache: "no-store" });
      const body = await response.json().catch(() => ({})) as KnowledgeResponse;
      if (!response.ok) throw new Error(body.error || `Search failed with status ${response.status}`);
      setResults(body.results ?? []);
      setSources(body.sources ?? []);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setResults([]); setSources([]); setError(reason instanceof Error ? reason.message : "Knowledge search failed.");
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Unified search" title="Knowledge" description="Search capabilities, operational memory, processes, and configured knowledge providers from one place." />
      <form className="knowledge-search" onSubmit={search} role="search"><label htmlFor="knowledge-query">Search workspace knowledge</label><div className="search-composer"><span className="input-with-icon"><Icon name="search" size={20} /><input id="knowledge-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about an agent, process, tool, or project" type="search" autoComplete="off" /></span><button className="button primary" type="submit" disabled={!query.trim() || loading}>{loading ? "Searching…" : "Search"}</button></div><p>Sources: inventory, memory, processes, and configured external providers.</p></form>
      <div className="results-announcement sr-only" role="status" aria-live="polite">{loading ? "Searching knowledge sources." : submitted ? `${results.length} results for ${submitted}. ${sources.length} source statuses loaded.` : ""}</div>
      {sources.length > 0 && <section className="source-health" aria-labelledby="source-health-title"><div className="section-heading compact-heading"><div><p className="eyebrow">Source health</p><h2 id="source-health-title">Search coverage</h2></div></div><div className="source-health-grid">{sources.map((source) => <article className="source-health-card" key={source.source}><div><strong>{titleCase(source.source)}</strong><small>{source.latencyMs} ms</small></div><span className={`status-badge ${sourceTone(source.status)}`}>{titleCase(source.status)}</span><p>{source.status === "ok" ? `${source.count} result${source.count === 1 ? "" : "s"}` : source.error || "Not configured for this workspace."}</p></article>)}</div></section>}
      {error ? <ErrorState message={error} onRetry={() => search()} /> : loading ? <div className="search-loading" role="status"><span className="spinner" aria-hidden="true" /><div><strong>Searching connected sources</strong><p>Results will be grouped by their originating system.</p></div></div> : !submitted ? <EmptyState icon="search" title="Search your operational knowledge" description="Enter a topic above to search the registry and every configured knowledge source." /> : results.length === 0 ? <EmptyState icon="search" title="No results found" description={`No connected source returned a match for “${submitted}”. Try a broader search term.`} /> : (
        <section aria-labelledby="knowledge-results"><div className="section-heading compact-heading"><div><h2 id="knowledge-results">Search results</h2><p className="result-count">{results.length} result{results.length === 1 ? "" : "s"} for “{submitted}”</p></div></div><div className="knowledge-results">{results.map((result, index) => <article className="knowledge-result" key={`${result.source}-${result.title}-${index}`}><div className="knowledge-result-header"><span className="type-badge">{titleCase(result.source)}</span>{typeof result.score === "number" && <span className="confidence">{Math.round(result.score * 100)}% relevance</span>}</div><h3>{result.title || "Untitled result"}</h3><p>{result.snippet || "No preview is available for this result."}</p>{isSafeExternalUrl(result.url) && <a className="external-link" href={result.url} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${result.title || "untitled result"} in a new tab`}>Open source <span className="sr-only">in a new tab</span> <Icon name="external" size={14} /></a>}</article>)}</div></section>
      )}
    </>
  );
}

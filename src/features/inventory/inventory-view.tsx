"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { useApi } from "@/lib/use-api";
import { formatDate, isSafeExternalUrl, isStale, titleCase } from "@/lib/presentation";
import type { Asset, InventoryResponse } from "@/types/domain";

const assetTypes = ["skill", "plugin", "cli", "mcp", "design"];
const pageSizes = [12, 24, 48];

function csvValue(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function InventoryView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [type, setType] = useState(searchParams.get("type") ?? "all");
  const [owner, setOwner] = useState(searchParams.get("owner") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [freshness, setFreshness] = useState(searchParams.get("freshness") ?? "all");
  const [source, setSource] = useState(searchParams.get("source") ?? "all");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "name");
  const [direction, setDirection] = useState(searchParams.get("direction") ?? "asc");
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1));
  const [pageSize, setPageSize] = useState(Number(searchParams.get("pageSize")) || 12);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, direction });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (type !== "all") params.set("type", type);
    if (owner) params.set("owner", owner);
    if (status !== "all") params.set("status", status);
    if (freshness !== "all") params.set("freshness", freshness);
    if (source !== "all") params.set("source", source);
    return params;
  }, [debouncedSearch, direction, freshness, owner, page, pageSize, sort, source, status, type]);

  useEffect(() => { router.replace(`/inventory?${query.toString()}`, { scroll: false }); }, [query, router]);
  const response = useApi<InventoryResponse>(`/api/inventory?${query.toString()}`);

  const normalized = useMemo(() => {
    const serverItems = response.data?.items ?? response.data?.data;
    const legacyItems = response.data?._all ?? [];
    const serverPaginated = Array.isArray(serverItems);
    let items = [...(serverItems ?? legacyItems)];

    if (!serverPaginated) {
      const needle = debouncedSearch.toLowerCase();
      items = items.filter((asset) => {
        const matchesSearch = !needle || [asset.name, asset.description, asset.owner, asset.source].some((value) => value?.toLowerCase().includes(needle));
        const matchesType = type === "all" || asset.type === type;
        const matchesOwner = !owner || asset.owner?.toLowerCase().includes(owner.toLowerCase());
        const matchesStatus = status === "all" || (status === "enabled" ? asset.enabled !== false : asset.enabled === false);
        const stale = isStale(asset.updated_at ?? asset.created_at);
        const matchesFreshness = freshness === "all" || (freshness === "stale" ? stale : !stale);
        const external = isSafeExternalUrl(asset.source);
        const matchesSource = source === "all" || (source === "external" ? external : !external);
        return matchesSearch && matchesType && matchesOwner && matchesStatus && matchesFreshness && matchesSource;
      });
      items.sort((a, b) => String(a[sort as keyof Asset] ?? "").localeCompare(String(b[sort as keyof Asset] ?? ""), "en-US", { numeric: true }));
      if (direction === "desc") items.reverse();
      const total = items.length;
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total, totalPages: Math.max(1, Math.ceil(total / pageSize)), exportItems: items };
    }

    const total = response.data?.total ?? response.data?.count ?? items.length;
    return { items, total, totalPages: response.data?.totalPages ?? Math.max(1, Math.ceil(total / pageSize)), exportItems: items };
  }, [debouncedSearch, direction, freshness, owner, page, pageSize, response.data, sort, source, status, type]);

  function resetFilters() {
    setSearch(""); setDebouncedSearch(""); setType("all"); setOwner(""); setStatus("all"); setFreshness("all"); setSource("all"); setSort("name"); setDirection("asc"); setPage(1);
  }

  function exportData(format: "csv" | "json") {
    const fields: Array<keyof Asset> = ["type", "name", "owner", "description", "source", "version", "enabled", "updated_at"];
    const date = new Date().toISOString().slice(0, 10);
    if (format === "json") return download(`brain-inventory-${date}.json`, JSON.stringify(normalized.exportItems, null, 2), "application/json");
    const rows = [fields.join(","), ...normalized.exportItems.map((asset) => fields.map((field) => csvValue(asset[field])).join(","))];
    download(`brain-inventory-${date}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
  }

  const filtersActive = Boolean(search || owner || type !== "all" || status !== "all" || freshness !== "all" || source !== "all");

  return (
    <>
      <PageHeader
        eyebrow="Capability catalog"
        title="Inventory"
        description="Search and review every skill, plugin, CLI tool, MCP server, and design capability in the workspace."
        actions={
          <div className="button-group" role="group" aria-label="Export current page">
            <button className="button secondary" type="button" title={`Exports the ${pageSize} rows on this page only`} onClick={() => exportData("csv")}>
              <Icon name="database" size={17} />Export page (CSV)
            </button>
            <button className="button secondary" type="button" title={`Exports the ${pageSize} rows on this page only`} onClick={() => exportData("json")}>
              Export page (JSON)
            </button>
          </div>
        }
      />

      <section className="filter-panel" aria-labelledby="inventory-filters">
        <div className="filter-heading"><div><Icon name="filter" size={18} /><h2 id="inventory-filters">Filters</h2></div>{filtersActive && <button className="text-button" type="button" onClick={resetFilters}>Clear all</button>}</div>
        <div className="filter-grid">
          <label className="field-group field-wide"><span>Search</span><span className="input-with-icon"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, description, owner, or source" type="search" /></span></label>
          <label className="field-group"><span>Type</span><select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All types</option>{assetTypes.map((value) => <option value={value} key={value}>{value === "cli" ? "CLI tool" : value === "mcp" ? "MCP server" : titleCase(value)}</option>)}</select></label>
          <label className="field-group"><span>Owner</span><input value={owner} onChange={(event) => { setOwner(event.target.value); setPage(1); }} placeholder="Any owner" /></label>
          <label className="field-group"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Any status</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
          <label className="field-group"><span>Freshness</span><select value={freshness} onChange={(event) => { setFreshness(event.target.value); setPage(1); }}><option value="all">Any freshness</option><option value="current">Verified</option><option value="stale">Stale</option></select></label>
          <label className="field-group"><span>Source</span><select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }}><option value="all">Any source</option><option value="external">External URL</option><option value="local">Local path</option></select></label>
          <label className="field-group"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name">Name</option><option value="type">Type</option><option value="owner">Owner</option><option value="updated_at">Last updated</option></select></label>
          <label className="field-group"><span>Direction</span><select value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        </div>
      </section>

      {response.loading ? <LoadingState label="Loading inventory…" /> : response.error ? <ErrorState message={response.error} onRetry={response.reload} /> : (
        <section aria-labelledby="inventory-results">
          <div className="section-heading compact-heading"><div><h2 id="inventory-results">Capabilities</h2><p className="result-count" aria-live="polite">{normalized.total.toLocaleString("en-US")} result{normalized.total === 1 ? "" : "s"}</p></div></div>
          {normalized.items.length === 0 ? <EmptyState icon="search" title="No capabilities found" description="Try broadening your search or clearing one or more filters." action={filtersActive ? <button className="button secondary" type="button" onClick={resetFilters}>Clear filters</button> : undefined} /> : <InventoryResults assets={normalized.items} />}
          <div className="pagination" aria-label="Inventory pagination">
            <label className="page-size">Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{pageSizes.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
            <span>Page {Math.min(page, normalized.totalPages)} of {normalized.totalPages}</span>
            <div className="button-group"><button className="button secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="button secondary" type="button" disabled={page >= normalized.totalPages} onClick={() => setPage((value) => Math.min(normalized.totalPages, value + 1))}>Next</button></div>
          </div>
        </section>
      )}
    </>
  );
}

function AssetStatus({ asset }: { asset: Asset }) {
  const enabled = asset.enabled !== false;
  return <span className={`status-badge ${enabled ? "success" : "neutral"}`}><Icon name={enabled ? "check" : "x"} size={13} />{enabled ? "Enabled" : "Disabled"}</span>;
}

function InventoryResults({ assets }: { assets: Asset[] }) {
  return (
    <>
      <div className="data-table-wrap">
        <table className="data-table"><thead><tr><th scope="col">Capability</th><th scope="col">Type</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Freshness</th><th scope="col">Source</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td><strong>{asset.name}</strong><small>{asset.description || "No description provided."}</small></td><td><span className="type-badge">{asset.type}</span></td><td>{asset.owner || "Unassigned"}</td><td><AssetStatus asset={asset} /></td><td><span className={`status-badge ${isStale(asset.updated_at ?? asset.created_at) ? "warning" : "success"}`}>{isStale(asset.updated_at ?? asset.created_at) ? "Stale" : "Verified"}</span><small>{formatDate(asset.updated_at ?? asset.created_at, { month: "short", day: "numeric", year: "numeric" })}</small></td><td>{isSafeExternalUrl(asset.source) ? <a className="external-link" href={asset.source} target="_blank" rel="noopener noreferrer">Open <Icon name="external" size={14} /></a> : <code>{asset.source || "Not available"}</code>}</td></tr>)}</tbody></table>
      </div>
      <div className="mobile-card-list">{assets.map((asset) => <article className="entity-card" key={asset.id}><div className="entity-card-header"><div><span className="type-badge">{asset.type}</span><h3>{asset.name}</h3></div><AssetStatus asset={asset} /></div><p>{asset.description || "No description provided."}</p><dl className="entity-details"><div><dt>Owner</dt><dd>{asset.owner || "Unassigned"}</dd></div><div><dt>Freshness</dt><dd>{isStale(asset.updated_at ?? asset.created_at) ? "Stale" : "Verified"}</dd></div><div><dt>Version</dt><dd>{asset.version || "Not available"}</dd></div></dl>{isSafeExternalUrl(asset.source) && <a className="button secondary full-width" href={asset.source} target="_blank" rel="noopener noreferrer">Open source <Icon name="external" size={16} /></a>}</article>)}</div>
    </>
  );
}

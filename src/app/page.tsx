"use client";
import { useState, useEffect, useCallback } from "react";

export const dynamic = "force-dynamic";

type View = "inventory" | "bots" | "dashboards" | "processes" | "knowledge" | "memory" | "search";
const VIEWS: { id: View; label: string }[] = [
  { id: "inventory", label: "Inventory" },
  { id: "bots", label: "Bots" },
  { id: "dashboards", label: "Dashboards" },
  { id: "processes", label: "Processes" },
  { id: "knowledge", label: "Knowledge" },
  { id: "memory", label: "Memory" },
  { id: "search", label: "Search" },
];

interface Asset { id: string; type: string; name: string; owner: string; description: string; source: string; version: string; enabled: boolean; }
interface Bot { id: string; name: string; kind: string; status: string; model: string; base_url: string; last_seen: string; }
interface Dashboard { id: string; name: string; url: string; category: string; status: string; icon: string; }
interface Fact { id: string; key: string; value: string; scope: string; source: string; }
interface KnResult { source: string; title: string; snippet: string; url?: string; score?: number; }

export default function Page() {
  const [view, setView] = useState<View>("inventory");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [knResults, setKnResults] = useState<KnResult[]>([]);
  const [knQuery, setKnQuery] = useState("");
  const [knLoading, setKnLoading] = useState(false);

  const load = useCallback(async (v: View) => {
    setLoading(true);
    try {
      const map: Record<View, string> = {
        inventory: "/api/inventory", bots: "/api/bots", dashboards: "/api/dashboards",
        processes: "/api/processes", memory: "/api/memory?scope=global", knowledge: "", search: "",
      };
      const ep = map[v];
      if (ep) {
        const r = await fetch(ep);
        const d = await r.json();
        setData(d);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(view); }, [view, load]);

  const assets: Asset[] = data._all || [];
  const filtered = assets.filter(a =>
    (!filter || a.type === filter) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.description || "").toLowerCase().includes(search.toLowerCase()))
  );
  const counts = {
    skill: assets.filter(a => a.type === "skill").length,
    plugin: assets.filter(a => a.type === "plugin").length,
    cli: assets.filter(a => a.type === "cli").length,
    mcp: assets.filter(a => a.type === "mcp").length,
    design: assets.filter(a => a.type === "design").length,
  };

  async function runKnowledge() {
    if (!knQuery.trim()) return;
    setKnLoading(true);
    try {
      const r = await fetch(`/api/knowledge?q=${encodeURIComponent(knQuery)}`);
      const d = await r.json();
      setKnResults(d.results || []);
    } catch {}
    setKnLoading(false);
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="brand-mark"></div>
          <div>
            <div className="brand-name">Brain<span> Registry</span></div>
            <div className="brand-sub">Agent ecosystem · single source of truth</div>
          </div>
        </div>
        <div className="tabs">
          {VIEWS.map(v => (
            <button key={v.id} className={`tab ${view === v.id ? "active" : ""}`} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </header>

      <main>
        {loading && <div className="loading">Loading…</div>}

        {view === "inventory" && !loading && (
          <>
            <div className="stats">
              <div className="stat"><div className="stat-val">{counts.skill}</div><div className="stat-label">Skills</div></div>
              <div className="stat"><div className="stat-val">{counts.plugin}</div><div className="stat-label">Plugins</div></div>
              <div className="stat"><div className="stat-val">{counts.cli}</div><div className="stat-label">CLI Tools</div></div>
              <div className="stat"><div className="stat-val">{counts.mcp}</div><div className="stat-label">MCP Servers</div></div>
              <div className="stat"><div className="stat-val">{counts.design}</div><div className="stat-label">Designs</div></div>
            </div>
            <div className="card">
              <div className="filters">
                <button className={`filter ${!filter ? "active" : ""}`} onClick={() => setFilter("")}>All ({assets.length})</button>
                {(["skill","plugin","cli","mcp","design"] as const).map(t => (
                  <button key={t} className={`filter ${filter === t ? "active" : ""}`} onClick={() => setFilter(t)}>{t} ({counts[t]})</button>
                ))}
                <input className="search" placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {filtered.length === 0 ? (
                <div className="empty">No assets yet. Run a bot sync or seed the ecosystem.</div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th>Source</th><th>Status</th></tr></thead>
                  <tbody>
                    {filtered.slice(0, 100).map(a => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong>{a.description && <><br /><span style={{fontSize:10,color:"var(--text-muted)"}}>{a.description.slice(0,60)}</span></>}</td>
                        <td><span className={`tag ${a.type}`}>{a.type}</span></td>
                        <td>{a.owner}</td>
                        <td>{a.source ? <a href={a.source} target="_blank">link</a> : "—"}</td>
                        <td>{a.enabled ? <span style={{color:"var(--success)"}}>on</span> : <span style={{color:"var(--text-muted)"}}>off</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {view === "bots" && !loading && (
          <div className="card">
            <h2>Fleet ({(data.bots || []).length})</h2>
            {(data.bots || []).length === 0 ? <div className="empty">No bots registered.</div> : (
              <div className="bot-grid">
                {(data.bots || []).map((b: Bot) => (
                  <div key={b.id} className="bot-card">
                    <div className="bot-name">{b.name}</div>
                    <div className="bot-model">{b.model || "—"}</div>
                    <div className="bot-status"><span className="dot"></span>{b.status || "unknown"}</div>
                    <div style={{fontSize:10,color:"var(--text-muted)",marginTop:6}}>
                      {b.last_seen ? `seen ${new Date(b.last_seen).toLocaleString()}` : "never"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "dashboards" && !loading && (
          <div className="card">
            <h2>Dashboards ({(data.dashboards || []).length})</h2>
            {(data.dashboards || []).length === 0 ? <div className="empty">No dashboards registered.</div> : (
              <table className="tbl">
                <thead><tr><th>Name</th><th>Category</th><th>Status</th><th>URL</th></tr></thead>
                <tbody>
                  {(data.dashboards || []).map((d: Dashboard) => (
                    <tr key={d.id}>
                      <td><strong>{d.name}</strong></td>
                      <td>{d.category || "—"}</td>
                      <td>{d.status}</td>
                      <td><a href={d.url} target="_blank">open →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === "processes" && !loading && (
          <div className="card">
            <h2>Processes ({(data.processes || []).length})</h2>
            {(data.processes || []).length === 0 ? <div className="empty">No processes documented yet.</div> : (
              (data.processes || []).map((p: any) => (
                <div key={p.id} style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid var(--border)"}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{p.title}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>{new Date(p.updated_at).toLocaleDateString()} · {(p.tags||[]).join(", ")}</div>
                  <pre style={{fontSize:12,color:"var(--text-2)",marginTop:6,whiteSpace:"pre-wrap",fontFamily:"var(--mono)"}}>{(p.body||"").slice(0,300)}…</pre>
                </div>
              ))
            )}
          </div>
        )}

        {view === "knowledge" && (
          <div className="card">
            <h2>Federated Knowledge Search</h2>
            <p style={{fontSize:11,color:"var(--text-muted)",marginBottom:12}}>Searches Obsidian, Supermemory, mem0, Hermes memory, and local assets in parallel.</p>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <input
                className="search" style={{flex:1}}
                placeholder="What do we know about…"
                value={knQuery}
                onChange={e => setKnQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runKnowledge()}
              />
              <button onClick={runKnowledge} className="filter active" style={{padding:"7px 16px"}}>Search</button>
            </div>
            {knLoading && <div className="loading">Querying sources…</div>}
            {!knLoading && knResults.length === 0 && knQuery && <div className="empty">No results.</div>}
            {knResults.map((r, i) => (
              <div key={i} className="kn-result">
                <div className="kn-source">{r.source}</div>
                <div className="kn-title">{r.title || "(untitled)"}</div>
                <div className="kn-snippet">{r.snippet}</div>
                {r.url && <a href={r.url} target="_blank" style={{fontSize:11}}>open →</a>}
              </div>
            ))}
          </div>
        )}

        {view === "memory" && !loading && (
          <div className="card">
            <h2>Memory Facts ({(data.facts || []).length})</h2>
            {(data.facts || []).length === 0 ? <div className="empty">No facts stored.</div> : (
              <table className="tbl">
                <thead><tr><th>Key</th><th>Value</th><th>Source</th></tr></thead>
                <tbody>
                  {(data.facts || []).map((f: Fact) => (
                    <tr key={f.id}>
                      <td><strong>{f.key}</strong></td>
                      <td style={{fontFamily:"var(--mono)",fontSize:11}}>{f.value}</td>
                      <td>{f.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === "search" && (
          <div className="card">
            <h2>Global Search</h2>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <input
                className="search" style={{flex:1}}
                placeholder="Search everything…"
                value={knQuery}
                onChange={e => setKnQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runKnowledge()}
              />
              <button onClick={runKnowledge} className="filter active" style={{padding:"7px 16px"}}>Search</button>
            </div>
            {knLoading && <div className="loading">Searching…</div>}
            {knResults.map((r, i) => (
              <div key={i} className="kn-result">
                <div className="kn-source">{r.source}</div>
                <div className="kn-title">{r.title || "(untitled)"}</div>
                <div className="kn-snippet">{r.snippet}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";

type View = "overview" | "inventory" | "bots" | "dashboards" | "knowledge" | "memory";

const NAV: { id: View; icon: string; label: string; desc: string }[] = [
  { id: "overview", icon: "◆", label: "Overview", desc: "סקירה כללית של המערכת" },
  { id: "inventory", icon: "📦", label: "Inventory", desc: "כל הסקילים, CLI, MCP, עיצובים" },
  { id: "bots", icon: "🤖", label: "Bots", desc: "הבוטים שמחוברים למערכת" },
  { id: "dashboards", icon: "📊", label: "Dashboards", desc: "כל הדשבורדים שלנו" },
  { id: "knowledge", icon: "🔍", label: "Knowledge", desc: "חיפוש מאוחד ב-Obsidian, mem0, ועוד" },
  { id: "memory", icon: "🧠", label: "Memory", desc: "עובדות שמורות לטווח ארוך" },
];

interface Asset { id: string; type: string; name: string; owner: string; description: string; source: string; version: string; enabled: boolean; }
interface Bot { id: string; name: string; kind: string; status: string; model: string; base_url: string; last_seen: string; }

const TYPE_INFO: Record<string, { icon: string; label: string; color: string; desc: string }> = {
  skill: { icon: "⚡", label: "Skills", color: "var(--primary-light)", desc: "הוראות שמאפשרות לAI לבצע משימות מורכבות (כמו מתכון)" },
  plugin: { icon: "🔌", label: "Plugins", color: "var(--accent)", desc: "תוספים שמרחיבים יכולות הבוט (אינטגרציות, כלים)" },
  cli: { icon: "⌨️", label: "CLI Tools", color: "var(--green)", desc: "כלי שורת פקודה מותקנים על השרת (stripe, gh, ffmpeg...)" },
  mcp: { icon: "🔗", label: "MCP Servers", color: "var(--accent-2)", desc: "Model Context Protocol - מקשר API חיצוני לבוט" },
  design: { icon: "🎨", label: "Designs", color: "var(--yellow)", desc: "סקילים לעיצוב וביקורת UI" },
};

export default function Page() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [knQuery, setKnQuery] = useState("");
  const [knResults, setKnResults] = useState<any[]>([]);
  const [knLoading, setKnLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const PER_PAGE = 24;

  const load = useCallback(async (v: View) => {
    if (v === "knowledge") { setData({}); setError(null); return; }
    setLoading(true);
    setError(null);
    const map: Partial<Record<View, string>> = {
      overview: "/api/inventory", inventory: "/api/inventory", bots: "/api/bots",
      dashboards: "/api/dashboards", memory: "/api/memory?scope=global",
    };
    const ep = map[v];
    if (ep) {
      try {
        const r = await fetch(ep);
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        setData(await r.json());
        setLastSync(new Date().toISOString());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
        setData({});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(view); setPage(0); setFilter(""); setSearch(""); }, [view, load]);

  const assets: Asset[] = data._all || [];
  const filtered = assets.filter(a =>
    (!filter || a.type === filter) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.description || "").toLowerCase().includes(search.toLowerCase()))
  );
  const counts = { skill: 0, plugin: 0, cli: 0, mcp: 0, design: 0 } as Record<string, number>;
  assets.forEach(a => { if (counts[a.type] !== undefined) counts[a.type]++; });

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // Export to CSV
  function exportCSV() {
    const headers = ["type", "name", "owner", "description", "source", "version", "enabled"];
    const rows = filtered.map(a => [
      a.type, a.name, a.owner, (a.description || "").replace(/"/g, '""'),
      a.source || "", a.version || "", a.enabled ? "true" : "false"
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brain-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export to JSON
  function exportJSON() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brain-inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  async function runKnowledge() {
    if (!knQuery.trim()) return;
    setKnLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/knowledge?q=${encodeURIComponent(knQuery)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setKnResults(d.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Knowledge search failed");
      setKnResults([]);
    }
    setKnLoading(false);
  }

  // Debounced search
  function debounceSearch(value: string) {
    setSearch(value);
    setPage(0);
  }

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo">
            <div className="sb-mark"></div>
            <div>
              <div className="sb-title">Brain<span>Registry</span></div>
              <div className="sb-tagline">מוח מרכזי לכל הבוטים</div>
            </div>
          </div>
        </div>
        <nav className="sb-nav">
          {NAV.map(n => (
            <button key={n.id} className={`sb-item ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)} title={n.desc}>
              <span className="sb-icon">{n.icon}</span>
              {n.label}
              {n.id === "inventory" && assets.length > 0 && <span className="sb-count">{assets.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sb-footer">
          <div>v1.0 · {new Date().getFullYear()}</div>
          {lastSync && <div className="sb-sync">עודכן: {new Date(lastSync).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</div>}
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="mobile-head">
        <div className="sb-logo"><div className="sb-mark"></div><div className="sb-title">Brain<span>Registry</span></div></div>
      </div>
      <div className="mobile-nav">
        {NAV.map(n => (
          <button key={n.id} className={`sb-item ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
            <span className="sb-icon">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-bottom-nav">
        {NAV.map(n => (
          <button key={n.id} className={`mbn-item ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
            <span className="mbn-icon">{n.icon}</span>
            <span className="mbn-label">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Main */}
      <main className="main">
        {/* Error banner */}
        {error && (
          <div className="error-banner" role="alert">
            <span>⚠️</span>
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {view === "overview" && (
          <>
            <div className="page-head">
              <div className="page-title">סקירה כללית</div>
              <div className="page-desc">זה המוח המרכזי של כל מערכת הAI שלנו. כאן נשמר כל מה שהבוטים יודעים ויש להם — סקילים, כלים, עיצובים, תהליכים וזיכרון. כל בוט (Hermes, OpenClaw) מתחבר לכאן כדי לדעת מה זמין.</div>
            </div>
            <div className="stats">
              {(Object.keys(TYPE_INFO) as string[]).map(t => (
                <div key={t} className="stat" onClick={() => { setView("inventory"); setFilter(t); }} style={{ cursor: "pointer" }}>
                  <div className="stat-icon">{TYPE_INFO[t].icon}</div>
                  <div className="stat-val">{counts[t]}</div>
                  <div className="stat-label">{TYPE_INFO[t].label}</div>
                  <div className="stat-desc">{TYPE_INFO[t].desc}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>מה זה כל דבר?</div>
              <div className="legend">
                {(Object.keys(TYPE_INFO) as string[]).map(t => (
                  <div key={t} className="legend-item">
                    <div className="legend-dot" style={{ background: TYPE_INFO[t].color }}></div>
                    <div className="legend-text">
                      <strong>{TYPE_INFO[t].icon} {TYPE_INFO[t].label}</strong>
                      <span>{TYPE_INFO[t].desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {view === "inventory" && (
          <>
            <div className="page-head">
              <div className="page-title">📦 Inventory — כל הנכסים</div>
              <div className="page-desc">כל מה שמותקן אצל הבוטים. לחץ על סוג כדי לסנן, או חפש בשם.</div>
              {lastSync && <div className="last-sync">עודכן לאחרונה: {new Date(lastSync).toLocaleString("he-IL")}</div>}
            </div>
            {loading ? (
              <div className="skeleton-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line" style={{ width: "60%" }} />
                    <div className="skeleton-line" style={{ width: "90%" }} />
                    <div className="skeleton-line" style={{ width: "40%" }} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="toolbar">
                  <button className={`chip ${!filter ? "active" : ""}`} onClick={() => { setFilter(""); setPage(0); }}>הכל<span className="n">{assets.length}</span></button>
                  {(Object.keys(TYPE_INFO) as string[]).map(t => (
                    <button key={t} className={`chip ${filter === t ? "active" : ""}`} onClick={() => { setFilter(t); setPage(0); }}>
                      {TYPE_INFO[t].icon} {TYPE_INFO[t].label}<span className="n">{counts[t]}</span>
                    </button>
                  ))}
                  <input className="field" placeholder="🔍 חיפוש לפי שם או תיאור..." value={search} onChange={e => debounceSearch(e.target.value)} />
                  <div className="export-btns">
                    <button className="chip" onClick={exportCSV} title="Export as CSV">📥 CSV</button>
                    <button className="chip" onClick={exportJSON} title="Export as JSON">📥 JSON</button>
                  </div>
                </div>
                {paged.length === 0 ? (
                  <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">אין תוצאות</div></div>
                ) : (
                  <div className="grid">
                    {paged.map(a => (
                      <div key={a.id} className="item">
                        <div className="item-head">
                          <div className="item-name">{a.name}</div>
                          <span className={`item-type ${a.type}`}>{a.type}</span>
                        </div>
                        <div className="item-desc">{a.description || (TYPE_INFO[a.type]?.desc ?? "—")}</div>
                        <div className="item-meta">
                          <span>👤 {a.owner}</span>
                          {a.version && <span>🏷️ {a.version}</span>}
                          <span>{a.enabled ? "✅ פעיל" : "⏸️ כבוי"}</span>
                        </div>
                        {a.source && a.source.startsWith("http") && <a className="item-link" href={a.source} target="_blank">קישור →</a>}
                      </div>
                    ))}
                  </div>
                )}
                {totalPages > 1 && (
                  <div className="pager">
                    <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← הקודם</button>
                    <span className="info">עמוד {page + 1} מ-{totalPages} · {filtered.length} סה"כ</span>
                    <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>הבא →</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {view === "bots" && (
          <>
            <div className="page-head">
              <div className="page-title">🤖 Bots — הבוטים שלנו</div>
              <div className="page-desc">כל בוט שמחובר לBrain. כל בוט מסנכרן את הנכסים שלו לכאן אוטומטית.</div>
            </div>
            {loading ? (
              <div className="skeleton-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line" style={{ width: "40%" }} />
                    <div className="skeleton-line" style={{ width: "80%" }} />
                    <div className="skeleton-line" style={{ width: "60%" }} />
                  </div>
                ))}
              </div>
            ) : (data.bots || []).length === 0 ? (
              <div className="empty"><div className="empty-icon">🤖</div><div className="empty-text">אין בוטים רשומים עדיין</div><div className="empty-hint">הרץ connector כדי לרשום בוט</div></div>
            ) : (
              <div className="bot-grid">
                {(data.bots || []).map((b: Bot) => (
                  <div key={b.id} className="bot">
                    <div className="bot-head">
                      <div className="bot-avatar">{b.kind === "hermes" ? "⚡" : b.kind === "openclaw" ? "🦞" : "🤖"}</div>
                      <div>
                        <div className="bot-name">{b.name}</div>
                        <div className="bot-kind">{b.kind}</div>
                      </div>
                    </div>
                    <div className="bot-row"><span>מצב</span><span><span className={`status-dot ${b.status || "online"}`}></span>{b.status || "online"}</span></div>
                    <div className="bot-row"><span>מודל</span><span>{b.model || "—"}</span></div>
                    <div className="bot-row"><span>נראה לאחרונה</span><span>{b.last_seen ? new Date(b.last_seen).toLocaleString("he-IL") : "—"}</span></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "dashboards" && (
          <>
            <div className="page-head">
              <div className="page-title">📊 Dashboards — כל הדשבורדים</div>
              <div className="page-desc">כל הדשבורדים שלנו במקום אחד.</div>
            </div>
            {loading ? (
              <div className="skeleton-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line" style={{ width: "40%" }} />
                    <div className="skeleton-line" style={{ width: "80%" }} />
                    <div className="skeleton-line" style={{ width: "60%" }} />
                  </div>
                ))}
              </div>
            ) : (data.dashboards || []).length === 0 ? (
              <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">אין דשבורדים רשומים</div></div>
            ) : (
              <div className="bot-grid">
                {(data.dashboards || []).map((d: any) => (
                  <div key={d.id} className="bot" style={{ cursor: "pointer" }} onClick={() => window.open(d.url, "_blank")}>
                    <div className="bot-head">
                      <div className="bot-avatar">{d.icon || "📊"}</div>
                      <div><div className="bot-name">{d.name}</div><div className="bot-kind">{d.category || "—"}</div></div>
                    </div>
                    <div className="bot-row"><span>סטטוס</span><span>{d.status || "—"}</span></div>
                    <div className="bot-row"><span>קישור</span><span style={{ color: "var(--primary-light)" }}>פתח →</span></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "knowledge" && (
          <>
            <div className="page-head">
              <div className="page-title">🔍 Knowledge — חיפוש ידע מאוחד</div>
              <div className="page-desc">מחפש בכל מקורות הידע במקביל: Obsidian (המאגר שלך), mem0, Supermemory, והזיכרון המקומי. התוצאות מקובצות לפי מקור.</div>
            </div>
            <div className="card">
              <div className="kn-bar">
                <input className="field" placeholder="מה אתה רוצה לדעת? לדוגמא: PromptForge, OpenClaw, SEO..." value={knQuery} onChange={e => setKnQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runKnowledge()} />
                <button className="chip active" onClick={runKnowledge}>חפש</button>
              </div>
              {knLoading && <div className="empty"><div className="empty-text">מחפש במקורות...</div></div>}
              {!knLoading && knResults.length === 0 && knQuery && <div className="empty"><div className="empty-icon">🔍</div><div className="empty-text">לא נמצאו תוצאות</div></div>}
              {knResults.map((r, i) => (
                <div key={i} className={`kn-result ${r.source}`}>
                  <div className="kn-top">
                    <span className="kn-badge">{r.source}</span>
                  </div>
                  <div className="kn-title">{r.title || "(ללא כותרת)"}</div>
                  <div className="kn-snippet">{r.snippet}</div>
                  {r.url && r.url.startsWith("http") && <a href={r.url} target="_blank" style={{ fontSize: 11, color: "var(--primary-light)", marginTop: 6, display: "inline-block" }}>פתח →</a>}
                </div>
              ))}
            </div>
          </>
        )}

        {view === "memory" && (
          <>
            <div className="page-head">
              <div className="page-title">🧠 Memory — עובדות שמורות</div>
              <div className="page-desc">עובדות שהבוטים שומרים לטווח ארוך. כל בוט יכול לקרוא ולכתוב לכאן.</div>
            </div>
            {loading ? (
              <div className="skeleton-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line" style={{ width: "40%" }} />
                    <div className="skeleton-line" style={{ width: "80%" }} />
                    <div className="skeleton-line" style={{ width: "60%" }} />
                  </div>
                ))}
              </div>
            ) : (data.facts || []).length === 0 ? (
              <div className="empty"><div className="empty-icon">🧠</div><div className="empty-text">אין עובדות שמורות עדיין</div><div className="empty-hint">בוטים יכולים לשמור עובדות דרך POST /api/memory</div></div>
            ) : (
              <div className="grid">
                {(data.facts || []).map((f: any) => (
                  <div key={f.id} className="item">
                    <div className="item-head"><div className="item-name">{f.key}</div></div>
                    <div className="item-desc" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{f.value}</div>
                    <div className="item-meta"><span>👤 {f.source || "—"}</span><span>📍 {f.scope}</span></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

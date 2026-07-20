import { NextRequest } from "next/server";
import { supabase } from "../../../lib/supabase";

// Federated knowledge fan-out. Each adapter returns [{source,title,snippet,url,score}].
// Brain is the aggregator — sources stay in their own tools.

interface Result { source: string; title: string; snippet: string; url?: string; score?: number; }

async function searchSupabaseMemory(q: string): Promise<Result[]> {
  const { data } = await supabase
    .from("memory_facts").select("*").ilike("value", `%${q}%`).limit(10);
  return (data || []).map((f: any) => ({
    source: "memory", title: f.key, snippet: f.value?.slice(0, 200), score: 0.9,
  }));
}

async function searchAssets(q: string): Promise<Result[]> {
  const { data } = await supabase
    .from("assets").select("*").or(`name.ilike.%${q}%,description.ilike.%${q}%`).limit(15);
  return (data || []).map((a: any) => ({
    source: a.type, title: a.name, snippet: a.description?.slice(0, 200) || a.source, url: a.source, score: 0.8,
  }));
}

async function searchProcesses(q: string): Promise<Result[]> {
  const { data } = await supabase
    .from("processes").select("*").or(`title.ilike.%${q}%,body.ilike.%${q}%`).limit(10);
  return (data || []).map((p: any) => ({
    source: "process", title: p.title, snippet: p.body?.slice(0, 200), score: 0.85,
  }));
}

// External sources — only enabled if their env keys exist.
async function searchSupermemory(q: string): Promise<Result[]> {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) return [];
  try {
    const r = await fetch("https://api.supermemory.ai/v3/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q, limit: 10 }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || d || []).map((x: any) => ({
      source: "supermemory", title: x.title || x.content?.slice(0, 80), snippet: x.content?.slice(0, 200),
      url: x.url, score: x.score || 0.7,
    }));
  } catch { return []; }
}

async function searchMem0(q: string): Promise<Result[]> {
  // mem0 runs locally via Python — call out only if an endpoint is configured.
  const url = process.env.MEM0_API_URL;
  if (!url) return [];
  try {
    const r = await fetch(`${url}/search?q=${encodeURIComponent(q)}&limit=10`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || d || []).map((x: any) => ({
      source: "mem0", title: x.id || x.memory?.slice(0, 80), snippet: x.memory?.slice(0, 200), score: x.score || 0.6,
    }));
  } catch { return []; }
}

async function searchObsidian(q: string): Promise<Result[]> {
  // Obsidian vault is read via a local REST API (the ngrok URL).
  const url = process.env.OBSIDIAN_API_URL;
  const key = process.env.OBSIDIAN_API_KEY;
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/search/simple/?query=${encodeURIComponent(q)}&contextLength=50`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : []).slice(0, 10).map((x: any) => ({
      source: "obsidian", title: x.filename || x.file?.path, snippet: (x.excerpt || x.snippet || "").slice(0, 200),
      url: x.file?.path, score: 0.75,
    }));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return Response.json({ error: "q required" }, { status: 400 });
  const sourcesParam = req.nextUrl.searchParams.get("sources");
  const sources = sourcesParam ? sourcesParam.split(",") : null;

  const all: Promise<Result[]>[] = [];
  const local: Record<string, () => Promise<Result[]>> = {
    memory: () => searchSupabaseMemory(q),
    assets: () => searchAssets(q),
    processes: () => searchProcesses(q),
  };
  const external: Record<string, () => Promise<Result[]>> = {
    supermemory: () => searchSupermemory(q),
    mem0: () => searchMem0(q),
    obsidian: () => searchObsidian(q),
  };

  const fanout: Record<string, () => Promise<Result[]>> = { ...local, ...external };
  for (const [name, fn] of Object.entries(fanout)) {
    if (sources && !sources.includes(name)) continue;
    all.push(fn().catch(() => []));
  }

  const settled = await Promise.all(all);
  const results = settled.flat().sort((a, b) => (b.score || 0) - (a.score || 0));
  return Response.json({ query: q, count: results.length, results });
}

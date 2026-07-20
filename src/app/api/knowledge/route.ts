import { NextRequest } from "next/server";
import { supabase } from "../../../lib/supabase";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

interface Result { source: string; title: string; snippet: string; url?: string; score?: number; }

function sanitizeQ(q: string): string {
  return q.replace(/[,.()\\]/g, " ").replace(/[%_]/g, " ").trim().slice(0, 100);
}

async function searchSupabaseMemory(q: string): Promise<Result[]> {
  const { data } = await supabase.from("brain_memory_facts").select("*").ilike("value", `%${q}%`).limit(10);
  return (data || []).map((f: any) => ({ source: "memory", title: f.key, snippet: (f.value || "").slice(0, 200), score: 0.9 }));
}

async function searchAssets(q: string): Promise<Result[]> {
  const { data } = await supabase.from("brain_assets").select("name,description,source,type").ilike("name", `%${q}%`).limit(15);
  const { data: d2 } = await supabase.from("brain_assets").select("name,description,source,type").ilike("description", `%${q}%`).limit(15);
  return [...(data||[]), ...(d2||[])].map((a: any) => ({ source: a.type, title: a.name, snippet: (a.description||"").slice(0,200), url: a.source, score: 0.8 }));
}

async function searchProcesses(q: string): Promise<Result[]> {
  const { data } = await supabase.from("brain_processes").select("*").ilike("title", `%${q}%`).limit(10);
  return (data || []).map((p: any) => ({ source: "process", title: p.title, snippet: (p.body||"").slice(0,200), score: 0.85 }));
}

function safeUrl(u?: string): string | undefined {
  return u && /^https?:\/\//.test(u) ? u : undefined;
}

async function withTimeout<T>(p: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]).catch(() => [] as unknown as T);
}

async function searchSupermemory(q: string): Promise<Result[]> {
  const key = process.env.SUPERMEMORY_API_KEY; if (!key) return [];
  return withTimeout(fetch("https://api.supermemory.ai/v3/search", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ q, limit: 10 }),
  }).then(r => r.json()).then((d: any) => (d.results||d||[]).map((x: any) => ({
    source: "supermemory", title: x.title || (x.content||"").slice(0,80), snippet: (x.content||"").slice(0,200), url: safeUrl(x.url), score: x.score||0.7,
  }))));
}

async function searchMem0(q: string): Promise<Result[]> {
  const url = process.env.MEM0_API_URL; if (!url) return [];
  return withTimeout(fetch(`${url}/search?q=${encodeURIComponent(q)}&limit=10`).then(r => r.json()).then((d: any) => (d.results||d||[]).map((x: any) => ({
    source: "mem0", title: x.id || (x.memory||"").slice(0,80), snippet: (x.memory||"").slice(0,200), score: x.score||0.6,
  }))));
}

async function searchObsidian(q: string): Promise<Result[]> {
  const url = process.env.OBSIDIAN_API_URL; const key = process.env.OBSIDIAN_API_KEY; if (!url || !key) return [];
  return withTimeout(fetch(`${url}/search/simple/?query=${encodeURIComponent(q)}&contextLength=50`, { headers: { Authorization: `Bearer ${key}` } })
    .then(r => r.json()).then((d: any) => (Array.isArray(d)?d:[]).slice(0,10).map((x: any) => ({
      source: "obsidian", title: x.filename || x.file?.path, snippet: (x.excerpt||x.snippet||"").slice(0,200), url: safeUrl(x.file?.path), score: 0.75,
    }))));
}

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const rawQ = req.nextUrl.searchParams.get("q");
  if (!rawQ) return Response.json({ error: "q required" }, { status: 400 });
  const q = sanitizeQ(rawQ);
  if (!q) return Response.json({ query: rawQ, count: 0, results: [] });
  const sourcesParam = req.nextUrl.searchParams.get("sources");
  const sources = sourcesParam ? sourcesParam.split(",") : null;

  const fanout: Record<string, () => Promise<Result[]>> = {
    memory: () => searchSupabaseMemory(q),
    assets: () => searchAssets(q),
    processes: () => searchProcesses(q),
    supermemory: () => searchSupermemory(q),
    mem0: () => searchMem0(q),
    obsidian: () => searchObsidian(q),
  };
  const fns = Object.entries(fanout).filter(([n]) => !sources || sources.includes(n)).map(([, fn]) => fn().catch(() => []));
  const settled = await Promise.all(fns);
  const results = settled.flat().sort((a, b) => (b.score || 0) - (a.score || 0));
  return Response.json({ query: rawQ, count: results.length, results });
}

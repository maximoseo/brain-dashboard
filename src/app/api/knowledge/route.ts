import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/api-auth";
import { getServerEnv } from "@/lib/env";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

const SOURCE_NAMES = ["memory", "assets", "processes", "supermemory", "mem0", "obsidian"] as const;
type SourceName = (typeof SOURCE_NAMES)[number];
interface Result { source: string; title: string; snippet: string; url?: string; score?: number }
interface SourceOutcome { source: SourceName; status: "ok" | "unconfigured" | "failed"; count: number; latencyMs: number; error?: string }

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  sources: z.string().optional().transform((value, ctx): SourceName[] | undefined => {
    if (!value) return undefined;
    const sources = value.split(",");
    const invalid = sources.filter((source) => !(SOURCE_NAMES as readonly string[]).includes(source));
    if (invalid.length) {
      ctx.addIssue({ code: "custom", message: `Unknown sources: ${invalid.join(", ")}` });
      return z.NEVER;
    }
    return [...new Set(sources)] as SourceName[];
  }),
});

const genericResultSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  score: z.number().optional(),
  id: z.string().optional(),
  memory: z.string().optional(),
  filename: z.string().optional(),
  excerpt: z.string().optional(),
  snippet: z.string().optional(),
  file: z.object({ path: z.string().optional() }).optional(),
}).passthrough();

function sanitizeQuery(q: string): string {
  return q.replace(/[,.()\\%_]/g, " ").replace(/\s+/g, " ").trim();
}

function safeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 3_000): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return response.json() as Promise<unknown>;
}

function resultArray(input: unknown): z.infer<typeof genericResultSchema>[] {
  const container = z.object({ results: z.array(genericResultSchema).optional() }).passthrough().safeParse(input);
  if (container.success && container.data.results) return container.data.results;
  const direct = z.array(genericResultSchema).safeParse(input);
  return direct.success ? direct.data : [];
}

async function searchMemory(q: string): Promise<Result[]> {
  const { data, error } = await getSupabaseAdmin().from("brain_memory_facts").select("key,value").ilike("value", `%${q}%`).limit(10);
  if (error) throw new Error("memory_query_failed");
  return (data ?? []).map((fact) => ({ source: "memory", title: String(fact.key), snippet: String(fact.value ?? "").slice(0, 200), score: 0.9 }));
}

async function searchAssets(q: string): Promise<Result[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("brain_assets")
    .select("name,description,source,type")
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(20);
  if (error) throw new Error("asset_query_failed");
  return (data ?? []).map((asset) => ({
    source: String(asset.type), title: String(asset.name), snippet: String(asset.description ?? "").slice(0, 200),
    url: safeUrl(typeof asset.source === "string" ? asset.source : undefined), score: 0.8,
  }));
}

async function searchProcesses(q: string): Promise<Result[]> {
  const { data, error } = await getSupabaseAdmin().from("brain_processes").select("title,body").or(`title.ilike.%${q}%,body.ilike.%${q}%`).limit(10);
  if (error) throw new Error("process_query_failed");
  return (data ?? []).map((process) => ({ source: "process", title: String(process.title), snippet: String(process.body ?? "").slice(0, 200), score: 0.85 }));
}

async function searchSupermemory(q: string): Promise<Result[] | null> {
  const key = getServerEnv().SUPERMEMORY_API_KEY;
  if (!key) return null;
  const data = await fetchJson("https://api.supermemory.ai/v3/search", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ q, limit: 10 }),
  });
  return resultArray(data).map((item) => ({ source: "supermemory", title: item.title ?? (item.content ?? "").slice(0, 80), snippet: (item.content ?? "").slice(0, 200), url: safeUrl(item.url), score: item.score ?? 0.7 }));
}

async function searchMem0(q: string): Promise<Result[] | null> {
  const url = getServerEnv().MEM0_API_URL;
  if (!url) return null;
  const data = await fetchJson(`${url}/search?q=${encodeURIComponent(q)}&limit=10`);
  return resultArray(data).map((item) => ({ source: "mem0", title: item.id ?? (item.memory ?? "").slice(0, 80), snippet: (item.memory ?? "").slice(0, 200), score: item.score ?? 0.6 }));
}

async function searchObsidian(q: string): Promise<Result[] | null> {
  const { OBSIDIAN_API_URL: url, OBSIDIAN_API_KEY: key } = getServerEnv();
  if (!url || !key) return null;
  const data = await fetchJson(`${url}/search/simple/?query=${encodeURIComponent(q)}&contextLength=50`, { headers: { Authorization: `Bearer ${key}` } });
  return resultArray(data).slice(0, 10).map((item) => ({ source: "obsidian", title: item.filename ?? item.file?.path ?? "Untitled", snippet: (item.excerpt ?? item.snippet ?? "").slice(0, 200), score: 0.75 }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return validationError(parsed.error, requestId(req));
    const q = sanitizeQuery(parsed.data.q);
    if (!q) return jsonPrivate({ query: parsed.data.q, count: 0, results: [], sources: [] });

    const searches: Record<SourceName, () => Promise<Result[] | null>> = {
      memory: () => searchMemory(q), assets: () => searchAssets(q), processes: () => searchProcesses(q),
      supermemory: () => searchSupermemory(q), mem0: () => searchMem0(q), obsidian: () => searchObsidian(q),
    };
    const selected = parsed.data.sources ?? SOURCE_NAMES;
    const settled = await Promise.all(selected.map(async (source) => {
      const started = Date.now();
      try {
        const results = await searches[source]();
        const outcome: SourceOutcome = { source, status: results === null ? "unconfigured" : "ok", count: results?.length ?? 0, latencyMs: Date.now() - started };
        return { results: results ?? [], outcome };
      } catch (error) {
        const outcome: SourceOutcome = { source, status: "failed", count: 0, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "unknown_error" };
        return { results: [], outcome };
      }
    }));
    const results = settled.flatMap((item) => item.results).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return jsonPrivate({ query: parsed.data.q, count: results.length, results, sources: settled.map((item) => item.outcome) });
  } catch (error) {
    return serverError(req, "/api/knowledge", error);
  }
}

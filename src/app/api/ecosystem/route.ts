import { NextRequest } from "next/server";
import { supabase } from "../../../lib/supabase";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/ecosystem — Unified Agent Ecosystem API (Feature Lab quick win).
 * ONE stable, read-only REST contract for every MaximoSEO dashboard to
 * query the available skills and MCP servers:
 *
 *   GET /api/ecosystem            → { version, generated_at, counts, skills, mcp }
 *   GET /api/ecosystem?type=skill → skills only
 *   GET /api/ecosystem?type=mcp   → MCP servers only
 *   GET /api/ecosystem?q=design   → substring filter on name/description
 *
 * Auth: brain session cookie or x-api-key (same as /api/inventory).
 * Backed by brain_assets (type 'skill' | 'mcp'); additive-only contract —
 * new fields may be appended, existing ones never removed or renamed.
 */
export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const type = req.nextUrl.searchParams.get("type");
  const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();

  let query = supabase
    .from("brain_assets")
    .select("type,name,owner,description,source,version,enabled,meta,updated_at")
    .in("type", ["skill", "mcp"])
    .order("type")
    .order("name");
  if (type === "skill" || type === "mcp") query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const norm = (a: {
    name: string;
    owner: string;
    description?: string;
    source?: string;
    version?: string;
    enabled?: boolean;
    meta?: Record<string, unknown>;
    updated_at?: string;
  }) => ({
    name: a.name,
    owner: a.owner,
    description: a.description || "",
    source: a.source || "",
    version: a.version || "",
    enabled: a.enabled !== false,
    meta: a.meta || {},
    updated_at: a.updated_at || null,
  });

  const assets = (data || []).map((a) => ({ ...norm(a), type: a.type as "skill" | "mcp" }));
  const match = (a: (typeof assets)[number]) =>
    !q ||
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q);

  const strip = (list: (typeof assets)[number][]) =>
    list.filter(match).map(({ type: _type, ...rest }) => rest);
  const skills = strip(assets.filter((a) => a.type === "skill"));
  const mcp = strip(assets.filter((a) => a.type === "mcp"));

  return Response.json({
    version: "1.0",
    generated_at: new Date().toISOString(),
    counts: { skills: skills.length, mcp: mcp.length },
    skills,
    mcp,
  });
}

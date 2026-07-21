import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  type: z.enum(["skill", "mcp"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(1000),
});

interface EcosystemRow {
  type: "skill" | "mcp";
  name: string;
  owner: string;
  description: string | null;
  source: string | null;
  version: string | null;
  enabled: boolean;
  meta: Record<string, unknown> | null;
  updated_at: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return validationError(parsed.error, requestId(req));
    const { type, q, page, pageSize } = parsed.data;

    let query = getSupabaseAdmin()
      .from("brain_assets")
      .select("type,name,owner,description,source,version,enabled,meta,updated_at", { count: "exact" })
      .in("type", type ? [type] : ["skill", "mcp"]);
    if (q) {
      const term = q.replace(/[,%_()\\]/g, " ").replace(/\s+/g, " ").trim();
      if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const from = (page - 1) * pageSize;
    const { data, count, error } = await query.order("type").order("name").order("owner").range(from, from + pageSize - 1);
    if (error) throw new Error(`Ecosystem query failed: ${error.message}`);

    const assets = (data ?? []) as EcosystemRow[];
    const normalize = (asset: EcosystemRow) => ({
      name: asset.name,
      owner: asset.owner,
      description: asset.description ?? "",
      source: asset.source ?? "",
      version: asset.version ?? "",
      enabled: asset.enabled,
      meta: asset.meta ?? {},
      updated_at: asset.updated_at,
    });
    const skills = assets.filter((asset) => asset.type === "skill").map(normalize);
    const mcp = assets.filter((asset) => asset.type === "mcp").map(normalize);

    return jsonPrivate({
      version: "1.1",
      generated_at: new Date().toISOString(),
      counts: { skills: skills.length, mcp: mcp.length, total: count ?? 0 },
      pagination: { page, pageSize, total: count ?? 0 },
      skills,
      mcp,
    });
  } catch (error) {
    return serverError(req, "/api/ecosystem", error);
  }
}

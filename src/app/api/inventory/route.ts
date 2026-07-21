import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { ASSET_TYPES, getSupabaseAdmin, type Asset } from "@/lib/supabase";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  type: z.enum(ASSET_TYPES).optional(),
  owner: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "enabled", "stale", "disabled"]).optional(),
  freshness: z.enum(["current", "stale"]).optional(),
  source: z.enum(["external", "local"]).optional(),
  search: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["type", "name", "owner", "status", "updated_at"]).default("name"),
  direction: z.enum(["asc", "desc"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  summary: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
}).strict();

function searchTerm(value: string): string {
  return value.replace(/[,%_()\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error, requestId(req));
    const { page, pageSize, type, owner, status, freshness, source, search, q, sort, summary } = parsed.data;
    const order = parsed.data.direction ?? parsed.data.order ?? "asc";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = getSupabaseAdmin()
      .from("brain_assets")
      .select("*", { count: "exact" });
    if (type) query = query.eq("type", type);
    if (owner) query = query.ilike("owner", `%${searchTerm(owner)}%`);
    if (status) query = query.eq("status", status === "enabled" ? "active" : status);
    if (freshness) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
      query = freshness === "stale" ? query.lt("updated_at", cutoff) : query.gte("updated_at", cutoff);
    }
    if (source === "external") query = query.like("source", "http%");
    if (source === "local") query = query.or("source.not.like.http%,source.is.null");
    const requestedSearch = search ?? q;
    if (requestedSearch) {
      const term = searchTerm(requestedSearch);
      if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,owner.ilike.%${term}%,source.ilike.%${term}%`);
    }

    query = query.order(sort, { ascending: order === "asc" });
    if (sort !== "type") query = query.order("type", { ascending: true });
    if (sort !== "name") query = query.order("name", { ascending: true });
    query = query.order("id", { ascending: true }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw new Error(`Inventory query failed: ${error.message}`);

    const assets = (data ?? []) as Asset[];
    const grouped: Record<string, Asset[]> = {};
    for (const asset of assets) (grouped[asset.type] ||= []).push(asset);
    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    let inventorySummary: { stale: number; activeMcp: number; byType: Record<string, number> } | undefined;
    if (summary) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
      const [staleResult, activeMcpResult, ...typeResults] = await Promise.all([
        getSupabaseAdmin().from("brain_assets").select("id", { count: "exact", head: true }).lt("updated_at", cutoff),
        getSupabaseAdmin().from("brain_assets").select("id", { count: "exact", head: true }).eq("type", "mcp").eq("enabled", true),
        ...ASSET_TYPES.map((assetType) => getSupabaseAdmin().from("brain_assets").select("id", { count: "exact", head: true }).eq("type", assetType)),
      ]);
      const failed = [staleResult, activeMcpResult, ...typeResults].find((result) => result.error);
      if (failed?.error) throw new Error(`Inventory summary query failed: ${failed.error.message}`);
      inventorySummary = {
        stale: staleResult.count ?? 0,
        activeMcp: activeMcpResult.count ?? 0,
        byType: Object.fromEntries(ASSET_TYPES.map((assetType, index) => [assetType, typeResults[index]?.count ?? 0])),
      };
    }

    return jsonPrivate({
      items: assets,
      total,
      totalPages,
      page,
      pageSize,
      summary: inventorySummary,
      skills: grouped.skill ?? [],
      plugins: grouped.plugin ?? [],
      cli: grouped.cli ?? [],
      mcp: grouped.mcp ?? [],
      designs: grouped.design ?? [],
      _all: assets,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: to + 1 < total,
      },
    });
  } catch (error) {
    return serverError(req, "/api/inventory", error);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { ASSET_TYPES, getSupabaseAdmin, type Asset } from "@/lib/supabase";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(1000),
  type: z.enum(ASSET_TYPES).optional(),
  owner: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "stale", "disabled"]).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["type", "name", "owner", "status", "updated_at"]).default("type"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

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
    const { page, pageSize, type, owner, status, q, sort, order } = parsed.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = getSupabaseAdmin()
      .from("brain_assets")
      .select("*", { count: "exact" });
    if (type) query = query.eq("type", type);
    if (owner) query = query.eq("owner", owner);
    if (status) query = query.eq("status", status);
    if (q) {
      const term = searchTerm(q);
      if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
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

    return jsonPrivate({
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
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        hasNextPage: to + 1 < total,
      },
    });
  } catch (error) {
    return serverError(req, "/api/inventory", error);
  }
}

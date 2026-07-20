import { NextRequest } from "next/server";
import { supabase, type AssetType } from "../../../lib/supabase";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const type = req.nextUrl.searchParams.get("type") as AssetType | null;
  const owner = req.nextUrl.searchParams.get("owner");

  let q = supabase.from("brain_assets").select("*").order("type").order("name");
  if (type) q = q.eq("type", type);
  if (owner) q = q.eq("owner", owner);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Group by type for the /api/inventory shape
  const grouped: Record<string, typeof data> = {};
  for (const a of data || []) {
    (grouped[a.type] ||= []).push(a);
  }
  return Response.json(
    {
      skills: grouped.skill || [],
      plugins: grouped.plugin || [],
      cli: grouped.cli || [],
      mcp: grouped.mcp || [],
      designs: grouped.design || [],
      _all: data,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

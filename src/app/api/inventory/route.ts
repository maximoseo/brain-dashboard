import { NextRequest } from "next/server";
import { supabase, type AssetType } from "../../../lib/supabase";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as AssetType | null;
  const owner = req.nextUrl.searchParams.get("owner");

  let q = supabase.from("assets").select("*").order("type").order("name");
  if (type) q = q.eq("type", type);
  if (owner) q = q.eq("owner", owner);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Group by type for the /api/inventory shape
  const grouped: Record<string, typeof data> = {};
  for (const a of data || []) {
    (grouped[a.type] ||= []).push(a);
  }
  return Response.json({
    skills: grouped.skill || [],
    plugins: grouped.plugin || [],
    cli: grouped.cli || [],
    mcp: grouped.mcp || [],
    designs: grouped.design || [],
    _all: data,
  });
}

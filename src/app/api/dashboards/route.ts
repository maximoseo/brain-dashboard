import { NextRequest } from "next/server";
import { supabase } from "../../../lib/supabase";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const { data, error } = await supabase.from("brain_dashboards").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(
    { dashboards: data },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}

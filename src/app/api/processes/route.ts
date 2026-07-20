import { NextRequest } from "next/server";
import { supabase } from "../../../lib/supabase";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const { data, error } = await supabase.from("brain_processes").select("*").order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ processes: data });
}

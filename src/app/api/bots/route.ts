import { NextRequest } from "next/server";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const { data, error } = await getSupabaseAdmin().from("brain_bots").select("*").order("name").limit(500);
    if (error) throw new Error(`Agent query failed: ${error.message}`);
    return jsonPrivate({ bots: data ?? [] });
  } catch (error) {
    return serverError(req, "/api/bots", error);
  }
}

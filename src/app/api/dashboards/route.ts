import { NextRequest } from "next/server";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const { data, error } = await getSupabaseAdmin().from("brain_dashboards").select("*").order("name").limit(500);
    if (error) throw new Error(`Dashboard query failed: ${error.message}`);
    return jsonPrivate({ dashboards: data ?? [] });
  } catch (error) {
    return serverError(req, "/api/dashboards", error);
  }
}

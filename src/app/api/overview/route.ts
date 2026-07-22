import { NextRequest } from "next/server";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const id = requestId(req);
  try {
    const { data, error } = await getSupabaseAdmin().rpc("brain_overview");
    if (error) {
      return jsonPrivate({ error: "overview_unavailable", detail: error.message, requestId: id }, { status: 503 });
    }
    return jsonPrivate({ ...data, requestId: id });
  } catch (error) {
    return serverError(req, "/api/overview", error);
  }
}

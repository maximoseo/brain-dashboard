import { NextRequest } from "next/server";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { authorizeRead } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const id = requestId(req);
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const { data, error } = await getSupabaseAdmin().rpc("brain_overview");
    if (error) {
      return jsonPrivate({ error: "overview_unavailable", requestId: id }, { status: 503 });
    }
    return jsonPrivate({ ...data, requestId: id });
  } catch (error) {
    return serverError(req, "/api/overview", error);
  }
}

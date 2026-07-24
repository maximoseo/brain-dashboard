import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.string().trim().min(1).max(80).optional(),
  cursor: z.coerce.number().int().positive().optional(),
}).strict();

export async function GET(req: NextRequest) {
  const id = requestId(req);
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;

    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return validationError(parsed.error, id);

    const { cursor, limit, type } = parsed.data;
    let query = getSupabaseAdmin()
      .from("brain_activity")
      .select("id,event_type,actor,summary,detail,created_at")
      .order("id", { ascending: false })
      .limit(100);

    if (type) query = query.eq("event_type", type);
    if (cursor) query = query.lt("id", cursor);
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`Activity query failed: ${error.message}`);

    const events = data ?? [];
    const nextCursor = events.length === limit ? events.at(-1)?.id : null;
    return jsonPrivate({ events, nextCursor, requestId: id });
  } catch (error) {
    return serverError(req, "/api/activity", error);
  }
}

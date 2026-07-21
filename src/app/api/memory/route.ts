import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRead, authorizeWrite } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

const scopeSchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9:_-]+$/);
const memorySchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(20_000),
  scope: scopeSchema.default("global"),
  source: z.string().trim().max(500).optional(),
}).strict();

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRead(req);
    if (!auth.ok) return auth.response;
    const parsed = scopeSchema.safeParse(req.nextUrl.searchParams.get("scope") ?? "global");
    if (!parsed.success) return validationError(parsed.error, requestId(req));

    const { data, error } = await getSupabaseAdmin()
      .from("brain_memory_facts")
      .select("*")
      .eq("scope", parsed.data)
      .order("key")
      .limit(500);
    if (error) throw new Error(`Memory query failed: ${error.message}`);
    return jsonPrivate({ facts: data ?? [] });
  } catch (error) {
    return serverError(req, "/api/memory", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeWrite(req, "memory:write");
    if (!auth.ok) return auth.response;
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return jsonPrivate({ error: "unsupported_media_type" }, { status: 415 });
    }

    const parsed = memorySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error, requestId(req));
    const { data, error } = await getSupabaseAdmin()
      .from("brain_memory_facts")
      .upsert(parsed.data, { onConflict: "scope,key" })
      .select()
      .single();
    if (error) throw new Error(`Memory write failed: ${error.message}`);
    return jsonPrivate({ fact: data }, { status: 200 });
  } catch (error) {
    return serverError(req, "/api/memory", error);
  }
}

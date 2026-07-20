import { NextRequest } from "next/server";
import { supabase, supabaseAdmin } from "../../../lib/supabase";
import { checkSync } from "../../../lib/auth";
import { checkApiKey, unauthorized } from "../../../lib/api-auth";

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return unauthorized();

  const scope = req.nextUrl.searchParams.get("scope") || "global";
  const { data, error } = await supabase
    .from("brain_memory_facts").select("*").eq("scope", scope).order("key");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ facts: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!checkSync(body.secret)) return Response.json({ error: "bad secret" }, { status: 401 });
  const { key, value, scope = "global", source } = body;
  if (!key || !value) return Response.json({ error: "key and value required" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("brain_memory_facts").upsert({ key, value, scope, source }, { onConflict: "scope,key" }).select();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ fact: data?.[0] });
}

import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { checkSync } from "../../../lib/auth";

interface SyncAsset { type: string; name: string; owner?: string; description?: string; source?: string; version?: string; enabled?: boolean; meta?: Record<string, unknown>; }
interface SyncBody { bot: string; secret?: string; assets: SyncAsset[]; }

const MAX_ASSETS = 500;

export async function POST(req: NextRequest) {
  let body: SyncBody;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
  if (!checkSync(body.secret)) return Response.json({ error: "bad secret" }, { status: 401 });
  if (!Array.isArray(body.assets)) return Response.json({ error: "assets must be array" }, { status: 400 });
  if (body.assets.length > MAX_ASSETS) return Response.json({ error: `max ${MAX_ASSETS} assets per sync` }, { status: 413 });

  const rows = body.assets
    .filter(a => a.type && a.name && a.type.length <= 20 && a.name.length <= 200)
    .map(a => ({
      type: a.type, name: a.name, owner: (a.owner || body.bot || "unknown").slice(0, 100),
      description: (a.description || null), source: (a.source || null), version: (a.version || null),
      enabled: a.enabled !== false, meta: a.meta || {}, updated_at: new Date().toISOString(),
    }));

  const { error } = await supabaseAdmin.from("brain_assets").upsert(rows, { onConflict: "type,name,owner" });
  const upserted = error ? 0 : rows.length;
  const skipped = body.assets.length - rows.length;

  await supabaseAdmin.from("brain_sync_log").insert({
    bot: body.bot, endpoint: "/api/sync", status: error ? "error" : "ok",
    detail: error ? error.message.slice(0, 200) : `upserted=${upserted} skipped=${skipped}`,
  });

  // bump last_seen without overwriting kind
  await supabaseAdmin.from("brain_bots").upsert({ name: body.bot, last_seen: new Date().toISOString() }, { onConflict: "name" });

  return Response.json({ upserted, skipped, error: error?.message });
}

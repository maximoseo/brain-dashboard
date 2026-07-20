import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { checkSync } from "../../../lib/auth";

interface SyncAsset {
  type: string;
  name: string;
  owner?: string;
  description?: string;
  source?: string;
  version?: string;
  enabled?: boolean;
  meta?: Record<string, unknown>;
}
interface SyncBody {
  bot: string;
  secret?: string;
  assets: SyncAsset[];
}

export async function POST(req: NextRequest) {
  let body: SyncBody;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }

  if (!checkSync(body.secret)) return Response.json({ error: "bad secret" }, { status: 401 });
  if (!Array.isArray(body.assets)) return Response.json({ error: "assets must be array" }, { status: 400 });

  let upserted = 0, skipped = 0;
  const errors: string[] = [];

  for (const a of body.assets) {
    if (!a.type || !a.name) { skipped++; continue; }
    const row = {
      type: a.type, name: a.name, owner: a.owner || body.bot || "unknown",
      description: a.description || null, source: a.source || null, version: a.version || null,
      enabled: a.enabled !== false, meta: a.meta || {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("brain_assets")
      .upsert(row, { onConflict: "type,name,owner" });
    if (error) { errors.push(`${a.type}/${a.name}: ${error.message}`); skipped++; }
    else upserted++;
  }

  await supabaseAdmin.from("brain_sync_log").insert({
    bot: body.bot, endpoint: "/api/sync",
    status: errors.length ? "partial" : "ok",
    detail: `upserted=${upserted} skipped=${skipped}${errors.length ? " errors=" + errors.join(";") : ""}`,
  });

  // bump bot last_seen
  await supabaseAdmin.from("brain_bots").upsert({
    name: body.bot, kind: body.bot, last_seen: new Date().toISOString(),
  }, { onConflict: "name" });

  return Response.json({ upserted, skipped, errors: errors.slice(0, 5) });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonPrivate, logRequest, requestId } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";

const modeSchema = z.enum(["live", "ready"]);

export async function GET(req: NextRequest) {
  const started = Date.now();
  const id = requestId(req);
  const parsed = modeSchema.safeParse(req.nextUrl.searchParams.get("mode") ?? "ready");
  if (!parsed.success) return jsonPrivate({ error: "invalid_health_mode", requestId: id }, { status: 400 });

  if (parsed.data === "live") {
    return jsonPrivate({ status: "ok", check: "liveness", timestamp: new Date().toISOString(), requestId: id });
  }

  const database: "up" | "down" = await (async () => {
    try {
      const { error } = await getSupabaseAdmin().from("brain_bots").select("id", { head: true, count: "exact" }).limit(1);
      return error ? "down" : "up";
    } catch {
      return "down";
    }
  })();

  // Schema compatibility check
  let schemaVersion = 0;
  if (database === "up") {
    try {
      const { data } = await getSupabaseAdmin().rpc("brain_schema_version");
      schemaVersion = typeof data === "number" ? data : 0;
    } catch {
      schemaVersion = 0;
    }
  }

  const schemaCompatible = schemaVersion >= 3;
  const status = database === "up" && schemaCompatible ? 200 : 503;
  const latencyMs = Date.now() - started;
  logRequest({ event: "health_check", requestId: id, route: "/api/health", status, latencyMs, database, schemaVersion });
  return jsonPrivate({
    status: status === 200 ? "ok" : "degraded",
    check: "readiness",
    dependencies: { database, schema: schemaCompatible ? "compatible" : "incompatible" },
    schemaVersion,
    requiredSchemaVersion: 3,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "development",
    requestId: id,
  }, { status });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authorizeWrite } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { sendAlert, AlertPayload } from "@/lib/telegram-alert";

const ALERT_SCOPE = "alert:write" as const;

const severitySchema = z.enum(["critical", "error", "warning", "info", "success"]);

const alertBodySchema = z.object({
  severity: severitySchema.default("error"),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(8_000),
  action: z.string().trim().max(2_000).optional(),
  component: z.string().trim().max(200).optional(),
  context: z.string().trim().max(2_000).optional(),
}).strict();

function telegramEscape(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function emitServerSideAlert(payload: AlertPayload): Promise<boolean> {
  return sendAlert({
    ...payload,
    title: telegramEscape(payload.title),
    details: telegramEscape(payload.details),
    action: payload.action ? telegramEscape(payload.action) : undefined,
    context: payload.context ? telegramEscape(payload.context) : undefined,
    component: payload.component,
  });
}

/**
 * POST /api/alert — Internal alert relay.
 * Requires a session OR the dedicated `BRAIN_ALERT_WRITE_KEY` scoped bearer.
 * Server-side routes (e.g. cron, health monitoring) should set `BRAIN_ALERT_WRITE_KEY`
 * in Vercel environment and call this endpoint with that bearer.
 * Browser error boundaries are intentionally no longer wired here; alerts are
 * emitted server-side only.
 */
export async function POST(req: NextRequest) {
  const id = requestId(req);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonPrivate({ error: "unsupported_media_type", requestId: id }, { status: 415 });
  }
  try {
    const auth = await authorizeWrite(req, ALERT_SCOPE);
    if (!auth.ok) return auth.response;
    const raw = await req.json().catch(() => null);
    const parsed = alertBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonPrivate(
        { error: "validation_failed", requestId: id, issues: parsed.error.issues },
        { status: 422 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: identity, error: identityError } = await supabase
      .from("brain_identities")
      .select("email, role, display_name")
      .eq("disabled", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (identityError) {
      // Non-fatal: continue with the configured dashboard identity.
    }
    const dashboard = process.env.NEXT_PUBLIC_DASHBOARD_NAME?.trim() || "Brain Dashboard";
    const site = process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim() || "";

    const payload: AlertPayload = {
      dashboard,
      site,
      severity: parsed.data.severity,
      title: parsed.data.title,
      details: parsed.data.details,
      action: parsed.data.action,
      component: parsed.data.component,
      context: parsed.data.context,
    };

    const sent = await emitServerSideAlert(payload);
    return jsonPrivate(
      {
        sent,
        emittedBy: identity ? identity.email : "service-role",
        requestId: id,
      },
      { status: sent ? 200 : 503 },
    );
  } catch (error) {
    return serverError(req, "/api/alert", error);
  }
}

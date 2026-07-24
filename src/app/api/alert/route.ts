import { NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest, jsonPrivate, requestId, serverError, validationError } from "@/lib/http";
import { SESSION_COOKIE, verifyActiveSession } from "@/lib/session";
import { sendAlert, AlertPayload } from "@/lib/telegram-alert";

const alertSchema = z.object({
  severity: z.enum(["info", "warning", "error", "critical", "success"]).default("error"),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(4_000),
  action: z.string().trim().max(500).optional(),
  component: z.string().trim().max(200).optional(),
  context: z.string().trim().max(1_000).optional(),
}).strict();

/**
 * POST /api/alert — Universal alert endpoint
 * Any internal component can POST here to trigger a Telegram alert.
 * Also used by the global error boundary.
 */
export async function POST(req: NextRequest) {
  const id = requestId(req);
  if (!isSameOriginRequest(req)) {
    return jsonPrivate({ error: "forbidden_origin", requestId: id }, { status: 403 });
  }

  const session = await verifyActiveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return jsonPrivate({ error: "unauthorized", requestId: id }, { status: 401 });
  }

  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonPrivate({ error: "unsupported_media_type", requestId: id }, { status: 415 });
  }

  try {
    const parsed = alertSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error, id);
    const { severity, title, details, action, component, context } = parsed.data;

    const payload: AlertPayload = {
      dashboard: process.env.NEXT_PUBLIC_DASHBOARD_NAME || 'Unknown Dashboard',
      site: process.env.NEXT_PUBLIC_DASHBOARD_URL || '',
      severity: severity || 'error',
      title,
      details,
      action,
      component,
      context,
    };

    const sent = await sendAlert(payload);
    return jsonPrivate({ sent, requestId: id });
  } catch (err) {
    return serverError(req, "/api/alert", err);
  }
}

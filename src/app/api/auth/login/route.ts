import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { safeRedirectPath } from "@/lib/redirect";
import { hashIdentifier, issueSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

const loginSchema = z.object({
  password: z.string().min(1).max(1024),
  next: z.unknown().optional(),
}).strict();

const rateResultSchema = z.object({ allowed: z.boolean(), retry_after: z.number().int().nonnegative() });

function passwordMatches(password: string, expected: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestFingerprint(req: NextRequest, secret: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return hashIdentifier(`${secret}:${ip}`);
}

async function rateLimit(identifierHash: string, success: boolean | null): Promise<z.infer<typeof rateResultSchema>> {
  const { data, error } = await getSupabaseAdmin().rpc("brain_check_login_rate_limit", {
    p_identifier_hash: identifierHash,
    p_success: success,
  });
  if (error) throw new Error(`Login rate limit unavailable: ${error.message}`);
  return rateResultSchema.parse(data);
}

async function auditLogin(identifierHash: string, result: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("brain_audit_log").insert({
    event: "auth.login",
    actor: "operator",
    result,
    source_ip_hash: identifierHash,
    request_id: id,
  });
  if (error) console.error(JSON.stringify({ level: "error", event: "audit_write_failed", route: "/api/auth/login" }));
}

export async function POST(req: NextRequest) {
  const id = requestId(req);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonPrivate({ error: "unsupported_media_type", requestId: id }, { status: 415 });
  }

  try {
    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonPrivate({ error: "invalid_request", requestId: id }, { status: 400 });

    const env = getServerEnv();
    const fingerprint = requestFingerprint(req, env.BRAIN_SESSION_SECRET);
    const status = await rateLimit(fingerprint, null);
    if (!status.allowed) {
      await auditLogin(fingerprint, "rate_limited", id);
      const response = jsonPrivate({ error: "too_many_attempts", retryAfter: status.retry_after, requestId: id }, { status: 429 });
      response.headers.set("Retry-After", String(status.retry_after));
      return response;
    }

    if (!passwordMatches(parsed.data.password, env.BRAIN_ACCESS_PASSWORD)) {
      await rateLimit(fingerprint, false);
      await auditLogin(fingerprint, "failure", id);
      return jsonPrivate({ error: "invalid_credentials", requestId: id }, { status: 401 });
    }

    await rateLimit(fingerprint, true);
    const session = await issueSession();
    await auditLogin(fingerprint, "success", id);
    const response = jsonPrivate({ ok: true, redirect: safeRedirectPath(parsed.data.next), requestId: id });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    return serverError(req, "/api/auth/login", error);
  }
}

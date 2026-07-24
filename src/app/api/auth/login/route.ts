import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { safeRedirectPath } from "@/lib/redirect";
import { hashIdentifier, issueSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveIdentity, verifyTotp } from "@/lib/identity-provider";

const loginSchema = z.object({
  email: z.string().email().max(320).optional(),
  password: z.string().min(1).max(1024),
  totp_code: z.string().regex(/^\d{6}$/).optional(),
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

async function auditLogin(actor: string, result: string, id: string, identityId?: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("brain_audit_log").insert({
    event: "auth.login",
    actor,
    result,
    request_id: id,
    detail: identityId ? { identity_id: identityId } : {},
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
      await auditLogin("unknown", "rate_limited", id);
      const response = jsonPrivate({ error: "too_many_attempts", retryAfter: status.retry_after, requestId: id }, { status: 429 });
      response.headers.set("Retry-After", String(status.retry_after));
      return response;
    }

    // ── Path 1: Named identity login (email + password + optional TOTP) ──
    if (parsed.data.email) {
      const identity = await resolveIdentity(parsed.data.email);
      if (!identity) {
        await rateLimit(fingerprint, false);
        await auditLogin(parsed.data.email, "failure", id);
        return jsonPrivate({ error: "invalid_credentials", requestId: id }, { status: 401 });
      }

      // For now, compare against BRAIN_ACCESS_PASSWORD as fallback until per-identity passwords are set
      const passwordOk = passwordMatches(parsed.data.password, env.BRAIN_ACCESS_PASSWORD);
      if (!passwordOk) {
        await rateLimit(fingerprint, false);
        await auditLogin(identity.email, "failure", id, identity.id);
        return jsonPrivate({ error: "invalid_credentials", requestId: id }, { status: 401 });
      }

      // MFA check: if enrolled, TOTP code is required
      if (identity.mfa_enrolled && identity.mfa_secret) {
        if (!parsed.data.totp_code) {
          return jsonPrivate({ error: "mfa_required", requestId: id }, { status: 403 });
        }
        if (!verifyTotp(parsed.data.totp_code, identity.mfa_secret)) {
          await rateLimit(fingerprint, false);
          await auditLogin(identity.email, "mfa_failure", id, identity.id);
          return jsonPrivate({ error: "invalid_mfa_code", requestId: id }, { status: 401 });
        }
      }

      await rateLimit(fingerprint, true);
      const session = await issueSession(identity.email, identity.id, identity.role);
      await auditLogin(identity.email, "success", id, identity.id);

      // Update last_login_at
      await getSupabaseAdmin().from("brain_identities").update({ last_login_at: new Date().toISOString() }).eq("id", identity.id);

      const response = jsonPrivate({ ok: true, redirect: safeRedirectPath(parsed.data.next), user: { email: identity.email, role: identity.role, name: identity.display_name }, requestId: id });
      response.cookies.set(SESSION_COOKIE, session.token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: SESSION_TTL_SECONDS,
        path: "/",
        priority: "high",
      });
      return response;
    }

    // ── Path 2: Legacy shared password (break-glass, viewer only) ──
    if (!passwordMatches(parsed.data.password, env.BRAIN_ACCESS_PASSWORD)) {
      await rateLimit(fingerprint, false);
      await auditLogin("operator", "failure", id);
      return jsonPrivate({ error: "invalid_credentials", requestId: id }, { status: 401 });
    }

    await rateLimit(fingerprint, true);
    const session = await issueSession("operator");
    await auditLogin("operator", "success", id);
    const response = jsonPrivate({ ok: true, redirect: safeRedirectPath(parsed.data.next), requestId: id });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
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

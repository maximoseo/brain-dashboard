import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "./env";
import { jsonPrivate } from "./http";
import { SESSION_COOKIE, verifyActiveSession } from "./session";

export type AuthScope = "read" | "sync:write" | "memory:write";
export interface AuthContext {
  actor: string;
  method: "session" | "bearer";
  scope: AuthScope;
}

type AuthResult = { ok: true; auth: AuthContext } | { ok: false; response: NextResponse };

function constantTimeEqual(value: string, expected: string): boolean {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

function scopeForToken(token: string): AuthScope | null {
  const env = getServerEnv();
  if (constantTimeEqual(token, env.BRAIN_API_READ_KEY)) return "read";
  if (constantTimeEqual(token, env.BRAIN_SYNC_WRITE_KEY)) return "sync:write";
  if (constantTimeEqual(token, env.BRAIN_MEMORY_WRITE_KEY)) return "memory:write";
  return null;
}

export async function authorizeRead(req: NextRequest): Promise<AuthResult> {
  const session = await verifyActiveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return { ok: true, auth: { actor: "operator", method: "session", scope: "read" } };

  const token = bearerToken(req);
  if (!token) return { ok: false, response: unauthorized() };
  const scope = scopeForToken(token);
  if (scope !== "read") {
    return { ok: false, response: scope ? forbidden("read") : unauthorized() };
  }
  return { ok: true, auth: { actor: "service:reader", method: "bearer", scope } };
}

export async function authorizeWrite(req: NextRequest, requiredScope: Exclude<AuthScope, "read">): Promise<AuthResult> {
  const token = bearerToken(req);
  if (!token) return { ok: false, response: unauthorized() };
  const scope = scopeForToken(token);
  if (scope !== requiredScope) {
    return { ok: false, response: scope ? forbidden(requiredScope) : unauthorized() };
  }
  return { ok: true, auth: { actor: `service:${requiredScope}`, method: "bearer", scope } };
}

export function unauthorized(): NextResponse {
  const response = jsonPrivate({ error: "unauthorized" }, { status: 401 });
  response.headers.set("WWW-Authenticate", "Bearer");
  return response;
}

export function forbidden(requiredScope: AuthScope): NextResponse {
  return jsonPrivate({ error: "insufficient_scope", requiredScope }, { status: 403 });
}

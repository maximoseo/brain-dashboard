import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

export const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function requestId(req: Request): string {
  return req.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();
}

export function jsonPrivate(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_CACHE_HEADERS)) headers.set(key, value);
  return NextResponse.json(body, { ...init, headers });
}

export function validationError(error: ZodError, id?: string): NextResponse {
  return jsonPrivate(
    {
      error: "validation_failed",
      requestId: id,
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    },
    { status: 422 },
  );
}

export function serverError(req: NextRequest, route: string, error: unknown): NextResponse {
  const id = requestId(req);
  console.error(JSON.stringify({
    level: "error",
    event: "request_failed",
    requestId: id,
    route,
    errorClass: error instanceof Error ? error.name : "UnknownError",
  }));
  return jsonPrivate({ error: "internal_server_error", requestId: id }, { status: 500 });
}

export function logRequest(fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ level: "info", ...fields }));
}

export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}

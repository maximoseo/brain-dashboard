import { NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/redirect";
import { SESSION_COOKIE, verifyActiveSession } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/favicon.ico"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path) || pathname.startsWith("/_next/") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  try {
    const session = await verifyActiveSession(req.cookies.get(SESSION_COOKIE)?.value);
    if (session) return NextResponse.next();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "session_verification_failed",
      errorClass: error instanceof Error ? error.name : "UnknownError",
    }));
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", safeRedirectPath(`${pathname}${search}`));
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

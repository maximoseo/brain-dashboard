import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const SESSION_SECRET = process.env.BRAIN_SESSION_SECRET || "";

// Routes that require auth (UI pages)
const PROTECTED_PAGES = ["/", "/overview", "/inventory", "/bots", "/dashboards", "/knowledge", "/memory"];

// Routes that are public (login page, static assets)
const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico"];

function verifySession(token: string): boolean {
  if (!SESSION_SECRET) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [timestamp, hash] = decoded.split(".");
    if (!timestamp || !hash) return false;
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return false;
    const expected = Buffer.from(SESSION_SECRET).toString("base64").slice(0, 32);
    const a = Buffer.from(hash);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // API routes handle their own auth — skip middleware
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check if this is a protected page
  const isProtectedPage = PROTECTED_PAGES.some(p => pathname === p || pathname.startsWith(p + "/"));
  if (!isProtectedPage) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = req.cookies.get("brain_session")?.value;
  if (session && verifySession(session)) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

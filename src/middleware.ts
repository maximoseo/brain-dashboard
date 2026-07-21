import { NextRequest, NextResponse } from "next/server";

const SESSION_SECRET = process.env.BRAIN_SESSION_SECRET || "";

// Routes that require auth (UI pages)
const PROTECTED_PAGES = ["/", "/overview", "/inventory", "/agents", "/dashboards", "/knowledge", "/memory", "/processes", "/activity"];

// Routes that are public (login page, static assets)
const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico"];

// Edge-runtime compatible constant-time string comparison
// (Node's crypto.timingSafeEqual is NOT available in Vercel Edge Runtime —
// its import fails silently and verifySession would always return false)
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function verifySession(token: string): boolean {
  if (!SESSION_SECRET) return false;
  try {
    // Cookies may be URL-encoded in transit
    const decodedToken = decodeURIComponent(token);
    // atob/btoa are Edge-safe equivalents of Buffer base64 for ASCII payloads
    const decoded = atob(decodedToken);
    const [timestamp, hash] = decoded.split(".");
    if (!timestamp || !hash) return false;
    // Session valid for 24h
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return false;
    const expected = btoa(SESSION_SECRET).slice(0, 32);
    return constantTimeEqual(hash, expected);
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

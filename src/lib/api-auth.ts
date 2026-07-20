import { NextRequest, NextResponse } from "next/server";

const SYNC_SECRET = process.env.BRAIN_SYNC_SECRET || "";
const SESSION_SECRET = process.env.BRAIN_SESSION_SECRET || "";

// Edge-runtime compatible constant-time comparison
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
    const decodedToken = decodeURIComponent(token);
    const decoded = atob(decodedToken);
    const [timestamp, hash] = decoded.split(".");
    if (!timestamp || !hash) return false;
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return false;
    const expected = btoa(SESSION_SECRET).slice(0, 32);
    return constantTimeEqual(hash, expected);
  } catch {
    return false;
  }
}

export function checkApiKey(req: NextRequest): boolean {
  // Check session cookie first (browser requests)
  const session = req.cookies.get("brain_session")?.value;
  if (session && verifySession(session)) return true;

  // Fall back to API key (bot/external requests)
  if (!SYNC_SECRET) return false;
  const key = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("key") || "";
  if (!key) return false;
  return constantTimeEqual(key, SYNC_SECRET);
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const SYNC_SECRET = process.env.BRAIN_SYNC_SECRET || "";
const SESSION_SECRET = process.env.BRAIN_SESSION_SECRET || "";

function verifySession(token: string): boolean {
  if (!SESSION_SECRET) return false;
  try {
    const decodedToken = decodeURIComponent(token);
    const decoded = Buffer.from(decodedToken, "base64").toString();
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

export function checkApiKey(req: NextRequest): boolean {
  // Check session cookie first (browser requests)
  const session = req.cookies.get("brain_session")?.value;
  if (session && verifySession(session)) return true;

  // Fall back to API key (bot/external requests)
  if (!SYNC_SECRET) return false;
  const key = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("key") || "";
  if (!key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(SYNC_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  
  const decodedToken = decodeURIComponent(token);
  const decoded = Buffer.from(decodedToken, "base64").toString();
  const [timestamp, hash] = decoded.split(".");
  
  return NextResponse.json({
    sessionSecretSet: !!SESSION_SECRET,
    sessionSecretLength: SESSION_SECRET.length,
    token,
    decoded,
    timestamp,
    hash,
    valid: verifySession(token),
  });
}

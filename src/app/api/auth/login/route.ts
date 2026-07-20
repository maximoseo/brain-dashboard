import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const ACCESS_PASSWORD = process.env.BRAIN_ACCESS_PASSWORD || "";
const SESSION_SECRET = process.env.BRAIN_SESSION_SECRET || "";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!ACCESS_PASSWORD) {
      return NextResponse.json({ error: "BRAIN_ACCESS_PASSWORD not configured" }, { status: 500 });
    }

    // Constant-time comparison
    const a = Buffer.from(password || "");
    const b = Buffer.from(ACCESS_PASSWORD);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid password" }, { status: 401 });
    }

    // Generate session token
    const timestamp = Date.now().toString();
    const hash = btoa(SESSION_SECRET || "default-secret").slice(0, 32);
    const token = btoa(`${timestamp}.${hash}`);

    const res = NextResponse.json({ ok: true });
    res.cookies.set("brain_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24h
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

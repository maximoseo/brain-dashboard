import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    sessionSecretSet: !!process.env.BRAIN_SESSION_SECRET,
    sessionSecretLength: process.env.BRAIN_SESSION_SECRET?.length || 0,
    accessPasswordSet: !!process.env.BRAIN_ACCESS_PASSWORD,
    accessPasswordLength: process.env.BRAIN_ACCESS_PASSWORD?.length || 0,
    syncSecretSet: !!process.env.BRAIN_SYNC_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

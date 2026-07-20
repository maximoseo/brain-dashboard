import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function GET() {
  const checks: Record<string, string> = { status: "ok", timestamp: new Date().toISOString() };

  // Check Supabase connection
  try {
    const { error } = await supabase.from("brain_bots").select("id").limit(1);
    checks.supabase = error ? `error: ${error.message}` : "connected";
  } catch (e) {
    checks.supabase = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  const status = checks.supabase === "connected" ? 200 : 503;
  return NextResponse.json(checks, { status });
}

import { NextRequest } from "next/server";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { verifyActiveSession, revokeSession, SESSION_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const id = requestId(req);
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await verifyActiveSession(token);
    if (!session) {
      return jsonPrivate({ authenticated: false, requestId: id }, { status: 401 });
    }

    // Look up identity if bound
    let identity = null;
    const { data: sessionRow } = await getSupabaseAdmin()
      .from("brain_sessions")
      .select("identity_id, role, actor")
      .eq("id", session.sid)
      .single();

    if (sessionRow?.identity_id) {
      const { data: identityRow } = await getSupabaseAdmin()
        .from("brain_identities")
        .select("id, email, display_name, role")
        .eq("id", sessionRow.identity_id)
        .single();
      if (identityRow) identity = identityRow;
    }

    return jsonPrivate({
      authenticated: true,
      session: { sid: session.sid, actor: sessionRow?.actor ?? "operator" },
      identity,
      requestId: id,
    });
  } catch (error) {
    return serverError(req, "/api/auth/session", error);
  }
}

export async function DELETE(req: NextRequest) {
  const id = requestId(req);
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    await revokeSession(token);
    const response = jsonPrivate({ ok: true, requestId: id });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    return serverError(req, "/api/auth/session", error);
  }
}

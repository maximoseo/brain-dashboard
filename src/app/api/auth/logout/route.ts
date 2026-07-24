import { NextRequest } from "next/server";
import { isSameOriginRequest, jsonPrivate, serverError } from "@/lib/http";
import { revokeSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return jsonPrivate({ error: "forbidden_origin" }, { status: 403 });
  }

  try {
    await revokeSession(req.cookies.get(SESSION_COOKIE)?.value);
    const response = jsonPrivate({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      expires: new Date(0),
      path: "/",
    });
    return response;
  } catch (error) {
    return serverError(req, "/api/auth/logout", error);
  }
}

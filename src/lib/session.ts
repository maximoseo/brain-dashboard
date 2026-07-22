import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "./env";
import { getSupabaseAdmin } from "./supabase";

export const SESSION_COOKIE = "brain_session";
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_IDLE_TTL_SECONDS = 2 * 60 * 60;
const SESSION_TOUCH_INTERVAL_SECONDS = 5 * 60;
const SESSION_ISSUER = "brain-dashboard";
const SESSION_AUDIENCE = "brain-dashboard-web";

const payloadSchema = z.object({
  v: z.literal(1),
  sid: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  iss: z.literal(SESSION_ISSUER),
  aud: z.literal(SESSION_AUDIENCE),
});

export type SessionPayload = z.infer<typeof payloadSchema>;

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSessionToken(
  secret: string,
  now = new Date(),
  sessionId = crypto.randomUUID(),
): { token: string; payload: SessionPayload } {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sid: sessionId,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encodedPayload}.${sign(encodedPayload, secret)}`, payload };
}

export function verifySessionToken(token: string, secret: string, now = new Date()): SessionPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expected = Buffer.from(sign(encodedPayload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const result = payloadSchema.safeParse(parsed);
    if (!result.success) return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (result.data.iat > nowSeconds + 60 || result.data.exp <= nowSeconds) return null;
    if (result.data.exp - result.data.iat !== SESSION_TTL_SECONDS) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueSession(
  actor = "operator",
  identityId?: string,
  role?: string,
): Promise<{ token: string; payload: SessionPayload }> {
  const env = getServerEnv();
  const session = createSessionToken(env.BRAIN_SESSION_SECRET);
  const { error } = await getSupabaseAdmin().from("brain_sessions").insert({
    id: session.payload.sid,
    actor,
    identity_id: identityId ?? null,
    role: role ?? null,
    expires_at: new Date(session.payload.exp * 1000).toISOString(),
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Unable to persist session: ${error.message}`);
  return session;
}

export async function verifyActiveSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const env = getServerEnv();
  const payload = verifySessionToken(token, env.BRAIN_SESSION_SECRET);
  if (!payload) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("brain_sessions")
    .select("id,expires_at,revoked_at,last_seen_at")
    .eq("id", payload.sid)
    .maybeSingle();
  const now = Date.now();
  if (error || !data || data.revoked_at) return null;
  const expiresAt = new Date(data.expires_at).getTime();
  const lastSeenAt = new Date(data.last_seen_at).getTime();
  if (
    !Number.isFinite(expiresAt) || !Number.isFinite(lastSeenAt) ||
    expiresAt <= now || lastSeenAt <= now - SESSION_IDLE_TTL_SECONDS * 1_000
  ) return null;

  if (lastSeenAt <= now - SESSION_TOUCH_INTERVAL_SECONDS * 1_000) {
    const { error: touchError } = await getSupabaseAdmin()
      .from("brain_sessions")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("id", payload.sid)
      .is("revoked_at", null);
    if (touchError) return null;
  }
  return payload;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const env = getServerEnv();
  const payload = verifySessionToken(token, env.BRAIN_SESSION_SECRET);
  if (!payload) return;
  const { error } = await getSupabaseAdmin()
    .from("brain_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", payload.sid)
    .is("revoked_at", null);
  if (error) throw new Error(`Unable to revoke session: ${error.message}`);
}

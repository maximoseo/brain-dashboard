import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSupabaseAdmin } from "./supabase";

export type Role = "viewer" | "auditor" | "operator" | "admin";

export interface Identity {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  mfa_enrolled: boolean;
  disabled: boolean;
}

const BCRYPT_COST_FACTOR = 12;

const identityRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string(),
  role: z.enum(["viewer", "auditor", "operator", "admin"]),
  mfa_enrolled: z.boolean(),
  mfa_secret: z.string().nullable(),
  password_hash: z.string().nullable(),
  disabled: z.boolean(),
});

/**
 * Look up an identity by email. Returns null if not found or disabled.
 */
export async function resolveIdentity(
  email: string,
): Promise<(Identity & { mfa_secret: string | null; password_hash: string | null }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("brain_identities")
    .select("id, email, display_name, role, mfa_enrolled, mfa_secret, password_hash, disabled")
    .ilike("email", email.trim())
    .single();

  if (error || !data) return null;
  const parsed = identityRowSchema.safeParse(data);
  if (!parsed.success) return null;
  if (parsed.data.disabled) return null;

  return parsed.data;
}

/**
 * Hash a password for storage in `brain_identities.password_hash`.
 * Use this when provisioning or resetting a named identity's credential.
 */
export async function hashIdentityPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verify a password against the identity's stored bcrypt hash.
 * Returns false (never throws) when the identity has no hash provisioned yet —
 * callers must not fall back to any shared/global credential in that case.
 */
export async function verifyIdentityPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  return bcrypt.compare(password, storedHash);
}

/**
 * TOTP verification (RFC 6238).
 * Accepts a 6-digit code and validates against the base32 secret.
 */
export function verifyTotp(code: string, secret: string, windowSeconds = 30, drift = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const now = Math.floor(Date.now() / 1000);
  for (let offset = -drift; offset <= drift; offset++) {
    const counter = Math.floor((now + offset * windowSeconds) / windowSeconds);
    const expected = generateTotp(secret, counter);
    if (safeCompareStrings(code, expected)) return true;
  }
  return false;
}

function generateTotp(base32Secret: string, counter: number): string {
  const key = base32Decode(base32Secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/[=\s]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Role hierarchy: admin > operator > auditor > viewer.
 */
const ROLE_LEVEL: Record<Role, number> = { viewer: 0, auditor: 1, operator: 2, admin: 3 };

export function hasMinRole(userRole: Role, required: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required];
}

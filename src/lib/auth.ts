import { timingSafeEqual } from "crypto";

const SYNC_SECRET = process.env.BRAIN_SYNC_SECRET || "";

export function checkSync(secret?: string): boolean {
  if (!SYNC_SECRET) return false; // fail closed when unset
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(SYNC_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

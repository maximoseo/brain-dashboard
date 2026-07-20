export const SYNC_SECRET = process.env.BRAIN_SYNC_SECRET || "";
export function checkSync(secret?: string) {
  if (!SYNC_SECRET) return true; // no secret configured = allow (dev mode)
  return secret === SYNC_SECRET;
}

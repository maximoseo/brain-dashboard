import { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWrite } from "@/lib/api-auth";
import { jsonPrivate, requestId, serverError } from "@/lib/http";
import { ASSET_TYPES, getSupabaseAdmin } from "@/lib/supabase";

const metadataSchema = z.record(
  z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.:-]+$/),
  z.unknown(),
).superRefine((value, ctx) => {
  if (Object.keys(value).length > 50) ctx.addIssue({ code: "custom", message: "metadata has too many keys" });
  if (JSON.stringify(value).length > 20_000) ctx.addIssue({ code: "custom", message: "metadata exceeds 20 KB" });
});

const assetSchema = z.object({
  type: z.enum(ASSET_TYPES),
  name: z.string().trim().min(2).max(200).refine(
    (name) => name.replace(/[\s┏━┳┗┛┃│└┐┌┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬─┄┆┈┊╌╎╭╮╯╰]/g, "").length >= 2,
    "name must contain at least two printable characters",
  ),
  owner: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(10_000).optional(),
  source: z.string().trim().max(2_000).optional(),
  version: z.string().trim().max(100).optional(),
  enabled: z.boolean().default(true),
  meta: metadataSchema.default({}),
}).strict();

export const syncBodySchema = z.object({
  bot: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/),
  credential_hash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  snapshot_uuid: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  digest: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  destructive: z.boolean().default(false),
  assets: z.array(assetSchema).max(500),
}).strict().superRefine((body, ctx) => {
  const seen = new Set<string>();
  body.assets.forEach((asset, index) => {
    if (asset.owner && asset.owner !== body.bot) {
      ctx.addIssue({ code: "custom", path: ["assets", index, "owner"], message: "owner must match the authenticated sync agent" });
    }
    const key = `${asset.type}\u0000${asset.name}\u0000${asset.owner ?? body.bot}`;
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["assets", index], message: "duplicate asset in snapshot" });
    seen.add(key);
  });
});

const syncResultSchema = z.object({
  received: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
});

const syncValidationSchema = z.object({
  status: z.string(),
  snapshot_id: z.string().optional(),
  detail: z.unknown().optional(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const id = requestId(req);
  try {
    const auth = await authorizeWrite(req, "sync:write");
    if (!auth.ok) return auth.response;
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return jsonPrivate({ error: "unsupported_media_type", requestId: id, failures: [] }, { status: 415 });
    }

    const parsed = syncBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const failures = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      }));
      return jsonPrivate({ error: "validation_failed", requestId: id, failures }, { status: 422 });
    }

    const db = getSupabaseAdmin();
    const validation = await db.rpc("brain_validate_sync", {
      p_bot_name: parsed.data.bot,
      p_credential_hash: parsed.data.credential_hash.toLowerCase(),
      p_snapshot_uuid: parsed.data.snapshot_uuid,
      p_sequence: parsed.data.sequence,
      p_digest: parsed.data.digest.toLowerCase(),
      p_asset_count: parsed.data.assets.length,
      p_is_destructive: parsed.data.destructive,
    });
    if (validation.error) {
      console.error(JSON.stringify({ level: "error", event: "sync_validation_failed", requestId: id, actor: parsed.data.bot }));
      return jsonPrivate({
        error: "sync_validation_failed",
        requestId: id,
        failures: [{ code: "sync_validation_failed", message: "The inventory snapshot could not be validated" }],
      }, { status: 500 });
    }
    const validationResult = syncValidationSchema.safeParse(validation.data);
    if (!validationResult.success || validationResult.data.status !== "accepted") {
      return jsonPrivate({
        error: "sync_rejected",
        status: validationResult.success ? validationResult.data.status : "invalid_validation_result",
        detail: validationResult.success ? validationResult.data.detail ?? validationResult.data.reason : undefined,
        requestId: id,
        failures: [{ code: "sync_rejected", message: "The inventory snapshot was rejected before mutation" }],
      }, { status: 409 });
    }

    const assets = parsed.data.assets.map((asset) => ({ ...asset, owner: parsed.data.bot }));
    const { data, error } = await db.rpc("brain_sync_inventory", {
      p_agent: parsed.data.bot,
      p_assets: assets,
      p_request_id: id,
    });
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "sync_failed", requestId: id, actor: parsed.data.bot }));
      return jsonPrivate({
        error: "sync_failed",
        requestId: id,
        failures: [{ code: "database_transaction_failed", message: "The inventory snapshot was not applied" }],
      }, { status: 500 });
    }

    const result = syncResultSchema.safeParse(data);
    if (!result.success) throw new Error("Sync transaction returned an invalid result");
    return jsonPrivate({ ...result.data, failures: [], requestId: id });
  } catch (error) {
    return serverError(req, "/api/sync", error);
  }
}

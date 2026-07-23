import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal("").transform(() => undefined));

const serverEnvSchema = z
  .object({
    SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_KEY: z.string().min(20).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    BRAIN_ACCESS_PASSWORD: z.string().min(12),
    BRAIN_SESSION_SECRET: z.string().min(32),
    BRAIN_API_READ_KEY: z.string().min(32),
    BRAIN_SYNC_WRITE_KEY: z.string().min(32),
    BRAIN_MEMORY_WRITE_KEY: z.string().min(32),
    BRAIN_ALERT_WRITE_KEY: z.string().min(32).optional(),
    SUPERMEMORY_API_KEY: z.string().optional(),
    MEM0_API_URL: optionalUrl,
    OBSIDIAN_API_URL: optionalUrl,
    OBSIDIAN_API_KEY: z.string().optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    CRON_SECRET: z.string().min(32).optional(),
    DASHBOARD_PROBE_ALLOWED_HOSTS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) {
      ctx.addIssue({ code: "custom", message: "SUPABASE_URL is required", path: ["SUPABASE_URL"] });
    }
    if (!env.SUPABASE_SERVICE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({ code: "custom", message: "SUPABASE_SERVICE_KEY is required", path: ["SUPABASE_SERVICE_KEY"] });
    }

    const scopedKeys = [env.BRAIN_API_READ_KEY, env.BRAIN_SYNC_WRITE_KEY, env.BRAIN_MEMORY_WRITE_KEY];
    if (new Set(scopedKeys).size !== scopedKeys.length) {
      ctx.addIssue({ code: "custom", message: "API keys for read, sync, and memory scopes must be distinct" });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
};

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  cachedEnv = {
    ...parsed.data,
    SUPABASE_URL: parsed.data.SUPABASE_URL ?? parsed.data.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_KEY: parsed.data.SUPABASE_SERVICE_KEY ?? parsed.data.SUPABASE_SERVICE_ROLE_KEY!,
  };
  return cachedEnv;
}

export function validateServerEnv(): void {
  getServerEnv();
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}

/* global process, console */
import { config } from "dotenv";
config({ path: ".env.local" });
import { z } from "zod";

const schema = z.object({
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
  CRON_SECRET: z.string().min(32).optional(),
  DASHBOARD_PROBE_ALLOWED_HOSTS: z.string().optional(),
  TELEGRAM_ALERT_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALERT_CHAT_ID: z.string().optional(),
  NEXT_PUBLIC_DASHBOARD_NAME: z.string().optional(),
  NEXT_PUBLIC_DASHBOARD_URL: z.string().url().optional(),
}).superRefine((env, ctx) => {
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) {
    ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "required" });
  }
  if (!env.SUPABASE_SERVICE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_KEY"], message: "required" });
  }
  const keys = [
    env.BRAIN_API_READ_KEY,
    env.BRAIN_SYNC_WRITE_KEY,
    env.BRAIN_MEMORY_WRITE_KEY,
  ];
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: "custom", path: ["scoped API keys"], message: "must be distinct" });
  }
  if (env.BRAIN_ALERT_WRITE_KEY && keys.includes(env.BRAIN_ALERT_WRITE_KEY)) {
    ctx.addIssue({
      code: "custom",
      path: ["BRAIN_ALERT_WRITE_KEY"],
      message: "must be distinct from the other scoped API keys",
    });
  }
  if (env.TELEGRAM_ALERT_BOT_TOKEN && !env.TELEGRAM_ALERT_CHAT_ID) {
    ctx.addIssue({
      code: "custom",
      path: ["TELEGRAM_ALERT_CHAT_ID"],
      message: "required when TELEGRAM_ALERT_BOT_TOKEN is set",
    });
  }
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment"))];
  console.error(`Invalid server environment: ${fields.join(", ")}`);
  process.exit(1);
}

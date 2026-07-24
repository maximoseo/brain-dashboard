/* global process, console */
import { config } from "dotenv";
import { z } from "zod";

config({ path: ".env.local" });

const optionalRuntimeSecret = z.string().min(1).optional();
const schema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  BRAIN_ACCESS_PASSWORD: optionalRuntimeSecret,
  BRAIN_SESSION_SECRET: optionalRuntimeSecret,
  BRAIN_API_READ_KEY: optionalRuntimeSecret,
  BRAIN_SYNC_WRITE_KEY: optionalRuntimeSecret,
  BRAIN_MEMORY_WRITE_KEY: optionalRuntimeSecret,
}).superRefine((env, ctx) => {
  const scopedKeys = [env.BRAIN_API_READ_KEY, env.BRAIN_SYNC_WRITE_KEY, env.BRAIN_MEMORY_WRITE_KEY].filter(Boolean);
  if (scopedKeys.length > 1 && new Set(scopedKeys).size !== scopedKeys.length) {
    ctx.addIssue({ code: "custom", path: ["scoped API keys"], message: "must be distinct when provided" });
  }
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment"))];
  console.error(`Invalid server environment shape: ${fields.join(", ")}`);
  process.exit(1);
}

const missingRuntimeFields = [
  "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY",
  "BRAIN_ACCESS_PASSWORD",
  "BRAIN_SESSION_SECRET",
  "BRAIN_API_READ_KEY",
  "BRAIN_SYNC_WRITE_KEY",
  "BRAIN_MEMORY_WRITE_KEY",
].filter((field) => {
  if (field === "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL") return !process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (field === "SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY") return !process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !process.env[field];
});

if (missingRuntimeFields.length) {
  console.warn(`Runtime environment will be validated on first server request. Missing at build time: ${missingRuntimeFields.join(", ")}`);
}

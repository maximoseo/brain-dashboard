import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
}
if (!service && typeof window === "undefined") {
  console.error("WARN: SUPABASE_SERVICE_KEY unset — write routes (sync, memory) will fail under RLS");
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anon || "placeholder", { auth: { persistSession: false } });
export const supabaseAdmin = service ? createClient(url!, service, { auth: { persistSession: false } }) : supabase;

export type AssetType = "skill" | "plugin" | "cli" | "mcp" | "design";
export interface Asset { id?: string; type: AssetType; name: string; owner: string; description?: string; source?: string; version?: string; enabled?: boolean; meta?: Record<string, unknown>; created_at?: string; updated_at?: string; }
export interface Bot { id?: string; name: string; kind: string; status?: string; model?: string; base_url?: string; last_seen?: string; meta?: Record<string, unknown>; }
export interface Dashboard { id?: string; name: string; url: string; category?: string; status?: string; icon?: string; }
export interface MemoryFact { id?: string; key: string; value: string; scope?: string; source?: string; }

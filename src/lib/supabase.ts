import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "./env";

let adminClient: SupabaseClient | undefined;

/** Server-only database client. The service role key must never be imported by client components. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const env = getServerEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "X-Client-Info": "brain-dashboard-server" } },
    });
  }
  return adminClient;
}

export const ASSET_TYPES = ["skill", "plugin", "cli", "mcp", "design"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface Asset {
  id?: string;
  type: AssetType;
  name: string;
  owner: string;
  description?: string | null;
  source?: string | null;
  version?: string | null;
  enabled?: boolean;
  status?: "active" | "stale" | "disabled";
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Bot {
  id?: string;
  name: string;
  kind: string;
  status?: "online" | "degraded" | "offline";
  model?: string | null;
  base_url?: string | null;
  last_seen?: string | null;
  meta?: Record<string, unknown>;
}

export interface Dashboard {
  id?: string;
  name: string;
  url: string;
  category?: string | null;
  status?: "live" | "degraded" | "offline";
  icon?: string | null;
}

export interface MemoryFact {
  id?: string;
  key: string;
  value: string;
  scope?: string;
  source?: string | null;
}

-- Canonical bootstrap schema. Versioned production changes live in supabase/migrations/.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.brain_assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('skill','plugin','cli','mcp','design')),
  name text not null check (char_length(name) between 2 and 200),
  owner text not null default 'hermes' check (char_length(owner) between 1 and 100),
  description text,
  source text,
  version text,
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','stale','disabled')),
  meta jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, name, owner)
);
create index if not exists assets_type_idx on public.brain_assets (type);
create index if not exists assets_owner_idx on public.brain_assets (owner);
create index if not exists assets_status_idx on public.brain_assets (status);
create index if not exists assets_updated_at_idx on public.brain_assets (updated_at desc);
create index if not exists assets_owner_status_idx on public.brain_assets (owner, status);
create index if not exists assets_name_trgm_idx on public.brain_assets using gin (name extensions.gin_trgm_ops);
create index if not exists assets_description_trgm_idx on public.brain_assets using gin (description extensions.gin_trgm_ops);

create table if not exists public.brain_bots (
  id uuid primary key default gen_random_uuid(), name text unique not null, kind text not null,
  status text not null default 'online' check (status in ('online','degraded','offline')),
  model text, base_url text, last_seen timestamptz, meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bots_last_seen_idx on public.brain_bots (last_seen desc);

create table if not exists public.brain_dashboards (
  id uuid primary key default gen_random_uuid(), name text unique not null,
  url text not null check (url ~ '^https?://'), category text,
  status text not null default 'live' check (status in ('live','degraded','offline')),
  icon text, created_at timestamptz not null default now()
);

create table if not exists public.brain_processes (
  id uuid primary key default gen_random_uuid(), title text not null, slug text unique not null,
  body text not null, tags text[] not null default '{}', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brain_memory_facts (
  id uuid primary key default gen_random_uuid(), key text not null, value text not null,
  scope text not null default 'global', source text, created_at timestamptz not null default now(),
  unique (scope, key)
);
create index if not exists memory_scope_key_idx on public.brain_memory_facts (scope, key);

create table if not exists public.brain_sync_log (
  id bigserial primary key, bot text not null, endpoint text,
  status text not null check (status in ('ok','error','rejected')), detail text,
  created_at timestamptz not null default now()
);
create index if not exists sync_log_bot_created_idx on public.brain_sync_log (bot, created_at desc);

create table if not exists public.brain_sessions (
  id uuid primary key, actor text not null, created_at timestamptz not null default now(),
  expires_at timestamptz not null, last_seen_at timestamptz not null default now(), revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists brain_sessions_expires_idx on public.brain_sessions (expires_at) where revoked_at is null;
create index if not exists brain_sessions_idle_idx on public.brain_sessions (last_seen_at) where revoked_at is null;

create table if not exists public.brain_login_attempts (
  id bigint generated always as identity primary key, identifier_hash text not null,
  success boolean not null, attempted_at timestamptz not null default now(),
  check (identifier_hash ~ '^[a-f0-9]{64}$')
);
create index if not exists brain_login_attempts_lookup_idx on public.brain_login_attempts (identifier_hash, attempted_at desc) where success = false;

create table if not exists public.brain_audit_log (
  id bigint generated always as identity primary key, event text not null, actor text not null,
  result text not null, source_ip_hash text, request_id text,
  detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists brain_audit_log_event_created_idx on public.brain_audit_log (event, created_at desc);
create index if not exists brain_audit_log_actor_created_idx on public.brain_audit_log (actor, created_at desc);

-- No anon/authenticated policies are intentional. The server-only service role owns all access.
do $$
declare table_name text;
begin
  foreach table_name in array array['brain_assets','brain_bots','brain_dashboards','brain_processes','brain_memory_facts','brain_sync_log','brain_sessions','brain_login_attempts','brain_audit_log'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- Install transactional sync and rate-limit functions via the versioned migration.

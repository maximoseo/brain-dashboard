create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('skill','plugin','cli','mcp','design')),
  name text not null,
  owner text not null default 'hermes',
  description text,
  source text,
  version text,
  enabled boolean default true,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (type, name, owner)
);
create index if not exists assets_type_idx on assets (type);
create index if not exists assets_owner_idx on assets (owner);

create table if not exists bots (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  kind text not null,
  status text default 'online',
  model text,
  base_url text,
  last_seen timestamptz,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists dashboards (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  url text not null,
  category text,
  status text default 'live',
  icon text,
  created_at timestamptz default now()
);

create table if not exists processes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  body text not null,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists memory_facts (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text not null,
  scope text default 'global',
  source text,
  created_at timestamptz default now(),
  unique (scope, key)
);

create table if not exists sync_log (
  id bigserial primary key,
  bot text not null,
  endpoint text,
  status text,
  detail text,
  created_at timestamptz default now()
);

-- RLS: anon read on all, service role write (Supabase service key bypasses RLS)
alter table assets enable row level security;
alter table bots enable row level security;
alter table dashboards enable row level security;
alter table processes enable row level security;
alter table memory_facts enable row level security;
alter table sync_log enable row level security;

drop policy if exists "anon read assets" on assets;
create policy "anon read assets" on assets for select using (true);
drop policy if exists "anon read bots" on bots;
create policy "anon read bots" on bots for select using (true);
drop policy if exists "anon read dashboards" on dashboards;
create policy "anon read dashboards" on dashboards for select using (true);
drop policy if exists "anon read processes" on processes;
create policy "anon read processes" on processes for select using (true);
drop policy if exists "anon read memory" on memory_facts;
create policy "anon read memory" on memory_facts for select using (true);
drop policy if exists "anon read sync_log" on sync_log;
create policy "anon read sync_log" on sync_log for select using (true);

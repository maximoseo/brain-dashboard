-- Operational workflows: work orders, notifications, knowledge
-- Requires: 20260721124500_control_plane_state_identity_health.sql
begin;

-- Work orders (review-only, no-op executor)
create table if not exists public.brain_work_orders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 300),
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  executor text not null default 'internal.noop.review',
  requested_by uuid references public.brain_identities(id) on delete set null,
  approved_by uuid references public.brain_identities(id) on delete set null,
  target_type text check (target_type in ('asset', 'bot', 'dashboard', 'process', 'system')),
  target_id uuid,
  params jsonb not null default '{}',
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists idx_work_orders_status on public.brain_work_orders (status, created_at desc);

-- Notifications (internal only, no external dispatcher yet)
create table if not exists public.brain_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('info', 'warning', 'critical', 'success')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  source text not null default 'system',
  acknowledged boolean not null default false,
  acknowledged_by uuid references public.brain_identities(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_unack on public.brain_notifications (acknowledged, created_at desc) where acknowledged = false;

-- Knowledge sources registry
create table if not exists public.brain_knowledge (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('supermemory', 'mem0', 'obsidian', 'process', 'manual')),
  key text not null,
  title text not null,
  content text not null default '',
  status text not null default 'active' check (status in ('active', 'failed', 'unconfigured', 'zero')),
  meta jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, key)
);

create index if not exists idx_knowledge_source on public.brain_knowledge (source, status);

-- Activity projection (immutable cursor-based)
create table if not exists public.brain_activity (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor text not null default 'system',
  summary text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_cursor on public.brain_activity (id desc);
create index if not exists idx_activity_type on public.brain_activity (event_type, created_at desc);

-- RPC: schema compatibility check
create or replace function public.brain_schema_version()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select value::integer from brain_schema_meta where key = 'version'), 0);
$$;

grant execute on function public.brain_schema_version to service_role;

-- RLS
alter table public.brain_work_orders enable row level security;
alter table public.brain_notifications enable row level security;
alter table public.brain_knowledge enable row level security;
alter table public.brain_activity enable row level security;

create policy "service_all_work_orders" on public.brain_work_orders for all using (true) with check (true);
create policy "service_all_notifications" on public.brain_notifications for all using (true) with check (true);
create policy "service_all_knowledge" on public.brain_knowledge for all using (true) with check (true);
create policy "service_all_activity" on public.brain_activity for all using (true) with check (true);

commit;

-- Control plane: identity, state, health
-- Requires: 20260721123000_agent_bound_sync_replay.sql
begin;

-- Schema version marker
create table if not exists public.brain_schema_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.brain_schema_meta (key, value) values ('version', '3')
  on conflict (key) do update set value = '3', updated_at = now();

-- Named identities (replaces shared password)
create table if not exists public.brain_identities (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  role text not null default 'viewer' check (role in ('viewer', 'auditor', 'operator', 'admin')),
  mfa_enrolled boolean not null default false,
  mfa_secret text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Sessions: bind to identity
alter table public.brain_sessions
  add column if not exists identity_id uuid references public.brain_identities(id) on delete cascade,
  add column if not exists role text,
  add column if not exists mfa_verified boolean not null default false,
  add column if not exists user_agent text,
  add column if not exists ip_hash text;

create index if not exists idx_sessions_identity on public.brain_sessions (identity_id);
create index if not exists idx_sessions_revoked on public.brain_sessions (revoked_at) where revoked_at is null;

-- Dashboard health probes
create table if not exists public.brain_dashboard_probes (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.brain_dashboards(id) on delete cascade,
  status text not null check (status in ('online', 'degraded', 'offline', 'auth_required', 'dns_error', 'tls_error', 'timeout')),
  http_status integer,
  latency_ms integer,
  detail jsonb not null default '{}',
  probed_at timestamptz not null default now()
);

create index if not exists idx_probes_dashboard_time on public.brain_dashboard_probes (dashboard_id, probed_at desc);

-- Overview RPC: canonical totals + attention queue
create or replace function public.brain_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'assets', jsonb_build_object(
      'total', (select count(*) from brain_assets),
      'active', (select count(*) from brain_assets where status = 'active'),
      'stale', (select count(*) from brain_assets where status = 'stale'),
      'disabled', (select count(*) from brain_assets where status = 'disabled')
    ),
    'bots', jsonb_build_object(
      'total', (select count(*) from brain_bots),
      'online', (select count(*) from brain_bots where status = 'online'),
      'degraded', (select count(*) from brain_bots where status = 'degraded'),
      'offline', (select count(*) from brain_bots where status = 'offline')
    ),
    'dashboards', jsonb_build_object(
      'total', (select count(*) from brain_dashboards),
      'live', (select count(*) from brain_dashboards where status = 'live'),
      'degraded', (select count(*) from brain_dashboards where status = 'degraded'),
      'offline', (select count(*) from brain_dashboards where status = 'offline')
    ),
    'sessions', jsonb_build_object(
      'active', (select count(*) from brain_sessions where revoked_at is null and expires_at > now()),
      'revoked', (select count(*) from brain_sessions where revoked_at is not null)
    ),
    'sync', jsonb_build_object(
      'last_24h', (select count(*) from brain_sync_log where created_at > now() - interval '24 hours'),
      'errors_24h', (select count(*) from brain_sync_log where created_at > now() - interval '24 hours' and status = 'error')
    ),
    'attention', coalesce((
      select jsonb_agg(jsonb_build_object('type', type, 'id', id, 'name', name, 'reason', reason))
      from (
        select 'bot' as type, id::text, name, 'offline' as reason from brain_bots where status = 'offline'
        union all
        select 'dashboard', id::text, name, 'offline' from brain_dashboards where status = 'offline'
        union all
        select 'asset', id::text, name, 'stale' from brain_assets where status = 'stale'
        limit 10
      ) q
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.brain_overview to service_role;

-- RLS
alter table public.brain_identities enable row level security;
alter table public.brain_dashboard_probes enable row level security;
alter table public.brain_schema_meta enable row level security;

create policy "service_all_identities" on public.brain_identities for all using (true) with check (true);
create policy "service_all_probes" on public.brain_dashboard_probes for all using (true) with check (true);
create policy "service_all_schema_meta" on public.brain_schema_meta for all using (true) with check (true);

commit;

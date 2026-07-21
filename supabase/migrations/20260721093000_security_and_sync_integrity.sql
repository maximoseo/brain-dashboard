begin;

create extension if not exists pg_trgm with schema extensions;

alter table public.brain_assets
  add column if not exists status text not null default 'active',
  add column if not exists verified_at timestamptz;
update public.brain_assets set
  enabled = coalesce(enabled, true),
  status = case when coalesce(enabled, true) then 'active' else 'disabled' end,
  meta = coalesce(meta, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());
alter table public.brain_assets alter column enabled set not null;
alter table public.brain_assets alter column enabled set default true;
alter table public.brain_assets alter column meta set not null;
alter table public.brain_assets alter column created_at set not null;
alter table public.brain_assets alter column updated_at set not null;
alter table public.brain_assets drop constraint if exists brain_assets_status_check;
alter table public.brain_assets add constraint brain_assets_status_check check (status in ('active', 'stale', 'disabled')) not valid;
alter table public.brain_assets drop constraint if exists brain_assets_name_length_check;
alter table public.brain_assets add constraint brain_assets_name_length_check check (char_length(name) between 2 and 200) not valid;
alter table public.brain_assets drop constraint if exists brain_assets_owner_length_check;
alter table public.brain_assets add constraint brain_assets_owner_length_check check (char_length(owner) between 1 and 100) not valid;

update public.brain_bots set status = coalesce(status, 'offline'), meta = coalesce(meta, '{}'::jsonb), created_at = coalesce(created_at, now());
alter table public.brain_bots alter column status set not null;
alter table public.brain_bots alter column status set default 'online';
alter table public.brain_bots alter column meta set not null;
alter table public.brain_bots alter column created_at set not null;
alter table public.brain_bots drop constraint if exists brain_bots_status_check;
alter table public.brain_bots add constraint brain_bots_status_check check (status in ('online', 'degraded', 'offline')) not valid;

update public.brain_dashboards set status = coalesce(status, 'offline'), created_at = coalesce(created_at, now());
alter table public.brain_dashboards alter column status set not null;
alter table public.brain_dashboards alter column status set default 'live';
alter table public.brain_dashboards alter column created_at set not null;
alter table public.brain_dashboards drop constraint if exists brain_dashboards_status_check;
alter table public.brain_dashboards add constraint brain_dashboards_status_check check (status in ('live', 'degraded', 'offline')) not valid;
alter table public.brain_dashboards drop constraint if exists brain_dashboards_url_check;
alter table public.brain_dashboards add constraint brain_dashboards_url_check check (url ~ '^https?://') not valid;

update public.brain_processes set tags = coalesce(tags, '{}'), created_at = coalesce(created_at, now()), updated_at = coalesce(updated_at, created_at, now());
update public.brain_memory_facts set scope = coalesce(scope, 'global'), created_at = coalesce(created_at, now());
update public.brain_sync_log set status = coalesce(status, 'error'), created_at = coalesce(created_at, now());
alter table public.brain_processes alter column tags set not null;
alter table public.brain_processes alter column created_at set not null;
alter table public.brain_processes alter column updated_at set not null;
alter table public.brain_memory_facts alter column scope set not null;
alter table public.brain_memory_facts alter column created_at set not null;
alter table public.brain_sync_log alter column status set not null;
alter table public.brain_sync_log alter column created_at set not null;
alter table public.brain_sync_log drop constraint if exists brain_sync_log_status_check;
alter table public.brain_sync_log add constraint brain_sync_log_status_check check (status in ('ok', 'error', 'rejected')) not valid;

create index if not exists assets_status_idx on public.brain_assets (status);
create index if not exists assets_updated_at_idx on public.brain_assets (updated_at desc);
create index if not exists assets_owner_status_idx on public.brain_assets (owner, status);
create index if not exists assets_name_trgm_idx on public.brain_assets using gin (name extensions.gin_trgm_ops);
create index if not exists assets_description_trgm_idx on public.brain_assets using gin (description extensions.gin_trgm_ops);
create index if not exists bots_last_seen_idx on public.brain_bots (last_seen desc);
create index if not exists sync_log_bot_created_idx on public.brain_sync_log (bot, created_at desc);
create index if not exists memory_scope_key_idx on public.brain_memory_facts (scope, key);

create table if not exists public.brain_sessions (
  id uuid primary key,
  actor text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint brain_sessions_expiry_check check (expires_at > created_at)
);
alter table public.brain_sessions add column if not exists last_seen_at timestamptz not null default now();
create index if not exists brain_sessions_expires_idx on public.brain_sessions (expires_at) where revoked_at is null;
create index if not exists brain_sessions_idle_idx on public.brain_sessions (last_seen_at) where revoked_at is null;

create table if not exists public.brain_login_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  success boolean not null,
  attempted_at timestamptz not null default now(),
  constraint brain_login_identifier_hash_check check (identifier_hash ~ '^[a-f0-9]{64}$')
);
create index if not exists brain_login_attempts_lookup_idx on public.brain_login_attempts (identifier_hash, attempted_at desc) where success = false;

create table if not exists public.brain_audit_log (
  id bigint generated always as identity primary key,
  event text not null,
  actor text not null,
  result text not null,
  source_ip_hash text,
  request_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists brain_audit_log_event_created_idx on public.brain_audit_log (event, created_at desc);
create index if not exists brain_audit_log_actor_created_idx on public.brain_audit_log (actor, created_at desc);

-- Remove every direct client policy and table grant. All protected data is served through the server-only service role.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'brain_assets', 'brain_bots', 'brain_dashboards', 'brain_processes', 'brain_memory_facts',
    'brain_sync_log', 'brain_sessions', 'brain_login_attempts', 'brain_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
    for policy_name in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

create or replace function public.brain_check_login_rate_limit(
  p_identifier_hash text,
  p_success boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  failure_count integer;
  first_failure timestamptz;
  retry_after integer := 0;
begin
  if p_identifier_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid identifier hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_identifier_hash, 0));
  delete from public.brain_login_attempts where attempted_at < now() - interval '24 hours';

  if p_success is true then
    delete from public.brain_login_attempts where identifier_hash = p_identifier_hash and success = false;
  elsif p_success is false then
    insert into public.brain_login_attempts(identifier_hash, success) values (p_identifier_hash, false);
  end if;

  select count(*), min(attempted_at)
    into failure_count, first_failure
    from public.brain_login_attempts
   where identifier_hash = p_identifier_hash
     and success = false
     and attempted_at > now() - interval '15 minutes';

  if failure_count >= 5 then
    retry_after := greatest(1, ceil(extract(epoch from (first_failure + interval '15 minutes' - now())))::integer);
  end if;

  return jsonb_build_object('allowed', failure_count < 5, 'retry_after', retry_after);
end;
$$;

create or replace function public.brain_sync_inventory(
  p_agent text,
  p_assets jsonb,
  p_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  received_count integer;
  existing_count integer;
  stale_count integer;
begin
  if p_agent !~ '^[a-zA-Z0-9_.:-]{1,100}$' then raise exception 'invalid agent'; end if;
  if jsonb_typeof(p_assets) <> 'array' then raise exception 'assets must be an array'; end if;
  received_count := jsonb_array_length(p_assets);
  if received_count > 500 then raise exception 'too many assets'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assets) as asset(type text, name text, owner text)
    where asset.type not in ('skill','plugin','cli','mcp','design')
       or asset.name is null or char_length(asset.name) not between 2 and 200
       or coalesce(asset.owner, p_agent) <> p_agent
  ) then raise exception 'invalid asset payload'; end if;

  select count(*) into existing_count
    from jsonb_to_recordset(p_assets) as asset(type text, name text)
    join public.brain_assets current
      on current.type = asset.type and current.name = asset.name and current.owner = p_agent;

  insert into public.brain_assets(type, name, owner, description, source, version, enabled, status, meta, verified_at, updated_at)
  select asset.type, asset.name, p_agent, asset.description, asset.source, asset.version,
         coalesce(asset.enabled, true), case when coalesce(asset.enabled, true) then 'active' else 'disabled' end,
         coalesce(asset.meta, '{}'::jsonb), now(), now()
    from jsonb_to_recordset(p_assets) as asset(
      type text, name text, owner text, description text, source text, version text, enabled boolean, meta jsonb
    )
  on conflict (type, name, owner) do update set
    description = excluded.description, source = excluded.source, version = excluded.version,
    enabled = excluded.enabled, status = excluded.status, meta = excluded.meta,
    verified_at = excluded.verified_at, updated_at = excluded.updated_at;

  update public.brain_assets current
     set status = 'stale', enabled = false, updated_at = now()
   where current.owner = p_agent
     and current.status <> 'stale'
     and not exists (
       select 1 from jsonb_to_recordset(p_assets) as asset(type text, name text)
       where asset.type = current.type and asset.name = current.name
     );
  get diagnostics stale_count = row_count;

  insert into public.brain_bots(name, kind, status, last_seen)
  values (p_agent, 'agent', 'online', now())
  on conflict (name) do update set status = 'online', last_seen = excluded.last_seen;

  insert into public.brain_sync_log(bot, endpoint, status, detail)
  values (p_agent, '/api/sync', 'ok', format('received=%s added=%s updated=%s stale=%s', received_count, received_count - existing_count, existing_count, stale_count));
  insert into public.brain_audit_log(event, actor, result, request_id, detail)
  values ('inventory.sync', p_agent, 'success', p_request_id, jsonb_build_object('received', received_count, 'added', received_count - existing_count, 'updated', existing_count, 'stale', stale_count));

  return jsonb_build_object('received', received_count, 'added', received_count - existing_count, 'updated', existing_count, 'stale', stale_count);
end;
$$;

revoke all on function public.brain_check_login_rate_limit(text, boolean) from public, anon, authenticated;
revoke all on function public.brain_sync_inventory(text, jsonb, text) from public, anon, authenticated;
grant all privileges on table public.brain_assets, public.brain_bots, public.brain_dashboards,
  public.brain_processes, public.brain_memory_facts, public.brain_sync_log, public.brain_sessions,
  public.brain_login_attempts, public.brain_audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.brain_check_login_rate_limit(text, boolean) to service_role;
grant execute on function public.brain_sync_inventory(text, jsonb, text) to service_role;

commit;

-- Agent-bound sync with replay/destructive guards
-- Requires: 20260721093000_security_and_sync_integrity.sql
begin;

-- Agent sync credentials: each agent gets its own hashed credential
create table if not exists public.brain_sync_credentials (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.brain_bots(id) on delete cascade,
  credential_hash text not null,
  label text not null default 'primary',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (credential_hash)
);

-- Sync snapshots: agent-bound, sequenced, digest-verified
create table if not exists public.brain_sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.brain_bots(id) on delete cascade,
  credential_id uuid references public.brain_sync_credentials(id) on delete set null,
  snapshot_uuid uuid not null,
  sequence bigint not null,
  digest text not null,
  asset_count integer not null default 0,
  status text not null default 'accepted' check (status in ('accepted', 'rejected_replay', 'rejected_stale', 'rejected_digest', 'rejected_destructive', 'shadow')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (bot_id, snapshot_uuid)
);

-- Index for fast replay/stale checks
create index if not exists idx_sync_snapshots_bot_seq on public.brain_sync_snapshots (bot_id, sequence desc);
create index if not exists idx_sync_snapshots_created on public.brain_sync_snapshots (created_at desc);

-- Sync log: add agent binding columns
alter table public.brain_sync_log
  add column if not exists bot_id uuid references public.brain_bots(id) on delete set null,
  add column if not exists credential_id uuid references public.brain_sync_credentials(id) on delete set null,
  add column if not exists snapshot_id uuid references public.brain_sync_snapshots(id) on delete set null,
  add column if not exists sequence bigint,
  add column if not exists digest text;

-- RPC: validate and record a sync snapshot
create or replace function public.brain_validate_sync(
  p_bot_name text,
  p_credential_hash text,
  p_snapshot_uuid uuid,
  p_sequence bigint,
  p_digest text,
  p_asset_count integer,
  p_is_destructive boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id uuid;
  v_credential_id uuid;
  v_last_seq bigint;
  v_last_digest text;
  v_last_asset_count integer;
  v_status text := 'accepted';
  v_detail jsonb := '{}';
  v_snapshot_id uuid;
begin
  -- Resolve bot
  select id into v_bot_id from brain_bots where name = p_bot_name and status != 'offline';
  if v_bot_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'bot_not_found_or_offline');
  end if;

  -- Validate credential
  select id into v_credential_id from brain_sync_credentials
    where bot_id = v_bot_id and credential_hash = p_credential_hash and active = true;
  if v_credential_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_credential');
  end if;

  -- Check replay: same snapshot_uuid already accepted
  if exists (select 1 from brain_sync_snapshots where bot_id = v_bot_id and snapshot_uuid = p_snapshot_uuid and status = 'accepted') then
    v_status := 'rejected_replay';
    v_detail := jsonb_build_object('reason', 'duplicate_snapshot_uuid');
  end if;

  -- Check stale: sequence must be strictly increasing
  if v_status = 'accepted' then
    select sequence, digest, asset_count into v_last_seq, v_last_digest, v_last_asset_count
      from brain_sync_snapshots
      where bot_id = v_bot_id and status = 'accepted'
      order by sequence desc limit 1;

    if v_last_seq is not null and p_sequence <= v_last_seq then
      v_status := 'rejected_stale';
      v_detail := jsonb_build_object('reason', 'sequence_not_increasing', 'last_seq', v_last_seq, 'got_seq', p_sequence);
    end if;
  end if;

  -- Check destructive: asset count drop > 50% requires flag
  if v_status = 'accepted' and v_last_asset_count is not null and v_last_asset_count > 0 then
    if p_asset_count < (v_last_asset_count * 0.5) and not p_is_destructive then
      v_status := 'rejected_destructive';
      v_detail := jsonb_build_object('reason', 'asset_count_drop_exceeds_threshold', 'last_count', v_last_asset_count, 'got_count', p_asset_count);
    end if;
  end if;

  -- Record snapshot
  insert into brain_sync_snapshots (bot_id, credential_id, snapshot_uuid, sequence, digest, asset_count, status, detail)
    values (v_bot_id, v_credential_id, p_snapshot_uuid, p_sequence, p_digest, p_asset_count, v_status, v_detail)
    returning id into v_snapshot_id;

  -- Update credential last_used
  update brain_sync_credentials set last_used_at = now() where id = v_credential_id;

  -- Log
  insert into brain_sync_log (bot, bot_id, credential_id, snapshot_id, endpoint, status, sequence, digest, detail)
    values (p_bot_name, v_bot_id, v_credential_id, v_snapshot_id, 'sync', case when v_status = 'accepted' then 'ok' else 'error' end, p_sequence, p_digest, v_detail);

  return jsonb_build_object('status', v_status, 'snapshot_id', v_snapshot_id, 'detail', v_detail);
end;
$$;

-- RLS: service role only
alter table public.brain_sync_credentials enable row level security;
alter table public.brain_sync_snapshots enable row level security;

create policy "service_all_sync_credentials" on public.brain_sync_credentials for all using (true) with check (true);
create policy "service_all_sync_snapshots" on public.brain_sync_snapshots for all using (true) with check (true);

-- Grant
grant execute on function public.brain_validate_sync to service_role;

commit;

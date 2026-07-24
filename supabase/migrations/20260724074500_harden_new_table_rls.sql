-- Harden grants/RLS policies for tables introduced after the initial security migration.
-- Safe to re-run: no data changes, only privilege narrowing for anon/authenticated roles.
begin;

revoke all on table public.brain_sync_credentials from anon, authenticated;
revoke all on table public.brain_sync_snapshots from anon, authenticated;
revoke all on table public.brain_identities from anon, authenticated;
revoke all on table public.brain_dashboard_probes from anon, authenticated;
revoke all on table public.brain_schema_meta from anon, authenticated;
revoke all on table public.brain_work_orders from anon, authenticated;
revoke all on table public.brain_notifications from anon, authenticated;
revoke all on table public.brain_knowledge from anon, authenticated;
revoke all on table public.brain_activity from anon, authenticated;

drop policy if exists "service_all_sync_credentials" on public.brain_sync_credentials;
drop policy if exists "service_all_sync_snapshots" on public.brain_sync_snapshots;
drop policy if exists "service_all_identities" on public.brain_identities;
drop policy if exists "service_all_probes" on public.brain_dashboard_probes;
drop policy if exists "service_all_schema_meta" on public.brain_schema_meta;
drop policy if exists "service_all_work_orders" on public.brain_work_orders;
drop policy if exists "service_all_notifications" on public.brain_notifications;
drop policy if exists "service_all_knowledge" on public.brain_knowledge;
drop policy if exists "service_all_activity" on public.brain_activity;

create policy "service_role_all_sync_credentials" on public.brain_sync_credentials for all to service_role using (true) with check (true);
create policy "service_role_all_sync_snapshots" on public.brain_sync_snapshots for all to service_role using (true) with check (true);
create policy "service_role_all_identities" on public.brain_identities for all to service_role using (true) with check (true);
create policy "service_role_all_probes" on public.brain_dashboard_probes for all to service_role using (true) with check (true);
create policy "service_role_all_schema_meta" on public.brain_schema_meta for all to service_role using (true) with check (true);
create policy "service_role_all_work_orders" on public.brain_work_orders for all to service_role using (true) with check (true);
create policy "service_role_all_notifications" on public.brain_notifications for all to service_role using (true) with check (true);
create policy "service_role_all_knowledge" on public.brain_knowledge for all to service_role using (true) with check (true);
create policy "service_role_all_activity" on public.brain_activity for all to service_role using (true) with check (true);

commit;

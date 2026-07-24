-- Named identities: replace HMAC-with-shared-secret password verification with
-- a proper per-identity bcrypt hash. Closes the gap where named-identity login
-- silently fell back to comparing against the single shared BRAIN_ACCESS_PASSWORD.
begin;

alter table public.brain_identities
  add column if not exists password_hash text;

-- Schema version marker
insert into public.brain_schema_meta (key, value) values ('version', '4')
  on conflict (key) do update set value = '4', updated_at = now();

commit;

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260724074500_harden_new_table_rls.sql", "utf8");

const sensitiveTables = [
  "brain_sync_credentials",
  "brain_sync_snapshots",
  "brain_identities",
  "brain_dashboard_probes",
  "brain_schema_meta",
  "brain_work_orders",
  "brain_notifications",
  "brain_knowledge",
  "brain_activity",
];

describe("schema RLS hardening migration", () => {
  it("revokes anon/authenticated access for newly introduced sensitive tables", () => {
    for (const table of sensitiveTables) {
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    }
  });

  it("scopes replacement policies to service_role instead of permissive all-role policies", () => {
    expect(migration).not.toMatch(/for all using \(true\) with check \(true\)/i);
    for (const table of sensitiveTables) {
      expect(migration).toMatch(new RegExp(`on public\\.${table} for all to service_role using \\(true\\) with check \\(true\\);`));
    }
  });
});

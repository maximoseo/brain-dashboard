# Comprehensive Improvement Implementation Contract

## Objective

Ship a secure, English-only, responsive Brain Dashboard with trustworthy registry data, scalable APIs, operational views, automated quality gates, and a verified production deployment.

## Acceptance

- Production login works with centrally managed credentials.
- Sessions are signed, expiring, revocable through logout, and rate-limited at login.
- Protected APIs reject anonymous access, do not accept URL credentials, and are not publicly cached.
- Supabase RLS does not permit anonymous reads of private operational data.
- All UI source is English and uses an English locale.
- Routes exist for overview, inventory, agents, dashboards, knowledge, memory, processes, and activity.
- The UI has no horizontal overflow at 320, 360, 390, 430, 768, 1024, 1280, and 1440 px widths.
- Only one primary navigation system is present at each breakpoint; touch targets are at least 44 px.
- Inventory is server-paginated with exact counts and does not truncate at 1,000 records.
- Sync validates input, uses correct HTTP errors, updates heartbeat/log state consistently, and reconciles stale records.
- ESLint, strict TypeScript, unit/integration tests, production build, English-only scan, accessibility checks, and responsive E2E checks pass.
- Production health, login, protected API, and primary page smoke tests pass after deployment.

## Non-goals

- Storing raw secrets in the repository or client bundle.
- Replacing external specialist dashboards.
- Enabling unconfirmed destructive external actions.
- Deleting production data without explicit approval and a backup/rollback plan.

## Constraints

- Next.js 16, React 19, Supabase, Vercel.
- Preserve existing API compatibility where safe; document intentional security-breaking changes.
- Prefer small, reviewable commits and proof at every integration step.
- Production database changes must be additive or migration-backed and reversible.

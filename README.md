# Brain Dashboard

Central registry for the agent ecosystem (skills, plugins, CLI tools, MCP servers, agents, dashboards, processes, and memory facts).

**Live:** https://brain-dashboard-maximo-seo.vercel.app/

## Setup

```bash
npm ci
cp .env.example .env.local
# Fill every required value with a distinct production-grade secret.
npm run dev
```

Apply `supabase/migrations/20260721093000_security_and_sync_integrity.sql` before starting this version. Startup fails closed when required configuration is missing.

Apply `supabase/migrations/20260723170000_identity_password_hash.sql` to add per-identity bcrypt password storage. Named identities (rows in `brain_identities`) cannot log in until a hash is provisioned — there is no fallback to the shared `BRAIN_ACCESS_PASSWORD`. Provision or reset a hash with:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  node scripts/set-identity-password.mjs ops@maximo-seo.ai 'a-strong-unique-password'
```

## Required environment

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server only) |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (server only) |
| `BRAIN_ACCESS_PASSWORD` | Operator login password, minimum 12 characters |
| `BRAIN_SESSION_SECRET` | HMAC session secret, minimum 32 characters |
| `BRAIN_API_READ_KEY` | Read-only service bearer credential |
| `BRAIN_SYNC_WRITE_KEY` | Inventory-sync bearer credential |
| `BRAIN_MEMORY_WRITE_KEY` | Memory-write bearer credential |

The three API keys must be distinct. Optional knowledge source variables are documented in `.env.example`.

## Authentication

Browser reads use the signed, revocable `brain_session` cookie created by `/api/auth/login`. Service calls use the appropriate scoped credential:

```http
Authorization: Bearer <scoped-key>
```

Credentials in query strings, request bodies, and `x-api-key` are not accepted. Protected responses use `Cache-Control: private, no-store`.

| Route | Method | Required scope | Description |
|---|---|---|---|
| `/api/inventory` | GET | session or read | Paginated assets with exact total |
| `/api/ecosystem` | GET | session or read | Paginated skill/MCP contract |
| `/api/bots` | GET | session or read | Registered agents |
| `/api/dashboards` | GET | session or read | Registered dashboards |
| `/api/memory` | GET | session or read | Memory facts |
| `/api/memory` | POST | memory write | Upsert a memory fact |
| `/api/knowledge` | GET | session or read | Federated search with source outcomes |
| `/api/processes` | GET | session or read | Documented processes |
| `/api/sync` | POST | sync write | Atomic full-snapshot inventory sync |
| `/api/health?mode=ready` | GET | none | Dependency readiness |
| `/api/health?mode=live` | GET | none | Process liveness |
| `/api/auth/login` | POST | none | Rate-limited operator login |
| `/api/auth/logout` | POST | same-origin session | Revoke current session |

### Inventory pagination

`GET /api/inventory?page=1&pageSize=100&type=skill&owner=agent-1&status=active&q=research`

`pageSize` is capped at 1,000. The response includes `pagination.total` from an exact database count; use subsequent pages to retrieve larger inventories.

### Agent inventory sync

A sync is a complete snapshot for one agent. Missing records owned by that agent become stale. The request is validated and applied in one PostgreSQL transaction.

```bash
curl -X POST https://brain-dashboard-maximo-seo.vercel.app/api/sync \
  -H "Authorization: Bearer $BRAIN_SYNC_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "bot": "hermes",
    "assets": [
      {"type": "skill", "name": "my-skill", "description": "..."},
      {"type": "cli", "name": "my-tool", "version": "1.0.0"}
    ]
  }'
```

Allowed asset types are `skill`, `plugin`, `cli`, `mcp`, and `design`. Invalid rows return HTTP `422` with a `failures` array; database transaction failures return HTTP `500` and do not report success.

## Verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

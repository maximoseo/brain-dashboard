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

Apply every file in `supabase/migrations/` in lexical order before starting this version. Startup fails closed when required configuration is missing, and readiness checks fail closed when the database schema is older than the required version.

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
| `/api/sync` | POST | sync write + agent sync credential hash | Atomic full-snapshot inventory sync with replay/destructive guards |
| `/api/health?mode=ready` | GET | session or read | Dependency readiness |
| `/api/health?mode=live` | GET | none | Process liveness |
| `/api/auth/login` | POST | none | Rate-limited operator login |
| `/api/auth/logout` | POST | same-origin session | Revoke current session |

### Inventory pagination

`GET /api/inventory?page=1&pageSize=100&type=skill&owner=agent-1&status=active&q=research`

`pageSize` is capped at 1,000. The response includes `pagination.total` from an exact database count; use subsequent pages to retrieve larger inventories.

### Agent inventory sync

A sync is a complete snapshot for one agent. Missing records owned by that agent become stale. The request is validated, replay-checked, destructive-drop checked, and then applied through PostgreSQL RPCs. Each agent must have an active row in `brain_sync_credentials`; clients send the credential hash, monotonic sequence, snapshot UUID, digest, and an explicit destructive flag when intentionally submitting a snapshot that drops more than 50% of the previous asset count.

```bash
curl -X POST https://brain-dashboard-maximo-seo.vercel.app/api/sync \
  -H "Authorization: Bearer $BRAIN_SYNC_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "bot": "hermes",
    "credential_hash": "64-char lowercase sha256 hex",
    "snapshot_uuid": "11111111-1111-4111-8111-111111111111",
    "sequence": 42,
    "digest": "64-char lowercase sha256 hex",
    "destructive": false,
    "assets": [
      {"type": "skill", "name": "my-skill", "description": "..."},
      {"type": "cli", "name": "my-tool", "version": "1.0.0"}
    ]
  }'
```

Allowed asset types are `skill`, `plugin`, `cli`, `mcp`, and `design`. Invalid rows return HTTP `422` with a `failures` array. Replay, stale sequence, invalid credential, and unsafe destructive snapshots return HTTP `409` before inventory mutation. Database transaction failures return HTTP `500` and do not report success.

### Health checks

Use unauthenticated liveness for load balancers and uptime checks:

```http
GET /api/health?mode=live
```

Use authenticated readiness for operators and CI so dependency/schema details are not public:

```http
GET /api/health?mode=ready
Authorization: Bearer ***
```

## Verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

# Brain Dashboard

Central registry for the agent ecosystem (skills, plugins, CLI tools, MCP servers, bots, dashboards, processes, memory facts).

**Live:** https://brain-dashboard-maximo-seo.vercel.app/

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in env vars
npm run dev
```

## Env Vars

| Var | Required | Description |
|-----|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (for writes) |
| `BRAIN_SYNC_SECRET` | ✅ | Shared secret for bot sync endpoint |
| `BRAIN_ACCESS_PASSWORD` | ✅ | Password for UI access |
| `BRAIN_SESSION_SECRET` | ✅ | Secret for session token signing |
| `SUPERMEMORY_API_KEY` | ⬜ | Supermemory search (knowledge tab) |
| `MEM0_API_URL` | ⬜ | mem0 search (knowledge tab) |
| `OBSIDIAN_API_URL` | ⬜ | Obsidian search (knowledge tab) |
| `OBSIDIAN_API_KEY` | ⬜ | Obsidian API key |

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/inventory` | GET | API key / session | List all assets (skills, plugins, CLI, MCP, designs) |
| `/api/bots` | GET | API key / session | List registered bots |
| `/api/dashboards` | GET | API key / session | List registered dashboards |
| `/api/memory` | GET | API key / session | List memory facts |
| `/api/memory` | POST | `BRAIN_SYNC_SECRET` | Store a memory fact |
| `/api/knowledge` | GET | API key / session | Federated search across sources |
| `/api/processes` | GET | API key / session | List documented processes |
| `/api/sync` | POST | `BRAIN_SYNC_SECRET` | Bot inventory sync (upsert assets) |
| `/api/health` | GET | none | Health check |
| `/api/auth/login` | POST | none | UI login (password) |

## Bot Sync

Bots POST their inventory to `/api/sync`:

```bash
curl -X POST https://brain-dashboard-maximo-seo.vercel.app/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "bot": "hermes",
    "secret": "BRAIN_SYNC_SECRET",
    "assets": [
      {"type": "skill", "name": "my-skill", "description": "..."},
      {"type": "cli", "name": "my-tool", "version": "1.0.0"}
    ]
  }'
```

## Deployment

```bash
# Via Vercel API
curl -X POST "https://api.vercel.com/v13/deployments?forceNew=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"brain-dashboard","gitSource":{"type":"github","ref":"main","repoId":"maximoseo/brain-dashboard"}}'
```

## Verification

```bash
npm run lint    # ESLint
npx tsc --noEmit  # TypeScript
npm run build   # Next.js build
curl https://brain-dashboard-maximo-seo.vercel.app/api/health
```

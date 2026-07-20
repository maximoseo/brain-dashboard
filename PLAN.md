# Brain Dashboard — Implementation Plan

**Project:** Central registry/store for the agent ecosystem (skills, plugins, CLI tools, MCP servers, bots, dashboards, processes, designs, memory facts)
**Date:** July 20, 2026
**Status:** ⏳ Awaiting Approval
**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth) · GitHub · Vercel

---

## 1. Goals

A single read/write surface where:
- **Bots (Hermes, OpenClaw, future)** register what they have and query what others have
- **Dashboards** pull config/asset lists (skills, MCPs, CLIs) instead of hardcoding them
- **You** see the whole fleet at a glance and edit it from one UI

**Success metrics:**
- One API (`GET /api/inventory`) returns the full ecosystem as JSON
- Bots POST new assets when they install something (idempotent by `name+type+owner`)
- Zero failed-deploy emails to service@maximo-seo.com after first green build
- Card appears on the dashboards panel

**Non-goals (v1):** RBAC beyond owner/admin, real-time WebSocket push (polling is fine), per-asset history beyond `updated_at`. Add when asked.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BRAIN DASHBOARD (Next.js)                  │
│   Inventory │ Bots │ Dashboards │ Processes │ Memory │ Search │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               API LAYER (Next.js Route Handlers)             │
│  GET/POST /api/inventory   ·   GET /api/bots                │
│  GET /api/dashboards       ·   GET /api/processes            │
│  GET /api/memory           ·   POST /api/sync (bot webhook)  │
│  GET /api/knowledge (federated fan-out)                      │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
┌──────────▼─────────────┐   ┌─────────────▼──────────────┐
│  Supabase (Postgres)    │   │  Bot Connectors (adapters) │
│  · assets               │   │  hermes-inventory.py       │
│  · bots                 │   │  openclaw-inventory.js     │
│  · dashboards           │   │  (run on cron / on-demand) │
│  · processes            │   └────────────────────────────┘
│  · memory_facts         │
│  · sync_log             │
└─────────────────────────┘
```

**Components:**
| Component | Role |
|-----------|------|
| **Next.js app** | UI + API (serverless on Vercel) |
| **Supabase Postgres** | Single source of truth — 6 tables |
| **Supabase Auth** | Owner/admin login (magic link or password) |
| **Bot connectors** | Thin scripts that read a bot's own inventory and POST to `/api/sync` |
| **Dashboards panel** | Receives a new card pointing at the deployed URL |

**Ponytail note:** No separate backend service. Next.js route handlers are the API. No Redis, no queue — Supabase is the store and the bots poll/push directly. Add a worker only if sync volume ever warrants it (it won't for a single-user fleet).

---

## 3. Database Schema

6 tables. One polymorphic `assets` table covers skills/plugins/CLI/MCP/designs — `type` discriminates. Avoids 5 near-identical tables.

```sql
-- Polymorphic asset store: skills, plugins, cli, mcp, designs
create table assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('skill','plugin','cli','mcp','design')),
  name text not null,               -- e.g. "hallmark", "stripe", "firecrawl-mcp"
  owner text not null default 'hermes',  -- which bot/system owns this copy
  description text,
  source text,                       -- url or "builtin"
  version text,
  enabled boolean default true,
  meta jsonb default '{}'::jsonb,    -- anything else (stars, path, config refs)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (type, name, owner)
);
create index on assets (type);
create index on assets (owner);

-- Bots in the fleet
create table bots (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,         -- "hermes", "zik" (openclaw)
  kind text not null,                -- "hermes" | "openclaw" | "other"
  status text default 'online',
  model text,                        -- "zai/glm-5.2"
  base_url text,
  last_seen timestamptz,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Dashboards we run
create table dashboards (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  url text not null,
  category text,
  status text default 'live',
  icon text,
  created_at timestamptz default now()
);

-- Processes / playbooks (markdown docs)
create table processes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  body text not null,                -- markdown
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Memory facts (shared across bots)
create table memory_facts (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text not null,
  scope text default 'global',       -- global | bot:hermes | bot:zik
  source text,                       -- who wrote it
  created_at timestamptz default now(),
  unique (scope, key)
);

-- Sync log (append-only, for debugging bot pushes)
create table sync_log (
  id bigserial primary key,
  bot text not null,
  endpoint text,
  status text,
  detail text,
  created_at timestamptz default now()
);

-- RLS: owner/admin write, anon read (dashboards need public GET)
-- Apply per-table in Supabase dashboard or via SQL.
```

**Why polymorphic:** 5 asset kinds share the same shape (name, owner, source, version, meta). One table + `type` = one set of CRUD routes, one search index, one UI list with a filter. Splitting into `skills`/`plugins`/`cli`/`mcp`/`designs` is 5× the code for zero gain until a kind diverges structurally — it hasn't.

---

## 4. API Specification

REST. No GraphQL — 6 endpoints cover everything, GraphQL's cost is overhead here.

| Method | Path | Body | Returns | Auth |
|--------|------|------|---------|------|
| `GET` | `/api/inventory` | — | `{skills,plugins,cli,mcp,designs}` grouped by type | anon (public read) |
| `GET` | `/api/inventory?type=skill&owner=hermes` | — | filtered array | anon |
| `POST` | `/api/sync` | `{bot, secret, assets:[{type,name,...}]}` | `{upserted, skipped}` | `BRAIN_SYNC_SECRET` |
| `GET` | `/api/bots` | — | bot fleet array | anon |
| `GET` | `/api/dashboards` | — | dashboards array (feeds the panel) | anon |
| `GET` | `/api/memory?scope=global` | — | facts array | anon |
| `POST` | `/api/memory` | `{key,value,scope,source,secret}` | upserted fact | `BRAIN_SYNC_SECRET` |
| `GET` | `/api/knowledge?q=&sources=obsidian,mem0` | — | `{results:[{source,title,snippet,url,score}]}` | anon |

**Sync auth:** shared `BRAIN_SYNC_SECRET` env var. Bots send it in the body. Simpler than per-bot API keys for a single-user fleet. Upgrade to Supabase service-role JWTs only if exposed publicly beyond your own infra.

**Idempotency:** `unique (type, name, owner)` + `on conflict do update` → bots can re-sync safely, no duplicates.

**Rate limit:** none in v1. Single user, trusted bots. Add Vercel Edge rate-limit if it ever faces untrusted traffic.

---

## 5. UI / Views

7 tabs, single page, filter + search:

1. **Inventory** — table of all assets, filter by type/owner, search, counts per type in header. Edit inline (name, source, enabled).
2. **Bots** — cards: name, model, status, last_seen, asset count.
3. **Dashboards** — list mirroring the panel (so Brain is the panel's source of truth).
4. **Processes** — markdown list, click to view, edit in a textarea.
5. **Knowledge** — federated search across Obsidian, Supermemory, mem0, Hermes memory, Langfuse. Results grouped by source, click-through to native view.
6. **Memory** — key/value facts (the local `memory_facts` table), filter by scope.
7. **Search** — global fuzzy search across all local tables (Postgres `ILIKE` across a `search` view; no Meilisearch/Elastic until volume demands).

**Tech:** React + the existing PromptForge/Central Brain design language (sunset theme tokens) so it matches the fleet. Tailwind. No component lib — 6 views is hand-writeable.

---

## 6. Bot Connectors (the integration layer)

Two thin scripts that read a bot's own state and POST to `/api/sync`. Run on cron (hourly) or on-demand.

**hermes-inventory.py** (runs on this server):
- Reads `hermes skills list`, `hermes mcp list`, `hermes plugins list`, `~/.hermes/config.yaml`
- Builds the asset array, POSTs to Brain

**openclaw-inventory.js** (runs on this server):
- Reads `openclaw skills list`, `openclaw plugins list`, `~/.openclaw/openclaw.json`
- POSTs to Brain

**Secret:** `BRAIN_SYNC_SECRET` in each bot's env. Both scripts ~50 lines each.

---

## 6b. Knowledge Sources (federated, not copied)

Brain does NOT duplicate what memory tools already store. It federates: one `/api/knowledge?q=` endpoint fans out to each connected source, merges, returns. Single source of truth stays in each tool. Brain is the aggregator view + the place bots ask "what do we know about X" without caring which tool holds it.

**Connected sources:**

| Source | Adapter | What it exposes | Auth |
|--------|---------|-----------------|------|
| **Obsidian vault** | `obsidian.py` — reads `/root/obsidian-vault` markdown + frontmatter (Bases, wikilinks) | notes, templates, references | filesystem (local) |
| **Supermemory** | `supermemory.py` — calls Supermemory MCP / REST | semantic search over indexed pages | `SUPERMEMORY_API_KEY` |
| **mem0** | `mem0.py` — calls mem0 Python lib (`mem0.Memory().search()`) | per-user facts | local lib, OpenAI key |
| **Hermes memory** | `hermes-mem.py` — reads `~/.hermes/memories/` (MEMORY.md + USER.md) | durable facts profile | filesystem |
| **Supabase `memory_facts`** | direct table query | facts bots POSTed via `/api/sync` | service key |
| **Langfuse** | `langfuse.py` — queries Langfuse API for traces/cost | run history, token spend | `LANGFUSE_SECRET_KEY` |

**Endpoint:** `GET /api/knowledge?q=<query>&sources=obsidian,mem0` → `{results:[{source, title, snippet, url, score}]}`

**Why federated over sync-and-copy:**
- No stale data — query hits the live source
- No duplication — Obsidian stays the vault, mem0 stays mem0
- One adapter per source (~30 lines each), no ETL pipeline
- Add a source = add one adapter file, register it in an array

**Ponytail ceiling:** federation adds latency (parallel fan-out, ~1-2s p99). Acceptable for a dashboard. If a bot needs sub-100ms, cache the last query result for 60s in the `memory_facts` table with a TTL column. Add the cache when a bot actually complains, not before.

**UI:** a "Knowledge" tab — search bar, results grouped by source, click-through to the source's native view (Obsidian note, Supermemory page, etc.). Brain never edits the source — it links to it.

**When to copy instead:** only if a source goes offline often or a bot needs offline access. Then add a `cache` table keyed by `(source, query_hash)` with a 1h TTL. Not now.

---

## 7. Deployment Pipeline

1. **Repo:** `maximoseo/brain-dashboard` (new, public)
2. **Vercel project:** created via API (token `VERCEL_TOKEN`), team `team_NVnIOFO7th3wYtoyRoqJnLhr`
3. **Env vars (Vercel):**
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (existing project `wtpczvyupmavzrxisvcm`)
   - `BRAIN_SYNC_SECRET` (generate, share with bots)
4. **Deploy:** `POST /v13/deployments?forceNew=1` with gitSource ref = main SHA (webhooks are disconnected across our repos, so use the API path that's proven to work)
5. **Verify green:** poll `/v13/deployments/{id}` until `READY`
6. **Email check:** the failed-deploy emails come from Vercel when a build errors. A green build = no email. Confirm by checking the deployment state is `READY` and the URL returns 200. (Vercel only emails `service@maximo-seo.com` on failure because that's the team's notification address — a successful build sends nothing.)
7. **Rollback:** `POST /v13/deployments/{prev_id}/promote` or redeploy prior SHA. Vercel keeps history.

**No GitHub Actions needed** — Vercel is the CI. Adding Actions would duplicate it. Add only if we want pre-merge previews (we don't, single dev).

---

## 8. Post-Deploy Verification Checklist

- [ ] Deployment state = `READY` (API poll)
- [ ] `GET https://brain-xxx.vercel.app/api/inventory` returns `{skills:[],...}` (empty but valid)
- [ ] No new email at service@maximo-seo.com in the last 10 min (green build = none sent)
- [ ] `POST /api/sync` with test asset returns `{upserted:1}`
- [ ] `GET /api/inventory` now shows the test asset
- [ ] Run `hermes-inventory.py` once → skills/MCPs/plugins populate
- [ ] Add card to dashboards-panel `src/data/dashboards.ts` → push to `devin/...` branch → Vercel auto-deploys panel
- [ ] Panel live at https://dashboards-panel.maximo-seo.ai shows the Brain card

---

## 9. Scope Decisions (ponytail)

| Built | Skipped | Add when |
|-------|---------|----------|
| Polymorphic `assets` table | Per-type tables | A kind needs fields the others don't |
| Shared sync secret | Per-bot API keys / JWTs | Untrusted bots or public exposure |
| `ILIKE` search | Meilisearch/Elastic | >10k rows or fuzzy needs |
| Polling | WebSocket live updates | Real-time collaboration needed |
| Supabase magic-link auth | OAuth / SSO | Multiple human admins |
| Vercel as CI | GitHub Actions | Pre-merge preview environments |
| Inline edit UI | Full CMS | Content team edits at scale |

---

## 10. Build Order (estimated ~1 day)

1. Supabase schema (6 tables + RLS) — 15 min
2. Next.js scaffold + env + Supabase client — 20 min
3. API routes (inventory, sync, bots, dashboards, memory, knowledge) — 75 min
4. UI: 7 views with sunset theme — 120 min
5. Seed from current ecosystem (Hermes skills/MCPs/plugins) — 30 min
6. Deploy via Vercel API, verify green — 15 min
7. Bot connector scripts — 30 min
8. Add to dashboards panel + push — 10 min

---

**⚡ Ready to build. Awaiting approval.**

Send "כן" / "ok" / "יאללה" to start, or tell me what to change.

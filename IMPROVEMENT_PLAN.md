# Brain Dashboard — Improvement Plan
**Date:** 2026-07-20 · **Live:** https://brain-dashboard-maximo-seo.vercel.app/ · **Repo:** /root/brain-dashboard

---

## Current State (verified)

| Component | Status | Details |
|-----------|--------|---------|
| **Deployment** | ✅ Live | Vercel, Next.js 16, static + API routes |
| **Build** | ✅ Green | `tsc` 0 errors, `next build` success |
| **API routes** | ✅ Working | 7 routes (inventory, bots, dashboards, memory, knowledge, processes, sync) |
| **Supabase** | ✅ Connected | `brain_*` tables in public schema |
| **Auth** | ⚠️ None | `BRAIN_ACCESS_PASSWORD` and `BRAIN_SESSION_SECRET` are **empty** — page is publicly accessible |
| **Data** | ⚠️ Partial | 1000 assets synced, but many tables empty |

### Data Inventory

| Table | Rows | Issues |
|-------|------|--------|
| `brain_assets` | 1,000 | 973 skills ✓, 17 CLI ✓, 3 designs ✓, **6 plugins are junk** (box-drawing chars), **1 MCP only** |
| `brain_bots` | 1 | Only `hermes` registered, no `openclaw` |
| `brain_dashboards` | **0** | Empty — should list all 7+ dashboards |
| `brain_memory_facts` | **0** | Empty — no shared facts |
| `brain_processes` | **0** | Empty — no process docs |
| `brain_sync_log` | 13 | Working, recent syncs logged |

---

## Issues Found (prioritized)

### P0 — Security & Access
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | **No auth on UI** — anyone can view the dashboard | 🔴 Critical | Add middleware that checks `BRAIN_ACCESS_PASSWORD` or Supabase Auth |
| 2 | **No auth on GET API routes** — anyone can query inventory, bots, knowledge | 🔴 Critical | Add API key check or Supabase Auth to GET routes (sync POST already has `BRAIN_SYNC_SECRET`) |
| 3 | **Junk plugin entries** — 6 box-drawing character rows in `brain_assets` | 🟡 Medium | Delete junk rows, add validation to sync endpoint to reject non-printable names |

### P1 — Data Completeness
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 4 | **0 dashboards registered** | 🟡 Medium | Seed `brain_dashboards` with all 7 live dashboards (rep-center, brain, dashboards-panel, loop-engineering, site-intel, central-brain, seo-dashboard) |
| 5 | **0 memory facts** | 🟡 Medium | Seed `brain_memory_facts` with user preferences, integration status, project conventions |
| 6 | **0 processes documented** | 🟡 Medium | Seed `brain_processes` with onboarding, content-pipeline, seo-audit, deployment, review, incident-response |
| 7 | **Only 1 MCP server** (rafter) — many more exist | 🟡 Medium | Sync actual MCP servers from `~/.local/bin/mcp-*`, `/usr/local/bin/mcp-*`, and `~/.hermes/mcp-installs/` |
| 8 | **Only 17 CLI tools** — many more exist | 🟡 Medium | Sync actual CLI tools from `/usr/local/bin/` and `~/.local/bin/` |
| 9 | **Only 1 bot** (hermes) — openclaw not registered | 🟡 Medium | Run openclaw inventory sync or add manually |
| 10 | **No asset versions** — all `version` fields are NULL | 🟢 Low | Extract versions from tool `--version` output during sync |

### P2 — UX & Functionality
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 11 | **No error handling in UI** — failed fetches silently fail (`catch {}`) | 🟡 Medium | Add error state display in UI |
| 12 | **No retry logic** — single fetch attempt | 🟢 Low | Add retry with backoff for API calls |
| 13 | **No loading skeletons** — just "טוען..." text | 🟢 Low | Add skeleton cards for better perceived performance |
| 14 | **No mobile bottom nav** — mobile nav is top-only | 🟢 Low | Add bottom tab bar for mobile (matches other dashboards) |
| 15 | **No dark/light mode toggle** — dark only | 🟢 Low | Add theme toggle (user preference) |
| 16 | **No export functionality** — can't export inventory as CSV/JSON | 🟢 Low | Add export button to inventory view |
| 17 | **No filtering by owner** — can only filter by type | 🟢 Low | Add owner filter (hermes/openclaw) |
| 18 | **No sort options** — only default sort | 🟢 Low | Add sort by name, type, updated_at |
| 19 | **Knowledge search doesn't show which sources failed** | 🟢 Low | Show per-source status in results |
| 20 | **No recent sync indicator** — can't tell when data was last updated | 🟡 Medium | Show `last_sync` timestamp in overview |

### P3 — Performance & Scale
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 21 | **1000 assets load all at once** — no virtualization for large lists | 🟢 Low | Add virtual scrolling or pagination (already has pagination, but all 1000 load into memory) |
| 22 | **No caching headers** — every request hits Supabase | 🟢 Low | Add `Cache-Control` headers to GET routes (60s for inventory, 300s for bots/dashboards) |
| 23 | **No search debounce** — every keystroke triggers filter | 🟢 Low | Add 300ms debounce to search input |
| 24 | **No offline support** — PWA not configured | 🟢 Low | Add service worker for offline asset browsing |

### P4 — Developer Experience
| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 25 | **No ESLint config** — `npx eslint` fails | 🟡 Medium | Add `eslint.config.js` with Next.js rules |
| 26 | **No README** — no setup docs | 🟡 Medium | Write README with setup, env vars, deployment |
| 27 | **No .env.example validation** — missing env vars crash silently | 🟡 Medium | Add startup validation that logs missing required env vars |
| 28 | **No CI** — no automated tests or linting | 🟡 Medium | Add GitHub Actions workflow (lint + tsc + build) |
| 29 | **No health check endpoint** — no `/api/health` | 🟢 Low | Add health check that verifies Supabase connection |
| 30 | **No structured logging** — no request logging | 🟢 Low | Add middleware for API request logging |

---

## Implementation Plan

### Phase 1: Security (30 min)
1. Add `src/middleware.ts` — password-protect UI with `BRAIN_ACCESS_PASSWORD`
2. Add API key check to GET routes (inventory, bots, dashboards, memory, knowledge) using `BRAIN_SYNC_SECRET`
3. Delete 6 junk plugin entries from `brain_assets`
4. Add name validation to sync endpoint (reject box-drawing chars, min 2 chars)

### Phase 2: Data Seeding (45 min)
5. Seed `brain_dashboards` with 7 dashboards
6. Seed `brain_memory_facts` with 10 key facts
7. Seed `brain_processes` with 6 processes
8. Write sync script for actual MCP servers and CLI tools
9. Register openclaw bot

### Phase 3: UX Polish (60 min)
10. Add error states to UI
11. Add loading skeletons
12. Add mobile bottom nav
13. Add export to CSV/JSON
14. Add owner filter + sort options
15. Add last-sync timestamp
16. Add theme toggle (optional)

### Phase 4: Performance (30 min)
17. Add caching headers to GET routes
18. Add search debounce
19. Add virtual scrolling for large lists (or keep pagination but show total count)

### Phase 5: DX (30 min)
20. Add ESLint config
21. Write README
22. Add env var validation
23. Add GitHub Actions CI
24. Add health check endpoint

---

## Verification Checklist

- [ ] `https://brain-dashboard-maximo-seo.vercel.app/` requires password
- [ ] `GET /api/inventory` requires API key
- [ ] `brain_dashboards` has 7 rows
- [ ] `brain_memory_facts` has 10+ rows
- [ ] `brain_processes` has 6 rows
- [ ] `brain_assets` has 0 junk entries (box-drawing)
- [ ] `brain_bots` has 2 rows (hermes + openclaw)
- [ ] UI shows error states when API fails
- [ ] Mobile bottom nav works
- [ ] ESLint passes
- [ ] CI green

---

**Ready to execute. Awaiting approval.**

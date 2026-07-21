# Brain Dashboard — Comprehensive Improvement Plan

**Product:** Brain Dashboard / Agent Ecosystem Registry  
**Production:** <https://brain-dashboard-maximo-seo.vercel.app/>  
**Source:** <https://github.com/maximoseo/brain-dashboard>  
**Audit date:** July 21, 2026  
**Plan status:** Ready for review  
**Product language requirement:** **English only**

---

## 1. Executive Summary

Brain Dashboard is intended to be the central operational registry for the agent ecosystem: skills, plugins, CLI tools, MCP servers, bots, dashboards, knowledge sources, processes, and durable memory. The foundation is useful and deliberately small: Next.js 16, React 19, Supabase, Vercel, a single dashboard shell, and nine API route handlers.

The current implementation should not yet be treated as a reliable production control plane. The most urgent problems are:

1. **Production access is out of sync.** The shared dashboard password is present in Doppler, but the current production login rejects it. The Vercel project exposes the expected environment-variable names, while the linked production environment pull returned empty values in this audit context. Authentication configuration and deployment ownership must be reconciled before feature work.
2. **The session token is forgeable.** Its timestamp is not cryptographically signed, allowing a valid token holder to extend the session indefinitely.
3. **Supabase anonymous read policies bypass application authentication.** Direct REST access can expose data without passing through the dashboard API.
4. **Authenticated API responses are marked publicly cacheable.** Private data could be retained in shared CDN caches.
5. **The English-only requirement is substantially violated.** The main UI contains dozens of Hebrew strings and explicitly formats dates with `he-IL`.
6. **The mobile layout is severely broken.** The desktop navigation remains present off-canvas, creates enormous elements, and conflicts with the bottom navigation.
7. **Inventory silently truncates at Supabase's default row limit.** The current client-side pagination only paginates the already-truncated response.
8. **The codebase lacks production safety rails.** There are no automated tests or CI, linting is broken, build-time type errors are ignored, and API/data validation is weak.

### Recommended product direction

Turn Brain Dashboard into a secure, English-only, responsive **Agent Operations Hub** with:

- a trusted inventory and capability catalog;
- fleet health and sync visibility;
- dashboard/service discovery;
- unified knowledge search;
- controlled write actions with audit trails;
- first-class mobile operation;
- clear ownership, freshness, and reliability signals.

Do not begin with visual polish alone. Complete the security, deployment, data-integrity, and English migration work first.

---

## 2. Audit Scope and Evidence

The plan is based on:

- authenticated and unauthenticated route testing;
- production login testing;
- desktop and 390×844 mobile screenshots;
- DOM geometry and responsive-layout inspection;
- source review of all files under `src/`;
- Supabase schema review;
- Vercel project/deployment inspection;
- production API checks;
- local production build;
- TypeScript check;
- npm dependency audit;
- Lighthouse audit of the production login screen.

### Verified baseline

| Area | Result |
|---|---|
| Production deployment | Ready and responding |
| Health endpoint | `200`, Supabase reported connected |
| Protected APIs without credentials | Correctly return `401` |
| Known shared password | Rejected by production |
| Local production build | Passes |
| TypeScript (`tsc --noEmit`) | Passes under current permissive configuration |
| Lint command | Fails because `next lint` is no longer valid in Next.js 16 |
| npm audit | 2 moderate vulnerabilities |
| Lighthouse login performance | 95 |
| Lighthouse login accessibility | 93 |
| Lighthouse login best practices | 96 |
| Lighthouse login SEO | 100 |
| Active UI language | Mixed English and Hebrew |
| Mobile usability | Critically broken |

### Important limitation

The authenticated production dashboard could not be reviewed visually because the deployed password does not match the established Doppler credential. The inner dashboard was therefore reviewed from source and in a local authenticated audit runtime connected to the configured Supabase project. This production credential drift is itself a P0 finding.

---

## 3. Product Goals

### Primary goal

Provide one trustworthy place to answer:

- What agents, tools, MCP servers, skills, dashboards, and processes exist?
- Which ones are online, healthy, stale, disabled, duplicated, or misconfigured?
- Who owns each capability?
- When was each record last verified?
- What can be safely invoked, and what requires approval?
- Where can an operator find the relevant documentation, logs, credentials reference, or dashboard?

### Success criteria

- 100% of user-facing copy is English.
- Production login works with the managed credential or managed identity provider.
- No application data is readable by anonymous direct Supabase requests.
- Mobile flows are fully usable at 320, 360, 390, 430, 768, and 1024 px widths.
- Inventory counts are exact and not limited to 1,000 rows.
- Every record shows owner, source, status, verification time, and freshness.
- Every write or destructive action is permissioned and audited.
- Core pages load in under 2 seconds at p75 on a mobile connection.
- Critical workflows have automated end-to-end coverage.

### Non-goals for the first release

- Replacing every specialist dashboard.
- Building a generic workflow engine.
- Storing raw credentials in Brain Dashboard.
- Allowing autonomous destructive actions without confirmation.
- Implementing complex multi-tenant billing.

---

## 4. P0 — Immediate Production Blockers

### P0.1 Reconcile production authentication and deployment ownership

**Evidence**

- The expected shared password exists in Doppler and matches other dashboard-password aliases.
- Production returns `401 invalid password` for that credential.
- The current Vercel project is `brain-dashboard-maximo-seo`.
- Production aliases reference a `feat-ecosystem-api` deployment source, while the visible GitHub repository currently exposes `main`.
- Vercel environment-variable names exist, but the environment pull used during this audit yielded empty values.

**Actions**

1. Confirm the canonical Vercel project and repository/branch mapping.
2. Remove duplicate or orphan Brain Dashboard projects.
3. Set production, preview, and development variables from one authoritative secret source.
4. Use Doppler or Vercel Secret References; do not manually copy credentials between projects.
5. Add a deployment preflight that fails when required variables are missing or empty.
6. Add a post-deploy login smoke test using a dedicated E2E credential.
7. Rotate the access and session secrets after reconciliation.

**Acceptance criteria**

- The canonical URL resolves to the intended Git commit.
- The managed E2E credential logs in successfully.
- Missing required variables prevent deployment rather than producing a broken login loop.
- Preview deployments use isolated credentials and data.

### P0.2 Replace the custom session token

**Current issue**

`src/app/api/auth/login/route.ts` builds a token from an unsigned timestamp and a static fragment derived from the session secret. Middleware trusts the user-controlled timestamp. A valid cookie holder can alter the timestamp or use a nonnumeric value to evade expiration.

**Recommended solution**

Use one of these, in priority order:

1. **Supabase Auth with email/password or magic link**, plus optional MFA.
2. Auth.js with a signed, encrypted session cookie.
3. A minimal HMAC-SHA-256 token containing `iat`, `exp`, `iss`, `aud`, and a random session ID.

Add:

- server-side session revocation;
- logout;
- fixed maximum lifetime and idle timeout;
- login rate limiting;
- failed-login audit events;
- CSRF protection for state-changing browser requests.

**Acceptance criteria**

- Changing any token byte invalidates the session.
- Expired and revoked sessions are rejected.
- Five repeated failed logins trigger a temporary backoff.
- Logout immediately invalidates the current session.

### P0.3 Close the Supabase authentication bypass

**Current issue**

The SQL schema permits anonymous `SELECT` access to all tables. Anyone with the public project URL and anon key can bypass Next.js API authentication and query Supabase REST directly.

**Actions**

- Remove unconditional anonymous read policies.
- Keep service-role credentials server-only.
- Use Supabase Auth-bound RLS or server-only API access.
- Treat memory facts, sync logs, bot metadata, source URLs, and operational notes as private.
- Add automated RLS tests for anonymous, authenticated operator, bot writer, and service roles.

**Acceptance criteria**

- Anonymous Supabase REST requests return no protected data.
- Operators only read allowed records.
- Bots can sync only their own scoped inventory.
- Service-role keys never appear in browser bundles or logs.

### P0.4 Stop publicly caching authenticated responses

Authenticated endpoints currently emit public `s-maxage` cache headers.

**Actions**

- Default private endpoints to `Cache-Control: private, no-store`.
- If caching is needed, cache server-side by authorization scope and never by a shared public CDN key.
- Add `Vary` only where safe and test cross-session isolation.

### P0.5 Remove credential transport through query strings

`?key=` is accepted for API authentication, and the same secret is used for both reads and writes.

**Actions**

- Remove query-string credentials.
- Require `Authorization: Bearer ...` or a signed service token.
- Separate read, sync-write, memory-write, and admin scopes.
- Rotate the existing shared sync secret.

---

## 5. English-Only Migration

English must be a release gate, not an informal cleanup task.

### Required replacements

Replace all Hebrew copy in:

- sidebar and mobile navigation descriptions;
- overview title and explanatory text;
- asset type descriptions;
- inventory headings, filters, search placeholder, statuses, links, pagination, and empty states;
- bot labels and timestamps;
- dashboard headings and links;
- knowledge search heading, description, placeholder, loading, empty, untitled, and open labels;
- memory heading, description, and empty state;
- login subtitle, password label, placeholder, loading label, and submit button;
- locale-specific date formatting.

### Language standards

- Set `html lang="en"` and keep the entire application LTR.
- Format dates with `en-US` or a configurable English locale.
- Use one terminology set:
  - **Agent**, not Bot, when the entity is an autonomous agent.
  - **Tool**, **Skill**, **Plugin**, **MCP Server**, **Dashboard**, **Process**, **Knowledge Source**.
  - **Enabled / Disabled**, **Healthy / Degraded / Offline**, **Verified / Stale**.
- Replace technical jargon with short supporting text or tooltips.
- Use sentence case for navigation and headings.

### Proposed English login copy

- Product: **Brain Dashboard**
- Subtitle: **Agent ecosystem operations hub**
- Label: **Password**
- Placeholder: **Enter your password**
- Button: **Sign in**
- Loading: **Signing in…**
- Generic error: **Unable to sign in. Check your credentials and try again.**

### Automated enforcement

Add CI checks that fail when:

- Hebrew Unicode characters appear in `src/`;
- `he-IL` appears in code;
- untranslated copy is added outside the copy catalog.

A simple English-only product does not need a full i18n framework immediately. Centralize copy in typed English constants first. Add i18n only if multilingual support becomes a real requirement.

---

## 6. Information Architecture and Navigation

### Current issues

- Six views are implemented inside one 420-line client component.
- Planned Processes and Global Search views are missing.
- View state is not represented in the URL.
- Browser history, deep links, refresh persistence, and shareable links do not work.
- Desktop and mobile navigation are rendered simultaneously and conflict.

### Recommended route structure

```text
/overview
/inventory
/inventory/[assetId]
/agents
/agents/[agentId]
/dashboards
/processes
/processes/[slug]
/knowledge
/memory
/activity
/settings
```

Redirect `/` to `/overview`.

### Primary navigation

1. Overview
2. Inventory
3. Agents
4. Dashboards
5. Knowledge
6. Processes
7. Activity

Keep Memory and Settings in secondary navigation. On mobile, place only the four most frequent destinations in the bottom bar and put the rest under **More**.

### Command palette

Add `Cmd/Ctrl + K` for:

- global search;
- page navigation;
- opening an asset or dashboard;
- copying a source path;
- running safe refresh operations;
- switching theme.

No destructive command should execute directly from the palette without confirmation.

---

## 7. UX and Visual Design

### Design-system direction

Keep the dark operational aesthetic but reduce the decorative gradient-heavy feel. The dashboard should communicate trust, hierarchy, and system status.

Create tokens for:

- neutral surfaces and borders;
- semantic status colors;
- typography scale;
- spacing scale;
- radii;
- shadows;
- focus rings;
- motion duration/easing.

Use one consistent icon library instead of emojis. Recommended: Lucide or Phosphor.

### Layout

**Desktop**

- Collapsible 240 px sidebar.
- 12-column content grid with a 1440 px maximum width.
- Sticky top bar containing page title, global search, freshness status, and account menu.
- Consistent page header with title, description, primary action, and context actions.

**Tablet**

- Collapsed icon sidebar or drawer.
- Two-column stat and card grids.

**Mobile**

- No desktop sidebar in the layout tree at the mobile breakpoint.
- One top app bar and one bottom navigation bar.
- `44×44 px` minimum touch targets.
- Single-column cards and tables converted to list rows.
- Safe-area support: `env(safe-area-inset-bottom)`.
- No fixed-width content and no hidden horizontal overflow masking layout defects.

### Confirmed mobile defect

At 390×844, the desktop navigation buttons remain geometrically present and become approximately 2,696 px tall. A separate bottom navigation is also visible. This produces clipping, off-screen controls, and a fundamentally unusable mobile experience.

**Required fix**

- Render navigation variants conditionally or use correct `display:none` rules.
- Remove transforms that leave the desktop navigation in the accessibility/layout tree.
- Add responsive integration tests that assert zero horizontal overflow.

### Overview redesign

Replace decorative type cards with operational cards:

- Total capabilities
- Healthy agents
- Stale records
- Failed syncs
- Active MCP servers
- Dashboards online
- Knowledge sources available

Add:

- sync health timeline;
- recent changes;
- stale/failed items requiring attention;
- ecosystem coverage by owner and type;
- quick links to highest-priority actions.

### Inventory redesign

Use a server-paginated data table with:

- search;
- type, owner, status, source, and freshness filters;
- sortable columns;
- saved views;
- density control;
- column visibility;
- bulk export;
- row details drawer;
- copy source/path action;
- verification history;
- stale and duplicate badges.

Do not use color alone for status.

### Empty, loading, and error states

Every view needs:

- skeleton loading state;
- specific empty state with a recommended next action;
- retryable error state;
- partial-data warning;
- stale-data banner;
- offline/degraded source status.

Never silently swallow fetch errors.

---

## 8. Accessibility Plan

Target WCAG 2.2 AA.

### Immediate fixes

- Add visible labels to search and filter controls.
- Add `aria-current="page"` to active navigation.
- Add `aria-live` regions for loading, errors, and result counts.
- Provide visible keyboard focus rings.
- Ensure disabled buttons remain legible.
- Use semantic links for navigation instead of clickable `div` elements.
- Add `rel="noopener noreferrer"` to external links.
- Validate outbound URLs before opening.
- Add accessible names to icon-only controls.
- Respect `prefers-reduced-motion`.
- Increase muted text contrast.
- Do not depend on emoji semantics.

### Test matrix

- Keyboard-only navigation.
- VoiceOver/Safari.
- TalkBack/Chrome Android.
- 200% and 400% zoom.
- High contrast mode.
- Reduced motion.
- Axe and Lighthouse in CI.

---

## 9. Feature Roadmap

### 9.1 Fleet health

For every agent:

- online/degraded/offline state;
- current model and runtime;
- last heartbeat;
- installed capability count;
- last successful sync;
- failed sync reason;
- version drift;
- host/environment metadata;
- recent activity.

### 9.2 Capability catalog

Each capability record should include:

- canonical name and type;
- description;
- owner/agent;
- source repository or documentation;
- installed version and latest version;
- enabled state;
- prerequisites;
- risk classification;
- permission level;
- last verified time;
- health status;
- tags;
- duplicate relationship.

### 9.3 Sync and reconciliation

- Upsert current records.
- Mark absent records stale rather than leaving them permanently active.
- Support a full-snapshot sync transaction.
- Display added, changed, disabled, and removed counts.
- Keep immutable sync history.
- Allow rollback of registry metadata, not external tools.

### 9.4 Unified knowledge search

- Search local memory, Obsidian, processes, inventory, and configured knowledge services.
- Show per-source status, latency, and failures.
- Group and deduplicate results.
- Include citations and source links.
- Add result-type and date filters.
- Never imply that a failed source returned zero matches.

### 9.5 Dashboard directory

- Health-check dashboard URLs.
- Show last deployment, environment, owner, repository, and status.
- Detect redirects, authentication failures, and expired domains.
- Add favorites and categories.
- Open external dashboards safely.

### 9.6 Processes and runbooks

- Markdown-based process library.
- Owners, tags, version, last reviewed date.
- Draft/review/published states.
- Links to required tools and dashboards.
- “Run with agent” action that creates a reviewed work order, not an immediate autonomous execution.

### 9.7 Activity and audit log

Record:

- logins and failed logins;
- sync attempts;
- record changes;
- external write actions;
- exports;
- configuration changes;
- user, agent, source IP hash, timestamp, and result.

### 9.8 Notifications

Add configurable alerts for:

- stale agents;
- repeated sync failures;
- unhealthy dashboards;
- credential/configuration drift;
- unusually large inventory changes;
- failed knowledge sources.

### 9.9 Safe actions

Read operations can be streamlined. Write or destructive actions must show:

- exact target;
- exact effect;
- required permission;
- preview/diff;
- confirmation;
- audit record;
- rollback guidance where possible.

---

## 10. Frontend Architecture Refactor

### Break up the monolith

Suggested structure:

```text
src/
  app/
    (authenticated)/
      layout.tsx
      overview/page.tsx
      inventory/page.tsx
      agents/page.tsx
      dashboards/page.tsx
      knowledge/page.tsx
      processes/page.tsx
      activity/page.tsx
    login/page.tsx
    api/
  components/
    app-shell/
    data-table/
    feedback/
    forms/
    navigation/
    status/
  features/
    inventory/
    agents/
    dashboards/
    knowledge/
    processes/
  lib/
    auth/
    db/
    validation/
    telemetry/
  types/
```

### React and Next.js improvements

- Prefer Server Components for initial page data.
- Use client components only for interactive islands.
- Use route-level loading and error boundaries.
- Use URL search parameters for filters and pagination.
- Add `AbortController` or a query library for client requests.
- Remove duplicated auth logic.
- Migrate deprecated `middleware.ts` to the Next.js 16 `proxy.ts` convention.

### TypeScript quality

Enable:

```json
{
  "strict": true,
  "allowJs": false,
  "skipLibCheck": false
}
```

Remove `typescript.ignoreBuildErrors`. Generate Supabase database types and validate all API inputs and outputs with Zod or Valibot.

---

## 11. API and Data Architecture

### Version the API

Use `/api/v1/...` for agent-facing interfaces and document compatibility guarantees.

### Validation

Validate:

- request content type;
- body shape;
- type enum;
- URL fields;
- status enum;
- owner identity;
- string lengths;
- batch size;
- allowed metadata keys.

Return appropriate `4xx` or `5xx` status codes. Do not report failed writes as HTTP 200.

### Sync transaction

A sync should atomically:

1. authenticate a specific agent;
2. validate the complete payload;
3. upsert current capabilities;
4. mark missing capabilities stale;
5. update the agent heartbeat;
6. append a sync-log record;
7. return exact counts and errors.

Use a Postgres function/transaction rather than three unrelated calls.

### Pagination

Replace unbounded `.select("*")` with server pagination:

- `page`/`pageSize` or cursor pagination;
- exact total count;
- stable sort key;
- maximum page size;
- indexed filter fields.

### Search indexes

Use:

- B-tree indexes for type, owner, status, and updated time;
- trigram indexes for fuzzy name/description search;
- full-text search where process and knowledge content justifies it.

### Migrations and seeds

- Introduce Supabase CLI migrations.
- Keep schema changes versioned.
- Generate TypeScript database types in CI.
- Add deterministic seed data for development and E2E tests.

---

## 12. Security Hardening

### Required controls

- Managed authentication or correctly signed sessions.
- Rate limiting for login and APIs.
- CSRF protection for cookie-authenticated writes.
- Separate scoped service credentials.
- RLS test suite.
- Content Security Policy.
- `frame-ancestors 'none'` unless embedding is intentional.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- restrictive `Permissions-Policy`.
- HSTS at the hosting layer.
- secure outbound-link handling.
- audit logs for authentication and writes.
- secret rotation runbook.
- no credentials in URLs, logs, analytics, or client bundles.

### Redirect validation

The `next` login parameter must only accept a same-origin path beginning with one `/`. Reject protocols, `//`, backslashes, encoded protocol separators, and non-string input.

### CSV export security

Escape every field and neutralize spreadsheet formulas beginning with `=`, `+`, `-`, `@`, tab, or carriage return.

---

## 13. Performance and Reliability

### Current baseline

The login page performs well, but it is not representative of authenticated dashboard workload. The main dashboard currently fetches complete datasets after hydration.

### Performance work

- Server-render the first page of each view.
- Add server-side pagination and filters.
- Avoid loading the full inventory into the browser.
- Split feature bundles by route.
- Use stable skeletons to avoid layout shift.
- Cache only public or safely scoped data.
- Use conditional requests/ETags where appropriate.
- Track API latency and Supabase query duration.

### Performance budgets

| Metric | Target |
|---|---:|
| LCP | ≤ 2.5 s p75 mobile |
| INP | ≤ 200 ms p75 |
| CLS | ≤ 0.1 |
| Initial JS | ≤ 180 KB gzip per route |
| API p95 | ≤ 500 ms for registry reads |
| Search p95 | ≤ 1.5 s across healthy sources |

### Reliability

- Health checks must verify required dependencies, not only return static status.
- Add readiness and liveness semantics.
- Track per-source degraded state.
- Add timeout, retry, and circuit-breaker behavior for federated knowledge sources.
- Preserve partial results and clearly label failed sources.

---

## 14. Testing and Quality Gates

### Unit tests

- session signing/verification;
- redirect validation;
- API authorization scopes;
- sync payload validation;
- CSV escaping;
- status/freshness calculations;
- English-only copy check.

### Integration tests

- Supabase RLS roles;
- paginated inventory API;
- atomic sync behavior;
- stale reconciliation;
- knowledge-source failure handling;
- cache isolation.

### End-to-end tests

- login success/failure/rate limit/logout;
- overview loading and degraded states;
- inventory filtering, sorting, pagination, export;
- agent detail page;
- dashboard safe navigation;
- knowledge search partial failure;
- mobile navigation;
- keyboard-only navigation.

### Responsive test matrix

- 320×568
- 360×800
- 390×844
- 430×932
- 768×1024
- 1024×768
- 1280×800
- 1440×900

For every size assert:

- no horizontal overflow;
- only one primary navigation system is visible;
- touch targets are at least 44×44 px;
- content is not hidden behind fixed bars;
- tables remain usable;
- dialogs fit the viewport.

### CI pipeline

On every pull request:

1. install with `npm ci`;
2. ESLint;
3. TypeScript strict check;
4. unit tests;
5. integration tests;
6. production build;
7. dependency audit;
8. English-only scan;
9. Playwright E2E;
10. Axe accessibility scan;
11. Lighthouse budget on preview deployment.

### Fix the current quality gates

- Replace `next lint` with the ESLint CLI.
- Remove build type-error suppression.
- Resolve the two moderate dependency vulnerabilities.
- Add a test framework; the repository currently has no tests.

---

## 15. Observability

Implement structured telemetry for:

- request ID;
- route;
- authenticated actor/agent ID;
- status code;
- latency;
- Supabase query latency;
- sync result counts;
- knowledge-source outcomes;
- deployment version/commit;
- error class without secrets.

Recommended stack:

- Sentry for exceptions and traces;
- Vercel Analytics/Speed Insights for web vitals;
- structured JSON logs;
- a small internal activity table for product audit events.

Create dashboards/alerts for:

- login failures;
- `401`, `403`, `429`, and `5xx` rates;
- failed syncs;
- stale agents;
- slow database queries;
- knowledge-source timeout rate;
- production environment drift.

---

## 16. Delivery Plan

### Phase 0 — Stabilize production (Day 1)

- Select the canonical Vercel project and Git source.
- Reconcile environment variables with Doppler.
- Rotate secrets.
- Add environment validation.
- Restore working production login.
- Add a deployment smoke test.

**Exit gate:** production login and protected API smoke tests pass.

### Phase 1 — Security and data boundaries (Days 2–4)

- Replace custom session tokens.
- Add logout, rate limiting, and audit events.
- Remove anonymous Supabase reads.
- Separate read/write credentials.
- Remove query-string authentication.
- Correct cache headers.
- Add redirect validation and security headers.

**Exit gate:** security test suite and RLS tests pass.

### Phase 2 — English-only foundation and architecture (Days 5–7)

- Replace all Hebrew UI copy.
- Standardize English terminology and locale.
- Split routes/features/components.
- Introduce routable navigation.
- Enable strict TypeScript.
- Fix linting and CI.

**Exit gate:** English scan, lint, types, build, and core tests pass.

### Phase 3 — Responsive design system (Week 2)

- Build app shell and design tokens.
- Fix desktop/mobile navigation.
- Redesign overview and feedback states.
- Implement responsive inventory patterns.
- Complete WCAG fixes.

**Exit gate:** responsive E2E matrix and Axe checks pass.

### Phase 4 — Data correctness and inventory scale (Week 3)

- Add server pagination and exact counts.
- Add schema migrations and generated types.
- Implement transactional sync and stale reconciliation.
- Add owner/status/freshness metadata.
- Add safe exports.

**Exit gate:** inventory supports the complete dataset without truncation.

### Phase 5 — Product capabilities (Weeks 4–5)

- Fleet health.
- Dashboard directory health.
- Processes/runbooks.
- Unified knowledge search with source health.
- Activity/audit view.
- Notification rules.

**Exit gate:** primary operator workflows are covered by E2E tests and production telemetry.

### Phase 6 — Optimization and controlled automation (Week 6)

- Performance tuning.
- Saved views and command palette.
- Safe action previews and confirmation flows.
- Reliability dashboards and alerts.

---

## 17. Prioritized Backlog

| Priority | Work item | Outcome |
|---|---|---|
| P0 | Reconcile Vercel project, Git source, and Doppler secrets | Working, reproducible production login |
| P0 | Replace forgeable session token | Authenticated, expiring, revocable sessions |
| P0 | Remove anonymous Supabase read policies | No direct database bypass |
| P0 | Correct private API cache headers | No cross-user CDN exposure |
| P0 | Remove query-string credentials and split scopes | Reduced credential leakage/blast radius |
| P0 | Fix mobile navigation/layout | Usable dashboard on phones |
| P1 | Complete English-only migration | Consistent English UI and locale |
| P1 | Add login rate limiting and audit log | Brute-force resistance and visibility |
| P1 | Add server-side pagination and exact totals | Complete inventory beyond 1,000 rows |
| P1 | Introduce CI, ESLint, strict types, and tests | Reliable releases |
| P1 | Validate API payloads and return correct status codes | Predictable integrations |
| P1 | Implement atomic sync and stale reconciliation | Trustworthy registry state |
| P1 | Route-based architecture | Deep links, history, maintainability |
| P2 | Redesign overview around operational health | Faster issue detection |
| P2 | Fleet health and agent detail pages | Actionable agent operations |
| P2 | Dashboard health directory | Reliable discovery and ownership |
| P2 | Knowledge source health and partial-result UX | Trustworthy federated search |
| P2 | Processes and runbooks | Repeatable operations |
| P2 | Activity and audit page | Traceability |
| P3 | Saved views and command palette | Operator efficiency |
| P3 | Theme preference | Personalization without blocking core work |
| P3 | Carefully scoped PWA/offline inventory | Optional resilience after security/data fixes |

---

## 18. Definition of Done

The improvement program is complete when:

- production maps to one canonical repository, branch, and Vercel project;
- secrets are managed centrally and validated at deployment;
- login, logout, expiry, revocation, and rate limiting work;
- direct anonymous Supabase access is blocked;
- all private APIs are non-publicly cacheable;
- 100% of visible UI is English;
- zero Hebrew characters and `he-IL` references remain in `src/`;
- no horizontal overflow exists at supported breakpoints;
- only one navigation pattern is present at each breakpoint;
- inventory totals are exact and pagination is server-side;
- sync is authenticated, validated, atomic, and reconciling;
- the application passes lint, strict TypeScript, tests, build, accessibility, security, and performance gates;
- key workflows are observable and auditable;
- write actions require explicit permission and confirmation.

---

## 19. Recommended First Pull Requests

### PR 1 — Production configuration and auth repair

- canonical Vercel/Git mapping;
- required-env schema;
- managed session implementation;
- working login/logout;
- smoke test.

### PR 2 — Data security

- RLS migration;
- private cache headers;
- scoped API tokens;
- query-string credential removal;
- security headers;
- security tests.

### PR 3 — English-only migration

- centralized English copy;
- English date formatting;
- removal of all Hebrew strings;
- English CI scan.

### PR 4 — Responsive app shell

- route-based navigation;
- desktop sidebar;
- mobile top/bottom navigation;
- overflow and touch-target tests;
- design tokens and accessibility primitives.

### PR 5 — Scalable inventory

- server pagination;
- exact totals;
- typed filters/sorts;
- asset detail route;
- safe export;
- stale/duplicate/freshness signals.

---

## Final Recommendation

Treat Brain Dashboard as operational infrastructure, not merely a visual directory. Its value comes from trustworthy identity, accurate registry data, clear health signals, and safe control—not from adding more cards. Stabilize production and security first, complete the English/mobile foundation second, then add fleet health, reconciliation, knowledge search, runbooks, and controlled actions.

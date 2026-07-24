import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const routes = ["overview", "inventory", "agents", "dashboards", "knowledge", "memory", "processes", "activity"];

async function text(path) { return readFile(join(root, path), "utf8"); }

test("all required product routes exist", async () => {
  await Promise.all(routes.map((route) => stat(join(root, `src/app/(authenticated)/${route}/page.tsx`))));
});

test("application declares English and redirects root to overview", async () => {
  const [layout, page] = await Promise.all([text("src/app/layout.tsx"), text("src/app/page.tsx")]);
  assert.match(layout, /<html lang="en">/);
  assert.match(page, /redirect\("\/overview"\)/);
});

test("navigation uses semantic links and a mobile More control", async () => {
  const shell = await text("src/components/app-shell/app-shell.tsx");
  for (const route of routes) assert.match(shell, new RegExp(`href: "\\/${route}"`));
  assert.match(shell, /<Link className=/);
  assert.match(shell, />More<\/span>/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /aria-label=\{signingOut \? "Signing out" : "Sign out"\}/);
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /closeMenu/);
  assert.match(shell, /moreButtonRef/);
});

test("responsive CSS separates sidebar and mobile navigation", async () => {
  const css = await text("src/app/globals.css");
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*\.desktop-sidebar/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.mobile-bottom-nav/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /body \{ padding-bottom: 0; overflow: hidden; \}/);
  assert.match(css, /\.app-shell \{ height: 100dvh; overflow: hidden; \}/);
  assert.match(css, /\.login-page \{ min-height: 100dvh;/);
  assert.match(css, /\.activity-timeline a \{[^}]*display: block;[^}]*min-height: 44px;/);
});

test("inventory requests paginated data and exposes accessible table/export controls", async () => {
  const inventory = await text("src/features/inventory/inventory-view.tsx");
  for (const field of ["pageSize", "search", "type", "owner", "status", "freshness", "source", "sort", "direction"]) assert.match(inventory, new RegExp(field));
  assert.match(inventory, /response\.data\?\.items/);
  assert.match(inventory, /aria-live="polite"/);
  assert.match(inventory, /<caption>/);
  assert.match(inventory, /aria-describedby="inventory-results-count"/);
  assert.match(inventory, /Export filtered CSV/);
});

test("authenticated shell signs out through the idempotent session endpoint", async () => {
  const shell = await text("src/components/app-shell/app-shell.tsx");
  assert.match(shell, /fetch\("\/api\/auth\/session", \{ method: "DELETE" \}\)/);
});

test("activity is served by a dedicated API and not stitched together client-side", async () => {
  const [route, activity] = await Promise.all([text("src/app/api/activity/route.ts"), text("src/features/activity/activity-view.tsx")]);
  assert.match(route, /from\("brain_activity"\)/);
  assert.match(route, /limit\(100\)/);
  assert.match(activity, /useApi<ActivityResponse>\("\/api\/activity"\)/);
  assert.doesNotMatch(activity, /useApi<InventoryResponse>/);
});

test("knowledge search exposes source health and announces results", async () => {
  const knowledge = await text("src/features/knowledge/knowledge-view.tsx");
  assert.match(knowledge, /Source health/);
  assert.match(knowledge, /role="status"/);
  assert.match(knowledge, /aria-live="polite"/);
  assert.match(knowledge, /sources\?: SourceOutcome\[\]/);
});

test("login form associates validation errors with relevant fields", async () => {
  const login = await text("src/app/login/page.tsx");
  assert.match(login, /id="login-error"/);
  assert.match(login, /aria-invalid=\{!!error/);
  assert.match(login, /aria-describedby=\{error \? "login-error" : undefined\}/);
});

test("external links include contextual names and new-tab announcements", async () => {
  const [agents, dashboards, knowledge, inventory] = await Promise.all([
    text("src/features/agents/agents-view.tsx"),
    text("src/features/dashboards/dashboards-view.tsx"),
    text("src/features/knowledge/knowledge-view.tsx"),
    text("src/features/inventory/inventory-view.tsx"),
  ]);
  for (const source of [agents, dashboards, knowledge, inventory]) {
    assert.match(source, /aria-label=\{/);
    assert.match(source, /new tab/);
  }
  assert.match(agents, /aria-hidden="true"/);
  assert.match(dashboards, /aria-hidden="true"/);
});

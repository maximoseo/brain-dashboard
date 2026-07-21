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
});

test("responsive CSS separates sidebar and mobile navigation", async () => {
  const css = await text("src/app/globals.css");
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*\.desktop-sidebar/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.mobile-bottom-nav/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("inventory requests paginated data and exposes filter controls", async () => {
  const inventory = await text("src/features/inventory/inventory-view.tsx");
  for (const field of ["pageSize", "search", "type", "owner", "status", "freshness", "source", "sort", "direction"]) assert.match(inventory, new RegExp(field));
  assert.match(inventory, /response\.data\?\.items/);
  assert.match(inventory, /aria-live="polite"/);
});

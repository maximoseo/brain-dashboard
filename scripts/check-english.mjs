import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const forbidden = /[\u0590-\u05ff]|he-IL/;
const extensions = new Set([".ts", ".tsx", ".css"]);
const failures = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (extensions.has(extname(path))) {
      const content = await readFile(path, "utf8");
      if (forbidden.test(content)) failures.push(relative(root.pathname, path));
    }
  }
}

await scan(root.pathname);
if (failures.length) {
  console.error(`English-only check failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("English-only check passed.");

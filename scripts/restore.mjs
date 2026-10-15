#!/usr/bin/env node
/**
 * Restore a world from a backup bundle downloaded at /api/backup.
 *   npm run restore -- ~/Downloads/marvel-world-2026-10-15T12-00-00.json
 * Stop the game first. The current data/ folder is moved aside to data.bak-<time>/, never deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) { console.log("usage: npm run restore -- <backup.json>"); process.exit(1); }
const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
if (bundle.kind !== "marvel-8-bit-backup" || !bundle.files) { console.log("that file is not a marvel-8-bit backup"); process.exit(1); }

const data = path.join(ROOT, "data");
if (fs.existsSync(data)) {
  const aside = `${data}.bak-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  fs.renameSync(data, aside);
  console.log(`previous world moved to ${aside}`);
}
for (const [rel, text] of Object.entries(bundle.files)) {
  const p = path.join(data, rel);
  if (!p.startsWith(data)) continue;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
console.log(`restored ${Object.keys(bundle.files).length} files: issue #${bundle.issue}, ${bundle.events} events, taken ${new Date(bundle.takenAt).toLocaleString()}`);
console.log("start the game again and it resumes from there");

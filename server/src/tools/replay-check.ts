/**
 * Replays a world (data/ by default, or a backup bundle from /api/backup) against the CURRENT code
 * and reports whether every logged event still validates and the story, memory and sim still load.
 * Run it before pushing a change that touches shared/events.ts, world.ts, story.ts, memory.ts or sim.ts.
 *
 *   npm run check:replay                       # the local data/ folder
 *   npm run check:replay -- backup.json        # a bundle downloaded from the live game
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = process.argv[2];
if (arg) {
  // unpack the bundle into a temp data dir and point the engine at it
  const bundle = JSON.parse(fs.readFileSync(arg, "utf8")) as { files: Record<string, string> };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "marvel-replay-"));
  for (const [rel, text] of Object.entries(bundle.files)) {
    const p = path.join(root, "data", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  for (const d of ["canon", "inbox"]) fs.symlinkSync(path.resolve(d), path.join(root, d));
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  process.env.APP_ROOT = root;
  console.log(`bundle unpacked to ${root}`);
}

const { CONFIG } = await import("../config.js");
const { GameEvent } = await import("../../../shared/events.js");
const { World } = await import("../world.js");
const { Story } = await import("../story.js");
const { Memory } = await import("../memory.js");
const { Sim } = await import("../sim.js");
const { CHELSEA_ROOFTOP } = await import("../../../shared/maps.js");

const log = path.join(CONFIG.dataDir, "events.jsonl");
if (!fs.existsSync(log)) { console.log(`no world at ${CONFIG.dataDir} (nothing to check)`); process.exit(0); }

const lines = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
let bad = 0;
const kinds: Record<string, number> = {};
lines.forEach((line, i) => {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { bad++; console.log(`line ${i + 1}: not JSON`); return; }
  const r = GameEvent.safeParse(raw);
  if (!r.success) { bad++; console.log(`line ${i + 1}: ${(raw as { type?: string }).type ?? "?"} no longer matches the event contract: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`); return; }
  kinds[r.data.type] = (kinds[r.data.type] ?? 0) + 1;
});

const world = new World(CHELSEA_ROOFTOP, { number: 0, title: "", premise: "", startsAt: Date.UTC(2026, 9, 14), sceneNote: "" });
let replayed = 0;
try { replayed = world.replay(); } catch (err) { bad++; console.log(`replay threw: ${(err as Error).stack}`); }
const story = new Story(); const memory = new Memory(); const sim = new Sim();
let storyOk = false;
try { storyOk = story.load(); } catch (err) { bad++; console.log(`issue.json failed to load: ${(err as Error).message}`); }
try { memory.load(); } catch (err) { bad++; console.log(`memory.json failed to load: ${(err as Error).message}`); }
try { sim.load(); } catch (err) { bad++; console.log(`world-sim.json failed to load: ${(err as Error).message}`); }

console.log(`replayed ${replayed} events (${Object.entries(kinds).map(([k, n]) => `${k}:${n}`).join(" ")})`);
console.log(`issue: ${storyOk ? `#${story.number} "${story.plan.title}" act ${story.actIndex + 1}${story.finished ? " (finished)" : ""}` : "none"}; actors: ${[...world.actors.values()].map((a) => `${a.name} ${a.hp}/${a.maxHp}@${a.location}`).join(", ") || "none"}`);
console.log(`clock: ${world.clock.label}; location: ${world.map.id}; deceased: ${[...world.deceased].join(", ") || "none"}`);
if (bad) { console.log(`\n${bad} problem(s). Do not deploy this change on top of this world without a migration.`); process.exit(1); }
console.log("\nreplay OK: this world loads cleanly on the current code");

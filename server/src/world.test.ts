import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// point the engine at a scratch data dir before importing modules that read CONFIG
process.env.APP_ROOT = path.resolve(import.meta.dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m8b-"));
const { CONFIG } = await import("./config.js");
(CONFIG as { dataDir: string }).dataDir = tmp;
const { World } = await import("./world.js");
const { Engine } = await import("./engine.js");
const { loadCharacter } = await import("./canon.js");
const { CHELSEA_ROOFTOP } = await import("../../shared/maps.js");

const issue = () => ({ number: 1, title: "T", premise: "", startsAt: Date.UTC(2026, 9, 14, 23, 48), sceneNote: "" });

test("the world rebuilds from its event log: HP, position, resources, injuries persist across a restart", () => {
  const w1 = new World(CHELSEA_ROOFTOP, issue());
  const e1 = new Engine(w1);
  const spidey = loadCharacter("spider-man")!, goblin = loadCharacter("green-goblin")!;
  e1.spawn(spidey, "center"); e1.spawn(goblin, "skylight");
  // a few resolved strikes
  for (let i = 0; i < 4; i++) {
    const r = e1.strike({ type: "strike", who: "green-goblin", target: "spider-man", move: "pumpkin-bomb" });
    assert.notEqual(typeof r, "string", String(r));
    if (typeof r !== "string") { w1.apply(r); if (r.type === "strike") { const inj = e1.injuryAfter(r); void inj; } }
  }
  const mv = e1.resolveOne({ type: "move", who: "spider-man", to: "ledge-east" });
  if (mv && typeof mv !== "string") w1.apply(mv);
  w1.issue.sceneNote = "mid-fight"; w1.saveState();
  const before = w1.actors.get("spider-man")!, gobBefore = w1.actors.get("green-goblin")!;
  assert.ok(before.hp < before.maxHp, "spidey should have taken damage");
  assert.equal(gobBefore.resources["pumpkin-bombs"], 2);

  const w2 = new World(CHELSEA_ROOFTOP, issue());
  const n = w2.replay();
  assert.ok(n >= 7);
  const after = w2.actors.get("spider-man")!, gobAfter = w2.actors.get("green-goblin")!;
  assert.equal(after.hp, before.hp);
  assert.equal(after.x, before.x); assert.equal(after.y, before.y);
  assert.deepEqual(after.injuries, before.injuries);
  assert.equal(gobAfter.resources["pumpkin-bombs"], 2);
  assert.equal(gobAfter.stamina, gobBefore.stamina);
  assert.equal(w2.issue.sceneNote, "mid-fight");
  assert.equal(w2.seq, w1.seq);
});

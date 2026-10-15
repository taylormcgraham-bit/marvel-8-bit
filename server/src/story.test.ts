import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.APP_ROOT = path.resolve(import.meta.dirname, "../..");
process.env.MAX_CHUNKS_PER_ACT = "3";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m8b-story-"));
const { CONFIG } = await import("./config.js");
(CONFIG as { dataDir: string }).dataDir = tmp;
const { Story } = await import("./story.js");
const { ISSUE_ONE_PLAN } = await import("./agents/showrunner.js");

test("acts advance when objectives resolve, or when an act runs long", () => {
  const s = new Story();
  s.begin(1, ISSUE_ONE_PLAN, 0);
  assert.equal(s.actIndex, 0);
  assert.equal(s.advanceReason(), null);
  assert.equal(typeof s.mark("nope", "done"), "string");
  const o = s.mark("hear-him-out", "done");
  assert.equal(typeof o, "object");
  assert.equal(s.advanceReason(), "objectives complete");
  s.advance();
  assert.equal(s.actIndex, 1);
  s.chunksInAct = 3;
  assert.match(s.advanceReason() ?? "", /ran long/);
  s.advance(); s.mark("find-out-what-he-wants", "failed"); s.mark("goblin-exits", "done");
  assert.equal(s.advanceReason(), "objectives complete");
  s.advance();
  assert.ok(s.finished);
});

test("story state persists and reloads", () => {
  const s = new Story();
  s.begin(2, ISSUE_ONE_PLAN, 123);
  s.mark("hear-him-out", "done"); s.advance(); s.chunksInAct = 2; s.save();
  const t = new Story();
  assert.ok(t.load());
  assert.equal(t.number, 2); assert.equal(t.actIndex, 1); assert.equal(t.chunksInAct, 2);
  assert.equal(t.objectives[0]![0]!.status, "done");
});

test("a planned death holds act 3 until the Editor decides, and gates the death beat", () => {
  const s = new Story();
  s.begin(3, { ...ISSUE_ONE_PLAN, plannedDeath: { who: "green-goblin", act: 3, mechanism: "the glider", justification: "it is time" } }, 0);
  assert.match(s.deathAllowed("green-goblin") ?? "", /awaiting/);
  assert.match(s.deathAllowed("spider-man") ?? "", /no planned death/);
  s.mark("hear-him-out", "done");
  assert.equal(s.deathHold(), null);                        // advancing into act 2 is fine
  s.advance();                                              // now act 2
  s.mark("keep-him-off-the-street", "done"); s.mark("daredevil-arrives", "done");
  assert.match(s.deathHold() ?? "", /held/);                // act 3 would start: held
  s.decideDeath("vetoed");
  assert.equal(s.deathHold(), null);
  assert.match(s.deathAllowed("green-goblin") ?? "", /vetoed/);
  s.decideDeath("approved");
  assert.match(s.deathAllowed("green-goblin") ?? "", /planned for act 3/);
  s.advance();
  assert.equal(s.deathAllowed("green-goblin"), null);
});

test("the veto window expires into approval after 24 hours", () => {
  const s = new Story();
  s.begin(4, { ...ISSUE_ONE_PLAN, plannedDeath: { who: "green-goblin", act: 3, mechanism: "x", justification: "y" } }, 0);
  s.pendingDeath!.submittedAt = Date.now() - 25 * 3_600_000;
  s.actIndex = 1;
  assert.equal(s.deathHold(), null);
  assert.equal(s.pendingDeath!.status, "approved");
});

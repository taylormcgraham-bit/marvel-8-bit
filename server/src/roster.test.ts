import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.APP_ROOT = path.resolve(import.meta.dirname, "../..");
const tmpCanon = fs.mkdtempSync(path.join(os.tmpdir(), "m8b-canon-"));
const { CONFIG } = await import("./config.js");
// copy the real canon so the stub drafter can read the reference bible, then draft into the copy
fs.cpSync(path.join(CONFIG.canonDir), tmpCanon, { recursive: true });
(CONFIG as { canonDir: string }).canonDir = tmpCanon;
(CONFIG as { dataDir: string }).dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "m8b-data-"));
const { draftStub, listPending, approve, reject, isPending } = await import("./agents/roster.js");
const { listCharacterIds, loadCharacter } = await import("./canon.js");

test("a roster request drafts a pending character that is hidden from the roster until approved", () => {
  const before = listCharacterIds().length;
  const p = draftStub("Add Moon Knight");
  assert.equal(p.id, "moon-knight"); assert.equal(p.mode, "stub");
  assert.ok(isPending("moon-knight"));
  assert.equal(listCharacterIds().length, before, "pending drafts are not in the roster");
  assert.ok(listPending().some((x) => x.id === "moon-knight"));
  const c = loadCharacter("moon-knight"); assert.ok(c); assert.equal(c!.stats.name, "Moon Knight");
  assert.ok(approve("moon-knight"));
  assert.equal(listCharacterIds().length, before + 1, "approved characters join the roster");
  assert.ok(!isPending("moon-knight"));
});

test("rejecting a draft removes its folder", () => {
  draftStub("Silver Surfer");
  assert.ok(isPending("silver-surfer"));
  assert.ok(reject("silver-surfer"));
  assert.ok(!fs.existsSync(path.join(tmpCanon, "characters", "silver-surfer")));
  assert.equal(reject("silver-surfer"), false);
});

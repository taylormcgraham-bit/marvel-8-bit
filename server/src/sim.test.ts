import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.APP_ROOT = path.resolve(import.meta.dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "m8b-sim-"));
const { CONFIG } = await import("./config.js");
(CONFIG as { dataDir: string }).dataDir = tmp;
const { Sim, weatherFor, SCHEME_OFFPANEL_CAP } = await import("./sim.js");
const { travelMinutes } = await import("../../shared/maps.js");

const HOUR = 3_600_000;

test("scheme meters advance off-panel, cap at 90, and not for villains on stage", () => {
  const s = new Sim(); s.init(0);
  const before = s.schemes["green-goblin"]!;
  s.advance(10 * HOUR, new Set(["doctor-doom"]));
  assert.ok(s.schemes["green-goblin"]! > before);
  assert.equal(s.schemes["doctor-doom"], 20 + ("doctor-doom".length * 7) % 25);
  s.advance(1000 * HOUR, new Set());
  assert.equal(s.schemes["green-goblin"], SCHEME_OFFPANEL_CAP);
});

test("faction standings react to rescues, public fights, knockouts and escapes", () => {
  const s = new Sim(); s.init(0);
  const role = (id: string) => (id === "green-goblin" ? "villain" : "hero");
  const pub0 = s.factions["spider-man"]!["public-opinion"] ?? 0;
  s.react({ type: "rescue", seq: 1, t: 0, ms: 0, who: "spider-man", what: "a kid" }, ["spider-man"], "midtown-street", role);
  assert.equal(s.factions["spider-man"]!["public-opinion"], pub0 + 2);
  s.react({ type: "fightStart", seq: 2, t: 0, ms: 0, sides: [["spider-man"], ["green-goblin"]], stakes: "", maxRounds: 3 }, ["spider-man", "green-goblin"], "midtown-street", role);
  assert.equal(s.factions["spider-man"]!["public-opinion"], pub0 + 1);
  s.react({ type: "fightEnd", seq: 3, t: 0, ms: 0, reason: "knockout", downed: ["green-goblin"], escaped: [], summary: "" }, ["spider-man", "green-goblin"], "midtown-street", role);
  assert.equal(s.factions["spider-man"]!["public-opinion"], pub0 + 4);
  assert.ok(s.schemes["green-goblin"]! <= 15);
  s.react({ type: "fightEnd", seq: 4, t: 0, ms: 0, reason: "escape", downed: [], escaped: ["green-goblin"], summary: "" }, ["spider-man"], "chelsea-rooftop", role);
  assert.equal(s.factions["spider-man"]!["public-opinion"], pub0 + 3);
});

test("standings decay toward canon baseline over game days", () => {
  const s = new Sim(); s.init(0);
  const base = s.factions["spider-man"]!["public-opinion"] ?? 0;
  s.shift("spider-man", "public-opinion", 10);
  s.advance(5 * 24 * HOUR, new Set());
  assert.equal(Math.round(s.factions["spider-man"]!["public-opinion"]!), base + 5);
});

test("weather is deterministic for a game time and mostly clear", () => {
  assert.equal(weatherFor(12345), weatherFor(12345));
  let clear = 0; const N = 400;
  for (let i = 0; i < N; i++) if (weatherFor(i * 4 * HOUR) === "clear") clear++;
  assert.ok(clear / N > 0.45 && clear / N < 0.75, `clear fraction ${clear / N}`);
});

test("travel times follow the rules table", () => {
  assert.equal(travelMinutes("chelsea-rooftop", "chelsea-rooftop"), 0);
  assert.equal(travelMinutes("chelsea-rooftop", "midtown-street"), 25);
  assert.equal(travelMinutes("avengers-lounge", "castle-doom"), 180);
});

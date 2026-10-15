import { test } from "node:test";
import assert from "node:assert/strict";
import { staminaCost, resourceCosts, effectiveGrid, injuryFor, resolveStrike } from "./combat.js";
import { Rng } from "./rng.js";
import type { Actor } from "./world.js";
import type { Move } from "./canon.js";

const DAY = 86_400_000;

function actor(id: string, grid: Partial<Actor["character"]["stats"]["grid"]> = {}, traits: string[] = [], moves: Move[] = []): Actor {
  const g = { int: 3, str: 3, spd: 3, dur: 3, nrg: 1, fgt: 3, ...grid };
  const a: Actor = {
    id, name: id, x: 0, y: 0, facing: "down", location: "chelsea-rooftop", hp: 60, maxHp: 60, stamina: 20, maxStamina: 20, resources: {}, injuries: [], morale: 0,
    character: { id, bible: "", stats: { id, name: id, role: "hero", tier: "city", grid: g, traits, moves, palette: { primary: "#000000", secondary: "#000000", accent: "#000000" }, homeLocation: "x", universe: "616" } },
  };
  return a;
}
const move = (over: Partial<Move>): Move => ({ id: "m", name: "M", kind: "light", power: 3, description: "", ...over });

test("stamina cost: explicit stamina:N wins, otherwise by kind", () => {
  assert.equal(staminaCost(move({ cost: "stamina:4" })), 4);
  assert.equal(staminaCost(move({ kind: "heavy" })), 3);
  assert.equal(staminaCost(move({ kind: "defense" })), 0);
});

test("resource costs: numeric only; flavor costs like shield:thrown are ignored", () => {
  assert.deepEqual(resourceCosts(move({ cost: "web-fluid:2, stamina:1" })), { "web-fluid": 2 });
  assert.deepEqual(resourceCosts(move({ cost: "shield:thrown" })), {});
  assert.deepEqual(resourceCosts(move({ cost: "billy-club-cable:0" })), {});
});

test("injuries lower effective stats, floored at 1", () => {
  const a = actor("a", { spd: 2, fgt: 1 });
  a.injuries.push({ id: "i", name: "cracked ribs", severity: 2, effects: { spd: -1, fgt: -1 }, healsAt: 0, cause: "x" });
  const g = effectiveGrid(a);
  assert.equal(g.spd, 1); assert.equal(g.fgt, 1);
});

test("a knockout always leaves a concussion; a big hit leaves a severity-2 injury", () => {
  const rng = new Rng(1);
  const t = actor("t");
  const ko = injuryFor(t, 60, 0, "heavy", "Haymaker", 0, rng);
  assert.equal(ko?.name, "concussion"); assert.equal(ko?.severity, 3); assert.equal(ko?.healsAt, 7 * DAY);
  const big = injuryFor(t, 20, 40, "heavy", "Haymaker", 0, rng);
  assert.equal(big?.severity, 2); assert.equal(big?.healsAt, 3 * DAY);
});

test("healing factor shortens injuries", () => {
  const rng = new Rng(1);
  const t = actor("t", {}, ["healing-factor"]);
  const inj = injuryFor(t, 60, 0, "heavy", "Haymaker", 0, rng);
  assert.equal(inj?.healsAt, 7 * DAY / 4);
});

test("strikes are rejected when out of resources, out of range, or too winded", () => {
  const rng = new Rng(616);
  const a = actor("a", {}, [], [move({ id: "web", kind: "control", power: 3, cost: "web-fluid:1" }), move({ id: "big", kind: "heavy", power: 6, cost: "stamina:5" })]);
  const t = actor("t");
  a.resources = { "web-fluid": 0 };
  assert.match(resolveStrike(a, t, a.character.stats.moves[0]!, rng, 1).reason ?? "", /out of web-fluid/);
  a.resources = { "web-fluid": 2 };
  assert.equal(resolveStrike(a, t, a.character.stats.moves[0]!, rng, 1).reason, undefined);
  assert.match(resolveStrike(a, t, a.character.stats.moves[1]!, rng, 5).reason ?? "", /too far/);
  a.stamina = 2;
  assert.match(resolveStrike(a, t, a.character.stats.moves[1]!, rng, 1).reason ?? "", /winded/);
});

test("strike resolution is deterministic for a seed and spends what it says", () => {
  const mk = () => { const a = actor("a", { str: 5, fgt: 5 }, [], [move({ id: "p", kind: "heavy", power: 6, cost: "stamina:3, ammo:1" })]); a.resources = { ammo: 2 }; return a; };
  const r1 = resolveStrike(mk(), actor("t"), mk().character.stats.moves[0]!, new Rng(42), 1);
  const r2 = resolveStrike(mk(), actor("t"), mk().character.stats.moves[0]!, new Rng(42), 1);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1.spent, { ammo: 1 }); assert.equal(r1.staminaCost, 3);
});

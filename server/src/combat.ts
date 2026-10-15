/**
 * Combat rules: stamina, effective stats under injury, strike resolution, injury
 * generation, healing. Pure functions over actors plus the world RNG; the engine and the
 * fight runner call these and turn the results into events.
 */
import type { Beat, Injury, StrikeOutcome } from "../../shared/events.js";
import type { Move } from "./canon.js";
import type { Actor } from "./world.js";
import type { Rng } from "./rng.js";

const HOUR = 3_600_000, DAY = 24 * HOUR;

export function maxStaminaFor(a: Actor): number {
  const g = a.character.stats.grid;
  return 10 + g.spd * 2 + g.dur * 2;
}

/** Stamina a move costs when its cost string does not name stamina explicitly. */
export function staminaCost(move: Move): number {
  const m = /stamina:(\d+)/.exec(move.cost ?? "");
  if (m) return Number(m[1]);
  switch (move.kind) {
    case "light": return 1; case "heavy": return 3; case "ranged": return 1; case "control": return 2;
    case "ultimate": return 5; case "mobility": return 1; case "rescue": return 1; default: return 0;
  }
}

/** Non-stamina, numeric resource costs. Flavor costs like "shield:thrown" are ignored here. */
export function resourceCosts(move: Move): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (move.cost ?? "").split(",")) {
    const [res, nStr] = part.trim().split(":");
    if (!res || res === "stamina") continue;
    const n = Number(nStr);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[res] = (out[res] ?? 0) + n;
  }
  return out;
}

export interface Grid { int: number; str: number; spd: number; dur: number; nrg: number; fgt: number }

/** Grid stats after injury penalties (floored at 1). */
export function effectiveGrid(a: Actor): Grid {
  const g = { ...a.character.stats.grid };
  for (const inj of a.injuries) {
    g.str = Math.max(1, g.str + (inj.effects.str ?? 0));
    g.spd = Math.max(1, g.spd + (inj.effects.spd ?? 0));
    g.fgt = Math.max(1, g.fgt + (inj.effects.fgt ?? 0));
    g.dur = Math.max(1, g.dur + (inj.effects.dur ?? 0));
  }
  return g;
}

export interface StrikeResult {
  outcome: StrikeOutcome;
  damage: number;
  counterDamage: number;
  staminaCost: number;
  spent: Record<string, number>;
  reason?: string; // set when the strike is illegal
}

/** Resolve one strike. Does not mutate; the caller applies the event. */
export function resolveStrike(a: Actor, t: Actor, move: Move, rng: Rng, dist: number): StrikeResult {
  const fail = (reason: string): StrikeResult => ({ outcome: "miss", damage: 0, counterDamage: 0, staminaCost: 0, spent: {}, reason });
  if (a.id === t.id) return fail(`${a.name} cannot strike themselves`);
  if (a.hp <= 0) return fail(`${a.name} is down and cannot attack`);
  if (t.hp <= 0) return fail(`${t.name} is already knocked out; the fight is over, do not keep attacking`);
  if (move.kind === "rescue") return fail(`use a rescue beat for ${move.name}`);
  if ((move.kind === "defense" || move.kind === "utility" || move.kind === "mobility") && move.power === 0)
    return fail(`"${move.name}" is a ${move.kind} move with no attack power; it is not a strike`);
  if (move.kind !== "ranged" && dist > 3.5)
    return fail(`${a.name} is too far from ${t.name} (${dist.toFixed(1)} tiles) for a melee move; move closer first or use a ranged move`);

  const sc = staminaCost(move);
  if (a.stamina < sc && move.kind !== "light")
    return fail(`${a.name} is too winded for ${move.name} (stamina ${a.stamina}/${a.maxStamina}); use a light move or recover`);
  const spent = resourceCosts(move);
  for (const [res, n] of Object.entries(spent)) {
    const have = a.resources[res];
    if (have === undefined) { delete spent[res]; continue; } // undeclared resource: flavor only
    if (have < n) return fail(`${a.name} is out of ${res} (${have} left); "${move.name}" needs ${n}. This should show in dialogue.`);
  }

  const ag = effectiveGrid(a), tg = effectiveGrid(t);
  const aT = a.character.stats.traits, tT = t.character.stats.traits;

  let hit = 0.6 + (ag.fgt - tg.spd) * 0.06;
  if (tT.includes("spider-sense") && !aT.includes("symbiote")) hit -= 0.2;
  if (tT.includes("radar-sense")) hit -= 0.1;
  if (move.kind === "light") hit += 0.1;
  if (move.kind === "heavy" || move.kind === "ultimate") hit -= 0.1;
  if (a.stamina < a.maxStamina * 0.25) hit -= 0.1;
  if (t.stamina < t.maxStamina * 0.25) hit += 0.1;
  hit = Math.min(0.92, Math.max(0.2, hit));

  let outcome: StrikeOutcome;
  let damage = 0, counterDamage = 0;
  if (!rng.chance(hit)) {
    outcome = rng.chance(0.25) && t.stamina > 2 ? "countered" : "miss";
    if (outcome === "countered") counterDamage = Math.max(1, Math.round(tg.fgt * 1.5));
  } else if (tg.dur >= ag.str + 2 && rng.chance(0.35)) {
    outcome = "blocked";
    damage = Math.max(0, Math.round(move.power * 0.3));
  } else {
    outcome = "hit";
    const scale = 1 + ag.str / 7;
    damage = Math.max(1, Math.round(move.power * 1.4 * scale * rng.range(0.8, 1.2)));
    if (tT.includes("healing-factor")) damage = Math.round(damage * 0.85);
    if (tT.includes("armored") || tT.includes("force-field")) damage = Math.round(damage * 0.8);
  }
  return { outcome, damage, counterDamage, staminaCost: Math.min(sc, a.stamina), spent };
}

const INJURY_NAMES: Record<string, string[]> = {
  heavy: ["bruised ribs", "cracked ribs", "dislocated shoulder"],
  light: ["split lip", "swollen eye", "sprained wrist"],
  ranged: ["burns", "shrapnel cuts", "concussive bruising"],
  control: ["wrenched shoulder", "rope burns", "twisted knee"],
  ultimate: ["internal bruising", "fractured arm", "broken ribs"],
  default: ["bruises", "cut above the eye", "jammed fingers"],
};

/**
 * Decide whether a hit leaves a lasting injury. Rules of thumb from canon/world/rules.md §3:
 * a single hit over a quarter of max HP, dropping under a quarter HP, or a knockout.
 */
export function injuryFor(t: Actor, damage: number, hpAfter: number, kind: string, moveName: string, nowGameMs: number, rng: Rng): Injury | null {
  const ratio = damage / t.maxHp;
  let severity = 0;
  if (hpAfter <= 0) severity = 3;
  else if (ratio >= 0.25) severity = 2;
  else if (hpAfter < t.maxHp * 0.25 && !t.injuries.some((i) => i.severity >= 2)) severity = 2;
  else if (ratio >= 0.12 && rng.chance(0.35)) severity = 1;
  if (!severity) return null;
  if (t.injuries.filter((i) => i.severity === severity).length >= 2) return null; // enough of that already
  const names = INJURY_NAMES[kind] ?? INJURY_NAMES.default!;
  const name = hpAfter <= 0 ? "concussion" : names[Math.min(names.length - 1, severity - 1)]!;
  const effects = severity === 1 ? (rng.chance(0.5) ? { fgt: -1 } : { spd: -1 })
    : severity === 2 ? { spd: -1, fgt: -1 }
    : { str: -1, spd: -1, fgt: -1 };
  let days = severity === 1 ? 1 : severity === 2 ? 3 : 7;
  const traits = t.character.stats.traits;
  if (traits.includes("healing-factor")) days /= 4;
  else if (traits.includes("fast-heal") || traits.includes("regeneration-slow")) days /= 2;
  else if (traits.includes("asgardian") || traits.includes("god")) days /= 2;
  return {
    id: `inj-${t.id}-${Math.floor(nowGameMs / 1000)}-${severity}`,
    name, severity, effects, healsAt: nowGameMs + days * DAY, cause: `${moveName}`,
  };
}

/** Stamina regained at the top of a round. */
export function staminaRegen(a: Actor): number {
  const g = effectiveGrid(a);
  return Math.max(1, Math.round(1 + g.dur / 3));
}

/** HP regained per game-hour of downtime. */
export function hpPerHour(a: Actor): number {
  const g = a.character.stats.grid;
  const traits = a.character.stats.traits;
  let rate = a.maxHp * (0.02 + g.dur * 0.005);
  if (traits.includes("healing-factor")) rate *= 4;
  else if (traits.includes("fast-heal") || traits.includes("regeneration-slow")) rate *= 2;
  return rate;
}

/** Where a combatant wants to stand relative to a target for a move kind. */
export function wantsRange(kind: Move["kind"]): "close" | "far" | "any" {
  if (kind === "ranged") return "far";
  if (kind === "light" || kind === "heavy" || kind === "ultimate") return "close";
  return "any";
}

export type FightBeat = Extract<Beat, { type: "fight" }>;

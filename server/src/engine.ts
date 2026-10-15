/**
 * The engine: AI decides WHAT and WHY, this code decides WHETHER and HOW.
 * Beats come in from the Director; events go out to the world and the theater.
 */
import type { Beat, GameEvent, StrikeOutcome } from "../../shared/events.js";
import type { Character } from "./canon.js";
import { World, maxHpFor, type Actor } from "./world.js";

export interface Rejection { beat: Beat; reason: string }

export interface ResolveResult { events: GameEvent[]; rejections: Rejection[] }

const MS = {
  caption: 2400,
  face: 150,
  emote: 1000,
  rescue: 2400,
  strike: 1500,
  sayBase: 900,
  sayPerChar: 38,
  movePerTile: 150,
  moveBase: 250,
};

export class Engine {
  constructor(readonly world: World) {}

  private base(ms: number) { return { seq: this.world.nextSeq(), t: Date.now(), ms }; }

  /** Register a character on stage. Returns the spawn event (already applied). */
  spawn(c: Character, at: string, facing: Actor["facing"] = "down"): GameEvent {
    const m = this.world.marker(at) ?? this.world.marker("center")!;
    const actor: Actor = {
      id: c.id, name: c.stats.name, x: m.x, y: m.y, facing,
      hp: 0, maxHp: 0, morale: 0, character: c,
      resources: { ...(c.stats.resources ?? {}) },
    };
    actor.maxHp = maxHpFor(c);
    actor.hp = actor.maxHp;
    this.world.actors.set(c.id, actor);
    const e: GameEvent = {
      type: "spawn", ...this.base(400), who: c.id, name: c.stats.name, at: m.id, x: m.x, y: m.y, facing,
      hp: actor.hp, maxHp: actor.maxHp, palette: c.stats.palette, role: c.stats.role,
    };
    this.world.apply(e);
    return e;
  }

  title(issue: number, title: string, subtitle?: string): GameEvent {
    const e: GameEvent = { type: "title", ...this.base(2600), issue, title, subtitle };
    this.world.apply(e);
    return e;
  }

  scene(caption?: string): GameEvent {
    const e: GameEvent = {
      type: "scene", ...this.base(1200), location: this.world.map.id, locationName: this.world.map.name,
      timeOfDay: this.world.timeOfDay, caption,
    };
    this.world.apply(e);
    return e;
  }

  note(level: "info" | "warn" | "reject", text: string): GameEvent {
    const e: GameEvent = { type: "note", ...this.base(0), level, text };
    this.world.apply(e);
    return e;
  }

  /**
   * Validate and resolve a chunk of beats in order. Each accepted beat is applied
   * immediately so later beats in the same chunk see its effects (positions, HP).
   */
  resolve(beats: Beat[]): ResolveResult {
    const events: GameEvent[] = [];
    const rejections: Rejection[] = [];
    for (const beat of beats) {
      const r = this.resolveOne(beat);
      if (typeof r === "string") rejections.push({ beat, reason: r });
      else { this.world.apply(r); events.push(r); }
    }
    return { events, rejections };
  }

  private actor(id: string): Actor | string {
    const a = this.world.actors.get(id);
    if (!a) return `unknown or absent character "${id}"; present: ${[...this.world.actors.keys()].join(", ")}`;
    return a;
  }

  private resolveOne(beat: Beat): GameEvent | string {
    switch (beat.type) {
      case "caption":
        return { ...beat, ...this.base(MS.caption) };

      case "wait":
        return { ...beat, ...this.base(beat.ms) };

      case "face": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        return { ...beat, ...this.base(MS.face) };
      }

      case "emote": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        return { ...beat, ...this.base(MS.emote) };
      }

      case "say": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        if (a.hp <= 0) return `${a.name} is down and cannot speak`;
        return { ...beat, ...this.base(MS.sayBase + beat.text.length * MS.sayPerChar) };
      }

      case "move": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        const m = this.world.marker(beat.to);
        if (!m) return `unknown marker "${beat.to}"; markers: ${this.world.map.markers.map((k) => k.id).join(", ")}`;
        if (a.hp <= 0) return `${a.name} is down and cannot move`;
        const dist = Math.hypot(m.x - a.x, m.y - a.y);
        if (dist < 0.5) return `${a.name} is already at ${beat.to}`;
        return { ...beat, ...this.base(MS.moveBase + Math.round(dist * MS.movePerTile)), x: m.x, y: m.y };
      }

      case "rescue": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        if (a.hp <= 0) return `${a.name} is down`;
        const traits = a.character.stats.traits;
        if (a.character.stats.role === "villain" && !traits.includes("protects-civilians-first"))
          return `${a.name} does not perform rescues (out of character)`;
        return { ...beat, ...this.base(MS.rescue) };
      }

      case "strike":
        return this.resolveStrike(beat);
    }
  }

  private resolveStrike(beat: Extract<Beat, { type: "strike" }>): GameEvent | string {
    const a = this.actor(beat.who); if (typeof a === "string") return a;
    const t = this.actor(beat.target); if (typeof t === "string") return t;
    if (a.id === t.id) return `${a.name} cannot strike themselves`;
    if (a.hp <= 0) return `${a.name} is down and cannot attack`;
    if (t.hp <= 0) return `${t.name} is already knocked out; the fight is over, do not keep attacking`;
    const move = a.character.stats.moves.find((m) => m.id === beat.move);
    if (!move) return `${a.name} has no move "${beat.move}"; available: ${a.character.stats.moves.map((m) => m.id).join(", ")}`;
    if (move.kind === "rescue") return `use a rescue beat for ${move.name}`;
    if (move.kind === "defense" || move.kind === "utility" || move.kind === "mobility") {
      if (move.power === 0) return `"${move.name}" is a ${move.kind} move with no attack power; use it as flavor via say/emote or pick an attacking move`;
    }
    const dist = Math.hypot(t.x - a.x, t.y - a.y);
    if (move.kind !== "ranged" && dist > 3.5)
      return `${a.name} is too far from ${t.name} (${dist.toFixed(1)} tiles) for a melee move; move closer first or use a ranged move`;

    // resource cost, e.g. "web-fluid:1"
    if (move.cost) {
      for (const part of move.cost.split(",")) {
        const [res, nStr] = part.trim().split(":");
        const n = Number(nStr ?? 1);
        if (!res || res === "stamina") continue; // stamina is Phase 2
        const have = a.resources[res];
        if (have !== undefined) {
          if (have < n) return `${a.name} is out of ${res} (${have} left); "${move.name}" needs ${n}. This should show in dialogue.`;
          a.resources[res] = have - n;
        }
      }
    }

    const ag = a.character.stats.grid, tg = t.character.stats.grid;
    const rng = this.world.rng;
    const tTraits = t.character.stats.traits;

    // to-hit: fighting skill vs target speed, modified by traits
    let hit = 0.6 + (ag.fgt - tg.spd) * 0.06;
    if (tTraits.includes("spider-sense") && !a.character.stats.traits.includes("symbiote")) hit -= 0.2;
    if (tTraits.includes("radar-sense")) hit -= 0.1;
    if (move.kind === "light") hit += 0.1;
    if (move.kind === "heavy" || move.kind === "ultimate") hit -= 0.1;
    hit = Math.min(0.92, Math.max(0.2, hit));

    let outcome: StrikeOutcome;
    let damage = 0;
    if (!rng.chance(hit)) {
      outcome = rng.chance(0.25) ? "countered" : "miss";
    } else if (tg.dur >= ag.str + 2 && rng.chance(0.35)) {
      outcome = "blocked";
      damage = Math.max(0, Math.round(move.power * 0.3));
    } else {
      outcome = "hit";
      const scale = 1 + ag.str / 7;
      damage = Math.max(1, Math.round(move.power * 1.4 * scale * rng.range(0.8, 1.2)));
      if (tTraits.includes("healing-factor")) damage = Math.round(damage * 0.85);
    }
    let targetHp = Math.max(0, t.hp - damage);
    // counter: attacker eats a small hit instead (Phase 2 will make this a proper event)
    if (outcome === "countered") {
      a.hp = Math.max(1, a.hp - Math.max(1, Math.round(tg.fgt * 1.5)));
    }
    // house rule: 0 HP is knocked out, never dead. Deaths are Showrunner-planned only (Phase 3).

    return {
      ...beat, ...this.base(MS.strike), moveName: move.name, kind: move.kind,
      outcome, damage, targetHp, targetMaxHp: t.maxHp,
    };
  }
}

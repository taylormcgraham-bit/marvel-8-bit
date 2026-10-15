/**
 * The engine: AI decides WHAT and WHY, this code decides WHETHER and HOW.
 * Beats come in from the Director (or the Tactician); events go out to the world and the theater.
 */
import type { Beat, GameEvent, Injury } from "../../shared/events.js";
import type { Character } from "./canon.js";
import { World, type Actor } from "./world.js";
import { resolveStrike, injuryFor, hpPerHour, staminaRegen } from "./combat.js";
import type { Story } from "./story.js";
import type { Objective } from "../../shared/events.js";
import { loadCharacter } from "./canon.js";
import { MAPS, travelMinutes } from "../../shared/maps.js";

export interface Rejection { beat: Beat; reason: string }

const MS = {
  caption: 2400, face: 150, emote: 1000, rescue: 2400, strike: 1500,
  sayBase: 900, sayPerChar: 38, movePerTile: 150, moveBase: 250,
  fightStart: 1800, round: 900, fightEnd: 2600, injury: 1200, heal: 300,
};

export class Engine {
  story?: Story;
  constructor(readonly world: World) {}

  private base(ms: number) { return { seq: this.world.nextSeq(), t: Date.now(), ms }; }

  /** Register a character on stage. Returns the spawn event (already applied). */
  spawn(c: Character, at: string, facing: Actor["facing"] = "down"): GameEvent {
    const m = this.world.marker(at) ?? this.world.marker("center")!;
    const a = this.world.addActor(c, m.x, m.y, facing);
    const e: GameEvent = {
      type: "spawn", ...this.base(400), who: c.id, name: c.stats.name, at: m.id, x: m.x, y: m.y, facing,
      location: a.location, hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, resources: a.resources, injuries: a.injuries,
      palette: c.stats.palette, role: c.stats.role, look: c.stats.look,
    };
    this.world.apply(e);
    return e;
  }

  title(issue: number, title: string, subtitle?: string): GameEvent {
    const e: GameEvent = { type: "title", ...this.base(2600), issue, title, subtitle };
    this.world.apply(e); return e;
  }

  scene(caption?: string, weather = this.world.weather): GameEvent {
    const e: GameEvent = {
      type: "scene", ...this.base(1200), location: this.world.map.id, locationName: this.world.map.name,
      timeOfDay: this.world.timeOfDay, weather, gameTime: this.world.clock.label, caption,
    };
    this.world.apply(e); return e;
  }

  recap(title: string, lines: string[]): GameEvent {
    const e: GameEvent = { type: "recap", ...this.base(2200 + lines.length * 1500), title, lines };
    this.world.apply(e); return e;
  }

  /**
   * Move characters to another map. Returns the travel event plus the scene and spawn
   * events that rebuild the stage there (all applied). The caller advances the clock.
   */
  travel(who: string[], to: string, how?: string): GameEvent[] | string {
    const dest = MAPS[to];
    if (!dest) return `unknown location "${to}"; locations: ${Object.keys(MAPS).join(", ")}`;
    const movers = who.filter((id) => this.world.actors.has(id));
    if (!movers.length) return "nobody listed is present";
    const from = this.world.map.id;
    if (from === to) return `already at ${dest.name}`;
    const minutes = travelMinutes(from, to);
    const out: GameEvent[] = [];
    // visible travel in the open world: a few seconds across town, longer by Quinjet
    const ms = Math.min(9000, 2800 + minutes * 45);
    const tr: GameEvent = { type: "travel", ...this.base(ms), who: movers, from, to, minutes, how };
    this.world.apply(tr); out.push(tr);
    // place arrivals on distinct entry markers
    movers.forEach((id, i) => {
      const a = this.world.actors.get(id)!;
      const mk = this.world.marker(dest.entry[i % dest.entry.length]!) ?? dest.markers[0]!;
      a.x = mk.x; a.y = mk.y; a.facing = "down";
    });
    return out;
  }

  /** Spawn events for everyone on the current map (after a scene change). */
  stageSpawns(): GameEvent[] {
    return this.world.stage().map((a) => {
      const e: GameEvent = {
        type: "spawn", ...this.base(400), who: a.id, name: a.name, location: a.location, at: this.world.nearestMarker(a).id, x: a.x, y: a.y, facing: a.facing,
        hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, resources: a.resources, injuries: a.injuries,
        palette: a.character.stats.palette, role: a.character.stats.role, look: a.character.stats.look,
      };
      this.world.apply(e); return e;
    });
  }

  note(level: "info" | "warn" | "reject", text: string): GameEvent {
    const e: GameEvent = { type: "note", ...this.base(0), level, text };
    this.world.apply(e); return e;
  }

  act(issue: number, n: number, title: string, goal: string, objectives: Objective[]): GameEvent {
    const e: GameEvent = { type: "act", ...this.base(2600), issue, n, title, goal, objectives };
    this.world.apply(e); return e;
  }
  objective(o: Objective): GameEvent {
    const e: GameEvent = { type: "objective", ...this.base(1600), id: o.id, text: o.text, status: o.status === "failed" ? "failed" : "done" };
    this.world.apply(e); return e;
  }
  issueEnd(issue: number, title: string, summary: string, next?: string): GameEvent {
    const e: GameEvent = { type: "issueEnd", ...this.base(5000), issue, title, summary, next };
    this.world.apply(e); return e;
  }
  despawn(who: string, how?: string): GameEvent {
    const e: GameEvent = { type: "despawn", ...this.base(600), who, how };
    this.world.apply(e); return e;
  }

  fightStart(sides: string[][], stakes: string, maxRounds: number): GameEvent {
    const e: GameEvent = { type: "fightStart", ...this.base(MS.fightStart), sides, stakes, maxRounds };
    this.world.apply(e); return e;
  }

  round(n: number, of: number, participants: string[]): GameEvent {
    const stamina: Record<string, number> = {};
    for (const id of participants) {
      const a = this.world.actors.get(id); if (!a || a.hp <= 0) continue;
      stamina[id] = Math.min(a.maxStamina, a.stamina + staminaRegen(a));
    }
    const e: GameEvent = { type: "round", ...this.base(MS.round), n, of, stamina };
    this.world.apply(e); return e;
  }

  fightEnd(reason: "knockout" | "escape" | "rounds" | "stalemate", downed: string[], escaped: string[], summary: string): GameEvent {
    const e: GameEvent = { type: "fightEnd", ...this.base(MS.fightEnd), reason, downed, escaped, summary };
    this.world.apply(e); return e;
  }

  injury(who: string, injury: Injury): GameEvent {
    const e: GameEvent = { type: "injury", ...this.base(MS.injury), who, injury };
    this.world.apply(e); return e;
  }

  heal(a: Actor, hp: number, stamina: number, healed: string[], reason: "time" | "recover" | "catch-up"): GameEvent {
    const e: GameEvent = { type: "heal", ...this.base(MS.heal), who: a.id, hp, stamina, healed, reason };
    this.world.apply(e); return e;
  }

  /** A downed fighter comes round after the fight with a sliver of HP. */
  recoverDowned(): GameEvent[] {
    const out: GameEvent[] = [];
    for (const a of this.world.actors.values()) {
      if (a.hp > 0) continue;
      out.push(this.heal(a, Math.max(1, Math.ceil(a.maxHp * 0.15)), Math.ceil(a.maxStamina * 0.3), [], "recover"));
    }
    return out;
  }

  /**
   * Time-based healing. Call with the game-time delta since the last call; emits heal events
   * only when something changed by at least a point. Never during a fight.
   */
  healOverTime(gameMsElapsed: number, reason: "time" | "catch-up" = "time"): GameEvent[] {
    const out: GameEvent[] = [];
    if (this.world.inFight || gameMsElapsed <= 0) return out;
    const hours = gameMsElapsed / 3_600_000;
    const now = this.world.clock.gameMs;
    for (const a of this.world.actors.values()) {
      const healed = a.injuries.filter((i) => i.healsAt <= now).map((i) => i.id);
      const hp = Math.min(a.maxHp, Math.round(a.hp + hpPerHour(a) * hours));
      const stamina = Math.min(a.maxStamina, Math.round(a.stamina + a.maxStamina * 0.5 * hours));
      if (hp === a.hp && stamina === a.stamina && healed.length === 0) continue;
      if (a.hp <= 0 && hp <= 0) continue;
      out.push(this.heal(a, hp, stamina, healed, reason));
    }
    return out;
  }

  /**
   * Validate and resolve a chunk of beats in order. Fight beats are returned, not resolved;
   * the caller hands them to the fight runner (they need the Tactician and several rounds).
   */
  resolve(beats: Beat[]): { events: GameEvent[]; rejections: Rejection[] } {
    const events: GameEvent[] = [];
    const rejections: Rejection[] = [];
    for (const beat of beats) {
      const r = this.resolveOne(beat);
      if (typeof r === "string") rejections.push({ beat, reason: r });
      else if (r) { this.world.apply(r); events.push(r); }
    }
    return { events, rejections };
  }

  actor(id: string): Actor | string {
    const a = this.world.actors.get(id);
    if (!a) return `unknown or absent character "${id}"; on stage: ${this.world.stage().map((x) => x.id).join(", ")}`;
    if (a.location !== this.world.map.id) return `${a.name} is not here (at ${MAPS[a.location]?.name ?? a.location}); on stage: ${this.world.stage().map((x) => x.id).join(", ")}`;
    return a;
  }

  /** Validate a fight beat. Returns an error string or null. */
  checkFight(beat: Extract<Beat, { type: "fight" }>): string | null {
    if (beat.sides.flat().some((id) => !this.world.onStage(id))) return "everyone in a fight must be on stage";
    const all = beat.sides.flat();
    if (new Set(all).size !== all.length) return "a character cannot be on both sides of a fight";
    for (const id of all) { const a = this.actor(id); if (typeof a === "string") return a; if (a.hp <= 0) return `${a.name} is knocked out and cannot fight`; }
    if (this.world.inFight) return "a fight is already in progress";
    return null;
  }

  /** Resolve one non-fight beat into an event (not applied), or a rejection string, or null for fight beats. */
  resolveOne(beat: Beat): GameEvent | string | null {
    switch (beat.type) {
      case "fight": return null;
      case "travel": return null; // handled by the production loop (needs clock and stage rebuild)
      case "objective": {
        if (!this.story?.loaded) return "no issue is running";
        const r = this.story.mark(beat.id, beat.status);
        if (typeof r === "string") return r;
        return { type: "objective", ...this.base(1600), id: r.id, text: r.text, status: beat.status };
      }
      case "enter": {
        if (this.world.onStage(beat.who)) return `${this.world.nameOf(beat.who)} is already on stage`;
        if (this.world.actors.has(beat.who)) {
          // elsewhere in the world: bring them here
          const a = this.world.actors.get(beat.who)!;
          const m = this.world.marker(beat.at); if (!m) return `unknown marker "${beat.at}"`;
          return {
            type: "spawn", ...this.base(900), who: a.id, name: a.name, location: this.world.map.id, at: m.id, x: m.x, y: m.y, facing: "down",
            hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, resources: a.resources, injuries: a.injuries,
            palette: a.character.stats.palette, role: a.character.stats.role, look: a.character.stats.look,
          };
        }
        if (this.story?.loaded && !this.story.plan.cast.includes(beat.who)) return `${beat.who} is not in this issue's cast (${this.story.plan.cast.join(", ")})`;
        if (this.world.deceased.has(beat.who)) return `${beat.who} is dead`;
        const c = loadCharacter(beat.who); if (!c) return `unknown character "${beat.who}"`;
        const m = this.world.marker(beat.at); if (!m) return `unknown marker "${beat.at}"`;
        const a = this.world.addActor(c, m.x, m.y, "down");
        this.world.actors.delete(beat.who); // the spawn event re-adds it on apply
        return {
          type: "spawn", ...this.base(900), who: c.id, name: c.stats.name, location: this.world.map.id, at: m.id, x: m.x, y: m.y, facing: "down",
          hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, resources: a.resources, injuries: a.injuries,
          palette: c.stats.palette, role: c.stats.role, look: c.stats.look,
        };
      }
      case "exit": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        return { type: "despawn", ...this.base(900), who: beat.who, how: beat.how };
      }
      case "death": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        const err = this.story?.deathAllowed(beat.who) ?? "no issue is running";
        if (err) return err;
        return { type: "death", ...this.base(4000), who: beat.who, name: a.name, how: beat.how, issue: this.story!.number };
      }
      case "caption": return { ...beat, ...this.base(MS.caption) };
      case "wait": return { ...beat, ...this.base(beat.ms) };
      case "face": { const a = this.actor(beat.who); if (typeof a === "string") return a; return { ...beat, ...this.base(MS.face) }; }
      case "emote": { const a = this.actor(beat.who); if (typeof a === "string") return a; return { ...beat, ...this.base(MS.emote) }; }
      case "say": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        if (a.hp <= 0) return `${a.name} is knocked out and cannot speak`;
        return { ...beat, ...this.base(MS.sayBase + beat.text.length * MS.sayPerChar) };
      }
      case "move": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        const m = this.world.marker(beat.to);
        if (!m) return `unknown marker "${beat.to}"; markers: ${this.world.map.markers.map((k) => k.id).join(", ")}`;
        if (a.hp <= 0) return `${a.name} is knocked out and cannot move`;
        const dist = Math.hypot(m.x - a.x, m.y - a.y);
        if (dist < 0.5) return `${a.name} is already at ${beat.to}`;
        return { ...beat, ...this.base(MS.moveBase + Math.round(dist * MS.movePerTile)), x: m.x, y: m.y };
      }
      case "rescue": {
        const a = this.actor(beat.who); if (typeof a === "string") return a;
        if (a.hp <= 0) return `${a.name} is down`;
        if (a.character.stats.role === "villain" && !a.character.stats.traits.includes("protects-civilians-first"))
          return `${a.name} does not perform rescues (out of character)`;
        return { ...beat, ...this.base(MS.rescue) };
      }
      case "strike": return this.strike(beat);
    }
  }

  /** Resolve a strike into an event (not applied) or a rejection string. */
  strike(beat: Extract<Beat, { type: "strike" }> & { line?: string }): GameEvent | string {
    const a = this.actor(beat.who); if (typeof a === "string") return a;
    const t = this.actor(beat.target); if (typeof t === "string") return t;
    const move = a.character.stats.moves.find((m) => m.id === beat.move);
    if (!move) return `${a.name} has no move "${beat.move}"; available: ${a.character.stats.moves.map((m) => m.id).join(", ")}`;
    const dist = Math.hypot(t.x - a.x, t.y - a.y);
    const r = resolveStrike(a, t, move, this.world.rng, dist);
    if (r.reason) return r.reason;
    const targetHp = Math.max(0, t.hp - r.damage);
    const attackerHp = Math.max(0, a.hp - r.counterDamage);
    return {
      type: "strike", who: beat.who, target: beat.target, move: beat.move, intent: beat.intent, line: beat.line,
      ...this.base(MS.strike), moveName: move.name, kind: move.kind,
      outcome: r.outcome, damage: r.damage, targetHp, targetMaxHp: t.maxHp,
      attackerHp, attackerStamina: a.stamina - r.staminaCost, targetStamina: r.outcome === "countered" ? Math.max(0, t.stamina - 1) : t.stamina,
      spent: r.spent,
    };
  }

  /** After a strike has been applied: did it leave a lasting injury? */
  injuryAfter(e: Extract<GameEvent, { type: "strike" }>): GameEvent | null {
    const t = this.world.actors.get(e.target); if (!t || e.outcome !== "hit") return null;
    const inj = injuryFor(t, e.damage, e.targetHp, e.kind, e.moveName, this.world.clock.gameMs, this.world.rng);
    return inj ? this.injury(t.id, inj) : null;
  }
}

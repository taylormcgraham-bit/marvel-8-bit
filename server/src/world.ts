import fs from "node:fs";
import path from "node:path";
import type { GameEvent, Dir } from "../../shared/events.js";
import type { MapDef } from "../../shared/maps.js";
import type { Character } from "./canon.js";
import { CONFIG } from "./config.js";
import { Rng } from "./rng.js";
import { Clock } from "./clock.js";

export interface Actor {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Dir;
  hp: number;
  maxHp: number;
  resources: Record<string, number>;
  /** cumulative morale bonus from rescues etc. Phase 2 will use this in combat. */
  morale: number;
  character: Character;
}

export interface Issue {
  number: number;
  title: string;
  subtitle?: string;
  premise: string;
  /** game-time ms (UTC-as-game-time) at which the issue opens */
  startsAt: number;
  /** the Director's running private note, carried call to call */
  sceneNote: string;
}

export function maxHpFor(c: Character): number {
  const g = c.stats.grid;
  return 30 + g.dur * 10 + g.str * 2;
}

/**
 * The world is a pure function of the event log. `apply` is the only mutation path.
 * Phase 1 keeps the log as JSONL on disk; Phase 4 moves it to SQLite.
 */
export class World {
  readonly map: MapDef;
  readonly actors = new Map<string, Actor>();
  readonly events: GameEvent[] = [];
  readonly rng: Rng;
  issue: Issue;
  readonly clock: Clock;
  seq = 0;
  private logPath: string;

  constructor(map: MapDef, issue: Issue) {
    this.map = map;
    this.issue = issue;
    this.rng = new Rng(CONFIG.seed);
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    this.clock = new Clock(issue.startsAt);
    this.logPath = path.join(CONFIG.dataDir, "events.jsonl");
  }

  marker(id: string) { return this.map.markers.find((m) => m.id === id); }

  /** Pretty, compact text form for prompts and the Chronicle. */
  describeEvent(e: GameEvent): string {
    switch (e.type) {
      case "caption": return `[CAPTION] ${e.text}`;
      case "move": return `${this.nameOf(e.who)} moves to ${e.to}.`;
      case "face": return `${this.nameOf(e.who)} turns ${e.dir}.`;
      case "say": return `${this.nameOf(e.who)} (${e.mood}): "${e.text}"`;
      case "emote": return `${this.nameOf(e.who)} emotes ${e.emote}`;
      case "wait": return `(beat)`;
      case "rescue": return `${this.nameOf(e.who)} rescues ${e.what}.`;
      case "strike": return `${this.nameOf(e.who)} uses ${e.moveName} on ${this.nameOf(e.target)}: ${e.outcome}${e.damage ? `, ${e.damage} dmg` : ""} (${this.nameOf(e.target)} HP ${e.targetHp}/${e.targetMaxHp}).`;
      case "title": return `=== ISSUE #${e.issue}: ${e.title}${e.subtitle ? " - " + e.subtitle : ""} ===`;
      case "scene": return `[SCENE] ${e.locationName}, ${e.timeOfDay}${e.caption ? ": " + e.caption : ""}`;
      case "spawn": return `${e.name} is present at ${e.at}.`;
      case "despawn": return `${this.nameOf(e.who)} leaves.`;
      case "note": return `[${e.level.toUpperCase()}] ${e.text}`;
    }
  }

  get timeOfDay() { return this.clock.timeOfDay; }

  nameOf(id: string) { return this.actors.get(id)?.name ?? id; }

  nextSeq() { return ++this.seq; }

  /** Apply an already-validated event to state, append to log. */
  apply(e: GameEvent) {
    switch (e.type) {
      case "spawn": {
        // actors are registered by the engine before the spawn event is applied
        const a = this.actors.get(e.who);
        if (a) { a.x = e.x; a.y = e.y; a.facing = e.facing; }
        break;
      }
      case "despawn": this.actors.delete(e.who); break;
      case "move": {
        const a = this.actors.get(e.who);
        if (a) {
          a.facing = Math.abs(e.x - a.x) >= Math.abs(e.y - a.y) ? (e.x >= a.x ? "right" : "left") : (e.y >= a.y ? "down" : "up");
          a.x = e.x; a.y = e.y;
        }
        break;
      }
      case "face": { const a = this.actors.get(e.who); if (a) a.facing = e.dir; break; }
      case "strike": {
        const t = this.actors.get(e.target);
        if (t) t.hp = e.targetHp;
        break;
      }
      case "rescue": { const a = this.actors.get(e.who); if (a) a.morale += 1; break; }
    }
    this.events.push(e);
    fs.appendFileSync(this.logPath, JSON.stringify(e) + "\n");
  }

  transcript(n: number): string[] {
    return this.events
      .filter((e) => e.type !== "wait" && e.type !== "face" && e.type !== "note")
      .slice(-n)
      .map((e) => this.describeEvent(e));
  }

  /** Events that reconstruct the current stage for a freshly connected client. */
  snapshot(): GameEvent[] {
    const t = Date.now();
    const out: GameEvent[] = [];
    out.push({ type: "title", seq: 0, t, ms: 2600, issue: this.issue.number, title: this.issue.title, subtitle: this.issue.subtitle });
    out.push({ type: "scene", seq: 0, t, ms: 1200, location: this.map.id, locationName: this.map.name, timeOfDay: this.timeOfDay });
    for (const a of this.actors.values()) {
      const near = this.map.markers.reduce((best, m) => {
        const d = Math.hypot(m.x - a.x, m.y - a.y);
        return d < best.d ? { d, id: m.id } : best;
      }, { d: Infinity, id: "center" });
      out.push({
        type: "spawn", seq: 0, t, ms: 400, who: a.id, name: a.name, at: near.id, x: a.x, y: a.y, facing: a.facing,
        hp: a.hp, maxHp: a.maxHp, palette: a.character.stats.palette, role: a.character.stats.role,
      });
    }
    return out;
  }
}

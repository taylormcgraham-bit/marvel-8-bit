import fs from "node:fs";
import path from "node:path";
import type { GameEvent, Dir, Injury } from "../../shared/events.js";
import type { MapDef } from "../../shared/maps.js";
import { loadCharacter, type Character } from "./canon.js";
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
  stamina: number;
  maxStamina: number;
  resources: Record<string, number>;
  injuries: Injury[];
  /** cumulative morale bonus from rescues etc. */
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
export function maxStaminaFor(c: Character): number {
  const g = c.stats.grid;
  return 10 + g.spd * 2 + g.dur * 2;
}

interface Persisted { sceneNote: string; rng: number; seq: number }

/**
 * The world is a pure function of the event log. `apply` is the only mutation path, and
 * `replay` rebuilds the world from the log on startup so outcomes persist across restarts.
 * Phase 1 keeps the log as JSONL on disk; Phase 4 moves it to SQLite.
 */
export class World {
  readonly map: MapDef;
  readonly actors = new Map<string, Actor>();
  readonly events: GameEvent[] = [];
  readonly rng: Rng;
  readonly clock: Clock;
  issue: Issue;
  seq = 0;
  /** true while a fight runs; healing pauses and the clock scene-locks */
  inFight = false;
  private logPath: string;
  private statePath: string;

  constructor(map: MapDef, issue: Issue) {
    this.map = map;
    this.issue = issue;
    this.rng = new Rng(CONFIG.seed);
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    this.clock = new Clock(issue.startsAt);
    this.logPath = path.join(CONFIG.dataDir, "events.jsonl");
    this.statePath = path.join(CONFIG.dataDir, "world.json");
  }

  get timeOfDay() { return this.clock.timeOfDay; }
  marker(id: string) { return this.map.markers.find((m) => m.id === id); }
  nameOf(id: string) { return this.actors.get(id)?.name ?? id; }
  nextSeq() { return ++this.seq; }

  nearestMarker(a: { x: number; y: number }) {
    return this.map.markers.reduce((best, m) => {
      const d = Math.hypot(m.x - a.x, m.y - a.y);
      return d < best.d ? { d, id: m.id } : best;
    }, { d: Infinity, id: "center" });
  }

  /**
   * A marker within melee reach of `target` that nobody is standing on, preferring the
   * closest to `from`. Falls back to the nearest marker to the target. Keeps fighters from
   * stacking on one tile when they close to melee.
   */
  standNear(from: { x: number; y: number }, target: { x: number; y: number }, reach = 3.2): string {
    const occupied = new Set([...this.actors.values()].map((a) => `${a.x},${a.y}`));
    const candidates = this.map.markers
      .filter((m) => Math.hypot(m.x - target.x, m.y - target.y) <= reach && Math.hypot(m.x - target.x, m.y - target.y) >= 1 && !occupied.has(`${m.x},${m.y}`))
      .sort((p, q) => Math.hypot(p.x - from.x, p.y - from.y) - Math.hypot(q.x - from.x, q.y - from.y));
    return candidates[0]?.id ?? this.nearestMarker(target).id;
  }

  /** Register a character on stage (state only; the engine emits the spawn event). */
  addActor(c: Character, x: number, y: number, facing: Dir): Actor {
    const actor: Actor = {
      id: c.id, name: c.stats.name, x, y, facing,
      hp: 0, maxHp: maxHpFor(c), stamina: 0, maxStamina: maxStaminaFor(c), morale: 0, character: c,
      resources: { ...(c.stats.resources ?? {}) }, injuries: [],
    };
    actor.hp = actor.maxHp; actor.stamina = actor.maxStamina;
    this.actors.set(c.id, actor);
    return actor;
  }

  /** Pretty, compact text form for prompts and the Chronicle. */
  describeEvent(e: GameEvent): string {
    const n = (id: string) => this.nameOf(id);
    switch (e.type) {
      case "caption": return `[CAPTION] ${e.text}`;
      case "move": return `${n(e.who)} moves to ${e.to}.`;
      case "face": return `${n(e.who)} turns ${e.dir}.`;
      case "say": return `${n(e.who)} (${e.mood}): "${e.text}"`;
      case "emote": return `${n(e.who)} emotes ${e.emote}`;
      case "wait": return `(beat)`;
      case "rescue": return `${n(e.who)} rescues ${e.what}.`;
      case "strike": return `${n(e.who)} uses ${e.moveName} on ${n(e.target)}: ${e.outcome}${e.damage ? `, ${e.damage} dmg` : ""} (${n(e.target)} HP ${e.targetHp}/${e.targetMaxHp})${e.line ? ` "${e.line}"` : ""}.`;
      case "fightStart": return `[FIGHT] ${e.sides.map((s) => s.map(n).join(" & ")).join(" vs ")}. Stakes: ${e.stakes}`;
      case "round": return `[ROUND ${e.n}/${e.of}]`;
      case "fightEnd": return `[FIGHT OVER: ${e.reason}] ${e.summary}`;
      case "injury": return `${n(e.who)} is injured: ${e.injury.name} (severity ${e.injury.severity}, from ${e.injury.cause}).`;
      case "heal": return e.healed.length ? `${n(e.who)} has healed: ${e.healed.join(", ")}.` : `${n(e.who)} recovers to HP ${e.hp}.`;
      case "title": return `=== ISSUE #${e.issue}: ${e.title}${e.subtitle ? " - " + e.subtitle : ""} ===`;
      case "scene": return `[SCENE] ${e.locationName}, ${e.timeOfDay}${e.caption ? ": " + e.caption : ""}`;
      case "spawn": return `${e.name} is present at ${e.at}.`;
      case "despawn": return `${n(e.who)} leaves.`;
      case "note": return `[${e.level.toUpperCase()}] ${e.text}`;
    }
  }

  /** Apply a validated event to state. Used live and on replay; must be total and deterministic. */
  private mutate(e: GameEvent) {
    switch (e.type) {
      case "spawn": {
        let a = this.actors.get(e.who);
        if (!a) {
          const c = loadCharacter(e.who);
          if (!c) return;
          a = this.addActor(c, e.x, e.y, e.facing);
        }
        a.x = e.x; a.y = e.y; a.facing = e.facing;
        a.hp = e.hp; a.maxHp = e.maxHp;
        if (e.stamina !== undefined) a.stamina = e.stamina;
        if (e.maxStamina !== undefined) a.maxStamina = e.maxStamina;
        if (e.resources) a.resources = { ...e.resources };
        if (e.injuries) a.injuries = [...e.injuries];
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
        const a = this.actors.get(e.who), t = this.actors.get(e.target);
        if (t) { t.hp = e.targetHp; t.stamina = e.targetStamina; }
        if (a) {
          a.hp = e.attackerHp; a.stamina = e.attackerStamina;
          for (const [res, n] of Object.entries(e.spent ?? {})) a.resources[res] = Math.max(0, (a.resources[res] ?? 0) - n);
        }
        break;
      }
      case "round": {
        for (const [id, st] of Object.entries(e.stamina)) { const a = this.actors.get(id); if (a) a.stamina = st; }
        break;
      }
      case "fightStart": this.inFight = true; break;
      case "fightEnd": {
        this.inFight = false;
        for (const id of e.escaped) this.actors.delete(id);
        break;
      }
      case "injury": { const a = this.actors.get(e.who); if (a && !a.injuries.some((i) => i.id === e.injury.id)) a.injuries.push(e.injury); break; }
      case "heal": {
        const a = this.actors.get(e.who);
        if (a) { a.hp = e.hp; a.stamina = e.stamina; a.injuries = a.injuries.filter((i) => !e.healed.includes(i.id)); }
        break;
      }
      case "rescue": { const a = this.actors.get(e.who); if (a) a.morale += 1; break; }
    }
  }

  /** Apply and append to the log. */
  apply(e: GameEvent) {
    this.mutate(e);
    this.events.push(e);
    const line = JSON.stringify(e) + "\n";
    try { fs.appendFileSync(this.logPath, line); }
    catch { fs.mkdirSync(CONFIG.dataDir, { recursive: true }); fs.appendFileSync(this.logPath, line); }
  }

  /** Rebuild state from the log on disk. Returns the number of events replayed. */
  replay(): number {
    if (!fs.existsSync(this.logPath)) return 0;
    const lines = fs.readFileSync(this.logPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      let e: GameEvent;
      try { e = JSON.parse(line); } catch { continue; }
      this.mutate(e);
      this.events.push(e);
      if (e.seq > this.seq) this.seq = e.seq;
    }
    const saved = this.loadState();
    if (saved) { this.issue.sceneNote = saved.sceneNote; this.rng.restore(saved.rng); if (saved.seq > this.seq) this.seq = saved.seq; }
    this.inFight = false; // a fight never survives a restart; it resumes as story
    return lines.length;
  }

  saveState() {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ sceneNote: this.issue.sceneNote, rng: this.rng.state(), seq: this.seq } satisfies Persisted));
  }
  private loadState(): Persisted | null {
    try { return JSON.parse(fs.readFileSync(this.statePath, "utf8")); } catch { return null; }
  }

  transcript(n: number): string[] {
    return this.events
      .filter((e) => e.type !== "wait" && e.type !== "face" && e.type !== "note" && e.type !== "round")
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
      out.push({
        type: "spawn", seq: 0, t, ms: 400, who: a.id, name: a.name, at: this.nearestMarker(a).id, x: a.x, y: a.y, facing: a.facing,
        hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, resources: a.resources, injuries: a.injuries,
        palette: a.character.stats.palette, role: a.character.stats.role, look: a.character.stats.look,
      });
    }
    return out;
  }
}

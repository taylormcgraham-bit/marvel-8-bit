/**
 * World Sim: the deterministic, no-AI part of the world that keeps moving between scenes.
 * Villain scheme meters, faction standings, weather, and whereabouts of everyone not on
 * stage. Persisted in data/world-sim.json; rules from canon/world/rules.md and factions.md.
 */
import fs from "node:fs";
import path from "node:path";
import type { GameEvent, Weather } from "../../shared/events.js";
import { MAPS } from "../../shared/maps.js";
import { listCharacterIds, loadCharacter } from "./canon.js";
import { CONFIG } from "./config.js";

export const FACTIONS = ["public-opinion", "nypd", "shield", "daily-bugle", "hellfire-club", "hydra", "latveria", "asgard", "wakanda", "kingpin-org"] as const;
export type Faction = (typeof FACTIONS)[number];

const HOUR = 3_600_000;
/** Scheme meter growth per game-hour while the villain is off-panel; capped at 90 off-panel. */
export const SCHEME_RATE_PER_HOUR = 1.5;
export const SCHEME_OFFPANEL_CAP = 90;

interface Persisted {
  schemes: Record<string, number>;
  factions: Record<string, Partial<Record<Faction, number>>>;
  whereabouts: Record<string, string>;
  weather: Weather;
  lastSimGameMs: number;
}

export function standingWord(v: number): string {
  if (v >= 60) return "beloved"; if (v >= 30) return "trusted"; if (v >= 10) return "liked"; if (v > -10) return "neutral";
  if (v > -30) return "wary"; if (v > -60) return "hostile"; return "hunted";
}

export class Sim {
  schemes: Record<string, number> = {};
  factions: Record<string, Partial<Record<Faction, number>>> = {};
  whereabouts: Record<string, string> = {};
  weather: Weather = "clear";
  lastSimGameMs = 0;
  private file = path.join(CONFIG.dataDir, "world-sim.json");

  /** Seed from canon for anyone not yet known. */
  init(gameMs: number) {
    for (const id of listCharacterIds()) {
      const c = loadCharacter(id)!;
      if (c.stats.role === "villain" && this.schemes[id] === undefined) this.schemes[id] = 20 + (id.length * 7) % 25;
      if (!this.factions[id]) this.factions[id] = { ...(c.stats.factions ?? {}) } as Partial<Record<Faction, number>>;
      if (!this.whereabouts[id]) this.whereabouts[id] = homeMap(c.stats.homeLocation);
    }
    if (!this.lastSimGameMs) this.lastSimGameMs = gameMs;
  }
  load() { try { Object.assign(this, JSON.parse(fs.readFileSync(this.file, "utf8")) as Persisted); } catch { /* fresh */ } }
  save() {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    const p: Persisted = { schemes: this.schemes, factions: this.factions, whereabouts: this.whereabouts, weather: this.weather, lastSimGameMs: this.lastSimGameMs };
    fs.writeFileSync(this.file, JSON.stringify(p, null, 2));
  }

  /** Advance meters and weather for elapsed game time. `onStage` villains do not advance (they fill on-panel). */
  advance(gameMs: number, onStage: Set<string>): string[] {
    const dt = Math.max(0, gameMs - this.lastSimGameMs);
    this.lastSimGameMs = gameMs;
    const hours = dt / HOUR;
    const notes: string[] = [];
    if (hours <= 0) return notes;
    for (const [id, v] of Object.entries(this.schemes)) {
      if (onStage.has(id)) continue;
      const nv = Math.min(SCHEME_OFFPANEL_CAP, v + SCHEME_RATE_PER_HOUR * hours);
      if (Math.floor(nv / 10) > Math.floor(v / 10)) notes.push(`${nameOf(id)}'s scheme advances (${Math.round(nv)}%).`);
      this.schemes[id] = nv;
    }
    // faction standings decay one point per game-day toward the canon baseline
    for (const id of Object.keys(this.factions)) {
      const base = (loadCharacter(id)?.stats.factions ?? {}) as Partial<Record<Faction, number>>;
      for (const f of Object.keys(this.factions[id]!) as Faction[]) {
        const cur = this.factions[id]![f] ?? 0, b = base[f] ?? 0;
        const step = Math.min(Math.abs(cur - b), hours / 24);
        this.factions[id]![f] = cur + Math.sign(b - cur) * step;
      }
    }
    const w = weatherFor(gameMs);
    if (w !== this.weather) { this.weather = w; notes.push(weatherLine(w)); }
    return notes;
  }

  shift(id: string, f: Faction, delta: number) {
    const cur = this.factions[id] ?? (this.factions[id] = {});
    cur[f] = Math.max(-100, Math.min(100, (cur[f] ?? 0) + delta));
  }

  /**
   * Consequences of on-panel events for standings (rules.md §4.4, factions.md).
   * Returns human-readable notes for the log.
   */
  react(e: GameEvent, stageIds: string[], mapId: string, roleOf: (id: string) => string): string[] {
    const notes: string[] = [];
    const heroes = stageIds.filter((id) => roleOf(id) === "hero");
    const pub = MAPS[mapId]?.publicSpace ?? false;
    switch (e.type) {
      case "rescue":
        this.shift(e.who, "public-opinion", 2); this.shift(e.who, "daily-bugle", 1);
        notes.push(`${nameOf(e.who)} rescue: public opinion +2`); break;
      case "fightStart":
        if (pub) for (const h of heroes) this.shift(h, "public-opinion", -1);
        if (pub) notes.push("a fight in public: public opinion -1 for the heroes present");
        break;
      case "fightEnd": {
        const villainsDown = e.downed.filter((id) => roleOf(id) === "villain");
        for (const v of villainsDown) { this.schemes[v] = Math.min(this.schemes[v] ?? 0, 15); for (const h of heroes) { this.shift(h, "nypd", 2); this.shift(h, "public-opinion", 3); } }
        if (villainsDown.length) notes.push(`villain down: NYPD +2, public opinion +3 for ${heroes.map(nameOf).join(", ")}`);
        const villainsFled = e.escaped.filter((id) => roleOf(id) === "villain");
        if (villainsFled.length) { for (const h of heroes) this.shift(h, "public-opinion", -1); notes.push("villain escaped: public opinion -1 for the heroes"); }
        break;
      }
      case "despawn":
      case "death":
        if (e.type === "death") this.whereabouts[e.who] = "deceased";
        break;
    }
    return notes;
  }

  /** Reset a villain's meter after an issue in which they were the antagonist. */
  closeIssue(antagonist: string) { if (this.schemes[antagonist] !== undefined) this.schemes[antagonist] = 25; }

  describe(ids?: string[]): string {
    const parts: string[] = [];
    const s = Object.entries(this.schemes).sort((a, b) => b[1] - a[1]);
    if (s.length) parts.push("VILLAIN SCHEME METERS (100% = the plan goes live; anything over 80 must be addressed):\n" + s.map(([id, v]) => `- ${nameOf(id)} (${id}): ${Math.round(v)}%`).join("\n"));
    const f = Object.entries(this.factions).filter(([id]) => !ids || ids.includes(id)).filter(([id]) => loadCharacter(id)?.stats.role === "hero");
    if (f.length) parts.push("FACTION STANDINGS:\n" + f.map(([id, m]) => `- ${nameOf(id)}: ${Object.entries(m).map(([k, v]) => `${k} ${Math.round(v ?? 0)} (${standingWord(v ?? 0)})`).join(", ")}`).join("\n"));
    const w = Object.entries(this.whereabouts).filter(([id]) => !ids || ids.includes(id));
    if (w.length) parts.push("WHEREABOUTS:\n" + w.map(([id, m]) => `- ${nameOf(id)}: ${MAPS[m]?.name ?? m}`).join("\n"));
    parts.push(`WEATHER: ${this.weather}`);
    return parts.join("\n\n");
  }
}

const nameOf = (id: string) => loadCharacter(id)?.stats.name ?? id;

/** Home location slug (from stats.json) to a map id we actually have. */
export function homeMap(home: string): string {
  if (home.includes("avengers") || home.includes("stark")) return "avengers-lounge";
  if (home.includes("latveria")) return "castle-doom";
  if (home.includes("midtown") || home.includes("bugle") || home.includes("oscorp") || home.includes("fisk")) return "midtown-street";
  if (home.includes("forest-hills") || home.includes("hells-kitchen") || home.includes("chelsea")) return "chelsea-rooftop";
  return "chelsea-rooftop";
}

/** Deterministic weather from the game clock: changes every few hours, mostly clear. */
export function weatherFor(gameMs: number): Weather {
  const slot = Math.floor(gameMs / (4 * HOUR));
  let h = (slot * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  const r = (h >>> 0) / 4294967295;
  const month = new Date(gameMs).getUTCMonth();
  const winter = month === 11 || month <= 1;
  if (r < 0.58) return "clear";
  if (r < 0.78) return winter ? "snow" : "rain";
  if (r < 0.9) return "fog";
  return winter ? "snow" : "storm";
}
export function weatherLine(w: Weather): string {
  return { clear: "The sky clears over the city.", rain: "Rain moves in over Manhattan.", fog: "Fog rolls in off the river.", snow: "Snow starts to fall.", storm: "A storm breaks over the city." }[w];
}

/**
 * Phase 1 "showrunner": a pacing loop. Holds the world, asks the Director for chunks
 * when the theater's buffer runs low, pushes resolved events to connected theaters.
 * Phase 3 replaces the hardcoded issue with the real Showrunner agent.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { GameEvent, SceneChunk } from "../../shared/events.js";
import { CHELSEA_ROOFTOP } from "../../shared/maps.js";
import { Director } from "./agents/director.js";
import { ContinuityEditor } from "./agents/continuity.js";
import { MockDirector } from "./agents/mock.js";
import { loadCharacter } from "./canon.js";
import { CONFIG } from "./config.js";
import { Engine, type Rejection } from "./engine.js";
import { World } from "./world.js";
import { describeDuration } from "./clock.js";

export interface Cast { id: string; at: string; facing?: "up" | "down" | "left" | "right" }

export const ISSUE_ONE = {
  number: 1,
  title: "Night of the Goblin",
  subtitle: "A Chelsea rooftop. Three web cartridges. One old enemy.",
  startsAt: Date.UTC(2026, 9, 14, 23, 48),
  premise:
    "Spider-Man is decompressing on his water-tower rooftop after a long night when the Green Goblin arrives, not to fight at first, but to talk: Norman has learned something about Harry he wants Peter to hear, and he enjoys the leverage. It goes bad the way it always does. Daredevil, patrolling two blocks over, hears the fight. The objective for the heroes: keep the Goblin away from the street below and find out what Norman actually wants. The objective for the Goblin: rattle Peter, test him, and leave on his own terms.",
  sceneNote: "",
};

export const CAST: Cast[] = [
  { id: "spider-man", at: "water-tower", facing: "down" },
  { id: "green-goblin", at: "ledge-north", facing: "down" },
  { id: "daredevil", at: "ledge-east", facing: "left" },
];

type Listener = (events: GameEvent[]) => void;

export class Showrunner {
  readonly world = new World(CHELSEA_ROOFTOP, { ...ISSUE_ONE });
  readonly engine = new Engine(this.world);
  mode: "live" | "mock" = "mock";
  private director?: Director;
  private continuity?: ContinuityEditor;
  private mock = new MockDirector();
  private listeners = new Set<Listener>();
  private bufferMs = 0;
  private viewers = 0;
  private generating = false;
  private lastCall = 0;
  private lastRejections: Rejection[] = [];
  private timer?: NodeJS.Timeout;
  status: string[] = [];

  constructor() {
    this.mode = CONFIG.mock ? "mock" : "live";
    if (this.mode === "live") {
      this.director = new Director();
      if (CONFIG.continuityMode === "llm") this.continuity = new ContinuityEditor();
    }
    this.openIssue();
  }

  private log(s: string) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
    console.log(line);
    this.status.push(line);
    if (this.status.length > 200) this.status.shift();
  }

  /** Title card, scene, cast on stage. */
  private openIssue() {
    const evs: GameEvent[] = [];
    evs.push(this.engine.title(ISSUE_ONE.number, ISSUE_ONE.title, ISSUE_ONE.subtitle));
    evs.push(this.engine.scene("CHELSEA. NEAR MIDNIGHT."));
    for (const c of CAST) {
      const ch = loadCharacter(c.id);
      if (!ch) { this.log(`cast member "${c.id}" has no canon folder yet; skipping`); continue; }
      evs.push(this.engine.spawn(ch, c.at, c.facing));
    }
    this.log(`Issue #${ISSUE_ONE.number} "${ISSUE_ONE.title}" open; on stage: ${[...this.world.actors.keys()].join(", ")}`);
  }

  onEvents(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(events: GameEvent[]) { for (const fn of this.listeners) fn(events); }

  viewerJoined() {
    this.viewers++;
    if (this.viewers === 1) {
      const { awayMs, passedMs } = this.world.clock.resume();
      if (passedMs > 0) {
        // Phase 4 runs Off-Panel Catch-Up here. For now the clock moves and the world is told.
        this.emitNote("info", `away ${describeDuration(awayMs)}; ${describeDuration(passedMs)} of game time passed. It is now ${this.world.clock.label}.`);
        this.emit([this.engine.scene(`${describeDuration(passedMs).toUpperCase()} LATER...`)]);
      } else if (awayMs > 60_000) {
        this.log(`viewer back after ${describeDuration(awayMs)}; within grace, no game time passed (${this.world.clock.label})`);
      }
    }
    this.kick();
  }
  viewerLeft() {
    this.viewers = Math.max(0, this.viewers - 1);
    if (this.viewers === 0) this.world.clock.pause();
  }
  reportBuffer(ms: number) { this.bufferMs = ms; this.kick(); }

  start() {
    this.timer = setInterval(() => {
      if (this.viewers > 0) this.world.clock.tick();
      this.kick();
    }, 1000);
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  /** Generate only while someone is watching and the theater is about to run dry. */
  private kick() {
    if (this.generating || this.viewers === 0) return;
    if (this.bufferMs > CONFIG.leadMs) return;
    if (Date.now() - this.lastCall < CONFIG.minCallGapMs) return;
    void this.generate();
  }

  private async generate() {
    this.generating = true;
    this.lastCall = Date.now();
    try {
      let chunk: SceneChunk;
      if (this.mode === "live" && this.director) {
        try {
          const r = await this.director.next({ world: this.world, rejections: this.lastRejections });
          chunk = r.chunk;
          this.log(`director(${r.model}) ${r.chunk.beats.length} beats; tokens in=${r.usage.in} out=${r.usage.out} cacheRead=${r.usage.cacheRead} cacheWrite=${r.usage.cacheWrite}`);
        } catch (err) {
          if (err instanceof Anthropic.AuthenticationError) {
            this.log("no valid Anthropic credentials; switching to MOCK mode (set ANTHROPIC_API_KEY or run `ant auth login`)");
            this.mode = "mock";
            chunk = this.mock.next(this.world);
          } else if (err instanceof Anthropic.RateLimitError) {
            this.log("rate limited; will retry shortly");
            this.lastCall = Date.now() + 20_000;
            return;
          } else if (err instanceof Anthropic.APIError) {
            this.log(`API error ${err.status}: ${err.message}`);
            this.lastCall = Date.now() + 10_000;
            return;
          } else {
            this.log(`director error: ${(err as Error).message}`);
            this.lastCall = Date.now() + 10_000;
            return;
          }
        }
        if (this.continuity && this.mode === "live") {
          try {
            const r = await this.continuity.review(this.world, chunk);
            chunk = { ...chunk, beats: r.beats };
            for (const n of r.notes) this.emitNote("warn", `continuity: ${n}`);
          } catch (err) {
            this.log(`continuity error (skipping review): ${(err as Error).message}`);
          }
        }
      } else {
        chunk = this.mock.next(this.world);
      }

      this.world.issue.sceneNote = chunk.sceneNote;
      const { events, rejections } = this.engine.resolve(chunk.beats);
      this.lastRejections = rejections;
      for (const r of rejections) this.emitNote("reject", `${r.beat.type} by ${"who" in r.beat ? r.beat.who : "?"}: ${r.reason}`);
      this.world.clock.sceneLocked = events.some((e) => e.type === "strike");
      if (events.length) {
        this.emit(events);
        this.bufferMs += events.reduce((s, e) => s + e.ms, 0);
      }
      this.log(`played ${events.length} beats, rejected ${rejections.length}; buffer ~${Math.round(this.bufferMs / 1000)}s`);
    } finally {
      this.generating = false;
    }
  }

  private emitNote(level: "info" | "warn" | "reject", text: string) {
    const e = this.engine.note(level, text);
    this.log(text);
    this.emit([e]);
  }
}

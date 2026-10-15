/**
 * The Bullpen's production loop. Holds the world and the story; asks the Showrunner for
 * issues, the Director for chunks, the Tactician for fight rounds, the Archivist to close
 * issues; pushes resolved events to connected theaters only while someone is watching.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Beat, GameEvent, SceneChunk } from "../../shared/events.js";
import { CHELSEA_ROOFTOP } from "../../shared/maps.js";
import { Director } from "./agents/director.js";
import { ContinuityEditor } from "./agents/continuity.js";
import { MockDirector } from "./agents/mock.js";
import { Tactician, MockTactician } from "./agents/tactician.js";
import { Showrunner as ShowrunnerAgent, MockShowrunner, ISSUE_ONE_PLAN } from "./agents/showrunner.js";
import { Archivist, MockArchivist } from "./agents/archivist.js";
import { runFight } from "./fight.js";
import { loadCharacter } from "./canon.js";
import { CONFIG } from "./config.js";
import { Engine, type Rejection } from "./engine.js";
import { World } from "./world.js";
import { Story, type IssuePlan } from "./story.js";
import { Memory } from "./memory.js";
import { Sim } from "./sim.js";
import { CatchUp, MockCatchUp } from "./agents/catchup.js";
import { MAPS } from "../../shared/maps.js";
import { describeDuration } from "./clock.js";

type Listener = (events: GameEvent[]) => void;

export class Showrunner {
  readonly world = new World(CHELSEA_ROOFTOP, {
    number: 1, title: ISSUE_ONE_PLAN.title, subtitle: ISSUE_ONE_PLAN.subtitle, premise: ISSUE_ONE_PLAN.premise,
    startsAt: Date.UTC(2026, 9, 14, 23, 48), sceneNote: "",
  });
  readonly engine = new Engine(this.world);
  readonly story = new Story();
  readonly memory = new Memory();
  readonly sim = new Sim();
  mode: "live" | "mock" = "mock";
  private director?: Director;
  private continuity?: ContinuityEditor;
  private tactician?: Tactician;
  private planner?: ShowrunnerAgent;
  private archivist?: Archivist;
  private catchup?: CatchUp;
  private mockCatchup = new MockCatchUp();
  private mock = new MockDirector();
  private mockTactician = new MockTactician();
  private mockPlanner = new MockShowrunner();
  private mockArchivist = new MockArchivist();
  private listeners = new Set<Listener>();
  private bufferMs = 0;
  private viewers = 0;
  private generating = false;
  private lastCall = 0;
  private lastRejections: Rejection[] = [];
  private lastHealGameMs = 0;
  private timer?: NodeJS.Timeout;
  status: string[] = [];

  constructor() {
    this.mode = CONFIG.mock ? "mock" : "live";
    if (this.mode === "live") {
      this.director = new Director();
      this.tactician = new Tactician();
      this.planner = new ShowrunnerAgent();
      this.archivist = new Archivist();
      this.catchup = new CatchUp();
      if (CONFIG.continuityMode === "llm") this.continuity = new ContinuityEditor();
    }
    this.engine.story = this.story;
    this.memory.load();
    this.sim.load();
    const replayed = this.world.replay();
    const hadStory = this.story.load();
    if (replayed > 0 && hadStory && !this.story.finished) {
      this.syncIssueHeader();
      this.log(`restored issue #${this.story.number} "${this.story.plan.title}", act ${this.story.actIndex + 1}, from ${replayed} logged events; on stage: ${[...this.world.actors.values()].map((a) => `${a.name} HP ${a.hp}/${a.maxHp}`).join(", ") || "nobody"}`);
    } else {
      this.log(replayed > 0 ? "log present but no issue in progress; starting fresh issue" : "fresh world");
    }
    this.lastHealGameMs = this.world.clock.gameMs;
    this.sim.init(this.world.clock.gameMs);
    this.world.weather = this.sim.weather;
    this.sim.save();
  }

  private log(s: string) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
    console.log(line);
    this.status.push(line);
    if (this.status.length > 300) this.status.shift();
  }

  private syncIssueHeader() {
    this.world.issue.number = this.story.number;
    this.world.issue.title = this.story.plan.title;
    this.world.issue.subtitle = this.story.plan.subtitle;
    this.world.issue.premise = this.story.plan.premise;
  }

  /* ------------------------------------------------------------------ issues */

  private async planIssue(number: number): Promise<IssuePlan> {
    if (this.mode === "live" && this.planner) {
      try {
        const plan = await this.planner.plan(this.world, this.memory, this.world.map, number, this.sim.describe());
        this.log(`showrunner planned issue #${number} "${plan.title}" (cast: ${plan.cast.join(", ")})`);
        return plan;
      } catch (err) {
        this.log(`showrunner error: ${(err as Error).message}; using scripted plan`);
      }
    }
    return this.mockPlanner.plan(this.world, this.memory, this.world.map, number, this.sim.describe());
  }

  /** Open an issue: cast changes, title card, scene, act 1. */
  private openIssue(number: number, plan: IssuePlan) {
    this.story.begin(number, plan, this.world.clock.gameMs);
    this.syncIssueHeader();
    this.world.issue.sceneNote = "";
    const evs: GameEvent[] = [];
    const opening = new Set(plan.opening.map((o) => o.who));
    // everyone not in the opening goes home between issues
    for (const a of [...this.world.actors.values()]) if (!opening.has(a.id)) { this.sim.whereabouts[a.id] = this.sim.whereabouts[a.id] ?? a.location; evs.push(this.engine.despawn(a.id, "between issues")); }
    if (MAPS[plan.location]) this.world.setLocation(plan.location); else this.log(`unknown issue location "${plan.location}", staying at ${this.world.map.id}`);
    this.world.weather = this.sim.weather;
    evs.push(this.engine.title(number, plan.title, plan.subtitle));
    evs.push(this.engine.scene(`${this.world.map.name.toUpperCase()}. ${this.world.clock.label.toUpperCase()}`));
    for (const o of plan.opening) {
      const existing = this.world.actors.get(o.who);
      if (existing) { existing.location = this.world.map.id; const m = this.world.marker(o.at); if (m) { existing.x = m.x; existing.y = m.y; } continue; }
      const c = loadCharacter(o.who);
      if (!c) { this.log(`opening cast "${o.who}" has no canon folder; skipping`); continue; }
      evs.push(this.engine.spawn(c, this.world.marker(o.at) ? o.at : "center"));
    }
    for (const id of opening) this.sim.whereabouts[id] = this.world.map.id;
    evs.push(...this.engine.stageSpawns().filter((e) => e.type === "spawn" && !evs.some((x) => x.type === "spawn" && x.who === e.who)));
    evs.push(this.engine.act(number, 1, plan.acts[0]!.title, plan.acts[0]!.goal, this.story.actObjectives));
    this.emit(evs);
    this.bufferMs += evs.reduce((s, e) => s + e.ms, 0);
    this.log(`issue #${number} "${plan.title}" open; act 1 "${plan.acts[0]!.title}"; on stage: ${[...this.world.actors.keys()].join(", ")}`);
    if (this.story.pendingDeath) this.log(`planned death pending Editor approval: ${this.story.pendingDeath.who} in act ${this.story.pendingDeath.act}`);
    this.world.saveState();
  }

  /** Close the issue: Archivist, Chronicle, memory, then plan and open the next one. */
  private async closeIssue() {
    const n = this.story.number;
    let summary;
    try {
      summary = this.mode === "live" && this.archivist ? await this.archivist.close(this.world, this.story, this.memory) : this.mockArchivist.close(this.world, this.story, this.memory);
    } catch (err) {
      this.log(`archivist error: ${(err as Error).message}; using mechanical summary`);
      summary = this.mockArchivist.close(this.world, this.story, this.memory);
    }
    for (const r of summary.relationships) this.memory.setRelationship(r.a, r.b, r.temperature, r.note, n);
    for (const f of summary.factsLearned) this.memory.addFact(f.who, f.fact, n);
    this.memory.setThreads([...summary.threads, ...this.story.plan.nextHooks]);
    this.memory.save();
    this.memory.writeIssue({
      number: n, title: this.story.plan.title, subtitle: this.story.plan.subtitle, summary: summary.summary, keyEvents: summary.keyEvents,
      threads: summary.threads, cast: this.story.plan.cast, endedAt: Date.now(),
    }, this.world.currentIssueEvents(n).filter((e) => e.seq > 0 && e.type !== "note").map((e) => this.world.describeEvent(e)));
    this.sim.closeIssue(this.story.plan.antagonist);
    this.sim.save();
    this.log(`issue #${n} closed and archived`);

    const next = await this.planIssue(n + 1);
    const endEv = this.engine.issueEnd(n, this.story.plan.title, summary.summary, next.title);
    this.emit([endEv]); this.bufferMs += endEv.ms;
    // time passes between issues; wounds heal
    const gap = next.opensAfterGameHours * 3_600_000;
    if (gap > 0) {
      this.world.clock.gameMs += gap; this.world.clock.save();
      const healed = this.engine.healOverTime(gap, "catch-up");
      if (healed.length) this.emit(healed);
      this.lastHealGameMs = this.world.clock.gameMs;
      const sc = this.engine.scene(`${describeDuration(gap).toUpperCase()} LATER`); this.emit([sc]);
    }
    this.openIssue(n + 1, next);
  }

  /** Advance the act if its objectives are done (or it ran long); end the issue after act 3. */
  private async maybeAdvance() {
    const reason = this.story.advanceReason();
    if (!reason) return;
    const hold = this.story.deathHold();
    if (hold) { if (this.story.chunksInAct % 4 === 0) this.emitNote("warn", hold); return; }
    this.story.advance();
    if (this.story.finished) { this.log(`act 3 complete (${reason}); closing issue`); await this.closeIssue(); return; }
    const act = this.story.act;
    const ev = this.engine.act(this.story.number, this.story.actIndex + 1, act.title, act.goal, this.story.actObjectives);
    this.emit([ev]); this.bufferMs += ev.ms;
    this.log(`act ${this.story.actIndex + 1} "${act.title}" (${reason})`);
    if (act.location && act.location !== this.world.map.id && MAPS[act.location]) {
      this.doTravel(this.world.stage().map((a) => a.id), act.location, "as the act opens");
    }
  }

  /* ------------------------------------------------------------------ viewers */

  onEvents(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(events: GameEvent[]) { for (const fn of this.listeners) fn(events); }

  /** Stage reconstruction for a new viewer: world snapshot plus the current act. */
  snapshot(): GameEvent[] {
    const out = this.world.snapshot();
    if (this.story.loaded && !this.story.finished) {
      out.push({ type: "act", seq: 0, t: Date.now(), ms: 1200, issue: this.story.number, n: this.story.actIndex + 1, title: this.story.act.title, goal: this.story.act.goal, objectives: this.story.actObjectives });
    }
    return out;
  }

  viewerJoined() {
    this.viewers++;
    if (this.viewers === 1) {
      const { awayMs, passedMs } = this.world.clock.resume();
      if (passedMs > 0) {
        this.log(`away ${describeDuration(awayMs)}; ${describeDuration(passedMs)} of game time passed. It is now ${this.world.clock.label}.`);
        void this.catchUp(passedMs);
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

  /** Off-Panel Catch-Up: heal, run the sim, write the "while you were away" card, resume the scene. */
  private async catchUp(passedMs: number) {
    this.generating = true;
    try {
      const healed = this.engine.healOverTime(passedMs, "catch-up");
      this.lastHealGameMs = this.world.clock.gameMs;
      const simNotes = this.runSim();
      let lines: string[];
      try {
        lines = this.mode === "live" && this.catchup && this.story.loaded
          ? await this.catchup.write(this.world, this.sim, this.story, passedMs, simNotes)
          : this.mockCatchup.write(this.world, this.sim, this.story, passedMs, simNotes);
      } catch (err) { this.log(`catch-up error: ${(err as Error).message}`); lines = this.mockCatchup.write(this.world, this.sim, this.story, passedMs, simNotes); }
      this.world.weather = this.sim.weather;
      const evs: GameEvent[] = [this.engine.recap(`WHILE YOU WERE AWAY: ${describeDuration(passedMs).toUpperCase()}`, lines), ...healed, this.engine.scene(`${this.world.map.name.toUpperCase()}. ${this.world.clock.label.toUpperCase()}`), ...this.engine.stageSpawns()];
      this.emit(evs); this.bufferMs += evs.reduce((s, e) => s + e.ms, 0);
    } finally { this.generating = false; }
  }

  /** Move characters to another map: travel event, clock advance, healing, new scene, stage spawns. */
  private doTravel(who: string[], to: string, how?: string): string | null {
    const r = this.engine.travel(who, to, how);
    if (typeof r === "string") return r;
    const evs: GameEvent[] = [...r];
    const tr = r[0]; const minutes = tr && tr.type === "travel" ? tr.minutes : 0;
    if (minutes > 0) {
      this.world.clock.gameMs += minutes * 60_000; this.world.clock.save();
      evs.push(...this.engine.healOverTime(minutes * 60_000, "time"));
      this.lastHealGameMs = this.world.clock.gameMs;
    }
    this.runSim();
    this.world.weather = this.sim.weather;
    evs.push(this.engine.scene(`${this.world.map.name.toUpperCase()}${minutes ? `. ${minutes} MINUTES LATER` : ""}`));
    evs.push(...this.engine.stageSpawns());
    for (const id of who) this.sim.whereabouts[id] = to;
    this.emit(evs); this.bufferMs += evs.reduce((s, e) => s + e.ms, 0);
    this.log(`travel: ${who.join(", ")} to ${to} (${minutes} min)`);
    return null;
  }

  /** Advance the deterministic sim to the current game time. Returns its notes. */
  private runSim(): string[] {
    const notes = this.sim.advance(this.world.clock.gameMs, new Set(this.world.stage().map((a) => a.id)));
    this.sim.save();
    return notes;
  }

  /** Editor's Desk: log a line and tell the theater. */
  note(text: string) { this.emitNote("info", text); }
  /** A character was approved or rejected: seed the Sim for newcomers. */
  rosterChanged() { this.sim.init(this.world.clock.gameMs); this.sim.save(); }

  /** Editor's Desk actions. */
  decideDeath(status: "approved" | "vetoed") {
    this.story.decideDeath(status);
    this.emitNote("info", `Editor ${status} the planned death of ${this.story.pendingDeath?.who ?? "?"}`);
  }

  start() {
    this.timer = setInterval(() => {
      if (this.viewers > 0) {
        this.world.clock.tick();
        const dt = this.world.clock.gameMs - this.lastHealGameMs;
        if (dt >= 600_000 && !this.world.inFight && !this.generating) {
          const healed = this.engine.healOverTime(dt, "time");
          if (healed.length) this.emit(healed);
          this.lastHealGameMs = this.world.clock.gameMs;
          const notes = this.runSim();
          if (this.sim.weather !== this.world.weather) { this.world.weather = this.sim.weather; this.emit([this.engine.scene(undefined, this.sim.weather)]); }
          for (const n of notes) this.log(`sim: ${n}`);
        }
      }
      this.kick();
    }, 1000);
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  /* ------------------------------------------------------------------ generation */

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
      if (!this.story.loaded) { this.openIssue(1, await this.planIssue(1)); return; }
      if (this.story.finished) { await this.closeIssue(); return; }

      let chunk: SceneChunk;
      if (this.mode === "live" && this.director) {
        try {
          const r = await this.director.next({ world: this.world, rejections: this.lastRejections, story: this.story, memory: this.memory, sim: this.sim });
          chunk = r.chunk;
          this.log(`director(${r.model}) ${r.chunk.beats.length} beats; tokens in=${r.usage.in} out=${r.usage.out} cacheRead=${r.usage.cacheRead} cacheWrite=${r.usage.cacheWrite}`);
        } catch (err) {
          if (err instanceof Anthropic.AuthenticationError) {
            this.log("no valid Anthropic credentials; switching to MOCK mode (set ANTHROPIC_API_KEY or run `ant auth login`)");
            this.mode = "mock";
            chunk = this.mockChunk();
          } else if (err instanceof Anthropic.RateLimitError) {
            this.log("rate limited; will retry shortly"); this.lastCall = Date.now() + 20_000; return;
          } else if (err instanceof Anthropic.APIError) {
            this.log(`API error ${err.status}: ${err.message}`); this.lastCall = Date.now() + 10_000; return;
          } else {
            this.log(`director error: ${(err as Error).message}`); this.lastCall = Date.now() + 10_000; return;
          }
        }
        if (this.continuity && this.mode === "live") {
          try {
            const r = await this.continuity.review(this.world, chunk);
            chunk = { ...chunk, beats: r.beats };
            for (const n of r.notes) this.emitNote("warn", `continuity: ${n}`);
          } catch (err) { this.log(`continuity error (skipping review): ${(err as Error).message}`); }
        }
      } else {
        chunk = this.mockChunk();
      }

      this.world.issue.sceneNote = chunk.sceneNote;
      const rejections: Rejection[] = [];
      let played = 0;
      for (const beat of chunk.beats) {
        if (beat.type === "fight") {
          const err = this.engine.checkFight(beat);
          if (err) { rejections.push({ beat, reason: err }); continue; }
          this.world.clock.sceneLocked = true;
          const r = await runFight(beat, {
            world: this.world, engine: this.engine, tactician: this.mode === "live" && this.tactician ? this.tactician : this.mockTactician,
            emit: (evs) => {
              for (const e of evs) for (const n of this.sim.react(e, this.world.stage().map((a) => a.id), this.world.map.id, (id) => loadCharacter(id)?.stats.role ?? "supporting")) this.log(`sim: ${n}`);
              this.emit(evs); this.bufferMs += evs.reduce((s, e) => s + e.ms, 0); played += evs.length;
            },
            log: (t) => this.log(t),
          });
          this.world.clock.sceneLocked = false;
          this.lastHealGameMs = this.world.clock.gameMs;
          this.log(`fight: ${r.rounds} rounds, ${r.reason}`);
          continue;
        }
        if (beat.type === "travel") {
          const err = this.doTravel(beat.who, beat.to, beat.how);
          if (err) rejections.push({ beat, reason: err });
          continue;
        }
        const r = this.engine.resolveOne(beat);
        if (typeof r === "string") { rejections.push({ beat, reason: r }); continue; }
        if (!r) continue;
        this.world.apply(r);
        if (r.type === "death") this.memory.record({ who: r.who, kind: "death", issue: r.issue, how: r.how }), this.memory.save();
        const evs: GameEvent[] = [r];
        if (r.type === "strike") { const inj = this.engine.injuryAfter(r); if (inj) evs.push(inj); }
        for (const n of this.sim.react(r, this.world.stage().map((a) => a.id), this.world.map.id, (id) => loadCharacter(id)?.stats.role ?? "supporting")) this.log(`sim: ${n}`);
        this.emit(evs);
        this.bufferMs += evs.reduce((s, e) => s + e.ms, 0);
        played += evs.length;
      }
      this.lastRejections = rejections;
      for (const r of rejections) this.emitNote("reject", `${r.beat.type}${"who" in r.beat ? " by " + r.beat.who : ""}: ${r.reason}`);
      this.story.chunksInAct++;
      this.story.save();
      this.world.saveState();
      this.log(`played ${played} events, rejected ${rejections.length}; act ${this.story.actIndex + 1} chunk ${this.story.chunksInAct}; buffer ~${Math.round(this.bufferMs / 1000)}s`);
      await this.maybeAdvance();
    } finally {
      this.generating = false;
    }
  }

  /** Scripted chunk plus, every other chunk, the first open objective marked done so acts progress. */
  private mockChunk(): SceneChunk {
    const chunk = this.mock.next(this.world);
    const beats: Beat[] = [...chunk.beats];
    const open = this.story.actObjectives.find((o) => o.status === "open");
    if (open && this.story.chunksInAct % 2 === 1) beats.push({ type: "objective", id: open.id, status: "done" });
    return { ...chunk, beats };
  }

  private emitNote(level: "info" | "warn" | "reject", text: string) {
    const e = this.engine.note(level, text);
    this.log(text);
    this.emit([e]);
  }
}

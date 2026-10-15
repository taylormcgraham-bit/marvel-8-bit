/**
 * Story state: the current issue (a three-act plan from the Showrunner), which act is live,
 * its objectives, and any planned death awaiting the Editor. Persisted in data/issue.json.
 * The Director acts inside this; the Showrunner replaces it when an issue ends.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Objective } from "../../shared/events.js";
import { CONFIG } from "./config.js";

export const ArcAct = z.object({
  title: z.string().max(60),
  location: z.string().optional().describe("map id if this act happens somewhere else; everyone on stage travels there as the act opens"),
  goal: z.string().max(240).describe("what this act is for dramatically"),
  objectives: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), text: z.string().max(120) })).min(1).max(3)
    .describe("concrete, observable things the Director can mark done; the act ends when all are done or failed"),
  setPiece: z.string().max(200).describe("the one image this act is built around"),
  arrivals: z.array(z.object({ who: z.string(), at: z.string(), cue: z.string().max(120) })).max(3)
    .describe("cast members who enter during this act, where, and on what cue"),
});
export const PlannedDeath = z.object({
  who: z.string(),
  act: z.number().int().min(1).max(3),
  mechanism: z.string().max(200),
  justification: z.string().max(300),
});
export const IssuePlan = z.object({
  title: z.string().max(60),
  subtitle: z.string().max(120),
  premise: z.string().max(900),
  antagonist: z.string().describe("character id"),
  location: z.string().describe("map id where the issue opens (from LOCATIONS)"),
  cast: z.array(z.string()).min(2).max(6).describe("character ids in this issue, including the antagonist"),
  opening: z.array(z.object({ who: z.string(), at: z.string() })).min(1).max(4).describe("who is on stage when the issue opens, and where"),
  opensAfterGameHours: z.number().min(0).max(72).describe("game time between the previous issue and this one"),
  acts: z.array(ArcAct).length(3),
  plannedDeath: PlannedDeath.optional().describe("only when the story truly earns it; held for the Editor's approval"),
  nextHooks: z.array(z.string().max(160)).max(3).describe("threads deliberately left for a later issue"),
});
export type IssuePlan = z.infer<typeof IssuePlan>;

export interface PendingDeath extends z.infer<typeof PlannedDeath> {
  issue: number;
  submittedAt: number;
  status: "pending" | "approved" | "vetoed";
}

interface Persisted {
  number: number;
  plan: IssuePlan;
  actIndex: number;
  objectives: Objective[][];
  chunksInAct: number;
  pendingDeath?: PendingDeath;
  startedAtGameMs: number;
}

/** Acts auto-advance after this many Director chunks if objectives stall. */
export const MAX_CHUNKS_PER_ACT = Number(process.env.MAX_CHUNKS_PER_ACT ?? 16);
const VETO_WINDOW_MS = 24 * 3_600_000;

export class Story {
  number = 0;
  plan!: IssuePlan;
  actIndex = 0;
  objectives: Objective[][] = [];
  chunksInAct = 0;
  pendingDeath?: PendingDeath;
  startedAtGameMs = 0;
  private file = path.join(CONFIG.dataDir, "issue.json");

  get act() { return this.plan.acts[this.actIndex]!; }
  get actObjectives() { return this.objectives[this.actIndex]!; }
  get loaded() { return this.number > 0; }
  get finished() { return this.actIndex >= this.plan.acts.length; }

  load(): boolean {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, "utf8")) as Persisted;
      this.number = p.number; this.plan = p.plan; this.actIndex = p.actIndex; this.objectives = p.objectives;
      this.chunksInAct = p.chunksInAct; this.pendingDeath = p.pendingDeath; this.startedAtGameMs = p.startedAtGameMs;
      return true;
    } catch { return false; }
  }
  save() {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    const p: Persisted = { number: this.number, plan: this.plan, actIndex: this.actIndex, objectives: this.objectives, chunksInAct: this.chunksInAct, pendingDeath: this.pendingDeath, startedAtGameMs: this.startedAtGameMs };
    fs.writeFileSync(this.file, JSON.stringify(p, null, 2));
  }

  begin(number: number, plan: IssuePlan, gameMs: number) {
    this.number = number; this.plan = plan; this.actIndex = 0; this.chunksInAct = 0; this.startedAtGameMs = gameMs;
    this.objectives = plan.acts.map((a) => a.objectives.map((o) => ({ id: o.id, text: o.text, status: "open" as const })));
    this.pendingDeath = plan.plannedDeath ? { ...plan.plannedDeath, issue: number, submittedAt: Date.now(), status: "pending" } : undefined;
    this.save();
  }

  /** Mark an objective; returns the objective or an error string. */
  mark(id: string, status: "done" | "failed"): Objective | string {
    const o = this.actObjectives.find((x) => x.id === id);
    if (!o) return `no objective "${id}" in the current act; open: ${this.actObjectives.filter((x) => x.status === "open").map((x) => x.id).join(", ") || "none"}`;
    if (o.status !== "open") return `objective "${id}" is already ${o.status}`;
    o.status = status; this.save();
    return o;
  }

  /** Should the act advance? Returns a reason or null. Caller emits the next act. */
  advanceReason(): string | null {
    if (this.finished) return null;
    if (this.actObjectives.every((o) => o.status !== "open")) return "objectives complete";
    if (this.chunksInAct >= MAX_CHUNKS_PER_ACT) return "act ran long; moving on";
    return null;
  }

  /** The final act waits on a pending death decision (24h veto window; approval by default after). */
  deathHold(): string | null {
    const d = this.pendingDeath;
    if (!d || d.status !== "pending") return null;
    if (Date.now() - d.submittedAt > VETO_WINDOW_MS) { d.status = "approved"; this.save(); return null; }
    if (this.actIndex + 1 >= 2) return `act 3 is held: the planned death of ${d.who} awaits the Editor (approve or veto on the Desk)`;
    return null;
  }

  advance() { this.actIndex++; this.chunksInAct = 0; this.save(); }

  /** Is a death beat for `who` allowed right now? */
  deathAllowed(who: string): string | null {
    const d = this.pendingDeath;
    if (!d || d.who !== who) return `no planned death for ${who}; deaths are Showrunner-planned and Editor-approved only`;
    if (d.status === "vetoed") return `the Editor vetoed the death of ${who}`;
    if (d.status === "pending") return `the death of ${who} is still awaiting the Editor`;
    if (this.actIndex + 1 < d.act) return `the death of ${who} is planned for act ${d.act}`;
    return null;
  }

  decideDeath(status: "approved" | "vetoed") { if (this.pendingDeath) { this.pendingDeath.status = status; this.save(); } }
}

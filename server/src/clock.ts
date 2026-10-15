/**
 * The world clock. Game time advances at 6x while someone is watching and follows a
 * grace-then-taper curve for time spent away (canon/world/rules.md §1.2).
 */
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export const WATCH_RATIO = 6;                 // 1 game-hour per 10 real minutes
export const GRACE_MS = 30 * MIN;             // reloads and short breaks cost nothing
export const LINEAR_MS = 6 * HOUR;            // after grace: 1:1 for this much game time
export const TAPER = 0.25;                    // then a quarter rate
export const CAP_MS = 7 * DAY;                // never more than a game-week per absence

/** Game time that passes for a given real absence. Pure; see test in clock.test.ts. */
export function gameTimeForAbsence(realMs: number): number {
  if (realMs <= GRACE_MS) return 0;
  const past = realMs - GRACE_MS;
  const linear = Math.min(past, LINEAR_MS);
  const tapered = Math.max(0, past - LINEAR_MS) * TAPER;
  return Math.min(CAP_MS, linear + tapered);
}

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

export function timeOfDayFor(gameMs: number): TimeOfDay {
  const h = new Date(gameMs).getUTCHours();
  if (h === 6) return "dawn";
  if (h >= 7 && h < 19) return "day";
  if (h === 19) return "dusk";
  return "night";
}

/** "11:48 PM, Wed Oct 14" in game time. Game time is kept in UTC; it is its own timezone. */
export function formatGameTime(gameMs: number): string {
  const d = new Date(gameMs);
  const h24 = d.getUTCHours(), m = d.getUTCMinutes();
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? "AM" : "PM";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}, ${day} ${mon} ${d.getUTCDate()}`;
}

export function describeDuration(ms: number): string {
  if (ms < HOUR) return `${Math.round(ms / MIN)} minutes`;
  if (ms < DAY) return `${(ms / HOUR).toFixed(1).replace(/\.0$/, "")} hours`;
  return `${(ms / DAY).toFixed(1).replace(/\.0$/, "")} days`;
}

interface Persisted { gameMs: number; lastSeenAt: number; sceneLocked: boolean }

export class Clock {
  gameMs: number;
  private lastSeenAt: number;
  private lastTick = Date.now();
  /** Set while a fight or set-piece is in progress; absences then cost no time (scene lock). */
  sceneLocked = false;
  private file = path.join(CONFIG.dataDir, "clock.json");

  constructor(startGameMs: number) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    const saved = this.load();
    this.gameMs = saved?.gameMs ?? startGameMs;
    this.lastSeenAt = saved?.lastSeenAt ?? Date.now();
    this.sceneLocked = saved?.sceneLocked ?? false;
  }

  private load(): Persisted | null {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return null; }
  }
  save() {
    fs.writeFileSync(this.file, JSON.stringify({ gameMs: this.gameMs, lastSeenAt: this.lastSeenAt, sceneLocked: this.sceneLocked } satisfies Persisted));
  }

  /**
   * Called when a viewer arrives after the world was unwatched. Returns how much game
   * time passed (0 for short absences or when scene-locked) so the caller can run catch-up.
   */
  resume(now = Date.now()): { awayMs: number; passedMs: number } {
    const awayMs = Math.max(0, now - this.lastSeenAt);
    const passedMs = this.sceneLocked ? 0 : gameTimeForAbsence(awayMs);
    this.gameMs += passedMs;
    this.lastSeenAt = now;
    this.lastTick = now;
    this.save();
    return { awayMs, passedMs };
  }

  /** Advance at the watching ratio. Call every second or so while viewers > 0. */
  tick(now = Date.now()) {
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.gameMs += dt * WATCH_RATIO;
    this.lastSeenAt = now;
  }

  /** Called when the last viewer leaves. */
  pause(now = Date.now()) { this.lastSeenAt = now; this.save(); }

  get timeOfDay(): TimeOfDay { return timeOfDayFor(this.gameMs); }
  get label(): string { return formatGameTime(this.gameMs); }
}

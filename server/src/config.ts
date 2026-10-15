import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Project root: the nearest ancestor with a package.json. Works from server/src (dev) and dist/server/src (prod). */
function findRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
export const ROOT = process.env.APP_ROOT ?? findRoot(path.dirname(fileURLToPath(import.meta.url)));

export const CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: path.join(ROOT, "data"),
  canonDir: path.join(ROOT, "canon"),
  inboxDir: path.join(ROOT, "inbox"),
  clientDist: path.join(ROOT, "dist/client"),

  /** Bullpen model assignments. Showrunner (Phase 3) will use the strongest tier. */
  directorModel: process.env.DIRECTOR_MODEL ?? "claude-opus-5-5",
  directorEffort: (process.env.DIRECTOR_EFFORT ?? "medium") as "low" | "medium" | "high",
  continuityModel: process.env.CONTINUITY_MODEL ?? "claude-haiku-5-5",
  /** Showrunner plans an issue once per issue: strongest tier, high effort. */
  showrunnerModel: process.env.SHOWRUNNER_MODEL ?? "claude-opus-5-5",
  /** Archivist closes an issue: summary, relationships, facts, threads. */
  archivistModel: process.env.ARCHIVIST_MODEL ?? "claude-sonnet-5-5",
  /** Tactician picks every combatant's move each round; fast tier, low effort, one call per round. */
  tacticianModel: process.env.TACTICIAN_MODEL ?? "claude-sonnet-5-5",
  /** "rules" = deterministic checks only; "llm" = rules + Continuity Editor model pass. */
  continuityMode: (process.env.CONTINUITY ?? "rules") as "rules" | "llm",
  /** Force scripted beats even if credentials exist. */
  mock: process.env.MOCK === "1",

  /** Generate the next chunk when the client has less than this much playback queued. */
  leadMs: Number(process.env.LEAD_MS ?? 25_000),
  /** Never call the Director more often than this. */
  minCallGapMs: Number(process.env.MIN_CALL_GAP_MS ?? 8_000),
  /** Transcript lines handed to the Director. */
  transcriptWindow: 48,
  /** World RNG seed. Same seed + same beats = same fight outcomes. */
  seed: Number(process.env.SEED ?? 616),
};

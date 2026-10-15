import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONFIG } from "./config.js";

export const MoveSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["light", "heavy", "ranged", "control", "defense", "mobility", "utility", "rescue", "ultimate"]),
  power: z.number().int().min(0).max(10),
  cost: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()).optional(),
});
export type Move = z.infer<typeof MoveSchema>;

export const StatsSchema = z.object({
  id: z.string(),
  name: z.string(),
  civilianName: z.string().optional(),
  role: z.enum(["hero", "villain", "antihero", "supporting"]),
  tier: z.enum(["street", "city", "world", "cosmic"]),
  grid: z.object({ int: z.number(), str: z.number(), spd: z.number(), dur: z.number(), nrg: z.number(), fgt: z.number() }),
  traits: z.array(z.string()),
  moves: z.array(MoveSchema),
  palette: z.object({ primary: z.string(), secondary: z.string(), accent: z.string() }),
  homeLocation: z.string(),
  factions: z.record(z.string(), z.number()).optional(),
  resources: z.record(z.string(), z.number().int()).optional(),
  leitmotif: z.string().optional(),
  universe: z.string().default("616"),
});
export type Stats = z.infer<typeof StatsSchema>;

export interface Character {
  id: string;
  stats: Stats;
  bible: string;
}

export function loadCharacter(id: string): Character | null {
  const dir = path.join(CONFIG.canonDir, "characters", id);
  const statsPath = path.join(dir, "stats.json");
  const biblePath = path.join(dir, "bible.md");
  if (!fs.existsSync(statsPath) || !fs.existsSync(biblePath)) return null;
  const stats = StatsSchema.parse(JSON.parse(fs.readFileSync(statsPath, "utf8")));
  const bible = fs.readFileSync(biblePath, "utf8");
  return { id, stats, bible };
}

export function listCharacterIds(): string[] {
  const dir = path.join(CONFIG.canonDir, "characters");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "stats.json"))).sort();
}

export function loadWorldDoc(name: string): string {
  const p = path.join(CONFIG.canonDir, "world", name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

/** Editor's Desk inbox: every .md/.txt file under inbox/ is a note to the Bullpen. */
export function readInbox(): string[] {
  if (!fs.existsSync(CONFIG.inboxDir)) return [];
  return fs
    .readdirSync(CONFIG.inboxDir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(CONFIG.inboxDir, f), "utf8").trim())
    .filter((s) => s.length > 0);
}

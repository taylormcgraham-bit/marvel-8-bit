/**
 * Roster requests: "add Moon Knight" on the Desk becomes a drafted bible and stats file
 * under canon/characters/<slug>/ with a pending marker. The Editor approves (marker removed,
 * character enters the roster) or rejects (folder deleted). The draft follows the Spider-Man
 * bible format; the Archivist model writes it in live mode, a labeled stub otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONFIG } from "../config.js";
import { loadCharacter } from "../canon.js";

const Draft = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).describe("folder slug, e.g. moon-knight"),
  name: z.string().max(40),
  civilianName: z.string().max(60).optional(),
  role: z.enum(["hero", "villain", "antihero", "supporting"]),
  tier: z.enum(["street", "city", "world", "cosmic"]),
  grid: z.object({ int: z.number().int().min(1).max(7), str: z.number().int().min(1).max(7), spd: z.number().int().min(1).max(7), dur: z.number().int().min(1).max(7), nrg: z.number().int().min(1).max(7), fgt: z.number().int().min(1).max(7) }),
  traits: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(3).max(14),
  moves: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().max(40),
    kind: z.enum(["light", "heavy", "ranged", "control", "defense", "mobility", "utility", "rescue", "ultimate"]),
    power: z.number().int().min(0).max(10), cost: z.string().max(40).optional(), description: z.string().max(160), tags: z.array(z.string()).max(4).optional(),
  })).min(6).max(12),
  palette: z.object({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/), secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  homeLocation: z.string().max(40),
  factions: z.array(z.object({ faction: z.enum(["public-opinion", "nypd", "shield", "daily-bugle", "hellfire-club", "hydra", "latveria", "asgard", "wakanda", "kingpin-org"]), value: z.number().int().min(-100).max(100) })).max(10),
  resources: z.array(z.object({ name: z.string().regex(/^[a-z0-9-]+$/), value: z.number().int().min(0) })).max(6),
  look: z.object({
    build: z.enum(["lean", "normal", "bulky", "huge"]), head: z.enum(["full-mask", "cowl", "helmet", "face", "hood", "skull", "horned-helm"]),
    cape: z.boolean(), emblem: z.boolean(), twoTone: z.boolean(), skin: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), hair: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    props: z.array(z.enum(["shield", "hammer", "tentacles", "cane", "club", "satchel"])).max(2),
  }),
  leitmotif: z.string().max(160),
  bible: z.string().min(2000).describe("the full bible.md in the exact 12-section format of the reference, 1500-2500 words"),
});
export type Draft = z.infer<typeof Draft>;

export interface PendingDraft { id: string; name: string; requestedAs: string; createdAt: number; mode: "live" | "stub" }

const pendingPath = (id: string) => path.join(CONFIG.canonDir, "characters", id, "pending.json");

export function listPending(): PendingDraft[] {
  const dir = path.join(CONFIG.canonDir, "characters");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => fs.existsSync(pendingPath(d))).map((d) => JSON.parse(fs.readFileSync(pendingPath(d), "utf8")));
}
export function isPending(id: string) { return fs.existsSync(pendingPath(id)); }
export function approve(id: string) { try { fs.unlinkSync(pendingPath(id)); return true; } catch { return false; } }
export function reject(id: string) { if (!isPending(id)) return false; fs.rmSync(path.join(CONFIG.canonDir, "characters", id), { recursive: true, force: true }); return true; }

function writeDraft(d: Draft, requestedAs: string, mode: "live" | "stub") {
  const dir = path.join(CONFIG.canonDir, "characters", d.id);
  fs.mkdirSync(dir, { recursive: true });
  const stats = {
    id: d.id, name: d.name, civilianName: d.civilianName, role: d.role, tier: d.tier, grid: d.grid, traits: d.traits, moves: d.moves,
    palette: d.palette, homeLocation: d.homeLocation,
    factions: Object.fromEntries(d.factions.map((f) => [f.faction, f.value])),
    resources: Object.fromEntries(d.resources.map((r) => [r.name, r.value])),
    leitmotif: d.leitmotif, universe: "616", look: d.look,
  };
  fs.writeFileSync(path.join(dir, "stats.json"), JSON.stringify(stats, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "bible.md"), d.bible.trim() + "\n");
  const pending: PendingDraft = { id: d.id, name: d.name, requestedAs, createdAt: Date.now(), mode };
  fs.writeFileSync(pendingPath(d.id), JSON.stringify(pending, null, 2));
  return pending;
}

export class RosterDrafter {
  private client = new Anthropic();
  async draft(request: string): Promise<PendingDraft> {
    const ref = loadCharacter("spider-man")!;
    const res = await this.client.beta.messages.parse({
      model: CONFIG.showrunnerModel,
      max_tokens: 12000,
      system: [
        { type: "text", text: "You are the ARCHIVIST of a canon-faithful (Earth-616) Marvel game. Draft a new character for the roster: a full bible in the exact 12-section format of the reference, plus engine stats. Canon facts only; mark contested canon as [current] choices. Powers table with limits and costs; weaknesses as exploitable patterns; 4 sample lines and a would-never-say list; relationships across the existing roster; arc seeds; game notes with a 1-7 power grid, kebab-case traits, 6-12 moves and should-never-happen rules. Pick a NES-style palette matching the costume and a look (build, head type, cape, props) for the rig." },
        { type: "text", text: `REFERENCE BIBLE (format to match exactly):\n\n${ref.bible}\n\nREFERENCE STATS:\n${JSON.stringify(ref.stats, null, 2)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `Draft: ${request}\n\nExisting roster ids for the relationships table: ${fs.readdirSync(path.join(CONFIG.canonDir, "characters")).join(", ")}.` }],
      output_config: { effort: "high", format: betaZodOutputFormat(Draft) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("draft unavailable");
    return writeDraft(res.parsed_output, request, "live");
  }
}

/** No-credentials stand-in: a clearly labeled stub so the approve/reject flow can be exercised. */
export function draftStub(request: string): PendingDraft {
  const name = request.trim().replace(/^add\s+/i, "").replace(/\.$/, "");
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "new-character";
  const sections = ["1. Identity and summary", "2. Origin", "3. Powers and abilities", "4. Weaknesses and exploitable patterns", "5. Personality", "6. Voice", "7. Relationships", "8. Rogues gallery", "9. Home turf and haunts", "10. Daily life", "11. Arc seeds", "12. Game notes"];
  const bible = `# ${name}\n\n> STUB DRAFT. Generated without model credentials so the roster flow could be exercised. Replace with a real bible before approving.\n\n` + sections.map((s) => `## ${s} [fixed]\n\n(To be written: ${s.toLowerCase()} for ${name}, in the format of canon/characters/spider-man/bible.md.)\n`).join("\n") + "\n" + "Lorem ".repeat(400);
  const d: Draft = {
    id, name, role: "hero", tier: "street", grid: { int: 3, str: 3, spd: 3, dur: 3, nrg: 1, fgt: 4 }, traits: ["no-kill-code", "secret-identity", "protects-civilians-first"],
    moves: [
      { id: "jab", name: "Jab", kind: "light", power: 3, description: "Quick strike." }, { id: "cross", name: "Cross", kind: "heavy", power: 6, cost: "stamina:3", description: "Full-weight punch." },
      { id: "throw", name: "Throw", kind: "control", power: 3, description: "Takes a foe off their feet." }, { id: "guard", name: "Guard", kind: "defense", power: 0, description: "Blocks the next hit." },
      { id: "dash", name: "Dash", kind: "mobility", power: 0, description: "Closes distance fast." }, { id: "rescue", name: "Rescue", kind: "rescue", power: 0, description: "Pulls a civilian clear." },
    ],
    palette: { primary: "#f8f8f8", secondary: "#202028", accent: "#c0c0c8" }, homeLocation: "midtown-manhattan", factions: [{ faction: "public-opinion", value: 0 }], resources: [],
    look: { build: "normal", head: "cowl", cape: true, emblem: false, twoTone: false, props: [] }, leitmotif: "To be composed.", bible,
  };
  return writeDraft(d, request, "stub");
}

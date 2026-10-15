/**
 * Showrunner: plans an issue as a three-act arc with objectives, set-pieces and arrivals,
 * reading the Chronicle, long-term memory, the roster and the Editor's notes. Strongest
 * model, highest effort, called once per issue.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CONFIG } from "../config.js";
import { listCharacterIds, loadCharacter, readInbox, loadWorldDoc } from "../canon.js";
import { IssuePlan } from "../story.js";
import type { Memory } from "../memory.js";
import type { World } from "../world.js";
import type { MapDef } from "../../../shared/maps.js";

const ROLE = `You are the SHOWRUNNER in the Bullpen of a private, AI-played Marvel game. You plan the next ISSUE: a three-act story that the Scene Director will stage beat by beat and the Tactician will fight round by round. You do not write dialogue. You design structure, stakes, and the one image each act is built around.

WHAT MAKES A GOOD ISSUE HERE
- It is a game. Acts have concrete OBJECTIVES the Director can observably complete ("Spider-Man gets Goblin away from the ledge", "Daredevil learns what Norman wants"), not moods.
- Three acts: setup with a hook, escalation with a reversal, climax with a set-piece and a cost. Act 3 should put a fight on screen worth the HP it costs.
- Continuity is sacred. Read the Chronicle and memory. Injuries carry over. Threads pay off or deepen. Characters know only what they learned on-panel.
- Canon voice. Pick antagonists whose schemes fit their bible. Villains are competent; they want something specific and usually get part of it.
- Cast small: 2 to 5 characters on one map. Arrivals mid-issue are a tool; use them for a turn.
- Editor's notes are the Editor-in-Chief's wishes. Weave them in; never obey them literally if that would break the story.
- Deaths: only if the story has truly earned it, never casually, and know it will be held for the Editor's approval. Most issues have none.
- Every issue leaves one or two hooks for later. Give it a title that would look right on a cover.

LOCATION: only one map exists today (chelsea-rooftop). Stage everything there; arrivals land at its markers.

OUTPUT: a single JSON object matching the schema.`;

export class Showrunner {
  private client = new Anthropic();

  private roster(): string {
    return listCharacterIds().map((id) => {
      const c = loadCharacter(id)!;
      const line = c.bible.split("\n").find((l) => l.startsWith("One-line pitch")) ?? c.bible.split(/\n## 2/)[0]!.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">")).slice(-1)[0] ?? "";
      return `- ${id} (${c.stats.name}, ${c.stats.role}, ${c.stats.tier}-tier): ${line.trim().slice(0, 200)}`;
    }).join("\n");
  }

  async plan(world: World, memory: Memory, map: MapDef, nextNumber: number): Promise<IssuePlan> {
    const notes = readInbox();
    const rules = loadWorldDoc("rules.md");
    const onStage = [...world.actors.values()].map((a) => `${a.name} (${a.id}): HP ${a.hp}/${a.maxHp}${a.injuries.length ? ", injuries: " + a.injuries.map((i) => i.name).join(", ") : ""}`).join("\n") || "(empty stage)";
    const res = await this.client.beta.messages.parse({
      model: CONFIG.showrunnerModel,
      max_tokens: 6000,
      system: [
        { type: "text", text: ROLE },
        { type: "text", text: `HOUSE RULES (death policy, knowledge model, off-panel limits):\n\n${rules.slice(0, 20000)}`, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: `ROSTER:\n${this.roster()}\n\nMAP ${map.id} MARKERS: ${map.markers.map((m) => `${m.id} (${m.desc})`).join("; ")}` },
      ],
      messages: [{
        role: "user",
        content: `Plan ISSUE #${nextNumber}. Game time now: ${world.clock.label}.

ON STAGE / CONDITION:
${onStage}

CHRONICLE (previous issues):
${memory.describeIssues()}

MEMORY:
${memory.describe()}

${notes.length ? `EDITOR'S NOTES:\n${notes.map((n) => "- " + n.replace(/\n+/g, " ")).join("\n")}` : "EDITOR'S NOTES: (none)"}

Use character ids exactly as listed in the roster. Opening cast must be on the map at markers.`,
      }],
      output_config: { effort: "high", format: betaZodOutputFormat(IssuePlan) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new Error(`Showrunner refused: ${res.stop_details?.explanation ?? ""}`);
    if (!res.parsed_output) throw new Error(`Showrunner returned unparseable output (${res.stop_reason})`);
    return res.parsed_output;
  }
}

/** Issue #1 as a plan, and a rotating generic plan for later issues when running without credentials. */
export class MockShowrunner {
  plan(world: World, _memory: Memory, _map: MapDef, nextNumber: number): IssuePlan {
    const ids = listCharacterIds();
    const villains = ids.filter((id) => loadCharacter(id)!.stats.role === "villain");
    const heroes = ids.filter((id) => loadCharacter(id)!.stats.role === "hero");
    if (nextNumber === 1 || !villains.length) return ISSUE_ONE_PLAN;
    const v = villains[(nextNumber - 1) % villains.length]!;
    const h1 = heroes[(nextNumber - 1) % heroes.length]!, h2 = heroes[(nextNumber + 2) % heroes.length]!;
    const vn = loadCharacter(v)!.stats.name, h1n = loadCharacter(h1)!.stats.name, h2n = loadCharacter(h2)!.stats.name;
    void world;
    return {
      title: `${vn} Rising`, subtitle: `${h1n} alone. ${h2n} late. ${vn} ready.`,
      premise: `${vn} has come to the Chelsea rooftop with a plan and a grudge. ${h1n} is the only one there to stop it; ${h2n} is on the way.`,
      antagonist: v, cast: [h1, h2, v], opening: [{ who: h1, at: "water-tower" }, { who: v, at: "ledge-north" }], opensAfterGameHours: 6,
      acts: [
        { title: "Arrival", goal: `${vn} states the terms; ${h1n} refuses.`, objectives: [{ id: "learn-terms", text: `${h1n} learns what ${vn} wants` }], setPiece: `${vn} on the parapet, lit from below`, arrivals: [] },
        { title: "Reinforcements", goal: `${h2n} arrives; the fight turns.`, objectives: [{ id: "ally-arrives", text: `${h2n} enters the fight` }, { id: "first-blood", text: `someone lands a serious hit` }], setPiece: "two heroes, one villain, a cracked skylight", arrivals: [{ who: h2, at: "ledge-east", cue: `when ${h1n} is in trouble` }] },
        { title: "The Cost", goal: `${vn} gets part of what they came for and leaves; the heroes count the cost.`, objectives: [{ id: "villain-exits", text: `${vn} leaves the rooftop, defeated or satisfied` }], setPiece: "the rooftop after, dawn coming", arrivals: [] },
      ],
      nextHooks: [`${vn} got something tonight; what was it?`],
    };
  }
}

export const ISSUE_ONE_PLAN: IssuePlan = {
  title: "Night of the Goblin",
  subtitle: "A Chelsea rooftop. Three web cartridges. One old enemy.",
  premise: "Spider-Man is decompressing on his water-tower rooftop after a long night when the Green Goblin arrives, not to fight at first, but to talk: Norman has learned something about Harry he wants Peter to hear, and he enjoys the leverage. It goes bad the way it always does. Daredevil, patrolling two blocks over, hears the fight.",
  antagonist: "green-goblin",
  cast: ["spider-man", "green-goblin", "daredevil"],
  opening: [{ who: "spider-man", at: "water-tower" }, { who: "green-goblin", at: "ledge-north" }],
  opensAfterGameHours: 0,
  acts: [
    { title: "The Visit", goal: "Norman arrives to talk, not fight. He has leverage about Harry and enjoys it. Peter has to decide whether to listen.", objectives: [{ id: "hear-him-out", text: "Spider-Man learns what Norman claims to know about Harry" }], setPiece: "the Goblin perched on the north parapet, glider idling, Spider-Man refusing to come closer", arrivals: [] },
    { title: "The Price", goal: "Talking turns to blows. Goblin tests Peter; Daredevil hears it from two blocks away.", objectives: [{ id: "keep-him-off-the-street", text: "Spider-Man keeps the Goblin away from the street below" }, { id: "daredevil-arrives", text: "Daredevil enters the fight" }], setPiece: "Goblin over the ledge, Spider-Man's web the only thing between a bomb and the avenue", arrivals: [{ who: "daredevil", at: "ledge-east", cue: "when the first bomb goes off" }] },
    { title: "What Norman Wants", goal: "The real ask surfaces; Goblin leaves on his own terms or is driven off, and Peter is left with the question about Harry.", objectives: [{ id: "find-out-what-he-wants", text: "the heroes find out what Norman actually wants" }, { id: "goblin-exits", text: "the Goblin leaves the rooftop" }], setPiece: "Goblin rising into the dark over the avenue, one last line, Peter and Matt on the gravel", arrivals: [] },
  ],
  nextHooks: ["Is Norman telling the truth about Harry?", "Daredevil heard something in Norman's heartbeat."],
};

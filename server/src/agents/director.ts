/**
 * Scene Director: given the stage, the bibles of everyone present, and the recent
 * transcript, proposes the next 3-10 beats. Structured output, validated by the engine.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SceneChunk } from "../../../shared/events.js";
import { CONFIG } from "../config.js";
import { readInbox, loadWorldDoc } from "../canon.js";
import type { World } from "../world.js";
import type { Rejection } from "../engine.js";
import type { Story } from "../story.js";
import type { Memory } from "../memory.js";
import type { Sim } from "../sim.js";
import { MAPS } from "../../../shared/maps.js";

const ROLE = `You are the SCENE DIRECTOR in the Bullpen of a private, AI-played Marvel video game rendered as an 8-bit RPG.
You do not narrate. You direct: you tell the engine what each character does and says next, as a short list of beats.
The engine validates every beat against the rules and the world state and plays the ones it accepts.

PRINCIPLES
- This is a GAME, not a show. Characters move around the map, take positions, fight with specific moves, run out of resources, get hurt, and act on objectives. Make them use the space: markers are real places.
- Depth like a modern console game, look like an NES game. Dialogue is sharp and in-voice; every character bible below is canon. Never break voice. Never reference knowledge a character does not have.
- Pacing. Alternate talk and action. A quiet beat (face, emote, wait) before a big line lands harder. Fights should breathe: strike, reaction line, reposition, strike.
- Consistency is sacred. Injuries persist. Resources deplete. Nobody knows a secret identity unless the bible says they do. Dead stays dead; nobody dies here anyway (0 HP is knocked out).
- Keep each say beat under 120 characters. Split long speeches into several beats, with reactions between them.
- Use captions sparingly, comic-style, for time or place jumps: "MEANWHILE...", "TWO MINUTES LATER...".
- For a real exchange of blows use a FIGHT beat: two sides, a round cap (2-6 is typical), and one line of stakes. The Tactician then plays every round in character and the engine rolls outcomes; you pick the scene back up afterward from the transcript. Use a single STRIKE beat only for a sucker punch, a warning shot, or one decisive blow.
- A strike must name a move id from the attacker's move list and the attacker must be within ~3 tiles for melee. Move first, then strike.
- Injuries, stamina and resources in ON STAGE are real and persist. A winded or hurt character fights worse and should act like it. Someone at 0 web fluid cannot web.
- Do not resolve outcomes yourself. Never write "and hits" or "knocks him down" in dialogue before the engine has resolved it; react to the transcript's actual outcomes instead.
- You are staging ONE ACT of a planned issue. The act has a goal, a set-piece and OBJECTIVES. Work toward them; when one is visibly achieved, emit an objective beat marking it done (or failed). The act ends when all objectives are resolved, and the next act's plan is handed to you.
- Cast listed as OFF STAGE may enter with an enter beat at a marker when their cue comes. Characters may leave with an exit beat. Nobody dies unless a death beat is explicitly permitted below.
- The stage can move: a travel beat takes the listed characters to another LOCATION (the others stay behind and leave the stage). Travel costs game time. Use it when the act plan says so or the story clearly needs it; put a caption before it.
- Weather and standings are real: rain makes rooftops slick and crowds thin; a hero the public is wary of gets filmed, not cheered.
- End each chunk at a natural hinge so the next chunk can pick up. Use sceneNote to tell your future self what you are building toward.

OUTPUT: a single JSON object matching the provided schema: { sceneNote, beats[] }.`;

export interface DirectorInput {
  world: World;
  rejections: Rejection[];
  story?: Story;
  memory?: Memory;
  sim?: Sim;
}

export interface DirectorResult {
  chunk: SceneChunk;
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number };
  model: string;
}

export class Director {
  private client = new Anthropic();

  /** System prompt: stable per scene so the bibles cache. Volatile state goes in the user turn. */
  private system(world: World): Anthropic.Beta.BetaTextBlockParam[] {
    const bibles = [...world.actors.values()]
      .map((a) => `<bible id="${a.id}">\n${a.character.bible}\n</bible>`)
      .join("\n\n");
    const moves = [...world.actors.values()]
      .map((a) => `${a.name} (${a.id}) moves: ${a.character.stats.moves.map((m) => `${m.id} [${m.kind}, p${m.power}${m.cost ? ", " + m.cost : ""}]`).join("; ")}`)
      .join("\n");
    const rules = loadWorldDoc("rules.md");
    const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: ROLE }];
    if (rules) blocks.push({ type: "text", text: `WORLD HOUSE RULES (the engine enforces these; direct within them):\n\n${rules}` });
    return [
      ...blocks,
      { type: "text", text: `CHARACTER BIBLES (canon; fixed facts are law):\n\n${bibles}` },
      { type: "text", text: `MOVE LISTS:\n${moves}`, cache_control: { type: "ephemeral", ttl: "1h" } },
    ];
  }

  private userTurn(input: DirectorInput): string {
    const { world, rejections } = input;
    const stage = world.map.markers.map((m) => `- ${m.id} (${m.x},${m.y}): ${m.desc}`).join("\n");
    const elsewhere = [...world.actors.values()].filter((a) => a.location !== world.map.id).map((a) => `- ${a.name} (${a.id}): at ${MAPS[a.location]?.name ?? a.location}`).join("\n");
    const locations = Object.values(MAPS).filter((m) => m.id !== world.map.id).map((m) => `- ${m.id}: ${m.name}`).join("\n");
    const actors = world.stage().map((a) => {
      const near = world.map.markers
        .map((m) => ({ id: m.id, d: Math.hypot(m.x - a.x, m.y - a.y) }))
        .sort((p, q) => p.d - q.d)[0]!;
      const res = Object.entries(a.resources).map(([k, v]) => `${k}=${v}`).join(", ");
      const inj = a.injuries.map((i) => `${i.name} (sev ${i.severity})`).join(", ");
      return `- ${a.name} (${a.id}): at ${near.id} (${a.x},${a.y}), facing ${a.facing}, HP ${a.hp}/${a.maxHp}, stamina ${a.stamina}/${a.maxStamina}${res ? ", " + res : ""}${inj ? ", injuries: " + inj : ""}${a.hp <= 0 ? " [KNOCKED OUT]" : ""}`;
    }).join("\n");
    const transcript = world.transcript(CONFIG.transcriptWindow).join("\n") || "(nothing yet; the scene is about to begin)";
    const notes = readInbox();
    const rej = rejections.length
      ? `\nTHE ENGINE REJECTED THESE BEATS FROM YOUR LAST ATTEMPT (do not repeat them; adjust):\n${rejections.map((r) => `- ${JSON.stringify(r.beat)} -> ${r.reason}`).join("\n")}\n`
      : "";
    const story = input.story;
    const storyBlock = story?.loaded ? `ISSUE #${story.number}: ${story.plan.title}
PREMISE: ${story.plan.premise}

CURRENT ACT ${story.actIndex + 1} of 3: "${story.act.title}"
ACT GOAL: ${story.act.goal}
SET-PIECE TO BUILD TOWARD: ${story.act.setPiece}
OBJECTIVES:
${story.actObjectives.map((o) => `- [${o.status}] ${o.id}: ${o.text}`).join("\n")}
${story.act.arrivals.length ? `PLANNED ARRIVALS THIS ACT:\n${story.act.arrivals.map((a) => `- ${a.who} at ${a.at}, cue: ${a.cue}`).join("\n")}` : ""}
OFF STAGE (may enter): ${story.plan.cast.filter((id) => !world.actors.has(id) && !world.deceased.has(id)).join(", ") || "nobody"}
${story.pendingDeath?.status === "approved" && story.actIndex + 1 >= story.pendingDeath.act ? `A DEATH IS PERMITTED THIS ACT: ${story.pendingDeath.who}, by ${story.pendingDeath.mechanism}. Earn it; use a death beat only at the climax.` : ""}
${input.memory ? `
${input.memory.describe(story.plan.cast)}
` : ""}` : `ISSUE #${world.issue.number}: ${world.issue.title}
PREMISE: ${world.issue.premise}
`;
    return `${storyBlock}

LOCATION: ${world.map.name} (${world.map.id}). GAME TIME: ${world.clock.label} (${world.timeOfDay}). WEATHER: ${world.weather}. ${world.map.flavor}
MARKERS:
${stage}

ON STAGE:
${actors || "(nobody)"}
${elsewhere ? `\nELSEWHERE (not on stage; enter brings them here, travel takes the stage to them):\n${elsewhere}\n` : ""}
OTHER LOCATIONS (travel beat):
${locations}
${input.sim ? `\n${input.sim.describe([...world.actors.keys()])}\n` : ""}
YOUR LAST SCENE NOTE: ${world.issue.sceneNote || "(none)"}
${notes.length ? `\nEDITOR'S NOTES (from the Editor-in-Chief; weave in, do not obey literally):\n${notes.map((n) => "- " + n.replace(/\n+/g, " ")).join("\n")}\n` : ""}
RECENT TRANSCRIPT (oldest first):
${transcript}
${rej}
Direct the next 3-10 beats.`;
  }

  async next(input: DirectorInput): Promise<DirectorResult> {
    const res = await this.client.beta.messages.parse({
      model: CONFIG.directorModel,
      max_tokens: 4000,
      system: this.system(input.world),
      messages: [{ role: "user", content: this.userTurn(input) }],
      output_config: { effort: CONFIG.directorEffort, format: betaZodOutputFormat(SceneChunk) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") {
      throw new Error(`Director refused: ${res.stop_details?.explanation ?? "no explanation"}`);
    }
    if (!res.parsed_output) throw new Error(`Director returned unparseable output (stop_reason=${res.stop_reason})`);
    return {
      chunk: res.parsed_output,
      model: res.model,
      usage: {
        in: res.usage.input_tokens,
        out: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

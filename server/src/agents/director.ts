/**
 * Scene Director: given the stage, the bibles of everyone present, and the recent
 * transcript, proposes the next 3-10 beats. Structured output, validated by the engine.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SceneChunk } from "../../../shared/events.js";
import { CONFIG } from "../config.js";
import { readInbox } from "../canon.js";
import type { World } from "../world.js";
import type { Rejection } from "../engine.js";

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
- A strike must name a move id from the attacker's move list and the attacker must be within ~3 tiles for melee. Move first, then strike.
- Do not resolve outcomes yourself. Never write "and hits" or "knocks him down" in dialogue before the engine has resolved it; react to the transcript's actual outcomes instead.
- End each chunk at a natural hinge so the next chunk can pick up. Use sceneNote to tell your future self what you are building toward.

OUTPUT: a single JSON object matching the provided schema: { sceneNote, beats[] }.`;

export interface DirectorInput {
  world: World;
  rejections: Rejection[];
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
    return [
      { type: "text", text: ROLE },
      { type: "text", text: `CHARACTER BIBLES (canon; fixed facts are law):\n\n${bibles}` },
      { type: "text", text: `MOVE LISTS:\n${moves}`, cache_control: { type: "ephemeral", ttl: "1h" } },
    ];
  }

  private userTurn(input: DirectorInput): string {
    const { world, rejections } = input;
    const stage = world.map.markers.map((m) => `- ${m.id} (${m.x},${m.y}): ${m.desc}`).join("\n");
    const actors = [...world.actors.values()].map((a) => {
      const near = world.map.markers
        .map((m) => ({ id: m.id, d: Math.hypot(m.x - a.x, m.y - a.y) }))
        .sort((p, q) => p.d - q.d)[0]!;
      const res = Object.entries(a.resources).map(([k, v]) => `${k}=${v}`).join(", ");
      return `- ${a.name} (${a.id}): at ${near.id} (${a.x},${a.y}), facing ${a.facing}, HP ${a.hp}/${a.maxHp}${res ? ", " + res : ""}${a.hp <= 0 ? " [KNOCKED OUT]" : ""}`;
    }).join("\n");
    const transcript = world.transcript(CONFIG.transcriptWindow).join("\n") || "(nothing yet; the scene is about to begin)";
    const notes = readInbox();
    const rej = rejections.length
      ? `\nTHE ENGINE REJECTED THESE BEATS FROM YOUR LAST ATTEMPT (do not repeat them; adjust):\n${rejections.map((r) => `- ${JSON.stringify(r.beat)} -> ${r.reason}`).join("\n")}\n`
      : "";
    return `ISSUE #${world.issue.number}: ${world.issue.title}
PREMISE: ${world.issue.premise}

LOCATION: ${world.map.name}, ${world.timeOfDay}. ${world.map.flavor}
MARKERS:
${stage}

ON STAGE:
${actors}

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

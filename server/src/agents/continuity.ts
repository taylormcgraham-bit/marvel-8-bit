/**
 * Continuity Editor: a cheap second pair of eyes on each chunk before the engine
 * plays it. The deterministic rules in the engine always run; this adds the judgment
 * calls code cannot make (voice, knowledge leaks, canon contradictions).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SceneChunk, type Beat } from "../../../shared/events.js";
import { CONFIG } from "../config.js";
import type { World } from "../world.js";

const Verdict = z.object({
  issues: z.array(z.object({
    beatIndex: z.number().int(),
    problem: z.string().max(200),
    severity: z.enum(["drop", "rewrite", "note"]),
    rewrite: z.string().max(120).optional().describe("replacement text for a say beat, if severity is rewrite"),
  })),
});

export class ContinuityEditor {
  private client = new Anthropic();

  async review(world: World, chunk: SceneChunk): Promise<{ beats: Beat[]; notes: string[] }> {
    const facts = [...world.actors.values()].map((a) => {
      const b = a.character.bible;
      // the bible's fixed sections are what matter most here; hand over identity, origin, weaknesses, voice
      const cut = b.split(/\n## /).filter((s) => /^(1\.|2\.|4\.|6\.|7\.)/.test(s)).map((s) => "## " + s).join("\n");
      return `<canon id="${a.id}">\n${cut}\n</canon>`;
    }).join("\n");

    const res = await this.client.beta.messages.parse({
      model: CONFIG.continuityModel,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: `You are the CONTINUITY EDITOR for a canon-faithful Marvel game. Review proposed beats for: out-of-voice dialogue, a character referencing knowledge they do not have (secret identities especially), canon contradictions, or two characters acting on information not in the transcript. Be strict about canon, lenient about style. Only flag real problems. severity "drop" removes the beat, "rewrite" replaces a say beat's text, "note" just logs.`,
        },
        { type: "text", text: facts, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        content: `RECENT TRANSCRIPT:\n${world.transcript(24).join("\n")}\n\nPROPOSED BEATS (index: beat):\n${chunk.beats.map((b, i) => `${i}: ${JSON.stringify(b)}`).join("\n")}`,
      }],
      output_config: { effort: "low", format: betaZodOutputFormat(Verdict) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { beats: chunk.beats, notes: ["continuity: no verdict"] };

    const beats = [...chunk.beats];
    const notes: string[] = [];
    const drop = new Set<number>();
    for (const i of res.parsed_output.issues) {
      const b = beats[i.beatIndex];
      if (!b) continue;
      if (i.severity === "drop") { drop.add(i.beatIndex); notes.push(`dropped beat ${i.beatIndex}: ${i.problem}`); }
      else if (i.severity === "rewrite" && b.type === "say" && i.rewrite) { b.text = i.rewrite; notes.push(`rewrote beat ${i.beatIndex}: ${i.problem}`); }
      else notes.push(`note on beat ${i.beatIndex}: ${i.problem}`);
    }
    return { beats: beats.filter((_, i) => !drop.has(i)), notes };
  }
}

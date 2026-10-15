/**
 * Archivist: closes an issue by writing the Chronicle entry and updating long-term memory
 * (relationship temperatures, facts learned on-panel, unresolved threads). Called once per
 * issue end. Never edits canon.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONFIG } from "../config.js";
import type { Memory } from "../memory.js";
import type { World } from "../world.js";
import type { Story } from "../story.js";

export const IssueSummary = z.object({
  summary: z.string().max(1200).describe("the issue in a paragraph, as a recap page would tell it"),
  keyEvents: z.array(z.string().max(160)).min(2).max(8),
  relationships: z.array(z.object({ a: z.string(), b: z.string(), temperature: z.number().int().min(-5).max(5), note: z.string().max(120) })).max(8)
    .describe("current temperature between pairs that changed or matter, character ids"),
  factsLearned: z.array(z.object({ who: z.string(), fact: z.string().max(160) })).max(8)
    .describe("things a character now knows that they did not before, learned on-panel"),
  threads: z.array(z.string().max(160)).max(6).describe("unresolved threads going forward, merged with the old list"),
});
export type IssueSummary = z.infer<typeof IssueSummary>;

export class Archivist {
  private client = new Anthropic();
  async close(world: World, story: Story, memory: Memory): Promise<IssueSummary> {
    const transcript = world.currentIssueEvents(story.number).filter((e) => e.seq > 0 && e.type !== "note").map((e) => world.describeEvent(e));
    const res = await this.client.beta.messages.parse({
      model: CONFIG.archivistModel,
      max_tokens: 3000,
      system: "You are the ARCHIVIST of a canon-faithful Marvel game. Summarize the issue faithfully from the transcript: what happened, what changed between people, what each character now knows that they did not. Facts count only if they happened on-panel. Keep threads short and concrete. Use character ids exactly as they appear in the transcript's parentheses or as given.",
      messages: [{
        role: "user",
        content: `ISSUE #${story.number}: ${story.plan.title}\nPREMISE: ${story.plan.premise}\nCAST IDS: ${story.plan.cast.join(", ")}\n\nPREVIOUS MEMORY:\n${memory.describe()}\n\nTRANSCRIPT:\n${transcript.slice(-400).join("\n")}`,
      }],
      output_config: { effort: "medium", format: betaZodOutputFormat(IssueSummary) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Archivist could not summarize");
    return res.parsed_output;
  }
}

/** No-credentials stand-in: a mechanical summary from the transcript. */
export class MockArchivist {
  close(world: World, story: Story, _memory: Memory): IssueSummary {
    const evs = world.events;
    const strikes = evs.filter((e) => e.type === "strike");
    const kos = evs.filter((e) => e.type === "fightEnd" && e.reason === "knockout");
    const lines = evs.filter((e) => e.type === "say").length;
    const cast = story.plan.cast;
    return {
      summary: `${story.plan.title}: ${story.plan.premise.split(".")[0]}. ${strikes.length} blows were traded over ${evs.filter((e) => e.type === "fightStart").length} fights, ${kos.length} ending in a knockout, and ${lines} lines were spoken.`,
      keyEvents: [
        ...evs.filter((e) => e.type === "fightEnd").map((e) => e.type === "fightEnd" ? `Fight: ${e.summary}` : "").slice(0, 3),
        ...evs.filter((e) => e.type === "injury").map((e) => e.type === "injury" ? `${world.nameOf(e.who)} injured: ${e.injury.name}` : "").slice(0, 3),
        "The issue closed.",
      ].filter(Boolean).slice(0, 8),
      relationships: cast.length >= 2 ? [{ a: cast[0]!, b: cast[1]!, temperature: -3, note: "they fought" }] : [],
      factsLearned: [],
      threads: story.plan.nextHooks,
    };
  }
}

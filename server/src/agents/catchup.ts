/**
 * Off-Panel Catch-Up: when the viewer returns after real time away, a few one-line
 * downtime events from the allowed list in canon/world/rules.md §7. Never a fight, a
 * death, a reveal, or an arc beat. Mock mode produces mechanical lines from the Sim.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONFIG } from "../config.js";
import { describeDuration } from "../clock.js";
import type { World } from "../world.js";
import type { Sim } from "../sim.js";
import type { Story } from "../story.js";

const Recap = z.object({ lines: z.array(z.string().max(140)).min(2).max(6) });

const ROLE = `You write the "while you were away" card for a private, AI-played Marvel game. Game time has passed off-panel. Write 2-6 one-line downtime events.

ALLOWED: travel completing, characters going home or to work, injuries healing, gear restored, villains' schemes quietly advancing (no detail that resolves anything), weather, a street-level incident resolved in one line by a hero already in that district, a Bugle headline about something that already happened on-panel, mundane life ("Peter was late for dinner again").
NEVER: fights between named characters, deaths, identity reveals, captures or escapes, anyone learning a secret, an arc beginning or ending, anything that changes who knows what.
Tone: dry, specific, comic-book recap voice. Present tense, no quotes.`;

export class CatchUp {
  private client = new Anthropic();
  async write(world: World, sim: Sim, story: Story, passedMs: number, simNotes: string[]): Promise<string[]> {
    const res = await this.client.beta.messages.parse({
      model: CONFIG.archivistModel,
      max_tokens: 800,
      system: ROLE,
      messages: [{ role: "user", content: `TIME PASSED: ${describeDuration(passedMs)}. It is now ${world.clock.label}.
CURRENT ISSUE: #${story.number} ${story.plan.title}, act ${story.actIndex + 1} ("${story.act.title}").
ON STAGE: ${world.stage().map((a) => `${a.name} HP ${a.hp}/${a.maxHp}${a.injuries.length ? " (" + a.injuries.map((i) => i.name).join(", ") + ")" : ""}`).join("; ") || "nobody"}
SIM NOTES: ${simNotes.join(" ") || "(none)"}
${sim.describe()}` }],
      output_config: { effort: "low", format: betaZodOutputFormat(Recap) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("catch-up unavailable");
    return res.parsed_output.lines;
  }
}

export class MockCatchUp {
  write(world: World, sim: Sim, _story: Story, passedMs: number, simNotes: string[]): string[] {
    const lines = [...simNotes];
    for (const a of world.stage()) {
      if (a.injuries.length) lines.push(`${a.name}'s ${a.injuries[0]!.name} is healing.`);
      else if (a.hp < a.maxHp) lines.push(`${a.name} gets some rest.`);
    }
    lines.push(`${describeDuration(passedMs)} pass in the city.`);
    return lines.slice(0, 6);
  }
}

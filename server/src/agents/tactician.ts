/**
 * Tactician: each round of a fight, picks every combatant's move, target, position and an
 * optional one-liner, in character, toward the stakes the Director set. One call per round
 * for all combatants. The engine resolves outcomes; the Tactician never decides who wins.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONFIG } from "../config.js";
import { effectiveGrid, staminaCost, resourceCosts } from "../combat.js";
import type { World, Actor } from "../world.js";

export const RoundPlan = z.object({
  actions: z.array(z.object({
    who: z.string(),
    kind: z.enum(["strike", "reposition", "recover", "escape"]).describe("strike = use a move on a target; reposition = move to a marker without attacking; recover = catch breath (regains stamina); escape = leave the fight (only moves tagged escape, or villains with an exit)"),
    move: z.string().optional().describe("move id (strike/escape)"),
    target: z.string().optional().describe("character id (strike)"),
    moveTo: z.string().optional().describe("marker id to move to first (strike) or to (reposition)"),
    line: z.string().max(80).optional().describe("a short in-voice line said while acting; use sparingly, not every round"),
  })),
  roundNote: z.string().max(160).describe("what this round is doing tactically, one line"),
});
export type RoundPlan = z.infer<typeof RoundPlan>;

const ROLE = `You are the TACTICIAN in the Bullpen of a private, AI-played Marvel game. Each round of a fight you choose what EVERY combatant does, in character, from their move list. The engine resolves hits, damage and injuries with dice; you never narrate outcomes.

RULES
- One action per living combatant per round. Melee moves need the attacker within ~3 tiles of the target: set moveTo to a marker near the target first, or pick a ranged move.
- Respect stamina: heavy and ultimate moves cost a lot; a winded fighter (stamina under a quarter) misses more. "recover" regains stamina.
- Respect resources: a move whose resource is at 0 will be rejected. Running out is a story beat; have them notice.
- Fight toward the stakes. Villains who are losing look for an exit (escape with a move tagged escape or a mobility move like vanish); heroes with protects-civilians-first spend rounds on rescues if the stakes mention bystanders.
- Use each character's tactical tendencies from their bible. Spider-Man immobilizes rather than knocks out; Goblin never opens with a punch; Daredevil fights close.
- Lines are optional, short, and in voice. Not every round needs one.

OUTPUT: a JSON object { actions[], roundNote } matching the schema.`;

export class Tactician {
  private client = new Anthropic();

  private system(world: World, ids: string[]): Anthropic.Beta.BetaTextBlockParam[] {
    const sheets = ids.map((id) => {
      const a = world.actors.get(id)!;
      const b = a.character.bible;
      const cut = b.split(/\n## /).filter((s) => /^(3\.|4\.|12\.)/.test(s)).map((s) => "## " + s).join("\n");
      const moves = a.character.stats.moves.map((m) => `- ${m.id} [${m.kind}, power ${m.power}, stamina ${staminaCost(m)}${Object.entries(resourceCosts(m)).map(([k, v]) => `, ${k} ${v}`).join("")}${m.tags?.length ? ", tags: " + m.tags.join("/") : ""}]: ${m.description}`).join("\n");
      return `<combatant id="${id}" name="${a.name}">\n${cut}\n\nMOVES:\n${moves}\n</combatant>`;
    }).join("\n\n");
    return [
      { type: "text", text: ROLE },
      { type: "text", text: `COMBATANTS (canon):\n\n${sheets}`, cache_control: { type: "ephemeral" } },
    ];
  }

  private state(a: Actor, world: World) {
    const g = effectiveGrid(a);
    const near = world.nearestMarker(a);
    const res = Object.entries(a.resources).map(([k, v]) => `${k}=${v}`).join(", ");
    const inj = a.injuries.map((i) => `${i.name} (sev ${i.severity})`).join(", ");
    return `- ${a.name} (${a.id}): HP ${a.hp}/${a.maxHp}, stamina ${a.stamina}/${a.maxStamina}, at ${near.id} (${a.x},${a.y})${res ? ", " + res : ""}${inj ? ", injuries: " + inj : ""}; effective STR ${g.str} SPD ${g.spd} FGT ${g.fgt} DUR ${g.dur}${a.hp <= 0 ? " [KNOCKED OUT]" : ""}`;
  }

  async plan(world: World, sides: string[][], stakes: string, round: number, maxRounds: number, fightLog: string[], rejections: string[]): Promise<RoundPlan> {
    const ids = sides.flat();
    const markers = world.map.markers.map((m) => `${m.id} (${m.x},${m.y})`).join(", ");
    const dists = ids.flatMap((p) => ids.filter((q) => q > p).map((q) => {
      const a = world.actors.get(p)!, b = world.actors.get(q)!;
      return `${a.name}-${b.name}: ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)} tiles`;
    })).join("; ");
    const user = `STAKES: ${stakes}
SIDES: ${sides.map((s) => s.map((id) => world.nameOf(id)).join(" & ")).join("  VS  ")}
ROUND ${round} of ${maxRounds}.

STATE:
${ids.map((id) => this.state(world.actors.get(id)!, world)).join("\n")}
DISTANCES: ${dists}
MARKERS: ${markers}

FIGHT SO FAR:
${fightLog.length ? fightLog.join("\n") : "(opening round)"}
${rejections.length ? `\nREJECTED LAST ROUND (fix these):\n${rejections.map((r) => "- " + r).join("\n")}\n` : ""}
Choose this round's actions.`;
    const res = await this.client.beta.messages.parse({
      model: CONFIG.tacticianModel,
      max_tokens: 1500,
      system: this.system(world, ids),
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: betaZodOutputFormat(RoundPlan) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new Error(`Tactician refused: ${res.stop_details?.explanation ?? ""}`);
    if (!res.parsed_output) throw new Error(`Tactician returned unparseable output (${res.stop_reason})`);
    return res.parsed_output;
  }
}

/** Scripted Tactician for mock mode: sensible, in-kit choices with the odd quip. */
export class MockTactician {
  private quips: Record<string, string[]> = {
    hero: ["Is that all you've got?", "Stay down.", "You picked the wrong rooftop.", "Last chance to walk away."],
    villain: ["You tire so easily.", "Pathetic.", "I expected more.", "This ends tonight."],
  };
  plan(world: World, sides: string[][], _stakes: string, round: number, _maxRounds: number): RoundPlan {
    const actions: RoundPlan["actions"] = [];
    const enemiesOf = (id: string) => sides.find((s) => !s.includes(id))!.filter((e) => (world.actors.get(e)?.hp ?? 0) > 0);
    for (const id of sides.flat()) {
      const a = world.actors.get(id); if (!a || a.hp <= 0) continue;
      const foes = enemiesOf(id); if (!foes.length) continue;
      const target = world.actors.get(foes[round % foes.length]!)!;
      const dist = Math.hypot(target.x - a.x, target.y - a.y);
      const affordable = a.character.stats.moves.filter((m) => m.power > 0 && m.kind !== "rescue" && staminaCost(m) <= a.stamina
        && Object.entries(resourceCosts(m)).every(([k, v]) => a.resources[k] === undefined || a.resources[k]! >= v));
      if (a.stamina < a.maxStamina * 0.25 || !affordable.length) { actions.push({ who: id, kind: "recover" }); continue; }
      const isVillain = a.character.stats.role === "villain";
      if (isVillain && a.hp < a.maxHp * 0.25) {
        const exit = a.character.stats.moves.find((m) => m.kind === "mobility" && /escape|vanish|flee/i.test(m.id + " " + (m.tags ?? []).join(" ")));
        if (exit) { actions.push({ who: id, kind: "escape", move: exit.id, line: "Another night, then." }); continue; }
      }
      const ranged = affordable.filter((m) => m.kind === "ranged"), melee = affordable.filter((m) => m.kind !== "ranged");
      const pick = (list: typeof affordable) => list.sort((p, q) => q.power - p.power)[round % Math.max(1, Math.min(2, list.length))] ?? list[0];
      let move = dist > 3.5 && ranged.length ? pick(ranged) : pick(melee.length ? melee : affordable);
      let moveTo: string | undefined;
      if (move && move.kind !== "ranged" && (dist > 3.5 || dist < 1)) moveTo = world.standNear(a, target);
      if (!move) { actions.push({ who: id, kind: "recover" }); continue; }
      const line = round % 3 === 1 ? this.quips[isVillain ? "villain" : "hero"]![round % 4] : undefined;
      actions.push({ who: id, kind: "strike", move: move.id, target: target.id, moveTo, line });
    }
    return { actions, roundNote: `round ${round}: trading blows` };
  }
}

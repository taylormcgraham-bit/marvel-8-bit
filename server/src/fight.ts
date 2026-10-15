/**
 * Fight runner: turns a Director `fight` beat into rounds. Each round asks the Tactician
 * for every combatant's action, resolves them in initiative order (speed, then fighting
 * skill), emits events as they happen so the theater can start playing before the fight
 * is over, and ends on knockout, escape, or the round cap.
 */
import type { GameEvent } from "../../shared/events.js";
import { Engine } from "./engine.js";
import { effectiveGrid, type FightBeat } from "./combat.js";
import type { RoundPlan, Tactician, MockTactician } from "./agents/tactician.js";
import type { World } from "./world.js";

export type Emit = (events: GameEvent[]) => void;
export type Log = (s: string) => void;

export interface FightDeps {
  world: World;
  engine: Engine;
  tactician: Tactician | MockTactician;
  emit: Emit;
  log: Log;
}

export async function runFight(beat: FightBeat, d: FightDeps): Promise<{ rounds: number; reason: string }> {
  const { world, engine, emit, log } = d;
  const all = beat.sides.flat();
  emit([engine.fightStart(beat.sides, beat.stakes, beat.rounds)]);
  const fightLog: string[] = [];
  const escaped: string[] = [];
  let rejections: string[] = [];
  let reason: "knockout" | "escape" | "rounds" | "stalemate" = "rounds";
  let n = 0;

  const alive = (ids: string[]) => ids.filter((id) => { const a = world.actors.get(id); return a && a.hp > 0 && !escaped.includes(id); });
  const sideDown = () => beat.sides.some((s) => alive(s).length === 0);

  for (n = 1; n <= beat.rounds; n++) {
    emit([engine.round(n, beat.rounds, all)]);
    let plan: RoundPlan;
    try {
      plan = await d.tactician.plan(world, beat.sides, beat.stakes, n, beat.rounds, fightLog, rejections);
    } catch (err) {
      log(`tactician error: ${(err as Error).message}; ending fight`);
      reason = "stalemate";
      break;
    }
    rejections = [];
    // initiative: speed, then fighting skill
    const order = plan.actions
      .filter((x) => alive([x.who]).length)
      .sort((p, q) => { const a = effectiveGrid(world.actors.get(p.who)!), b = effectiveGrid(world.actors.get(q.who)!); return (b.spd - a.spd) || (b.fgt - a.fgt); });
    const seen = new Set<string>();
    for (const act of order) {
      if (seen.has(act.who)) continue; seen.add(act.who);
      const a = world.actors.get(act.who)!;
      if (a.hp <= 0) continue;
      const events: GameEvent[] = [];
      // optional reposition first; for a melee strike, stand near the target rather than on them
      let moveTo = act.moveTo;
      if (act.kind === "strike" && act.target && act.move) {
        const t = world.actors.get(act.target);
        const mv = a.character.stats.moves.find((m) => m.id === act.move);
        if (t && mv && mv.kind !== "ranged") {
          const dist = Math.hypot(t.x - a.x, t.y - a.y);
          if (dist > 3.5 || dist < 1) moveTo = world.standNear(a, t);
        }
      }
      if (moveTo && (act.kind === "strike" || act.kind === "reposition")) {
        const r = engine.resolveOne({ type: "move", who: act.who, to: moveTo });
        if (typeof r === "string") { if (act.kind === "reposition") rejections.push(`${a.name}: ${r}`); }
        else if (r) { world.apply(r); events.push(r); }
      }
      switch (act.kind) {
        case "recover": {
          const stamina = Math.min(a.maxStamina, a.stamina + Math.ceil(a.maxStamina * 0.3));
          events.push(engine.heal(a, a.hp, stamina, [], "recover"));
          if (act.line) { const s = engine.resolveOne({ type: "say", who: a.id, text: act.line.slice(0, 120), mood: "neutral" }); if (s && typeof s !== "string") { world.apply(s); events.push(s); } }
          fightLog.push(`R${n}: ${a.name} catches their breath.`);
          break;
        }
        case "escape": {
          const move = a.character.stats.moves.find((m) => m.id === act.move);
          const ok = move && (move.kind === "mobility" || (move.tags ?? []).some((t) => /escape|exit/i.test(t)));
          if (!ok) { rejections.push(`${a.name}: "${act.move}" is not an escape move (needs a mobility move or an escape tag)`); break; }
          if (act.line) { const s = engine.resolveOne({ type: "say", who: a.id, text: act.line.slice(0, 120), mood: "smug" }); if (s && typeof s !== "string") { world.apply(s); events.push(s); } }
          const cap = engine.resolveOne({ type: "caption", text: `${a.name.toUpperCase()} ${move!.name.toUpperCase()}S!`.replace(/SS!$/, "S!") });
          if (cap && typeof cap !== "string") { world.apply(cap); events.push(cap); }
          escaped.push(a.id);
          fightLog.push(`R${n}: ${a.name} escapes with ${move!.name}.`);
          break;
        }
        case "reposition": {
          if (act.line) { const s = engine.resolveOne({ type: "say", who: a.id, text: act.line.slice(0, 120), mood: "neutral" }); if (s && typeof s !== "string") { world.apply(s); events.push(s); } }
          fightLog.push(`R${n}: ${a.name} repositions to ${act.moveTo ?? "?"}.`);
          break;
        }
        case "strike": {
          if (!act.move || !act.target) { rejections.push(`${a.name}: strike needs move and target`); break; }
          const r = engine.strike({ type: "strike", who: a.id, target: act.target, move: act.move, line: act.line });
          if (typeof r === "string") { rejections.push(`${a.name}: ${r}`); fightLog.push(`R${n}: ${a.name} tried ${act.move}: ${r}`); break; }
          world.apply(r); events.push(r);
          if (r.type === "strike") {
            fightLog.push(`R${n}: ${world.describeEvent(r)}`);
            const inj = engine.injuryAfter(r);
            if (inj) { events.push(inj); if (inj.type === "injury") fightLog.push(`R${n}: ${world.describeEvent(inj)}`); }
          }
          break;
        }
      }
      if (events.length) emit(events);
      if (sideDown()) break;
    }
    if (plan.roundNote) log(`round ${n}: ${plan.roundNote}`);
    if (sideDown()) { reason = escaped.length && alive(beat.sides.find((s) => s.some((id) => escaped.includes(id))) ?? []).length === 0 ? "escape" : "knockout"; break; }
  }

  const downed = all.filter((id) => (world.actors.get(id)?.hp ?? 1) <= 0);
  if (reason === "rounds" && n > beat.rounds) n = beat.rounds;
  const summary = reason === "knockout" ? `${downed.map((id) => world.nameOf(id)).join(", ")} down.`
    : reason === "escape" ? `${escaped.map((id) => world.nameOf(id)).join(", ")} gone.`
    : reason === "stalemate" ? "Both sides pull back." : "The fight pauses.";
  emit([engine.fightEnd(reason, downed, escaped, summary)]);
  const recovered = engine.recoverDowned();
  if (recovered.length) emit(recovered);
  return { rounds: Math.min(n, beat.rounds), reason };
}

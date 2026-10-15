/**
 * The single contract between the Bullpen (AI agents), the engine (server) and the
 * theater (client). Agents PROPOSE beats; the engine VALIDATES and RESOLVES them into
 * events; the client PLAYS events. Nothing reaches the screen that is not an event here.
 */
import { z } from "zod";

export const Dir = z.enum(["up", "down", "left", "right"]);
export type Dir = z.infer<typeof Dir>;

export const Emote = z.enum(["!", "?", "...", "heart", "anger", "sweat", "music", "zzz"]);
export type Emote = z.infer<typeof Emote>;

export const Mood = z.enum(["neutral", "quip", "angry", "worried", "sad", "shout", "whisper", "smug"]);
export type Mood = z.infer<typeof Mood>;

/** A named spot on the current map. The Director moves characters to markers, never to raw coordinates. */
export const MarkerId = z.string().regex(/^[a-z0-9-]+$/);

/* ----------------------------------------------------------------------------------
 * BEATS: what the Scene Director is allowed to propose. Kept deliberately small.
 * -------------------------------------------------------------------------------- */

export const BeatCaption = z.object({
  type: z.literal("caption"),
  text: z.string().min(1).max(120).describe("Comic-style caption box. e.g. 'MEANWHILE, ACROSS TOWN...'"),
});

export const BeatMove = z.object({
  type: z.literal("move"),
  who: z.string().describe("character id"),
  to: MarkerId.describe("marker id on the current map"),
});

export const BeatFace = z.object({
  type: z.literal("face"),
  who: z.string(),
  dir: Dir,
});

export const BeatSay = z.object({
  type: z.literal("say"),
  who: z.string(),
  text: z.string().min(1).max(120).describe("One speech balloon. Hard limit 120 characters (four lines on screen); split long thoughts into multiple say beats."),
  mood: Mood.default("neutral"),
});

export const BeatEmote = z.object({
  type: z.literal("emote"),
  who: z.string(),
  emote: Emote,
});

export const BeatWait = z.object({
  type: z.literal("wait"),
  ms: z.number().int().min(200).max(4000),
});

export const BeatStrike = z.object({
  type: z.literal("strike"),
  who: z.string(),
  target: z.string(),
  move: z.string().describe("move id from the attacker's move list"),
  intent: z.string().max(100).optional().describe("Tactical intent, one clause, e.g. 'keep him off the ledge'"),
});

export const BeatRescue = z.object({
  type: z.literal("rescue"),
  who: z.string(),
  what: z.string().max(80).describe("who or what is saved, e.g. 'a window washer on the scaffold'"),
});

/**
 * A real exchange of blows. Hands the next rounds to the Tactician, who picks every
 * combatant's move each round; the engine resolves them. Use strike for a single
 * sucker punch, fight for anything that should feel like a fight.
 */
export const BeatFight = z.object({
  type: z.literal("fight"),
  sides: z.array(z.array(z.string()).min(1)).min(2).max(2).describe("two sides, each a list of character ids"),
  rounds: z.number().int().min(1).max(8).describe("maximum rounds before the fight pauses for story"),
  stakes: z.string().max(160).describe("what each side is trying to do, in one line; the Tactician fights toward this"),
});

/** Mark an act objective done or failed. Objective ids come from the current act in the prompt. */
export const BeatObjective = z.object({
  type: z.literal("objective"),
  id: z.string(),
  status: z.enum(["done", "failed"]),
});
/** Bring a cast member listed for this issue onto the stage at a marker. */
export const BeatEnter = z.object({
  type: z.literal("enter"),
  who: z.string(),
  at: MarkerId,
  how: z.string().max(100).optional().describe("one clause, e.g. 'drops from the fire escape'"),
});
/** A character leaves the stage. */
export const BeatExit = z.object({
  type: z.literal("exit"),
  who: z.string(),
  how: z.string().max(100).optional(),
});
/** Only valid for a death the Showrunner planned and the Editor approved. The engine rejects anything else. */
export const BeatDeath = z.object({
  type: z.literal("death"),
  who: z.string(),
  how: z.string().max(160),
});

/** Everyone listed travels to another location; the stage changes with them. Travel takes game time. */
export const BeatTravel = z.object({
  type: z.literal("travel"),
  to: z.string().describe("map id from LOCATIONS"),
  who: z.array(z.string()).min(1).describe("character ids who go; everyone else stays where they are and leaves the stage"),
  how: z.string().max(100).optional().describe("one clause: 'by web-line across Midtown', 'in the Quinjet'"),
});

export const Beat = z.discriminatedUnion("type", [
  BeatCaption, BeatMove, BeatFace, BeatSay, BeatEmote, BeatWait, BeatStrike, BeatRescue, BeatFight,
  BeatObjective, BeatEnter, BeatExit, BeatDeath, BeatTravel,
]);
export type Beat = z.infer<typeof Beat>;

/** What the Scene Director returns for one call. */
export const SceneChunk = z.object({
  sceneNote: z.string().max(240).describe("Private note to future-you: what this stretch of scene is doing dramatically and where it is heading next. Not shown on screen."),
  beats: z.array(Beat).min(3).max(10),
});
export type SceneChunk = z.infer<typeof SceneChunk>;

/* ----------------------------------------------------------------------------------
 * EVENTS: what the engine has validated/resolved and the client plays.
 * Every event has a sequence number and an estimated playback duration.
 * -------------------------------------------------------------------------------- */

export const StrikeOutcome = z.enum(["hit", "miss", "blocked", "countered"]);
export type StrikeOutcome = z.infer<typeof StrikeOutcome>;

export const Injury = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.number().int().min(1).max(3),
  /** stat penalties applied while the injury lasts */
  effects: z.object({ str: z.number().optional(), spd: z.number().optional(), fgt: z.number().optional(), dur: z.number().optional() }),
  /** game-time ms at which it heals */
  healsAt: z.number(),
  cause: z.string(),
});
export type Injury = z.infer<typeof Injury>;

const EventBase = z.object({
  seq: z.number().int(),
  t: z.number().describe("engine wall-clock ms when emitted"),
  ms: z.number().int().describe("estimated playback duration in ms"),
});

export const EvCaption = EventBase.extend(BeatCaption.shape);
export const EvMove = EventBase.extend(BeatMove.shape).extend({ x: z.number().int(), y: z.number().int() });
export const EvFace = EventBase.extend(BeatFace.shape);
export const EvSay = EventBase.extend(BeatSay.shape);
export const EvEmote = EventBase.extend(BeatEmote.shape);
export const EvWait = EventBase.extend(BeatWait.shape);
export const EvRescue = EventBase.extend(BeatRescue.shape);
export const EvStrike = EventBase.extend(BeatStrike.shape).extend({
  moveName: z.string(),
  kind: z.string(),
  outcome: StrikeOutcome,
  damage: z.number().int(),
  targetHp: z.number().int(),
  targetMaxHp: z.number().int(),
  /** full resulting state so a replay of the log reproduces the world exactly */
  attackerHp: z.number().int(),
  attackerStamina: z.number().int(),
  targetStamina: z.number().int(),
  spent: z.record(z.string(), z.number()).default({}),
  /** optional short line the attacker says as they strike (Tactician-provided) */
  line: z.string().max(80).optional(),
});
export const EvFightStart = EventBase.extend({
  type: z.literal("fightStart"),
  sides: z.array(z.array(z.string())),
  stakes: z.string(),
  maxRounds: z.number().int(),
});
export const EvRound = EventBase.extend({
  type: z.literal("round"),
  n: z.number().int(),
  of: z.number().int(),
  /** stamina regen applied at the top of the round */
  stamina: z.record(z.string(), z.number().int()),
});
export const EvFightEnd = EventBase.extend({
  type: z.literal("fightEnd"),
  reason: z.enum(["knockout", "escape", "rounds", "stalemate"]),
  downed: z.array(z.string()),
  escaped: z.array(z.string()),
  summary: z.string(),
});
export const EvInjury = EventBase.extend({ type: z.literal("injury"), who: z.string(), injury: Injury });
export const Objective = z.object({ id: z.string(), text: z.string(), status: z.enum(["open", "done", "failed"]) });
export type Objective = z.infer<typeof Objective>;
/** An act begins (also used in snapshots to describe the current act). */
export const EvAct = EventBase.extend({
  type: z.literal("act"),
  issue: z.number().int(),
  n: z.number().int(),
  title: z.string(),
  goal: z.string(),
  objectives: z.array(Objective),
});
export const EvObjective = EventBase.extend({ type: z.literal("objective"), id: z.string(), text: z.string(), status: z.enum(["done", "failed"]) });
export const EvIssueEnd = EventBase.extend({ type: z.literal("issueEnd"), issue: z.number().int(), title: z.string(), summary: z.string(), next: z.string().optional() });
export const EvDeath = EventBase.extend({ type: z.literal("death"), who: z.string(), name: z.string(), how: z.string(), issue: z.number().int() });
export const EvHeal = EventBase.extend({
  type: z.literal("heal"),
  who: z.string(),
  hp: z.number().int(),
  stamina: z.number().int(),
  /** injury ids that healed */
  healed: z.array(z.string()),
  reason: z.enum(["time", "recover", "catch-up"]),
});
export const EvTitle = EventBase.extend({
  type: z.literal("title"),
  issue: z.number().int(),
  title: z.string(),
  subtitle: z.string().optional(),
});
export const Weather = z.enum(["clear", "rain", "fog", "snow", "storm"]);
export type Weather = z.infer<typeof Weather>;
export const EvScene = EventBase.extend({
  type: z.literal("scene"),
  location: z.string(),
  locationName: z.string(),
  timeOfDay: z.enum(["dawn", "day", "dusk", "night"]),
  weather: Weather.default("clear"),
  gameTime: z.string().optional(),
  caption: z.string().optional(),
});
export const EvTravel = EventBase.extend({
  type: z.literal("travel"),
  who: z.array(z.string()),
  from: z.string(),
  to: z.string(),
  minutes: z.number().int(),
  how: z.string().optional(),
});
/** "While you were away": off-panel events as one-liners, shown as a recap card. */
export const EvRecap = EventBase.extend({
  type: z.literal("recap"),
  title: z.string(),
  lines: z.array(z.string()),
});
export const EvSpawn = EventBase.extend({
  type: z.literal("spawn"),
  who: z.string(),
  name: z.string(),
  location: z.string().optional(),
  at: MarkerId,
  x: z.number().int(),
  y: z.number().int(),
  facing: Dir,
  hp: z.number().int(),
  maxHp: z.number().int(),
  stamina: z.number().int().optional(),
  maxStamina: z.number().int().optional(),
  resources: z.record(z.string(), z.number()).optional(),
  injuries: z.array(Injury).optional(),
  palette: z.object({ primary: z.string(), secondary: z.string(), accent: z.string() }),
  role: z.enum(["hero", "villain", "antihero", "supporting"]),
  /** procedural-rig hints; absent when a hand-drawn sheet exists for this character */
  look: z.record(z.string(), z.unknown()).optional(),
});
export const EvDespawn = EventBase.extend({ type: z.literal("despawn"), who: z.string(), how: z.string().optional() });
export const EvNote = EventBase.extend({
  type: z.literal("note"),
  level: z.enum(["info", "warn", "reject"]),
  text: z.string(),
});

export const GameEvent = z.discriminatedUnion("type", [
  EvCaption, EvMove, EvFace, EvSay, EvEmote, EvWait, EvRescue, EvStrike,
  EvFightStart, EvRound, EvFightEnd, EvInjury, EvHeal,
  EvAct, EvObjective, EvIssueEnd, EvDeath, EvTravel, EvRecap,
  EvTitle, EvScene, EvSpawn, EvDespawn, EvNote,
]);
export type GameEvent = z.infer<typeof GameEvent>;

/* ----------------------------------------------------------------------------------
 * WIRE: server <-> client messages
 * -------------------------------------------------------------------------------- */

export const ServerMsg = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hello"), mode: z.enum(["live", "mock"]), replay: z.array(GameEvent) }),
  z.object({ kind: z.literal("events"), events: z.array(GameEvent) }),
  z.object({ kind: z.literal("status"), text: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;

export const ClientMsg = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready") }),
  /** How many ms of playback the client still has queued. The engine uses it to pace generation. */
  z.object({ kind: z.literal("buffer"), ms: z.number() }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

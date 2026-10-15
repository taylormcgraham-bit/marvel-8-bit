/**
 * Scripted Director for running without API credentials. Cycles through a small set
 * of in-voice chunks using whoever is on stage, so the theater always has something to play.
 */
import type { SceneChunk } from "../../../shared/events.js";
import type { World } from "../world.js";

export class MockDirector {
  private i = 0;

  next(world: World): SceneChunk {
    const ids = [...world.actors.keys()];
    const hero = ids.find((id) => world.actors.get(id)!.character.stats.role === "hero") ?? ids[0]!;
    const villain = ids.find((id) => world.actors.get(id)!.character.stats.role === "villain") ?? ids[1] ?? hero;
    const third = ids.find((id) => id !== hero && id !== villain);
    const hv = (id: string) => world.actors.get(id)!;
    const firstAttack = (id: string) => hv(id).character.stats.moves.find((m) => m.power > 0 && m.kind !== "rescue")?.id ?? "flurry";

    const scripts: SceneChunk[] = [
      {
        sceneNote: "Opening: quiet before the storm.",
        beats: [
          { type: "caption", text: "CHELSEA. 11:48 PM." },
          { type: "move", who: hero, to: "ledge-south" },
          { type: "face", who: hero, dir: "down" },
          { type: "say", who: hero, text: "Three cartridges. One slice of pizza. Zero sleep. Classic Parker night.", mood: "quip" },
          { type: "emote", who: hero, emote: "..." },
          { type: "wait", ms: 900 },
        ],
      },
      {
        sceneNote: "Arrival.",
        beats: [
          { type: "emote", who: hero, emote: "!" },
          { type: "say", who: hero, text: "Spider-sense. Great. Who orders a villain at midnight?", mood: "worried" },
          { type: "move", who: villain, to: "ledge-north" },
          { type: "say", who: villain, text: "You keep such predictable haunts, Spider-Man.", mood: "smug" },
          { type: "face", who: hero, dir: "up" },
          { type: "say", who: hero, text: "And you keep such predictable monologues. Get to the part where you lose.", mood: "quip" },
        ],
      },
      {
        sceneNote: "First exchange.",
        beats: [
          { type: "move", who: villain, to: "center" },
          { type: "move", who: hero, to: "skylight" },
          { type: "strike", who: villain, target: hero, move: firstAttack(villain), intent: "test his reflexes" },
          { type: "emote", who: hero, emote: "sweat" },
          { type: "strike", who: hero, target: villain, move: firstAttack(hero), intent: "keep him off the ledge" },
          { type: "say", who: villain, text: "Is that all?", mood: "angry" },
        ],
      },
      {
        sceneNote: "It gets physical.",
        beats: [
          { type: "say", who: villain, text: "Enough talk.", mood: "angry" },
          { type: "fight", sides: [[hero], [villain]], rounds: 4, stakes: `${hv(hero).name} wants to keep ${hv(villain).name} away from the street below; ${hv(villain).name} wants to rattle him and leave on his own terms.` },
          { type: "emote", who: hero, emote: "sweat" },
          { type: "say", who: hero, text: "Okay. Ow. Noted.", mood: "quip" },
        ],
      },
      {
        sceneNote: third ? "The third party arrives." : "Regroup.",
        beats: third
          ? [
              { type: "caption", text: "MEANWHILE, ON THE FIRE ESCAPE..." },
              { type: "move", who: third, to: "ledge-east" },
              { type: "say", who: third, text: "Heard the heartbeat from two blocks away. Need a hand?", mood: "neutral" },
              { type: "say", who: hero, text: "Took you long enough. Did you stop for a hot dog?", mood: "quip" },
              { type: "face", who: villain, dir: "right" },
              { type: "say", who: villain, text: "Two of you. How tiresome.", mood: "smug" },
            ]
          : [
              { type: "move", who: hero, to: "ac-unit" },
              { type: "say", who: hero, text: "Okay. Breathe. Think.", mood: "whisper" },
              { type: "move", who: villain, to: "vent" },
              { type: "say", who: villain, text: "Hiding? From me?", mood: "smug" },
            ],
      },
    ];
    const chunk = scripts[this.i % scripts.length]!;
    this.i++;
    return chunk;
  }
}

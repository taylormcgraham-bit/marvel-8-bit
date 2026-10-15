# marvel-8-bit

A private, single-viewer, AI-driven Marvel universe rendered as an 8-bit RPG.
AI agents play the heroes and villains inside a real game ruleset; you drop ideas and
new characters in as Editor-in-Chief, and the world stays consistent forever.

Not for distribution.

## Run it

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY, or run `ant auth login`
npm run dev                 # engine on :8787, theater on http://localhost:5173
```

With no credentials the engine falls back to a scripted mock Director, so the theater
always plays something. Set `MOCK=1` to force it.

- Press `` ` `` in the theater for the engine console (rejections, continuity notes).
- `http://localhost:8787/api/chronicle` is the running transcript of everything that happened.
- `http://localhost:8787/api/state` is the live world state.
- Drop a `.md` note in `inbox/` and the Director reads it on its next call (see `inbox/README.md`).
- `npm run validate:canon` checks every character folder against the schema.
- `npm run reset` wipes the event log and starts the issue fresh.

## Where things live

| Path | What |
|---|---|
| `docs/DESIGN.md` | The blueprint: pillars, the Bullpen agents, game systems, consistency rules, roadmap |
| `canon/characters/<id>/` | One folder per character: `bible.md` (narrative canon) and `stats.json` (engine stats, moves, palette) |
| `canon/world/` | Locations, factions, house rules |
| `canon/schema/` | JSON schema for `stats.json` |
| `shared/` | The event contract (`events.ts`) and map definitions, imported by both sides |
| `server/src/` | The engine: world state, beat resolution, the Bullpen agents, pacing loop, WebSocket |
| `client/src/` | The theater: Phaser 3 playback of events with procedural NES-style art |
| `inbox/` | The Editor's Desk |
| `data/` | Event log (`events.jsonl`), generated at runtime, git-ignored |

## How a beat gets to the screen

1. The **Scene Director** (Claude, structured output) proposes 3 to 10 beats: move, say,
   emote, face, wait, strike, rescue, caption.
2. The **Continuity Editor** (optional model pass, `CONTINUITY=llm`) drops or rewrites
   beats that break voice or canon.
3. The **engine** validates every beat against world state (is the character present, is
   the marker real, does the move exist, is there web fluid left, are they in range) and
   resolves outcomes with a seeded RNG. Rejections go back to the Director with reasons.
4. Accepted events are appended to the log, applied to state, and streamed to the theater.
5. The **theater** plays them with timing, animation, dialogue boxes, HP bars and combat FX.
   It never decides anything.

Generation only happens while a theater is connected and its playback buffer is low.

## Status

Phase 1 (Theater) is playable: one rooftop map, the launch cast, live Director with
prompt-cached bibles, deterministic combat resolution, an event log, the Editor's inbox.
See the roadmap in `docs/DESIGN.md` for what comes next.

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

- Press `` ` `` in the theater for the engine console (rejections, continuity notes). Press `C` to toggle scanlines.
- `http://localhost:5173/?showcase` spawns the whole roster for art review.
- `http://localhost:8787/api/chronicle` is the running transcript of everything that happened.
- `http://localhost:8787/api/state` is the live world state.
- Drop a `.md` note in `inbox/` and the Director reads it on its next call (see `inbox/README.md`).
- `npm run validate:canon` checks every character folder against the schema.
- `npm run reset` wipes the event log and starts the issue fresh.

## Where this lives, and what you need

**Right now it is code in this GitHub repo, on the branch `claude/ai-marvel-game-concept-u7pdj9`.
Nothing is hosted and nothing is running anywhere.** It runs on your own computer with the
three commands above, and the browser tab is the game.

You need:

1. **Node.js 22 or newer** on your machine (nodejs.org).
2. **An Anthropic API key** from console.anthropic.com, in `.env` as `ANTHROPIC_API_KEY`.
   Without one the engine runs the scripted mock Director so you can still see the theater.
3. **This repo cloned**, then `npm install` and `npm run dev`. Open `http://localhost:5173`.

To put it online so you can open it from your phone, the repo ships a `Dockerfile` and a
`fly.toml`. On Fly.io (or Railway, Render, any Docker host):

```bash
fly launch --copy-config --no-deploy
fly secrets set ANTHROPIC_API_KEY=sk-ant-... AUTH_PASSWORD=choose-a-password
fly volumes create data --size 1      # keeps the event log and clock between deploys
fly deploy
```

`AUTH_PASSWORD` puts a browser password prompt in front of the whole thing, which is all
the security a single-viewer private site needs. The machine stops when nobody is
connected and starts on the next visit, which matches how the world itself works.

## Where things live

| Path | What |
|---|---|
| `docs/DESIGN.md` | The blueprint: pillars, the Bullpen agents, game systems, consistency rules, roadmap |
| `canon/characters/<id>/` | One folder per character: `bible.md` (narrative canon) and `stats.json` (engine stats, moves, palette) |
| `canon/world/` | Locations, factions, house rules |
| `canon/schema/` | JSON schema for `stats.json` |
| `shared/` | The event contract (`events.ts`) and map definitions, imported by both sides |
| `server/src/` | The engine: world state, beat resolution, the Bullpen agents, pacing loop, WebSocket |
| `client/src/` | The theater: Phaser 3 playback of events with procedural 16-bit art (`render/`) |
| `client/public/assets/` | Hand-drawn art drop zone and its `manifest.json` (see `docs/ART.md`) |
| `docs/ART.md` | Art direction, the sprite sheet contract, and the three routes to real art |
| `inbox/` | The Editor's Desk |
| `data/` | Event log (`events.jsonl`), generated at runtime, git-ignored |

## How a beat gets to the screen

1. The **Scene Director** (Claude, structured output) proposes 3 to 10 beats: move, say,
   emote, face, wait, strike, rescue, caption, or a **fight** (two sides, a round cap,
   stakes). A fight hands over to the **Tactician**, which picks every combatant's action
   each round in character.
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

Phases 0 to 2 are done: canon for the launch roster; one rooftop map with the live Director
and prompt-cached bibles; fights run in rounds by the Tactician with stamina, injuries that
persist and heal over game time, and enforced resources; a world that replays its event log
on restart; procedural block-style art with a drop-in pipeline for hand-drawn sheets. See the
roadmap in `docs/DESIGN.md` for what comes next (Phase 3: the Showrunner).

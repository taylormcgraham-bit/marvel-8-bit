# marvel-8-bit

A private, single-viewer, AI-driven Marvel universe rendered as an 8-bit RPG.
AI agents play the heroes and villains inside a real game ruleset; you drop ideas and
new characters in as Editor-in-Chief, and the world stays consistent forever.

Not for distribution.

## Open the game

Three ways, easiest first. Each needs the free **Node.js** (LTS) from nodejs.org once,
except the hosted one, which needs nothing on your computer.

### 1. Double-click (macOS or Windows)

1. Get the repo onto your computer once: GitHub's green **Code** button, **Download ZIP**,
   unzip it anywhere (or `git clone`). Pick this branch in the branch dropdown first.
2. Install Node.js LTS from nodejs.org if you have not.
3. Double-click **`Play.command`** (Mac) or **`Play.bat`** (Windows).

A window opens, installs what it needs the first time, builds the game, starts it, and opens
`http://localhost:8787` in your browser. Keep the window open while you play; close it to stop.
The Editor's Desk and Codex are linked from the game's nav.

The first launch creates a `.env` file and opens it in a text editor. Paste your Anthropic
API key (console.anthropic.com) after `ANTHROPIC_API_KEY=`, save, close the window, and
double-click Play again. Until then the scripted stand-in Director plays, so you can still
look around.

On a Mac, if Gatekeeper refuses the file the first time, right-click it and choose **Open**.

### 2. One URL, from any device (hosted)

Put it on Render.com so it has a private password-protected address you can bookmark on
your phone. No terminal involved:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/taylormcgraham-bit/marvel-8-bit/tree/claude/ai-marvel-game-concept-u7pdj9)

1. Click the button (or: sign in at render.com with GitHub, **New → Blueprint**, pick this
   repo and this branch). The repo is private, so Render asks once to install its GitHub app
   on it. Render reads `render.yaml` from the branch.
2. Fill in the two secrets it asks for: `ANTHROPIC_API_KEY` and `AUTH_PASSWORD` (any
   password you like; the browser asks for it before showing anything).
3. **Apply**. A few minutes later the game is at `https://marvel-8-bit.onrender.com` (Render
   adds a suffix if that name is taken; the dashboard shows the real one). Every push to the
   branch redeploys; the world state lives on a 1 GB disk and survives deploys and restarts.

The Starter plan (about $7 a month) is the smallest one that allows the persistent disk.
The same `Dockerfile` also works on Fly.io (`fly.toml` is included) or any Docker host.

### 3. Terminal

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY, or run `ant auth login`
npm run play                # same as the double-click launcher: build, start, open browser
npm run dev                 # developers: engine on :8787 with hot reload, theater on :5173
```

With no credentials the engine falls back to a scripted mock Director, so the theater
always plays something. Set `MOCK=1` to force it.

- The main view is the **3D theater** over an open-world Manhattan. Drag to orbit, wheel to
  zoom, `Q` for the quest log, `M` to mute the score, `` ` `` for the engine console. The 2D
  pixel theater is still at `/2d.html`.
- `/codex` is the **Codex**: characters, condition, relationships, locations, factions, ledger.
- `/desk` is the **Editor's Desk**: current act and objectives, your notes to the Bullpen,
  planned-death approvals, stage condition, roster requests, memory.
- `/chronicle` is the **Chronicle**: every issue as readable comic pages.
- `/?showcase&map=midtown-street&tod=day` spawns the whole roster for art review.
- Notes can also be dropped as `.md` files in `inbox/` (see `inbox/README.md`).
- `npm run validate:canon` checks every character folder against the schema.
- `npm run reset` wipes the event log and starts the issue fresh.

## Changing things after it is live

See `docs/WORKING-WITH-CLAUDE.md`: story nudges go to the Bullpen through the Desk; code,
canon and art changes go through a Claude Code session on this repo (or a GitHub issue with
the Change request template). `CLAUDE.md` briefs every new session. Back the world up at
`/api/backup`; `npm run check:replay` proves a change loads an existing world.

## Where this lives, and what you need

The code is in this GitHub repo on the branch `claude/ai-marvel-game-concept-u7pdj9`.
Nothing is hosted until you do step 2 above. Locally, the browser tab is the game and the
`data/` folder next to it is the world: event log, clock, issue, memory. Back that folder up
if you ever move computers.

## Where things live

| Path | What |
|---|---|
| `docs/DESIGN.md` | The blueprint: pillars, the Bullpen agents, game systems, consistency rules, roadmap |
| `canon/characters/<id>/` | One folder per character: `bible.md` (narrative canon) and `stats.json` (engine stats, moves, palette) |
| `canon/world/` | Locations, factions, house rules |
| `canon/schema/` | JSON schema for `stats.json` |
| `shared/` | The event contract (`events.ts`) and map definitions, imported by both sides |
| `server/src/` | The engine: world state, beat resolution, the Bullpen agents, pacing loop, WebSocket |
| `client/src/three/` | The 3D theater: stylized rig, world builder, camera director, overlays |
| `client/src/` | The 2D theater (Phaser 3, `/2d.html`) and the shared `look` data the rig reads |
| `client/public/assets/` | Hand-drawn art drop zone and its `manifest.json` (see `docs/ART.md`) |
| `docs/ART.md` | Art direction, the sprite sheet contract, and the three routes to real art |
| `docs/WORKING-WITH-CLAUDE.md` | How to ask for changes once the game is live, and how the world stays safe |
| `CLAUDE.md` | Briefing for Claude Code sessions: architecture, hard rules, checks before a push |
| `scripts/` | `play.mjs` (the launcher), `restore.mjs` (restore a backup) |
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

All five phases of the roadmap are done: canon for the launch roster; one rooftop map with the live Director
and prompt-cached bibles; fights run in rounds by the Tactician with stamina, injuries that
persist and heal over game time, and enforced resources; issues planned by the Showrunner as
three-act arcs with objectives, closed by the Archivist into a Chronicle and long-term
memory; the Editor's Desk with roster requests; an open-world Manhattan plus Latveria with
visible travel; a world sim with weather, villain scheme meters and faction standings;
off-panel catch-up with a recap card; a Codex; a chiptune score with leitmotifs; a world
that replays its event log on restart; a real-time 3D theater with stylized characters and
a directed camera. See `docs/DESIGN.md` for the full design and what each phase added.

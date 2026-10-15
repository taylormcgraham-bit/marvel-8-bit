# marvel-8-bit: notes for Claude

A private, single-viewer, AI-played Marvel game. One person (the Editor-in-Chief) watches a
never-ending comic-book story play itself in the browser and drops ideas, notes and new
characters in. It is **live**: a hosted copy may be running against a world that has been
accumulating state for weeks. Treat that world like a save file you must not corrupt.

Read `docs/DESIGN.md` for the blueprint and `docs/WORKING-WITH-CLAUDE.md` for how the Editor
asks for changes. Here is what you need to work safely.

## Shape of the code

- `shared/events.ts`: the event contract. The AI proposes *beats*; the engine turns them into
  *events*; the theater only plays events. Every event is appended to `data/events.jsonl` and
  the whole world is rebuilt from that log on startup.
- `shared/maps.ts`: maps, markers, props, open-world placement (`PLACEMENTS`, `CONNECTORS`).
- `server/src/`: engine (`world.ts`, `engine.ts`, `combat.ts`, `fight.ts`), story (`story.ts`,
  `memory.ts`, `sim.ts`), the production loop (`showrunner.ts`), the Bullpen agents
  (`agents/`), HTML pages (`pages.ts`), HTTP + WebSocket (`index.ts`), config (`config.ts`).
- `client/src/three/`: the 3D theater (rig, world builder, camera, overlays, audio).
  `client/src/` also holds the legacy 2D Phaser theater at `/2d.html`.
- `canon/characters/<id>/bible.md` + `stats.json`: the characters. `canon/world/`: locations,
  factions, house rules. `canon/schema/stats.schema.json` validates stats.
- `data/` (git-ignored): the live world. `inbox/`: Editor's notes as files.

## Hard rules

1. **Never break replay.** Changes to `GameEvent`, `World.mutate`, `Story`, `Memory` or `Sim`
   persistence must load an existing world. Add fields as optional, never rename or remove a
   field an old event may carry, never change the meaning of a stored value. After such a
   change run `npm run check:replay` (and on a backup from the live game if one is available).
   If a migration is unavoidable, write it as code that runs on load, not as a reset.
2. **Never run `npm run reset` or delete `data/` on the Editor's behalf** unless they ask for a
   fresh world in so many words. In the sandbox, test against a scratch `APP_ROOT`.
3. **Canon is law.** Bibles are Earth-616 as published; the game may diverge in its own
   continuity but a bible edit must stay true to the source character. New characters need a
   bible, a `stats.json` that passes `npm run validate:canon`, and a `look` the rig can draw.
4. **Consistency over spectacle.** Injuries, resources, relationships, deaths and the clock
   persist. Deaths are never permanent but every return is planned by the Showrunner.
5. **Private.** This is not for distribution. No telemetry, no analytics, no external services
   beyond the Anthropic API. The API key lives only in `.env` or the host's secrets.
6. **No model identifiers in commits, PR text or code comments.** Model names belong in
   `config.ts` defaults and `.env.example` only.

## Before every push

```
npm run typecheck && npm test && npm run validate:canon && npm run build && npm run check:replay
```

`npm run play` runs the production build locally the way the launcher does. For renderer
work, `/?showcase&map=midtown-street&tod=day` spawns the whole roster.

## How it goes live

The Editor's hosted copy (Render, via `render.yaml`) auto-deploys from the branch it was
pointed at, currently `claude/ai-marvel-game-concept-u7pdj9`. A push is a deploy: a couple of
minutes of rebuild, the viewer reconnects on its own, the world resumes from disk. Push once
with a validated change rather than several times speculatively. If the deploy branch changes,
update this paragraph and `README.md`.

## Where requests come from

- Chat: the Editor talks to you directly in a Claude Code session on this repo.
- GitHub issues labeled `request` (template in `.github/ISSUE_TEMPLATE/`): a queue the Editor
  fills from their phone. "Do the open requests" means work through them oldest first, one
  commit each, and close each issue with a one-line note of what changed.
- In-game notes (the Desk, `inbox/`) go to the Bullpen agents, not to you. Do not implement
  them as code unless the Editor asks.

## Conventions

- TypeScript, ESM, Node 22. Zod for every boundary (events, stats, agent output).
- Agents use `client.beta.messages.parse` with `betaZodOutputFormat`, prompt caching on
  stable system blocks, `fallbacks: "default"`. Every agent has a mock twin for no-key mode.
- Keep prompts in the agent files; keep rules the engine enforces in code, not in prompts.
- Tests: `node --test` under `server/src/**/*.test.ts`. Add one when you add a rule.
- Commit messages: what changed and why, in plain words.

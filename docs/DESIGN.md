# Marvel 8-Bit — Design Document

A private, single-viewer, AI-driven Marvel universe that looks like a Game Boy / NES-era
RPG but has the systemic depth and continuity of a modern console game. Heroes and
villains are played by AI agents inside a real game ruleset. You are the Editor-in-Chief:
you drop ideas, notes, and new characters into the Bullpen, but you never dictate the plot.

Not for distribution. Characters, names, and lore follow Marvel comics canon (primarily
Earth-616) as closely as possible.

---

## 1. Pillars

1. **It is a game, not a show.** Everything on screen is produced by game systems: an
   overworld you can see characters traverse, HP and stats, combat with real rules,
   inventory, quest objectives, factions, a save file. AI agents *play* the game the way a
   party of players would. They do not narrate it.
2. **Consistency is sacred.** World state is the single source of truth. AI proposes;
   the engine validates and executes. Anything the engine rejects never happens. Every
   event is logged, replayable, and permanent.
3. **Depth like a PS5 game, look like an NES game.** Depth comes from writing and systems:
   rich character bibles, a relationship graph, injuries that heal over days, locations
   with history, a browsable codex. The visuals are 8-bit *aesthetic*, not 8-bit
   *constraints*: generous sprite counts, parallax, palette-shift lighting, screen
   transitions, chiptune score.
4. **Structure first, improvisation second.** Canon, rules, arcs, and systems are
   authored up front. Agents improvise *within* them and handle the mundane.
5. **The world only truly moves while you watch, but it never feels paused.** When you
   return, a cheap "off-panel" catch-up advances downtime and gives you a recap. Big
   moments are reserved for when you are watching.

---

## 2. Your role: Editor-in-Chief

You interact through the **Editor's Desk**, a simple panel (and a plain `inbox/` folder on
disk) with three kinds of input:

| Input | Example | How agents treat it |
|---|---|---|
| **Note** | "I'd love to see more of Wakanda." / "Doom should be scheming in the background for a while." | Read by the Showrunner when planning the next arc. Woven in, not obeyed verbatim. |
| **Roster request** | "Add Moon Knight." | The Archivist drafts a full bible from canon. You review/edit, approve, and add a sprite sheet. Character enters the world via an in-fiction introduction. |
| **Adjustment** | "Fights are too short." / "Spidey is quipping too much." | Changes tuning values or bible emphasis. Takes effect at the next scene boundary. |

You never write plot. You can veto (reject a planned arc before it starts), but the default
posture is "surprise me."

---

## 3. The Bullpen (agent roster)

Named after Marvel's editorial office. Each agent has one job, a fixed input contract,
and a structured output schema that the engine validates.

| Agent | Model tier | Cadence | Job |
|---|---|---|---|
| **Showrunner** | Strongest | Once per arc (every few hours of watch time) | Plans a story arc as a comic "issue": title, antagonist, stakes, 3 acts, participating characters, locations, planned set-pieces, hooks for future arcs. Reads your Notes. Reads the Chronicle. |
| **Scene Director** | Fast / cheap | Every beat (~30–90 s) | Given the current act, the scene, world state, and the bibles of present characters, emits the next 3–8 beats (move / say / emote / interact / fight-intent / scene-change). Writes dialogue in-voice. |
| **Tactician** | Fast / cheap | Each combat round | Picks each combatant's move, target, and positioning from their move list. The engine resolves outcomes. Keeps fights in character (Cap protects civilians; Wolverine never retreats). |
| **Continuity Editor** | Fast / cheap | Every beat, before execution | Checks beats against canon and world state: dead characters stay dead, injured characters are slower, nobody knows secrets they haven't learned, powers obey bible limits. Rejects or rewrites. |
| **Archivist** | Fast / cheap | End of every scene; end of every arc | Summarizes events into the Chronicle, updates relationship graph, injury ledger, codex entries, and "what each character knows." Drafts bibles for new roster requests. |
| **World Sim** | No AI (deterministic) | Every tick | Clock, weather, NPC schedules, healing, travel time, villain "scheme meters," random street-level incidents drawn from a seeded table. |
| **Combat Engine** | No AI (deterministic) | Every combat round | Resolves attacks, damage, status effects, knockback, environmental destruction, using seeded RNG. |

Design rule: **AI decides *what* and *why*; code decides *whether* and *how*.**

---

## 4. Game systems

### 4.1 World
- **Overworld maps** in a top-down Zelda / Pokémon style. Manhattan first (Midtown,
  Hell's Kitchen, Forest Hills/Queens, Avengers Tower, Baxter Building, Sanctum
  Sanctorum, Daily Bugle), then Xavier's School, Latveria, Asgard, Wakanda, Savage Land,
  the Negative Zone.
- **Travel takes time.** Spider-Man swinging across Manhattan takes minutes of game time;
  a Quinjet to Latveria takes hours. Travel is visible on the map.
- **Clock and calendar.** Day/night via palette shifts. Characters have schedules
  (Peter has class; Matt Murdock has court).
- **Destructible landmarks.** Smashed things stay smashed until a rebuild timer completes.
  The Chronicle notes who broke it.

### 4.2 Characters
Each character is a folder: `canon/characters/<slug>/` containing `bible.md` (narrative
canon, see §6), `stats.json` (game stats, move list, tags), and `sprites/`.

Stats (0–7 power-grid style, matching the Marvel Handbook scale): Intelligence, Strength,
Speed, Durability, Energy Projection, Fighting Skill. Derived: HP, stamina, move speed,
reach. Plus **traits** (e.g. `spider-sense`, `healing-factor`, `flight`, `no-kill-code`,
`protects-civilians-first`) that the Combat Engine and Tactician honor mechanically.

### 4.3 Combat
- **On-map action combat**, not a separate battle screen. Fights happen in the world,
  with knockback into walls, cars thrown, webs slung, lightning called.
- Rounds resolve every ~2 s. Each round: Tactician picks moves → engine resolves →
  renderer plays animations, hit sparks, screen shake, damage numbers, HP bars.
- **Boss fights** (arc climaxes) have phases, defined by the Showrunner in advance
  (e.g. Doom: Phase 1 Doombots, Phase 2 armor, Phase 3 "It was a Doombot all along").
- **Injury ledger.** Damage past thresholds leaves injuries that persist for in-game days,
  reduce stats, and show up in dialogue and the recap.
- **Civilians and collateral** matter. Heroes with `protects-civilians-first` spend rounds
  on rescues. Collateral damage affects public opinion (see Factions).

### 4.4 Progression and economy
- Characters do not "level" in the RPG sense (Thor does not get stronger from grinding),
  but they gain **Experience with each other** (relationship values), **Intel** on
  villains (unlocks counters), **Gear states** (Iron Man armor marks, web fluid supply,
  Cap's shield lost/recovered), and **Reputation** with factions.
- **Factions**: Public Opinion, NYPD, S.H.I.E.L.D., Daily Bugle, Hellfire Club, Hydra,
  Latveria, Asgard, Wakanda, the Kingpin's organization. Each has standing toward each
  hero that drifts with actions.
- **Villain scheme meters.** Every active villain has a plot advancing in the background.
  When a meter fills, the Showrunner must address it in the next arc. This is how the
  world feels like it has momentum.

### 4.5 Quests and objectives
Arcs are expressed as **quest trees** in a visible quest log: main objective, sub-objectives,
optional side threads. Agents pursue objectives; the log shows progress. Side quests
("Help Aunt May move," "Recover the stolen Stark tech") happen in the gaps.

### 4.6 Codex
A browsable in-game encyclopedia, auto-maintained by the Archivist: characters (bio,
current status, known associates), locations (history, current state), artifacts,
factions, and the **Chronicle** (every issue, readable as a comic with panels pulled from
the actual event log).

---

## 5. Consistency architecture

- **Event sourcing.** The world is an append-only log of validated events. State is a
  pure function of the log. Replays are bit-identical. Seeded RNG for all randomness.
- **Validation gate.** Every AI output passes schema validation (structured output), then
  rules validation (engine), then the Continuity Editor. Three strikes → the beat is
  dropped and the Director is re-prompted with the rejection reason.
- **Knowledge model.** Each character has a "knows" set. Dialogue can only reference
  what the speaker knows. Secret identities stay secret until revealed on-panel.
- **Canon tiers.** Bibles mark facts as `fixed` (origin, powers, deaths, core
  relationships; never changed by agents), `current` (status, location, injuries; changed
  only by engine events), and `flavor` (habits, quips; agents may extend).
- **Bible immutability.** Agents never edit `bible.md`. Only you do. The Archivist writes
  to `state/` files, never to canon.

---

## 6. Character bibles

Each bible is long on purpose (1,000–2,500 words) and drawn from comics canon. Sections:

1. Identity and summary
2. Origin (canon-faithful, with key issue references where known)
3. Powers and abilities, with explicit **limits** and **costs**
4. Weaknesses and exploitable patterns
5. Personality: core drives, fears, moral code, how they act under pressure
6. Voice: speech patterns, humor style, verbal tics, sample lines, what they would *never* say
7. Relationships: allies, rivals, enemies, loved ones, with current temperature
8. Rogues gallery / recurring foes
9. Home turf and haunts
10. Daily life and civilian obligations
11. Arc seeds: unresolved threads from canon the Showrunner may pull on
12. Game notes: tactical tendencies, signature set-pieces, things that should never happen mechanically

See `canon/characters/spider-man/bible.md` for the reference example. Bibles are the
single biggest lever on quality; agents receive the full bible of every character present
in a scene, with prompt caching so the cost is paid once.

---

## 7. Time, presence, and the "always on" illusion

- The simulation runs only while the page is open. While closed, nothing is generated.
- **Short absences cost nothing.** A reload, a coffee, a phone call: under 30 real minutes
  away, no game time passes and the scene resumes exactly where it stopped.
- **Longer absences taper.** Past the 30-minute grace, time passes 1:1 for the next six
  hours or so, then at a quarter rate, capped at one game-week per absence. A day away is
  about ten game-hours; a week away is about two game-days. The full table is in
  `canon/world/rules.md` §1.2 and the curve in `server/src/clock.ts`.
- **Scene lock.** If you closed the tab mid-fight or mid-set-piece, the clock does not move
  at all; you come back to the same moment.
- When time does pass, the engine runs **Off-Panel Catch-Up**: the Archivist generates
  downtime events only (travel completes, injuries heal, villain meters advance, civilian
  life happens, small street-level incidents resolve). No arc climaxes, no deaths, no
  reveals ever happen off-panel. You then see a **"Previously on…"** recap page.
- Optional later: pre-generate a 15-minute buffer when you close so the next open is instant.

---

## 8. Art direction

See `docs/ART.md` for the sheet contract and the asset pipeline. The short version:

- **Blocky Minecraft-style, top-down, more detail than 8-bit.** Cube heads, boxy bodies,
  soft edges instead of black outlines, block textures on every surface, a slight 2.5D
  front face on walls and objects, layered parallax sky, lighting pools, scanlines optional.
- **Sprites:** 24×34 characters on 16×16 tiles today (procedural rig); hand-drawn sheets
  may be larger and drop in through the manifest.
- **Portraits:** 32×32 in a bevelled SNES-style dialogue window with a nameplate; comic
  caption boxes for narration ("MEANWHILE, IN LATVERIA…"); issue-cover title cards.
- **Camera:** cinematic. Pans, zooms, slow-motion on finishing blows, letterboxing in
  cutscene beats.
- **Audio:** chiptune score with per-character leitmotifs, dynamic layering in combat.
- **Reference feel:** Zelda: Link's Awakening, Pokémon Gold, Shovel Knight's "modern
  retro" polish, Marvel's 90s arcade sprite energy.

---

## 9. Tech stack

- **TypeScript everywhere.**
- **Client:** Phaser 3 (tilemaps, sprites, animation, camera). Vite for dev/build.
- **Server:** Node. Holds the API key, runs the Bullpen, owns the event log and world
  state. SQLite (`better-sqlite3`) for the log and state; plain Markdown/JSON on disk for
  canon so you can edit bibles in any editor.
- **AI:** Claude via the Anthropic SDK with structured outputs (JSON schema) for every
  agent. Strong model for the Showrunner; fast model for everything else. Prompt caching
  on bibles and world-state summaries.
- **Transport:** server streams validated events to the client over WebSocket; client is a
  deterministic playback engine.
- **Hosting:** runs locally first (`npm run dev`). Later, a single small VM (Fly.io /
  Railway) behind basic auth. Single viewer means no scaling concerns.

---

## 10. Starting roster and world

**Heroes (launch):** Spider-Man, Captain America, Iron Man, Thor, Hulk, Daredevil.
**Villains (launch):** Green Goblin, Doctor Doom, Loki, Kingpin, Doctor Octopus, Red Skull.
**Supporting cast (non-combat, NPC-driven):** Aunt May, Mary Jane Watson, J. Jonah Jameson,
Pepper Potts, Nick Fury, Foggy Nelson, Jane Foster.

**Phase 2 roster:** Wolverine, Storm, Black Widow, Doctor Strange, Black Panther,
Scarlet Witch, Vision, Magneto, Venom, Ultron, Thanos (end-game tier).

**Launch map:** Manhattan (5 districts) + Avengers Tower interior + Latveria (Doom's castle,
boss arena).

---

## 11. Roadmap

| Phase | Goal | Done when |
|---|---|---|
| **0. Canon** ✅ | Write bibles for the 12 launch characters, world rules, faction definitions, location histories. | Bibles reviewed by you. |
| **1. Theater** ✅ | One district, three characters, Scene Director + Continuity Editor only. Move / say / emote beats render in Phaser. | You can watch Spidey and Goblin banter on a rooftop for 20 minutes without it breaking. |
| **2. Game** ✅ | Combat Engine, Tactician, stats, HP, injuries, on-map fights, HUD. | A fight looks and feels like a game, outcomes persist. |
| **3. Story** ✅ | Showrunner, arcs as issues, quest log, title cards, Chronicle, Editor's Desk. | A full 3-act issue plays start to finish and your notes shape the next one. |
| **4. World** | More districts and realms, World Sim (clock, weather, schedules, scheme meters), factions, Off-Panel Catch-Up and recaps. | You can close it for a day and come back to a living world. |
| **5. Polish** | Codex, cinematic camera, chiptune score, portraits, roster-request pipeline. | It feels like a PS5 game wearing an NES costume. |

---

## 12. Implementation notes (Phase 1)

- **Event contract** lives in `shared/events.ts` (zod). Beats are what agents may propose;
  events are what the engine emitted. The theater only ever sees events.
- **Markers, not coordinates.** The Director stages characters at named spots on the map
  (`water-tower`, `ledge-north`, `skylight`...). Maps are in `shared/maps.ts` until Phase 4
  moves them to Tiled JSON.
- **Combat resolution** is in `server/src/engine.ts`: to-hit from fighting skill vs. speed,
  trait modifiers (`spider-sense`, `radar-sense`, `healing-factor`), block from durability,
  damage from move power and strength, seeded RNG. 0 HP is knocked out, never dead.
- **Resources** declared in `stats.json` (`"resources": {"web-fluid": 6}`) are decremented by
  move costs and enforced: a strike that cannot be paid for is rejected and the Director is
  told, which is how "out of web fluid" becomes a story beat instead of a bug.
- **Prompt caching.** Bibles and move lists sit in the system prompt with a 1-hour cache
  breakpoint; only the volatile stage state and transcript go in the user turn.
- **Pacing.** The theater reports its queued playback time every second; the engine asks
  the Director for more only when that drops under `LEAD_MS`, and only while a viewer is
  connected. Closing the tab stops generation entirely (pillar 5).
- **Procedural art.** All tiles, sprites, portraits and FX are drawn at boot from palettes in
  `client/src/render/pixels.ts`. Real pixel art replaces texture keys one for one.

### Phase 2 notes (Combat)

- **Fight beats.** The Director proposes `fight` with two sides, a round cap and one line of
  stakes. `server/src/fight.ts` runs the rounds: each round the **Tactician** (one call for
  all combatants, `server/src/agents/tactician.ts`) picks strike / reposition / recover /
  escape per fighter with an optional in-voice line; the engine resolves in initiative order
  (speed, then fighting skill) and streams events to the theater as they resolve. A single
  `strike` beat still exists for sucker punches.
- **Stamina.** Max from speed and durability; moves cost by kind unless the move names a
  `stamina:N` cost; regen each round; a winded fighter misses more and cannot throw heavies.
- **Injuries** (`server/src/combat.ts`): a hit over a quarter of max HP, dropping under a
  quarter HP, or a knockout leaves a named injury with stat penalties and a heal time in
  game days (halved or quartered by healing traits). Injuries appear in the Director's and
  Tactician's prompts, on the HUD, and persist until the clock passes `healsAt`.
- **Resources** are declared in every `stats.json` and enforced for every move cost that
  names them; flavor costs (`shield:thrown`) are ignored by the engine.
- **Healing** runs in ten-game-minute steps while watching and in one step on catch-up,
  never during a fight. Downed fighters come round at 15% HP after the fight with a
  concussion.
- **Persistence.** The world replays `data/events.jsonl` on startup; every event carries the
  full resulting state it needs (HP, stamina, spent resources), so a restart reproduces the
  world exactly. `data/world.json` keeps the Director's scene note and the RNG state.

### Phase 3 notes (Story)

- **Issues are plans** (`server/src/story.ts`): title, premise, antagonist, cast, opening
  positions, three acts each with a goal, a set-piece, one to three observable objectives and
  planned arrivals, optional planned death, hooks for later. The **Showrunner** agent writes
  one per issue from the roster, the Chronicle, memory and your notes; a scripted plan covers
  no-key mode and Issue #1.
- **Acts advance** when every objective is done or failed (the Director marks them with an
  `objective` beat) or after `MAX_CHUNKS_PER_ACT` chunks if an act stalls. Act 3 is held while
  a planned death is pending on the Desk; the window auto-approves after 24 real hours.
- **Cast moves**: `enter` (only cast listed for the issue, at a marker) and `exit` beats.
  A `death` beat is accepted only for the planned, approved character in the planned act;
  the engine never kills otherwise. Deaths go to the ledger in memory.
- **Issue close**: the **Archivist** summarizes the transcript, updates relationship
  temperatures, facts learned on-panel and threads in `data/memory.json`, and writes
  `data/chronicle/issue-NNN.json`. The Showrunner then plans the next issue, game time
  skips ahead by its `opensAfterGameHours` (wounds heal), the cast changes, and a new title
  card plays.
- **Pages**: `/chronicle` renders every issue as readable comic pages with the live
  transcript; `/desk` shows the current act and objectives, lets you add and remove notes,
  approve or veto a planned death, and see stage condition, roster and memory.
- **Theater**: quest log (Q), act banners, objective toasts, end-of-issue cards.

## 13. Open questions

- ~~Permadeath policy~~ **Decided:** deaths are real, rare, Showrunner-planned with a 24-hour
  Editor veto, and never final. Resurrection is a planned story device with a canon
  mechanism and a cost, no sooner than two arcs later. A Deaths and Returns ledger lives in
  the Chronicle. See `canon/world/rules.md` §5.2.
- ~~Multiverse~~ **Decided:** allowed. Earth-616 is prime; variants are their own character
  folders with a `universe` tag and arrive only on-panel via Showrunner-planned events.
  Variants never silently undo a 616 death. See `canon/world/rules.md` §5.4.
- ~~Game-time to real-time ratio~~ **Decided:** 1 game-hour ≈ 10 real minutes while watching;
  grace-then-taper while away (§7).
- Whether the Tactician should voice each combatant separately (more in-character, more
  cost) or pick for all combatants in one call (cheaper, risk of homogenized tactics).

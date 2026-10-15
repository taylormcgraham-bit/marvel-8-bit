# Working with Claude after the game is live

You are the Editor-in-Chief. There are two different things you can "talk to", and it helps
to know which is which.

| You want to... | Talk to | Where |
|---|---|---|
| Nudge the story, suggest a beat, ask for a character to show up, add a new character to the roster, approve or veto a planned death | **The Bullpen** (the AI agents playing the game) | The Editor's Desk at `/desk`, or a `.md` file in `inbox/` |
| Change how the game *works*: rules, maps, art, music, the Desk itself, prompts, a character's bible, a bug | **Claude Code** (me, in a session on this repo) | A Claude Code session, or a GitHub issue |

The Bullpen never changes code. Claude Code never plays the story. Both can run at the same
time; the live game does not have to stop for either.

## Talking to the Bullpen (no code, instant)

Open the Desk and type a note. The Scene Director reads every note on its next call and weaves
it in rather than obeying it literally. Delete the note when it has landed. Roster requests go
in the box on the Desk: the Archivist drafts a bible and stats, you approve or reject.

## Talking to Claude Code (code and canon changes)

1. Open a Claude Code session on this repository, on the branch the game deploys from
   (`claude/ai-marvel-game-concept-u7pdj9` today). On the web: claude.ai/code, pick the repo and
   branch. In a terminal in the repo folder: `claude`.
2. Say what you want in plain words, as you would to a developer who knows the project.
   `CLAUDE.md` in the repo root tells every new session the architecture, the safety rules,
   and how to validate, so you never have to re-explain.
3. I make the change, run the checks, commit and push. If the game is hosted on Render, the
   push redeploys it in a couple of minutes. The browser tab reconnects by itself and the
   story resumes from where the world's save file left it.

Examples of things to ask for:

- "Add Moon Knight with a proper bible and a look the rig can draw."
- "Fights feel too short; raise the default round cap and make the Tactician more cautious."
- "Give Hell's Kitchen its own map and connect it to Chelsea."
- "Rain should actually reduce accuracy on rooftops."
- "The Desk should show how much game time passed since I last looked."
- "Something is wrong: the chronicle shows two Issue #9s."

### Requests from your phone

Open a GitHub issue with the **Change request** template. Next time you start a session, say
"do the open requests" and I work through them oldest first, one commit each, closing each
issue with a note of what changed.

## Keeping the world safe while we change things

The world is the `data/` folder (events log, clock, issue, memory, sim). Code changes are
designed to load an existing world, and I run a replay check before pushing. Even so:

- **Before a big change, download a backup.** Visit `/api/backup` on the live game (it needs
  the same password as everything else). It saves one JSON file with the whole world.
- **To hand me the live world for testing**, attach that backup to the request or drop it in
  the repo folder of your session and tell me where it is. `npm run check:replay -- file.json`
  proves the current code loads it.
- **To restore**, stop the game and run `npm run restore -- file.json`. The old `data/` is
  moved aside, never deleted.
- **Starting fresh is a decision, not a side effect.** I never reset the world unless you say so.

## What a change costs you

- A deploy is a minute or two of rebuild. If a fight is mid-round when the engine restarts,
  it resumes as story, not as a frozen fight.
- Bible edits take effect on the Director's next call. Stats edits take effect for a
  character the next time they spawn (an issue boundary), so a live character keeps their
  current HP and injuries.
- New maps and characters appear when the Showrunner plans the next issue.

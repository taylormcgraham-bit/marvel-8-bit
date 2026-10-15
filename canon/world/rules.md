# World Canon: House Rules

> These are the rules the engine enforces, not suggestions to the agents. Where an agent's
> beat conflicts with a rule here, the Continuity Editor rejects the beat. Where this file
> conflicts with `docs/DESIGN.md`, this file wins for mechanics and the design doc wins for
> intent; flag the conflict for the Editor. Numbers here are tuning values: the Editor may
> adjust them via an Adjustment note, and they take effect at the next scene boundary.

---

## 1. Time

### 1.1 Ratio while watching
- **1 game-hour = 10 real minutes** (6×). A game-day is 4 real hours of watching.
- The World Sim ticks once per game-minute (every 10 real seconds). Combat rounds are
  ~2 real seconds and advance the clock 5 game-seconds each; a 30-round fight is one game
  minute. Fights are short in-world and long on screen, as in comics.
- Scene Director beats (30-90 real seconds) do not advance the clock beyond their
  rendered duration; a conversation takes as long as it takes to play.
- Travel advances the clock in real time at the 6× ratio (a 30-game-minute trip is 5 real
  minutes on the map, visible, skippable by the viewer with a fast-forward that still
  renders the route).

### 1.2 Ratio while closed (catch-up)
- While the page is closed, elapsed real time converts to game time at **1:1** (a day
  away is a game-day), **capped at 7 game-days** per absence.
- Absences under 10 real minutes do not advance the clock at all; the world resumes mid-
  scene.
- Catch-up events are generated only from the allowed list in §7 and are then summarized
  as the "Previously on…" recap.

### 1.3 Calendar
- Day/night palette: dawn 06:00, day 07:00, dusk 19:00, night 20:00 (game time). Night
  increases random street incidents ×1.5 and lowers civilian density ×0.5.
- Characters have schedules in `state/schedules.json` (Peter's classes, Matt's court days,
  Jameson's deadline at 22:00, Fisk's dinner at 20:00). The World Sim moves off-screen
  characters along their schedules; the Scene Director may interrupt a schedule only with
  a scene that explains it.

---

## 2. Travel

Travel is visible on the map and costs game-minutes. The table gives launch-location pairs
in **game minutes** by mode. "Swing" is Spider-Man's web-swinging (also Daredevil's
rooftop run at ×1.5). "Flight" is Iron Man or Thor (Thor ×0.5 outside Manhattan). "Ground"
is a cab, subway or car; civilians and Hulk-as-Banner use it. "Hulk" is Hulk leaping
(Manhattan only; every landing is a T0 destruction event). "Quinjet" requires Avengers
Tower or S.H.I.E.L.D. standing ≥ 20.

Within Midtown, these locations are on the same map and travel between them is 1-3
game-minutes by any mode: `midtown-manhattan`, `avengers-tower` / `stark-tower`,
`baxter-building`, `daily-bugle`, `oscorp-tower`, `fisk-tower`.

| From → To | Swing | Flight | Ground | Hulk |
|---|---|---|---|---|
| Midtown ↔ Hell's Kitchen | 4 | 1 | 10 | 2 |
| Midtown ↔ Chelsea rooftop | 5 | 1 | 12 | 2 |
| Midtown ↔ Sanctum Sanctorum (Village) | 8 | 2 | 15 | 3 |
| Midtown ↔ George Washington Bridge | 20 | 4 | 30 | 8 |
| Midtown ↔ Forest Hills | 30 | 6 | 45 | 12 |
| Hell's Kitchen ↔ Chelsea rooftop | 3 | 1 | 8 | 1 |
| Hell's Kitchen ↔ Forest Hills | 35 | 7 | 55 | 14 |
| Forest Hills ↔ George Washington Bridge | 45 | 9 | 60 | 18 |
| Sanctum ↔ Chelsea rooftop | 4 | 1 | 10 | 2 |
| Any Manhattan location ↔ Xavier's School (Phase 2) | n/a (train 80) | 25 | 75 | n/a |

Realms and foreign locations, from Avengers Tower unless noted:

| Destination | Quinjet | Iron Man | Thor | Other |
|---|---|---|---|---|
| Latveria (Castle Doom) | 180 | 150 | 60 | Doom: instant (own tech). Commercial flight via Hungary: 600. |
| Asgard | n/a | n/a | Bifrost: instant | Bifrost requires Heimdall's leave (Asgard standing ≥ 20, or Thor present). Loki: 15 via hidden paths, Loki only. No other route exists. |
| Wakanda (Phase 2) | 300 | 240 | 90 | Wakandan transport by invitation: 120. |

Rules:
- A character in transit is unavailable for beats except `say` over comms (Avengers, Iron
  Man, S.H.I.E.L.D.) and cannot fight. Arrival is an event.
- Injured characters travel slower: severity 3 ×1.25, severity 4 ×1.5, severity 5 cannot
  travel without transport.
- Spider-Man's swing costs no web fluid for travel (abstracted) but a trip over 20 minutes
  flags fatigue (-1 stamina on arrival).
- Villains with prepared routes (`always-has-exit`, Ock's tunnels) get a one-time
  instant exit from a boss arena to their home location; the Chronicle logs the escape.

---

## 3. Injury and healing

### 3.1 How injuries happen
HP is derived from DUR and tier. The Combat Engine never kills; at 0 HP a character is
**Downed** (see §5). Injuries are rolled when:
- a single hit removes ≥ 25% of max HP (roll severity 1-2),
- HP falls below 50% for the first time in a fight (roll severity 1-3),
- HP falls below 25% (roll severity 2-4),
- the character is Downed (roll severity 3-5).
Seeded RNG; the Tactician's move tags can bias the roll (`bleed` +1, `knockback` into a
wall +1, `terror` adds a morale effect instead of a stat effect).

### 3.2 Severity table (base durations in game-days)

| Severity | Name | Effect | Benched | Heals in |
|---|---|---|---|---|
| 1 | Bruised | -10% max stamina; dialogue mention | no | 1 |
| 2 | Hurt | -1 to one physical stat (STR/SPD/FGT) | no | 3 |
| 3 | Injured | -1 to two stats; travel ×1.25 | 6 game-hours | 7 |
| 4 | Broken | -2 to one stat, -1 to another; travel ×1.5 | 1 game-day | 14 |
| 5 | Critical | -2 to two stats; hospital or medbay required | 3 game-days | 28; permanent Chronicle scar |

"Benched" means the Showrunner may not plan the character into combat and the Tactician
refuses fight-intent beats, unless the character has `fights-through-injury` (Spider-Man,
Daredevil, Captain America), in which case they may fight at a further -1 to all stats and
the injury's remaining duration increases by 50%.

### 3.3 Modifiers (multiply the duration)
- `fast-heal` (Spider-Man): ×0.5.
- `healing-factor` (Wolverine, Phase 2): ×0.1, never benched.
- `gamma-regeneration` (Hulk): ×0.1 while Hulk; ×1.0 as Banner (he carries Hulk's
  injuries at severity minus 2).
- `asgardian` (Thor, Loki): ×0.25.
- `super-soldier-body` (Captain America, Red Skull): ×0.6.
- Treatment: Avengers Tower or Helicarrier medbay ×0.7; hospital ×0.8; Asgardian healing
  ×0.5 while in Asgard; no treatment for severity ≥ 3 ×1.2.
- Villain downtime: a villain in custody heals at ×0.9 (prison medical); a fugitive in a
  lair heals at ×1.1.

### 3.4 Gear is repaired, not healed
`armor-power`, `arm-integrity`, `web-fluid`, `shield` and similar resources restore only at
the owner's workshop or home location: 10% of maximum per game-hour spent there (Tony's
armory ×2). Lost gear (Cap's shield thrown into the river) is an item on the map until
recovered; the Chronicle tracks where it is. Spider-Man's web cartridges refill only in
Forest Hills or a lab he has access to, 1 cartridge per game-hour, max 6.

### 3.5 Visible consequences
Injured characters render with a limp or sling frame at severity ≥ 3, lose one move slot
(the Tactician removes their highest-cost heavy move), and the Scene Director must have at
least one line per scene acknowledging it. Injuries appear in the recap.

---

## 4. Destruction and rebuild

### 4.1 Tiers

| Tier | Examples | Rebuild timer (game-days) | Who may cause it |
|---|---|---|---|
| T0 | Mailbox, lamppost, car, hot-dog cart, hydrant, water tower | 1 | Anyone |
| T1 | Storefront, façade, bus, subway entrance, scaffolding | 3 | Anyone |
| T2 | Building floor, elevated track section, crane, bridge roadway section | 10 | Combat Engine on heavy/ultimate moves |
| T3 | Landmark feature: Bugle sign, Avengers Tower "A", Baxter "4", Oscorp logo, Times Square screens, GWB tower platform | 20 | Showrunner-planned set-piece only |
| T4 | Monumental: bridge span, building collapse, castle wall breach | 45 | Showrunner-planned arc climax, Editor notified |

Indestructible (hard list): the Sanctum Sanctorum's structure and Seal window, the Bifrost,
Castle Doom's keep (walls and Doombot foundry are T4), Odin's palace, the Great Mound, 20
Ingram Street (Showrunner may damage it as T1 only).

### 4.2 Lifecycle
`intact → destroyed (rubble tiles) → rebuilding (scaffold tiles, at 30% of the timer) →
intact`. Damage Control, Inc. crews appear as NPCs on rebuilding tiles during daytime.
Timers run during catch-up. The Codex entry for the location records the event and the
attribution.

### 4.3 Attribution ("who broke it")
The Chronicle names the **proximate cause**: the character whose move resolved into the
destruction. A character knocked into a wall by an enemy's attack is not the cause; the
attacker is. A character who throws a car is the cause. A character who dodges and lets a
projectile hit a storefront is not the cause, unless the move was `redirect`. Environmental
collapse from a villain's `prepared-only` move is the villain's. The Combat Engine emits
the attribution with the destruction event; agents do not decide it.

### 4.4 Collateral and Public Opinion
Each destruction event applies a Public Opinion delta to the attributed character if they
are a hero: **T0 -1, T1 -3, T2 -8, T3 -15, T4 -25.** Civilian injured: -5 per civilian.
Civilian death (Showrunner-planned only): -30. Villain-caused destruction with no hero
present lowers Public Opinion for **all** launch heroes by T-tier ÷ 4 (the city feels
unprotected); villain-caused destruction with a hero present applies nothing to the hero.

Multipliers: Daily Bugle standing ≤ -40 → negatives ×1.5 for that hero (Spider-Man's
default); Avengers goodwill (Captain America, Iron Man, Thor) ×0.75; Hulk ×1.5 (fear);
Daredevil in Hell's Kitchen ×0.75 (his neighborhood forgives him).

Mitigation in the same scene: each Rescue move +2; staying on-panel after the fight ends
(a `help-cleanup` beat) +5 once; a public apology line to a civilian +1 once per scene.
NYPD standing moves by half the Public Opinion delta for destruction of public property.

---

## 5. Downed, capture, and permadeath

### 5.1 Downed
At 0 HP a character is **Downed**: unconscious or helpless, cannot act, takes no further
damage from the Combat Engine (attacks on a Downed target are rejected). After 3 rounds
Downed with no allied Rescue, the fight's winner decides the outcome through a Showrunner-
defined default: heroes **capture** villains (custody at Raft, Ryker's or S.H.I.E.L.D.);
villains **leave** heroes (canon villains gloat and depart) unless the arc plan specifies
capture of the hero. Downed heroes are then Hospitalized (severity roll per §3.1).

### 5.2 Permadeath policy
- **Only the Showrunner may plan a death**, and only in an arc plan with an explicit
  `planned_death` field naming the character, the issue, the act, the mechanism, and the
  canon justification. The Combat Engine can never kill. The Scene Director can never kill.
  The Archivist can never record a death that was not planned.
- **Editor veto window.** A planned death appears in the Editor's Desk when the arc plan is
  submitted and is held for **24 real hours or until the Editor approves**, whichever is
  first. A veto removes the death and the Showrunner re-plans the climax. The arc cannot
  start its final act while a planned death is still in the window.
- Applies equally to heroes, villains and supporting cast (`plot-armor` is implicit for
  every named character). Named characters include anyone with a bible or a Codex entry.
- **Unnamed NPCs.** Mooks and civilians are **incapacitated**, not killed, by default. A
  villain with the `lethal-villain` trait (Red Skull) may kill unnamed mooks only in a scene
  the Showrunner has flagged `lethal: true` in the arc plan; the kill is rendered without
  gore (the Dust of Death's death's-head is the canonical exception) and logged. Unnamed
  civilians are never killed without a `planned_death`-style flag and the same veto window.
- **No deaths off-panel.** Ever. See §7.
- **Reversal.** A death may be reversed only by a later Showrunner-planned arc with a
  canon-faithful mechanism (the Hand, Zola, Asgardian rebirth, a Doombot reveal planned in
  advance), subject to the same veto window, and no sooner than three arcs after the death.
  The Chronicle keeps both events.

### 5.3 Custody
Captured villains stay in custody for a minimum of one game-day and a maximum set by the
Showrunner; escapes are **on-panel events only** and are planned as the opening of an arc
or an incident the viewer watches. A villain's scheme meter continues at half rate in
custody. Kingpin's organization standing ≥ 60 halves a villain's minimum custody.

---

## 6. Knowledge

### 6.1 What "knows" means
Every character has a `knows` set in `state/knowledge.json`: a set of **fact IDs**. A fact
is an atom such as `identity:spider-man=peter-parker`, `location:ock-lair=midtown-
transformer`, `event:gwen-stacy-death`, `scheme:red-skull-sleeper:stage-2`. Facts have a
**visibility**: `public` (anyone may know it; the default for events witnessed by crowds or
printed in the Bugle), `group` (known to a named set), or `secret` (identity, lair, plan).
Dialogue may reference only facts in the speaker's `knows` set; the Continuity Editor
rejects any line that depends on a fact the speaker lacks, and the Tactician may not target
a hidden lair or civilian identity the attacker does not know.

### 6.2 How facts are acquired (all logged as events)
1. **Prior knowledge.** The bible's `[fixed]` sections seed `knows` at character creation
   (Ock knows the Sinister Six roster; Red Skull knows Zola's address). Bibles never seed
   another character's `secret` facts unless the bible says so explicitly (Daredevil and
   MJ know Spider-Man's identity; Ock does not).
2. **Witness.** A conscious character present in a scene acquires any fact that is
   **perceivable** in a beat: within line of sight for visual facts, within earshot for
   spoken ones. Daredevil perceives everything within his radar/hearing radius (the whole
   map tile set of his current location) regardless of walls, but not visual-only facts
   (he cannot read a face; he can know a heartbeat). Disguises and masks block identity
   facts: witnessing Spider-Man unmask grants `identity:spider-man=peter-parker` only if
   the witness already knows `person:peter-parker`; otherwise they acquire
   `identity:spider-man=unknown-face` and a description.
3. **Told.** A `say` beat tagged with a fact ID grants it to every listener in earshot.
   Characters may lie: a listener acquires a `belief` tagged `false`, tracked separately;
   the Continuity Editor permits them to act on it, and a later true fact replaces it.
4. **Media.** A Daily Bugle headline (chosen by the Archivist from `public` events of the
   prior game-day) becomes known to everyone with the `reads-news` trait at 07:00 the next
   game-morning. A Times Square broadcast grants a fact instantly to everyone in Midtown.
   Media can never carry a `secret` fact unless it was first made `public` on-panel.
5. **Deduction.** The Archivist may grant a fact by inference to a character with INT ≥ 5
   when they know at least two supporting facts and the arc has a `deduction-allowed` flag
   for that fact; it is logged as an event with the supporting facts cited. **Secret
   identities and planned reveals can never be deduced**; they require an on-panel reveal
   in a Showrunner-planned arc with Editor approval.
6. **Intel.** Heroes earn Intel points on a villain (from S.H.I.E.L.D., the Bugle, Daredevil's
   informants, witnessing a scheme tell). Intel unlocks `scheme:` facts in stages and
   counter-tags for the Tactician; it never unlocks `identity:` facts.

### 6.3 Propagation
- Facts spread only by the mechanisms above. There is no ambient osmosis: Aunt May does not
  "just know" something happened in Midtown unless she witnessed it, was told, or read it.
- A fact known by ≥ 3 characters with `reads-news`-adjacent roles (reporters, police,
  S.H.I.E.L.D.) may be promoted to `public` by the Archivist at the next scene boundary,
  **unless it is `secret`**, which can only be promoted by an on-panel reveal.
- Villains' scheme tells (see each bible §11) are `public` facts placed in the world; a
  hero "noticing" one is a witness event in a scene, not an automatic grant.
- Forgetting does not happen except by Showrunner-planned magical or medical events, which
  are logged like any other.
- The Archivist's "what each character knows" summary is regenerated at every scene end
  from the event log; it is never hand-edited.

---

## 7. Off-panel catch-up

Run at page open when the clock advances (§1.2). The Archivist generates events only from
the allowed list; the Continuity Editor validates each; anything else is rejected and
deferred to the live world.

**May happen off-panel:**
- Travel in progress completes; characters follow their schedules to expected locations.
- Injuries heal per §3; rebuild timers advance per §4; gear restores at home locations.
- Villain scheme meters advance by their base rate, **capped so no meter exceeds 90%**
  off-panel (it fills on-panel). New tells for seeds are placed in the world.
- Weather, calendar, incident-table rolls for street-level incidents that are resolved
  in one line by a hero already in that district (a mugging stopped, a fire contained),
  with injuries no worse than severity 1 and destruction no worse than T0.
- Relationship values drift by at most ±2 per game-day and never change sign.
- Faction standings decay 1 point per game-day toward baseline per `factions.md`.
- Bugle headlines about events that already happened on-panel.
- Mundane conversation summarized ("Peter and MJ had dinner; he was late") with no new
  facts beyond `public` ones.
- Custody timers run; a villain's lawyers file paperwork; nobody escapes.

**May never happen off-panel:**
- Deaths, resurrections, or any `planned_death` mechanics.
- Identity reveals or any acquisition of a `secret` fact by anyone.
- Fights between named characters; injuries of severity ≥ 2; destruction of T1 or higher.
- Captures or escapes of named characters; changes of custody.
- A scheme meter reaching 100%; a boss fight; an arc beginning or ending.
- Relationship sign flips, betrayals, alliances, breakups, proposals.
- A roster introduction or a Phase 2 location unlocking.
- Any beat the Showrunner has marked as a set-piece.

The recap ("Previously on…") lists the catch-up events in Chronicle order, then the live
scene resumes exactly where the log left it, with the clock advanced and the recap's events
already in `knows` sets where the rules above permit.

---

## 8. Scheme meters (reference)

Every active villain has one meter per active arc seed, 0-100%, advancing at a base rate
of 4% per game-day on-panel and 3% off-panel, modified by faction standings as noted in
`factions.md`. At 60% the Archivist places the seed's first tells; at 80% the second; at
100% the Showrunner must address the scheme in the next arc. On a loss, the meter resets to
the villain's bible value (Doctor Octopus 25%, Red Skull 30%, default 0%). A captured
villain's meters run at half rate.

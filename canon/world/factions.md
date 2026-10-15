# World Canon: Factions

> Canon tier legend: **[fixed]** never changed by agents · **[current]** changed only by
> engine events, tracked in `state/` · **[flavor]** agents may extend in-voice.
>
> Factions are the ten groups named in `docs/DESIGN.md` §4.4. Each holds a **standing**
> toward every hero (and, where it matters, every villain) in the range -100..100, stored in
> `state/factions.json` and seeded from each character's `stats.json` `factions` block.
> Standing drifts with actions as described below, decays 1 point per game-day toward the
> character's seeded baseline, and is read by the Showrunner (who can be recruited, who is
> hunted), the Scene Director (how NPCs greet a hero), the Tactician (does the NYPD shoot
> at you or with you), and the World Sim (incident tables). The slugs below are the keys.
>
> Thresholds used throughout: **hostile** ≤ -60 · **cold** -59..-20 · **neutral** -19..19
> · **warm** 20..59 · **allied** ≥ 60.

---

## public-opinion — Public Opinion

**What it is [fixed].** The mood of New York toward a given hero: what the person on the
street says when the costume swings overhead. In canon this swings wildly and fast;
Spider-Man has been cheered and pelted with garbage in the same week, and the Avengers
coast on decades of goodwill until they level a block. It is the faction every other
faction reads.

**Who "leads" it.** Nobody. It is an aggregate. Its loudest inputs are the Daily Bugle's
front page, Times Square broadcasts, and what the NYPD says on camera.

**Raises standing.** Rescue moves (+2 each); ending a fight with no civilian injuries
(+3); staying after a fight to help (+5); a public team-up with an allied-standing hero
(+2); a Bugle positive headline (+5; rare for Spider-Man); stopping a street incident from
the random table (+1); unmasking a frame-up (+10).

**Lowers standing.** Collateral damage by tier (see `rules.md`: T0 -1, T1 -3, T2 -8,
T3 -15, T4 -25); a civilian injured in a hero's fight (-5); a Bugle negative headline (-5);
being seen fleeing a fight while civilians are in danger (-8); fighting another hero in
public (-6 to both); a villain's propaganda success (Red Skull's `propagandist` move, -4 to
the targeted hero).

**At high standing (allied).** Civilians point heroes toward trouble (incident spawns
within view); bystanders cheer (morale buff +1 in the first round of a fight); NYPD standing
drifts up 1 per game-day; Jameson's headlines land softer (negative deltas ×0.75).

**At low standing (hostile).** Crowds boo and throw things (-1 morale, first round);
civilians refuse Rescue prompts half the time, slowing rescues; frame-ups become available
to villains as a scheme; NYPD standing drifts down 1 per game-day; Jameson's headlines hit
harder (negative deltas ×1.5).

---

## nypd — New York Police Department

**What it is [fixed].** The city's police. In canon the NYPD is split on costumed heroes:
Captain George Stacy was Spider-Man's quiet ally until his death (ASM #90); Jean DeWolff
trusted him and was murdered for her trouble; plenty of beat cops have drawn on him. The
department respects Captain America without reservation and is wary of everyone else.
Wilson Fisk owns a slice of it and always has.

**Who leads it.** The Commissioner (unnamed at launch, NPC). Named precinct voices: Midtown
South and the 15th are the Spider-Man beats in this world; Hell's Kitchen's precinct is
Fisk's.

**Raises standing.** Handing over a captured villain alive (+6); leaving evidence usable in
court instead of webbed to a lamppost with a note (+3); saving an officer (+8); cooperating
with a named officer on-panel (+2); S.H.I.E.L.D. vouching (if S.H.I.E.L.D. standing is
allied, +1 per game-day while above neutral).

**Lowers standing.** Fleeing a crime scene before police arrive (-2; Spider-Man does this
constantly); destruction of police property (-5); striking an officer (-20); a villain
escaping custody after a hero's handoff "went wrong" (-4); Public Opinion drift (above).

**At high standing (allied).** Officers hold a perimeter during fights (civilians clear
faster, reducing collateral risk); hostages are negotiated for instead of shot at; a hero
can call for a police cordon as a utility beat; the NYPD shares incident intel (Intel +1 on
the active villain each game-day).

**At low standing (hostile).** Officers fire on the hero when a fight begins (ranged mook
attacks in round one); warrants exist; a hero cannot hand over villains without a scene;
Kingpin's bribed cops leak the hero's movements to Fisk (Kingpin's org gets a tell).

---

## shield — S.H.I.E.L.D.

**What it is [fixed].** The Strategic Homeland Intervention, Enforcement and Logistics
Division, the world's intelligence-and-superhuman-response agency, headquartered on the
Helicarrier. Founded in response to Hydra; infiltrated by Hydra more than once. Nick Fury
has run it longer than anyone and trusts almost nobody. It licenses the Avengers, tolerates
Spider-Man, and keeps files on everyone.

**Who leads it.** Director Nick Fury (launch supporting cast). Beneath him, unnamed agents
drawn from the schedule table; Sharon Carter and Maria Hill may be referenced but are not
NPCs at launch.

**Raises standing.** Stopping a Hydra operation (+8); sharing intel with Fury on-panel
(+3); answering a Fury summons (+2); world-tier threat neutralized (+10); handing a
captured world-tier villain to S.H.I.E.L.D. rather than NYPD (+5).

**Lowers standing.** Refusing a direct Fury request (-4); unilateral action in a foreign
realm (Latveria, Asgard) without clearance (-6); destroying S.H.I.E.L.D. property (-8);
concealing a known Hydra asset (-15); Public Opinion falling below -60 (-1 per game-day).

**At high standing (allied).** Fury shares villain scheme-meter readings (the hero's
Intel on that villain jumps +2); Quinjet or S.H.I.E.L.D. transport available for travel
(see `rules.md` travel table); medbay access on the Helicarrier (healing modifier 0.7);
S.H.I.E.L.D. agents appear as allied mooks in world-tier fights.

**At low standing (hostile).** S.H.I.E.L.D. monitors the hero (villains with `master-
strategist` may acquire the hero's location from a leaked file as a tell); travel requests
denied; Fury's dialogue turns to threats; at ≤ -80 a S.H.I.E.L.D. apprehension incident
can spawn (never lethal).

---

## daily-bugle — The Daily Bugle

**What it is [fixed].** New York's tabloid of record. J. Jonah Jameson's paper has run
"Spider-Man: Threat or Menace?" in every format print allows. It is also a real newspaper
with real reporters (Robbie Robertson, Ben Urich, Betty Brant) who get things right more
often than Jameson likes. The Bugle amplifies Public Opinion: it does not create the mood,
it decides how loud it is.

**Who leads it.** J. Jonah Jameson, publisher (supporting cast). Robbie Robertson, editor,
is the moderating voice and the mechanism by which the Bugle occasionally prints the truth.

**Raises standing.** An exclusive (a hero giving a Bugle reporter a quote on-panel, +4);
saving a Bugle employee (+8; saving Jameson himself +10 and he will never mention it);
Ben Urich's investigation vindicated by the hero's actions (+5); proving a villain framed
the hero (+8); Spider-Man can never exceed -20 while Jameson is publisher (hard cap,
[fixed]).

**Lowers standing.** Collateral damage in Midtown within sight of the building (-3 on top
of Public Opinion); refusing an interview (-1); embarrassing Jameson publicly (-6); a photo
of the hero fleeing (-4); Jameson's personal grudge (Spider-Man drifts -1 per game-day
toward -60 regardless; Hulk toward -40).

**At high standing (warm/allied).** Headlines about the hero skew positive (Public
Opinion positive deltas ×1.25); the hero may plant a story as a utility beat (one per arc)
that lowers a villain's cover; Urich shares tips (Intel +1 on Kingpin or Hydra per arc).

**At low standing (hostile).** Every negative Public Opinion delta is multiplied ×1.5 and
every positive ×0.5; "MENACE" headlines spawn as the morning tile; villains with
`propagandist` get a free -2 Public Opinion against the hero per arc; the Bugle may be the
venue a villain uses to send the hero a message.

---

## hellfire-club — The Hellfire Club

**What it is [fixed].** An exclusive society of the wealthy and powerful with branches in
New York and London, founded in the eighteenth century. Its public face is a private club
on Fifth Avenue; its Inner Circle, styled as chess pieces (Black King, White Queen and so
on), manipulates governments and markets and has included Sebastian Shaw, Emma Frost and
Selene. The Club's mutant politics make it a Phase 2 concern, but its money and its
members' hooks into Oscorp, Stark's competitors and the Latverian embassy are live at
launch.

**Who leads it.** The Inner Circle. At launch, Sebastian Shaw is Black King; no Inner
Circle member is an NPC on the map. The Club manifests through intermediaries, invitations,
and money.

**Raises standing.** Discretion (declining to investigate a Club-linked incident, +3; the
Club notices); accepting an invitation (+5; Tony Stark has standing invitations); defeating
a Club rival (the Club dislikes Fisk's rise; a public Kingpin setback is +2 with them);
protecting Club property without knowing it (+1).

**Lowers standing.** Raiding the Fifth Avenue club (-15); exposing a member (-10);
S.H.I.E.L.D. standing above 60 (-1 per game-day; they distrust Fury's friends); refusing an
invitation publicly (-5).

**At high standing (warm/allied).** Invitations to events that serve as neutral-ground
scenes with villains (Doom, Osborn and Fisk have all attended); a line of credit (gear
repairs cost half the game-time); information about Latveria and Oscorp that is accurate
and self-serving.

**At low standing (hostile).** The Club funds the hero's enemies (one villain's scheme
meter gets +5% at arc start); Public Opinion attacks through purchased press (-2 per arc);
the Club's security as hostile mooks on Fifth Avenue; in Phase 2, Inner Circle members as
antagonists.

---

## hydra — Hydra

**What it is [fixed].** The terrorist order whose creed is "Cut off a limb and two more
shall take its place." Baron Wolfgang von Strucker built modern Hydra from the ashes of the
Nazi war machine; the Red Skull has commanded, warred with and been betrayed by it; it has
infiltrated S.H.I.E.L.D. to its core at least once. Its green-hooded soldiers are the Marvel
Universe's default mooks and its cells are everywhere. Hydra is less an organization than a
weather system of fanatics.

**Who leads it [current].** Split. Baron Strucker holds the global apparatus and three of
New York's five cells; the Red Skull holds the other two and intends to hold all five. A
hero's standing is with Hydra as a whole; the Skull's bible tracks his personal cells.

**Raises standing.** Almost nothing a hero does. Hydra standing is best read as a fear
index: the less Hydra wants to meet a hero, the lower the number, and that is the hero's
goal. A hero who lets a Hydra cell escape to pursue another target gains +2 (they note the
mercy and exploit it). Villains: cooperation with the Skull's faction (+5 per joint
operation).

**Lowers standing.** Every Hydra operation stopped (-5); every cell destroyed (-10);
capturing a Hydra officer alive and handing to S.H.I.E.L.D. (-8); Captain America exists
(his standing is pinned at -100).

**At "high" standing (above -20, for a hero).** Hydra does not prioritize the hero: fewer
Hydra ambush incidents; Hydra mooks may retreat rather than fight the hero. For a villain,
high standing means Hydra troops are available as minions in that villain's boss fights.

**At low standing (hostile, the normal state for heroes).** Hydra targets the hero: ambush
incidents on the random table; a bounty that draws mercenary mooks; the Skull's
`propagandist` moves target the hero preferentially. At ≤ -80, Hydra will attempt to use
the hero's loved ones as leverage if any are publicly known (never off-panel).

---

## latveria — Latveria

**What it is [fixed].** The sovereign Balkan kingdom of Doctor Doom, recognized by the
United Nations, with an embassy in New York that has diplomatic immunity and has used it. Its
people are prosperous, educated, and watched by Doombots. Latveria's standing is Doom's
opinion of a hero expressed as state policy: whom he receives as an equal, whom he tolerates,
whom he has declared an enemy of the realm.

**Who leads it.** Doctor Doom, absolute monarch. Boris as chamberlain; Kristoff Vernard as
heir; the Latverian ambassador in New York as the on-map voice at launch.

**Raises standing.** Defeating a common enemy on Doom's behalf without being asked (+10;
Doom considers it tribute); treating Doom with formal courtesy on-panel (+3); saving a
Latverian citizen (+5); declining to invade when provoked (+4; Doom notices restraint);
Reed Richards being humiliated (+2; this is petty and canonical).

**Lowers standing.** Entering Latveria uninvited (-15); destroying a Doombot in Latveria
(-5 each) or in New York (-2 each); striking Doom in his own castle (-20); allying openly
with the Fantastic Four or S.H.I.E.L.D. against Latveria (-10); mocking Doom (-8; he hears
everything).

**At high standing (warm/allied).** Safe passage into Latveria (travel without the
Doombot ambush on arrival); an audience in the throne room as a scene; Doom may share
intel on a mutual enemy (Intel +2 on Red Skull, Loki or Doctor Octopus); the embassy
offers sanctuary (a hero can shelter there; Doom will remind them of it forever).

**At low standing (hostile).** Doombots hunt the hero when they enter Latveria; the
embassy obstructs (NYPD standing -2 if the hero violates its grounds); Doom's scheme meter
accelerates against the hero specifically (+5% per arc); diplomatic complaints lower
S.H.I.E.L.D. standing (-2 per arc while hostile).

---

## asgard — Asgard

**What it is [fixed].** The Realm Eternal and its court, which judges mortals by honor,
courage and hospitality. Odin's good opinion is rare; the Warriors Three's is cheap and
loud; Heimdall's is the one that opens the Bifrost. Asgard's standing is the court's
collective regard for a hero, with Odin's judgment as the decisive weight.

**Who leads it.** Odin All-Father. Thor as prince; Heimdall as gatekeeper; Loki as the
court's unfixable problem.

**Raises standing.** Fighting beside Thor against a worthy foe (+5); accepting a feast
invitation and behaving (+3); defeating a Frost Giant, Troll or Asgardian relic threat on
Midgard (+8); showing courage against a stronger enemy witnessed by an Asgardian (+4);
honoring a boast (+2).

**Lowers standing.** Fleeing a fight witnessed by an Asgardian (-6); harming an
Asgardian citizen (-15); trafficking with Loki knowingly (-10); using the Bifrost without
leave (-8); insulting Odin (-12).

**At high standing (warm/allied).** Heimdall opens the Bifrost on request (instant travel
to and from Asgard; see `rules.md`); Asgardian healing (healing modifier 0.5 while in
Asgard); the Warriors Three may arrive as allies in a world-tier fight (Showrunner
discretion); Odin may grant a boon as an arc reward.

**At low standing (hostile).** Bifrost closed; Asgardian guards hostile on arrival;
Thor's own standing with the hero takes pressure (-1 relationship per game-day while
hostile); Loki finds the hero a more attractive pawn (Loki's scheme meter +5% at arc start
if it targets Midgard).

---

## wakanda — Wakanda

**What it is [fixed].** The vibranium kingdom, whose foreign policy is suspicion backed by
the most advanced technology on Earth. Wakanda does not need anyone and has made that its
diplomatic position for a thousand years. Its standing with a hero is the Panther throne's
assessment of whether that hero is a friend to Wakanda, a threat to the Mound, or simply an
outsider. Phase 2 for the map; live at launch as a faction because vibranium is already in
the world (Captain America's shield is a vibranium alloy, and Wakanda knows where every
gram of it is).

**Who leads it.** King T'Challa, the Black Panther (Phase 2 roster). The Wakandan
ambassador and the Dora Milaje embassy guard are the New York presence.

**Raises standing.** Protecting a Wakandan citizen or diplomat (+8); returning stolen
vibranium (+10); refusing to sell or share Wakandan technology (+5); fighting beside
T'Challa in Phase 2 (+5); Captain America starts warm by canon.

**Lowers standing.** Stealing or buying stolen vibranium (-20); entering Wakanda uninvited
(-15); allying with Klaw, Doom or the Hellfire Club against Wakandan interests (-10);
public contempt for Wakanda's secrecy (-4).

**At high standing (warm/allied).** Wakandan tech repairs gear faster (gear-restoration
time ×0.5 at the embassy); the border opens (Phase 2 travel); intel on vibranium thefts
and on Klaw; a Dora Milaje escort may appear as allied mooks in New York once per arc.

**At low standing (hostile).** The embassy denies everything; Wakanda tracks the hero's
vibranium (Captain America's shield location is always known to them); Phase 2: Dora
Milaje interdiction incidents; Wakandan pressure on S.H.I.E.L.D. (-2 per arc).

---

## kingpin-org — The Kingpin's Organization

**What it is [fixed].** Wilson Fisk's criminal empire: the Maggia's old rackets
consolidated under one enormous man who never carries a weapon and never needs to.
Protection, narcotics, gambling, construction fraud, political corruption, and a payroll
that includes assassins (Bullseye, Elektra, Typhoid Mary at various times), cops, judges and
reporters. Fisk has fought Daredevil, Spider-Man and the Punisher to a standstill for
decades and has been "retired," imprisoned, exiled and mayor without losing the title.

**Who leads it.** Wilson Fisk, the Kingpin (launch villain). Lieutenants are unnamed NPCs
at launch; Hammerhead, Tombstone and the Owl are rivals, not members.

**Raises standing.** Taking Fisk's side against a rival (Red Skull, Hammerhead, the Owl:
+8; Fisk remembers debts); leaving Fisk's legitimate business alone (+1 per game-day while
the hero is not actively investigating him); accepting a Fisk favor (+5 and a hook; he
collects); a villain who pays Fisk for services (+5 per transaction; Doctor Octopus is at
20 for this reason).

**Lowers standing.** Interrupting a Kingpin operation (-5); costing Fisk money (per tier of
destruction to Fisk-owned property, double the Public Opinion delta); arresting a lieutenant
(-8); investigating Fisk Tower (-6); Daredevil and Spider-Man start hostile and their
standing can never exceed -40 while Fisk lives ([fixed]).

**At high standing (for villains; heroes cannot reach it).** Fisk's lieutenants act as
minions; Fisk's lawyers spring the villain from custody faster (capture duration ×0.5);
Fisk's financing advances a scheme meter (+10% per arc); the NYPD's bribed officers look
away.

**At low standing (hostile, the hero norm).** Kingpin's bribed police leak the hero's
movements (Fisk gets a tell when the hero enters Hell's Kitchen or Fisk Tower); contract
hits as incidents (never lethal without Showrunner planning); pressure on the hero's
civilian life (Nelson & Murdock lose a client; Peter Parker's rent goes up); at ≤ -80 Fisk
makes the hero a priority target and his scheme meter rotates to focus on them.

/**
 * Server-rendered pages: the Chronicle (issues as readable comic pages) and the Editor's
 * Desk (current act, objectives, notes, pending deaths). Plain HTML, no build step.
 */
import type { Showrunner } from "./showrunner.js";
import { listCharacterIds, loadCharacter } from "./canon.js";
import { MAPS } from "../../shared/maps.js";
import { standingWord } from "./sim.js";
import { listPending } from "./agents/roster.js";
import { loadWorldDoc } from "./canon.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const CSS = `
:root{--bg:#0b0b14;--panel:#141432;--ink:#e8e8f8;--muted:#9a9ab8;--yellow:#ffd860;--red:#e02828;--green:#58d854;--blue:#48b8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 system-ui,sans-serif}
header{display:flex;gap:18px;align-items:baseline;padding:14px 20px;background:var(--panel);border-bottom:3px solid var(--red)}
header h1{margin:0;font:16px "Press Start 2P",monospace;color:var(--yellow)}header a{color:var(--muted);text-decoration:none}header a:hover{color:var(--ink)}
main{max-width:980px;margin:0 auto;padding:20px}
.card{background:var(--panel);border:2px solid #303060;border-radius:4px;padding:14px 16px;margin:0 0 16px;box-shadow:3px 3px 0 #000}
h2{font:12px "Press Start 2P",monospace;color:var(--yellow);margin:0 0 10px}h3{margin:14px 0 6px;font-size:13px;color:var(--blue);text-transform:uppercase;letter-spacing:1px}
.muted{color:var(--muted)}.row{display:flex;gap:14px;flex-wrap:wrap}.row>*{flex:1 1 300px}
ul{padding-left:18px;margin:6px 0}li{margin:2px 0}
.obj.done{color:var(--green)}.obj.failed{color:var(--red);text-decoration:line-through}.obj.open{color:var(--ink)}
.panel{background:#0e0e24;border:2px solid #303060;padding:8px 10px;margin:6px 0;border-radius:3px}
.cap{display:inline-block;background:var(--yellow);color:#1a1208;font:10px "Press Start 2P",monospace;padding:6px 8px;margin:8px 0 2px;box-shadow:2px 2px 0 #000}
.say{margin:4px 0}.say b{color:var(--yellow)}.fight{color:#ff9a6a}.sys{color:var(--muted);font-size:12px}
.title{display:block;background:var(--red);color:#fff;font:12px "Press Start 2P",monospace;padding:10px 12px;margin:14px 0 8px;box-shadow:3px 3px 0 #000}
textarea,input{width:100%;background:#0e0e24;color:var(--ink);border:2px solid #303060;padding:8px;font:inherit}
button{background:var(--yellow);color:#1a1208;border:0;padding:8px 12px;font:11px "Press Start 2P",monospace;cursor:pointer;box-shadow:2px 2px 0 #000;margin:4px 4px 0 0}
button.danger{background:var(--red);color:#fff}button.quiet{background:#303060;color:var(--ink)}
.note{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.bar{height:8px;background:#202030;border:1px solid #6a6a8a}.bar i{display:block;height:100%;background:var(--green)}
.small{font-size:12px}
`;

const page = (title: string, body: string, nav: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet"><style>${CSS}</style></head>
<body><header><h1>MARVEL 8-BIT</h1>${nav}</header><main>${body}</main></body></html>`;

const NAV = `<a href="/">Theater</a> <a href="/chronicle">Chronicle</a> <a href="/codex">Codex</a> <a href="/desk">Editor's Desk</a>`;

function transcriptHtml(lines: string[]): string {
  return lines.map((l) => {
    if (l.startsWith("[CAPTION]")) return `<span class="cap">${esc(l.slice(10))}</span><br>`;
    if (l.startsWith("=== ISSUE")) return `<span class="title">${esc(l.replace(/=/g, "").trim())}</span>`;
    if (l.startsWith("=== END")) return `<span class="title" style="background:#303060">${esc(l.replace(/=/g, "").trim())}</span>`;
    if (l.startsWith("--- ACT")) return `<h3>${esc(l.replace(/---/g, "").trim())}</h3>`;
    if (l.startsWith("[FIGHT") || l.startsWith("[ROUND") || / uses .* on /.test(l) || l.includes("is injured")) return `<div class="fight">${esc(l)}</div>`;
    if (l.startsWith("[SCENE]") || l.startsWith("[OBJECTIVE") || l.startsWith("[DEATH]")) return `<div class="sys">${esc(l)}</div>`;
    const m = /^(.+?) \((\w+)\): "(.*)"$/.exec(l);
    if (m) return `<div class="say"><b>${esc(m[1]!)}</b><span class="muted small"> (${esc(m[2]!)})</span>: ${esc(m[3]!)}</div>`;
    return `<div class="sys">${esc(l)}</div>`;
  }).join("\n");
}

export function chroniclePage(run: Showrunner): string {
  const past = run.memory.issues();
  const current = run.story.loaded && !run.story.finished
    ? `<div class="card"><h2>Now playing: Issue #${run.story.number} — ${esc(run.story.plan.title)}</h2><p class="muted">${esc(run.story.plan.subtitle)}</p><p>${esc(run.story.plan.premise)}</p>
       <h3>Act ${run.story.actIndex + 1}: ${esc(run.story.act.title)}</h3><p class="muted">${esc(run.story.act.goal)}</p>
       <ul>${run.story.actObjectives.map((o) => `<li class="obj ${o.status}">${esc(o.text)}</li>`).join("")}</ul>
       <h3>Transcript</h3><div class="panel">${transcriptHtml(run.world.currentIssueEvents(run.story.number).filter((e) => e.seq > 0 && e.type !== "note" && e.type !== "wait" && e.type !== "face" && e.type !== "round").map((e) => run.world.describeEvent(e)))}</div></div>`
    : `<div class="card"><p class="muted">No issue in progress.</p></div>`;
  const archive = past.length
    ? past.slice().reverse().map((i) => `<div class="card"><h2>Issue #${i.number} — ${esc(i.title)}</h2><p class="muted">${esc(i.subtitle)}</p><p>${esc(i.summary)}</p>
        <h3>Key events</h3><ul>${i.keyEvents.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
        ${i.threads.length ? `<h3>Threads</h3><ul>${i.threads.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <details><summary class="muted">Full transcript (${i.transcript.length} lines)</summary><div class="panel">${transcriptHtml(i.transcript)}</div></details></div>`).join("")
    : "";
  const ledger = run.memory.ledger.length ? `<div class="card"><h2>Deaths and Returns</h2><ul>${run.memory.ledger.map((l) => `<li>${esc(l.kind)}: <b>${esc(run.world.nameOf(l.who))}</b>, issue ${l.issue}, ${esc(l.how)}</li>`).join("")}</ul></div>` : "";
  return page("Chronicle", current + ledger + archive, NAV);
}

export function deskPage(run: Showrunner, notes: { file: string; text: string }[]): string {
  const s = run.story;
  const d = s.pendingDeath;
  const issue = s.loaded ? `<div class="card"><h2>Issue #${s.number} — ${esc(s.plan.title)}</h2><p class="muted">${esc(s.plan.subtitle)}</p>
    <div class="row">${s.plan.acts.map((a, i) => `<div class="panel"><b>${i === s.actIndex ? "▶ " : ""}Act ${i + 1}: ${esc(a.title)}</b><div class="muted small">${esc(a.goal)}</div>
      <ul>${(s.objectives[i] ?? []).map((o) => `<li class="obj ${o.status}">${esc(o.text)}</li>`).join("")}</ul></div>`).join("")}</div>
    <p class="small muted">Cast: ${s.plan.cast.map((id) => esc(run.world.nameOf(id))).join(", ")} · Hooks: ${s.plan.nextHooks.map(esc).join(" / ") || "none"}</p></div>` : `<div class="card"><p class="muted">No issue yet. Open the theater to start one.</p></div>`;
  const death = d ? `<div class="card"><h2>Planned death: ${esc(run.world.nameOf(d.who))}</h2><p>Act ${d.act}. <b>Mechanism:</b> ${esc(d.mechanism)}</p><p><b>Justification:</b> ${esc(d.justification)}</p>
    <p>Status: <b>${d.status}</b>${d.status === "pending" ? ` (auto-approves ${new Date(d.submittedAt + 24 * 3600_000).toLocaleString()})` : ""}</p>
    ${d.status === "pending" ? `<form method="post" action="/api/deaths/approve"><button class="danger">Approve</button></form><form method="post" action="/api/deaths/veto"><button class="quiet">Veto</button></form>` : ""}</div>` : "";
  const sim = `<div class="card"><h2>World</h2><p class="small"><b>${esc(run.world.map.name)}</b> · ${esc(run.world.weather)} · ${esc(run.world.clock.label)}</p>
    <h3>Villain schemes</h3>${Object.entries(run.sim.schemes).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<div class="small">${esc(run.world.nameOf(id))} <span class="muted">${Math.round(v)}%</span><div class="bar"><i style="width:${Math.round(v)}%;background:${v >= 80 ? "var(--red)" : v >= 50 ? "var(--yellow)" : "var(--blue)"}"></i></div></div>`).join("")}
    <h3>Standings</h3><table class="small" style="border-collapse:collapse">${Object.entries(run.sim.factions).filter(([id]) => loadCharacter(id)?.stats.role === "hero").map(([id, m]) => `<tr><td style="padding:2px 10px 2px 0"><b>${esc(run.world.nameOf(id))}</b></td><td>${Object.entries(m).map(([k, v]) => `${esc(k)} <span class="muted">${Math.round(v ?? 0)} ${standingWord(v ?? 0)}</span>`).join(" · ")}</td></tr>`).join("")}</table>
    <h3>Whereabouts</h3><p class="small">${Object.entries(run.sim.whereabouts).map(([id, m]) => `${esc(run.world.nameOf(id))}: <span class="muted">${esc(MAPS[m]?.name ?? m)}</span>`).join(" · ")}</p></div>`;
  const stage = `<div class="card"><h2>On stage</h2>${run.world.stage().map((a) => `<div class="panel"><b>${esc(a.name)}</b> <span class="muted small">HP ${a.hp}/${a.maxHp} · stamina ${a.stamina}/${a.maxStamina}${a.injuries.length ? " · " + a.injuries.map((i) => esc(i.name)).join(", ") : ""}</span><div class="bar"><i style="width:${Math.round(100 * a.hp / a.maxHp)}%"></i></div><div class="small muted">${Object.entries(a.resources).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</div></div>`).join("") || "<p class='muted'>Empty.</p>"}
    <p class="small muted">Game time ${esc(run.world.clock.label)} · mode ${run.mode}</p></div>`;
  const notesHtml = `<div class="card"><h2>Notes to the Bullpen</h2><p class="muted small">The Showrunner reads these when planning the next issue; the Director reads them every scene. Woven in, never obeyed literally.</p>
    ${notes.map((n) => `<div class="panel note"><div>${esc(n.text)}</div><form method="post" action="/api/notes/delete"><input type="hidden" name="file" value="${esc(n.file)}"><button class="quiet">×</button></form></div>`).join("") || "<p class='muted'>No notes.</p>"}
    <form method="post" action="/api/notes"><textarea name="text" rows="3" placeholder="e.g. I'd love to see more of Daredevil and Spidey as friends. Or: bring in Doctor Doom next."></textarea><button>Add note</button></form></div>`;
  const pending = listPending();
  const roster = `<div class="card"><h2>Roster</h2><p class="small">${listCharacterIds().map((id) => { const c = loadCharacter(id)!; return `<a class="panel" style="display:inline-block;margin:3px;color:inherit;text-decoration:none" href="/codex#${id}">${esc(c.stats.name)} <span class="muted">${c.stats.role}</span></a>`; }).join(" ")}</p>
    ${pending.length ? `<h3>Drafts awaiting your approval</h3>${pending.map((p) => `<div class="panel note"><div><b>${esc(p.name)}</b> <span class="muted small">(${esc(p.requestedAs)}${p.mode === "stub" ? ", STUB: no model credentials" : ""})</span> · <a href="/codex#${esc(p.id)}" style="color:var(--blue)">read the draft</a></div><div><form method="post" action="/api/roster/approve" style="display:inline"><input type="hidden" name="id" value="${esc(p.id)}"><button>Approve</button></form><form method="post" action="/api/roster/reject" style="display:inline"><input type="hidden" name="id" value="${esc(p.id)}"><button class="quiet">Reject</button></form></div></div>`).join("")}` : ""}
    <h3>Request a character</h3><form method="post" action="/api/roster/request"><input name="request" placeholder="e.g. Moon Knight, or: Miles Morales from Earth-1610"><button>Draft a bible</button></form>
    <p class="muted small">The Archivist drafts a full bible and stats in the house format from canon. You read it on the Codex page, then approve or reject. Approved characters can be cast by the Showrunner from the next issue.</p></div>`;
  const memory = `<div class="card"><h2>Memory</h2><pre class="small" style="white-space:pre-wrap">${esc(run.memory.describe())}</pre></div>`;
  const changes = `<div class="card"><h2>Changing the game itself</h2><p class="small">Notes above go to the Bullpen, who play the story. Rules, maps, art, bugs and new systems go to Claude Code in a session on the repo (see <code>docs/WORKING-WITH-CLAUDE.md</code>). Before a big change, <a href="/api/backup" style="color:var(--blue)">download a backup of the world</a> (${run.world.events.length} events, issue #${run.story.loaded ? run.story.number : 0}).</p></div>`;
  return page("Editor's Desk", issue + death + stage + sim + notesHtml + roster + memory + changes, NAV);
}


export function codexPage(run: Showrunner): string {
  const ids = [...listCharacterIds(), ...listPending().map((p) => p.id)];
  const pendingIds = new Set(listPending().map((p) => p.id));
  const section = (b: string, n: number) => { const m = new RegExp(`## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`).exec(b); return m ? m[1]!.trim() : ""; };
  const md = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\n\n/g, "<br><br>").replace(/\n- /g, "<br>· ");
  const chars = ids.map((id) => {
    const c = loadCharacter(id); if (!c) return "";
    const a = run.world.actors.get(id);
    const st = run.sim.factions[id];
    const rel = run.memory.relationships.filter((r) => r.a === id || r.b === id);
    const facts = run.memory.facts.filter((f) => f.who === id);
    const dead = run.world.deceased.has(id);
    const status = dead ? "deceased" : a ? `on stage at ${esc(MAPS[a.location]?.name ?? a.location)}, HP ${a.hp}/${a.maxHp}${a.injuries.length ? ", " + a.injuries.map((i) => esc(i.name)).join(", ") : ""}` : `last seen: ${esc(MAPS[run.sim.whereabouts[id] ?? ""]?.name ?? run.sim.whereabouts[id] ?? "unknown")}`;
    return `<div class="card" id="${esc(id)}"><h2>${esc(c.stats.name)}${pendingIds.has(id) ? ' <span class="muted">(draft, pending approval)</span>' : ""}</h2>
      <p class="muted small">${esc(c.stats.civilianName ?? "")} · ${c.stats.role} · ${c.stats.tier} tier · INT ${c.stats.grid.int} STR ${c.stats.grid.str} SPD ${c.stats.grid.spd} DUR ${c.stats.grid.dur} NRG ${c.stats.grid.nrg} FGT ${c.stats.grid.fgt}</p>
      <p><b>Status:</b> ${status}</p>
      <div class="row"><div><h3>Who they are</h3><p class="small">${md(section(c.bible, 1))}</p></div><div><h3>Weaknesses</h3><p class="small">${md(section(c.bible, 4).slice(0, 900))}</p></div></div>
      ${c.stats.role === "villain" && run.sim.schemes[id] !== undefined ? `<p class="small"><b>Scheme meter:</b> ${Math.round(run.sim.schemes[id]!)}%</p>` : ""}
      ${st && Object.keys(st).length ? `<p class="small"><b>Standings:</b> ${Object.entries(st).map(([k, v]) => `${esc(k)} ${Math.round(v ?? 0)} (${standingWord(v ?? 0)})`).join(" · ")}</p>` : ""}
      ${rel.length ? `<h3>Relationships (this world)</h3><ul class="small">${rel.map((r) => `<li>${esc(run.world.nameOf(r.a === id ? r.b : r.a))}: ${r.temperature >= 0 ? "+" : ""}${r.temperature}, ${esc(r.note)}</li>`).join("")}</ul>` : ""}
      ${facts.length ? `<h3>Knows (learned on-panel)</h3><ul class="small">${facts.map((f) => `<li>${esc(f.fact)} <span class="muted">(issue ${f.issue})</span></li>`).join("")}</ul>` : ""}
      <details><summary class="muted">Moves</summary><ul class="small">${c.stats.moves.map((m) => `<li><b>${esc(m.name)}</b> <span class="muted">${m.kind}, power ${m.power}${m.cost ? ", " + esc(m.cost) : ""}</span>: ${esc(m.description)}</li>`).join("")}</ul></details>
      <details><summary class="muted">Full bible</summary><pre class="small" style="white-space:pre-wrap">${esc(c.bible)}</pre></details></div>`;
  }).join("");
  const locs = Object.values(MAPS).map((m) => { const present = [...run.world.actors.values()].filter((a) => a.location === m.id).map((a) => esc(a.name)); return `<div class="panel"><b>${esc(m.name)}</b> <span class="muted small">${m.kind}, ${m.region}${m.publicSpace ? ", public" : ""}</span><div class="small">${esc(m.flavor)}</div>${present.length ? `<div class="small muted">Here now: ${present.join(", ")}</div>` : ""}</div>`; }).join("");
  const worldDoc = loadWorldDoc("locations.md");
  const factions = loadWorldDoc("factions.md");
  const ledger = run.memory.ledger.length ? `<div class="card"><h2>Deaths and Returns</h2><ul>${run.memory.ledger.map((l) => `<li>${esc(l.kind)}: <b>${esc(run.world.nameOf(l.who))}</b>, issue ${l.issue}, ${esc(l.how)}</li>`).join("")}</ul></div>` : "";
  const threads = run.memory.threads.length ? `<div class="card"><h2>Unresolved threads</h2><ul>${run.memory.threads.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  return page("Codex", `<div class="card"><h2>Codex</h2><p class="small muted">Everything the world knows about itself: characters with their current condition and what they have learned, locations, factions, the ledger. Canon from the bibles; state from the engine.</p>
    <p class="small">${ids.map((id) => `<a href="#${esc(id)}" style="color:var(--blue)">${esc(loadCharacter(id)?.stats.name ?? id)}</a>`).join(" · ")}</p></div>` + chars + `<div class="card"><h2>Locations</h2>${locs}<details><summary class="muted">World atlas (canon/world/locations.md)</summary><pre class="small" style="white-space:pre-wrap">${esc(worldDoc)}</pre></details></div>
    <div class="card"><h2>Factions</h2><details open><summary class="muted">canon/world/factions.md</summary><pre class="small" style="white-space:pre-wrap">${esc(factions)}</pre></details></div>` + threads + ledger, NAV);
}

/**
 * Server-rendered pages: the Chronicle (issues as readable comic pages) and the Editor's
 * Desk (current act, objectives, notes, pending deaths). Plain HTML, no build step.
 */
import type { Showrunner } from "./showrunner.js";
import { listCharacterIds, loadCharacter } from "./canon.js";

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

const NAV = `<a href="/">Theater</a> <a href="/chronicle">Chronicle</a> <a href="/desk">Editor's Desk</a>`;

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
  const stage = `<div class="card"><h2>On stage</h2>${[...run.world.actors.values()].map((a) => `<div class="panel"><b>${esc(a.name)}</b> <span class="muted small">HP ${a.hp}/${a.maxHp} · stamina ${a.stamina}/${a.maxStamina}${a.injuries.length ? " · " + a.injuries.map((i) => esc(i.name)).join(", ") : ""}</span><div class="bar"><i style="width:${Math.round(100 * a.hp / a.maxHp)}%"></i></div><div class="small muted">${Object.entries(a.resources).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</div></div>`).join("") || "<p class='muted'>Empty.</p>"}
    <p class="small muted">Game time ${esc(run.world.clock.label)} · mode ${run.mode}</p></div>`;
  const notesHtml = `<div class="card"><h2>Notes to the Bullpen</h2><p class="muted small">The Showrunner reads these when planning the next issue; the Director reads them every scene. Woven in, never obeyed literally.</p>
    ${notes.map((n) => `<div class="panel note"><div>${esc(n.text)}</div><form method="post" action="/api/notes/delete"><input type="hidden" name="file" value="${esc(n.file)}"><button class="quiet">×</button></form></div>`).join("") || "<p class='muted'>No notes.</p>"}
    <form method="post" action="/api/notes"><textarea name="text" rows="3" placeholder="e.g. I'd love to see more of Daredevil and Spidey as friends. Or: bring in Doctor Doom next."></textarea><button>Add note</button></form></div>`;
  const roster = `<div class="card"><h2>Roster</h2><p class="small">${listCharacterIds().map((id) => { const c = loadCharacter(id)!; return `<span class="panel" style="display:inline-block;margin:3px">${esc(c.stats.name)} <span class="muted">${c.stats.role}</span></span>`; }).join(" ")}</p>
    <p class="muted small">To add a character: write a bible and stats.json under canon/characters/&lt;id&gt;/ (docs/DESIGN.md §6) and the Showrunner can cast them.</p></div>`;
  const memory = `<div class="card"><h2>Memory</h2><pre class="small" style="white-space:pre-wrap">${esc(run.memory.describe())}</pre></div>`;
  return page("Editor's Desk", issue + death + stage + notesHtml + roster + memory, NAV);
}

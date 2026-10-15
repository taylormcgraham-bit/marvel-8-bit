import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { ClientMsg, type ServerMsg } from "../../shared/events.js";
import { CONFIG } from "./config.js";
import { Showrunner } from "./showrunner.js";
import { chroniclePage, deskPage, codexPage } from "./pages.js";
import { RosterDrafter, draftStub, approve as approveDraft, reject as rejectDraft } from "./agents/roster.js";
import { listCharacterIds, loadCharacter } from "./canon.js";
import { maxHpFor } from "./world.js";

const run = new Showrunner();
run.start();

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

/** Optional password gate for a hosted deployment: set AUTH_PASSWORD (user name is anything). */
function authorized(req: http.IncomingMessage): boolean {
  const want = process.env.AUTH_PASSWORD;
  if (!want) return true;
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Basic ")) return false;
  const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
  return decoded.slice(decoded.indexOf(":") + 1) === want;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 100_000) req.destroy(); }); req.on("end", () => resolve(b)); });
}
function listNotes(): { file: string; text: string }[] {
  if (!fs.existsSync(CONFIG.inboxDir)) return [];
  return fs.readdirSync(CONFIG.inboxDir).filter((f) => /\.(md|txt)$/i.test(f) && f !== "README.md").sort()
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(CONFIG.inboxDir, f), "utf8").trim() })).filter((n) => n.text);
}
const redirect = (res: http.ServerResponse, to: string) => { res.statusCode = 303; res.setHeader("location", to); res.end(); };

const server = http.createServer(async (req, res) => {
  // health check for hosts (Render, Fly): no password, no state
  if (req.url === "/healthz") { res.setHeader("content-type", "text/plain"); res.end("ok"); return; }
  if (!authorized(req)) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Basic realm="marvel-8-bit"');
    res.end("password required");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  // ---- pages
  if (url.pathname === "/chronicle") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(chroniclePage(run)); return; }
  if (url.pathname === "/desk") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(deskPage(run, listNotes())); return; }
  if (url.pathname === "/codex") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(codexPage(run)); return; }
  // ---- roster requests
  if (req.method === "POST" && url.pathname === "/api/roster/request") {
    const body = new URLSearchParams(await readBody(req));
    const request = (body.get("request") ?? "").trim().slice(0, 200);
    if (request) {
      try {
        if (run.mode === "live") { const p = await new RosterDrafter().draft(request); run.note(`drafted ${p.name} (${p.id}); awaiting approval on the Desk`); }
        else { const p = draftStub(request); run.note(`stub draft ${p.name} (${p.id}); no model credentials, awaiting approval`); }
      } catch (err) { run.note(`roster draft failed: ${(err as Error).message}`); }
    }
    redirect(res, "/desk"); return;
  }
  if (req.method === "POST" && (url.pathname === "/api/roster/approve" || url.pathname === "/api/roster/reject")) {
    const body = new URLSearchParams(await readBody(req));
    const id = path.basename(body.get("id") ?? "");
    if (id) { const ok = url.pathname.endsWith("approve") ? approveDraft(id) : rejectDraft(id); if (ok) { run.rosterChanged(); run.note(`${url.pathname.endsWith("approve") ? "approved" : "rejected"} draft ${id}`); } }
    redirect(res, "/desk"); return;
  }
  // ---- Editor's Desk actions
  if (req.method === "POST" && url.pathname === "/api/notes") {
    const body = new URLSearchParams(await readBody(req));
    const text = (body.get("text") ?? "").trim().slice(0, 2000);
    if (text) { fs.mkdirSync(CONFIG.inboxDir, { recursive: true }); fs.writeFileSync(path.join(CONFIG.inboxDir, `note-${Date.now()}.md`), text + "\n"); }
    redirect(res, "/desk"); return;
  }
  if (req.method === "POST" && url.pathname === "/api/notes/delete") {
    const body = new URLSearchParams(await readBody(req));
    const file = path.basename(body.get("file") ?? "");
    if (file && file !== "README.md" && /\.(md|txt)$/i.test(file)) { try { fs.unlinkSync(path.join(CONFIG.inboxDir, file)); } catch { /* gone */ } }
    redirect(res, "/desk"); return;
  }
  if (req.method === "POST" && (url.pathname === "/api/deaths/approve" || url.pathname === "/api/deaths/veto")) {
    run.decideDeath(url.pathname.endsWith("approve") ? "approved" : "vetoed");
    redirect(res, "/desk"); return;
  }
  if (url.pathname === "/api/desk") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ issue: run.story.loaded ? { number: run.story.number, plan: run.story.plan, actIndex: run.story.actIndex, objectives: run.story.objectives, pendingDeath: run.story.pendingDeath } : null, notes: listNotes(), memory: run.memory }, null, 2));
    return;
  }
  if (url.pathname === "/api/state") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      mode: run.mode,
      issue: run.world.issue,
      gameTime: run.world.clock.label,
      location: run.world.map.id,
      weather: run.world.weather,
      sim: { schemes: run.sim.schemes, factions: run.sim.factions, whereabouts: run.sim.whereabouts },
      timeOfDay: run.world.timeOfDay,
      sceneLocked: run.world.clock.sceneLocked,
      actors: [...run.world.actors.values()].map(({ character, ...a }) => a),
      onStage: run.world.stage().map((a) => a.id),
      events: run.world.events.length,
    }, null, 2));
    return;
  }
  if (url.pathname === "/api/roster") {
    // every character in canon as spawn events, for the theater's showcase mode (art review)
    const markers = run.world.map.markers;
    const list = listCharacterIds().map((id, i) => {
      const c = loadCharacter(id)!; const m = markers[i % markers.length]!;
      const hp = maxHpFor(c);
      return { type: "spawn", seq: 0, t: Date.now(), ms: 150, who: id, name: c.stats.name, at: m.id, x: m.x, y: m.y, facing: "down", hp, maxHp: hp, palette: c.stats.palette, role: c.stats.role, look: c.stats.look };
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(list));
    return;
  }
  if (url.pathname === "/api/chronicle") {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(run.world.events.filter((e) => e.type !== "note").map((e) => run.world.describeEvent(e)).join("\n"));
    return;
  }
  if (url.pathname === "/api/status") {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(run.status.join("\n"));
    return;
  }
  // production: serve the built client
  let file = path.join(CONFIG.clientDist, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(CONFIG.clientDist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(CONFIG.clientDist, "index.html");
  }
  if (!fs.existsSync(file)) { res.statusCode = 404; res.end("client not built; run `npm run dev` or `npm run build`"); return; }
  res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws", verifyClient: (info: { req: http.IncomingMessage }) => authorized(info.req) });

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  send(ws, { kind: "hello", mode: run.mode, replay: run.snapshot() });
  const off = run.onEvents((events) => send(ws, { kind: "events", events }));
  run.viewerJoined();
  ws.on("message", (raw) => {
    const parsed = ClientMsg.safeParse(JSON.parse(String(raw)));
    if (!parsed.success) return;
    if (parsed.data.kind === "buffer") run.reportBuffer(parsed.data.ms);
  });
  ws.on("close", () => { off(); run.viewerLeft(); });
});

server.listen(CONFIG.port, () => {
  console.log(`marvel-8-bit engine on http://localhost:${CONFIG.port}  (mode: ${run.mode}, director: ${CONFIG.directorModel}, continuity: ${CONFIG.continuityMode})`);
});

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { ClientMsg, type ServerMsg } from "../../shared/events.js";
import { CONFIG } from "./config.js";
import { Showrunner } from "./showrunner.js";

const run = new Showrunner();
run.start();

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/state") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      mode: run.mode,
      issue: run.world.issue,
      gameTime: run.world.clock.label,
      timeOfDay: run.world.timeOfDay,
      sceneLocked: run.world.clock.sceneLocked,
      actors: [...run.world.actors.values()].map(({ character, ...a }) => a),
      events: run.world.events.length,
    }, null, 2));
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

const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  send(ws, { kind: "hello", mode: run.mode, replay: run.world.snapshot() });
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

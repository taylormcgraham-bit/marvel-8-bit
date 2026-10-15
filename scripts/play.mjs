#!/usr/bin/env node
/**
 * One-click launcher. Double-clicking Play.command (macOS) or Play.bat (Windows) runs this.
 * It installs dependencies the first time, rebuilds when the code changed, starts the engine,
 * and opens the game in your browser. Close the window to stop the game.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8787);
const URL_ = `http://localhost:${PORT}`;
const win = process.platform === "win32";
const say = (s) => console.log(`\n>> ${s}`);

process.chdir(ROOT);

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  say(`Node.js ${process.versions.node} is too old. Install Node 22 or newer from https://nodejs.org and run this again.`);
  openUrl("https://nodejs.org");
  hold(1);
}

function run(cmd, args, label) {
  say(label);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: win });
  if (r.status !== 0) { say(`"${cmd} ${args.join(" ")}" failed. Scroll up for the error.`); hold(1); }
}
function hold(code) {
  if (process.stdin.isTTY) {
    console.log("\nPress Enter to close this window.");
    try { fs.readSync(0, Buffer.alloc(1)); } catch {}
  }
  process.exit(code);
}
function openUrl(url) {
  try {
    if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    else if (win) spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {}
}
function openEditor(file) {
  try {
    if (process.platform === "darwin") spawn("open", ["-t", file], { stdio: "ignore", detached: true }).unref();
    else if (win) spawn("notepad", [file], { stdio: "ignore", detached: true }).unref();
  } catch {}
}
function newest(dir, skip = new Set(["node_modules", "dist", "data", ".git"])) {
  let t = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else t = Math.max(t, fs.statSync(p).mtimeMs);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return t;
}
const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);

// 1. dependencies
if (!fs.existsSync("node_modules") || mtime("package-lock.json") > mtime(path.join("node_modules", ".package-lock.json"))) {
  run("npm", ["install", "--no-fund", "--no-audit"], "First run: installing dependencies (a minute or two)...");
}

// 2. credentials
let envJustCreated = false;
if (!fs.existsSync(".env")) {
  fs.copyFileSync(".env.example", ".env");
  envJustCreated = true;
}
const env = fs.readFileSync(".env", "utf8");
const hasKey = /^[ \t]*ANTHROPIC_API_KEY[ \t]*=[ \t]*\S+/m.test(env);

// 3. build when the source is newer than the last build
const stamp = path.join("dist", ".built");
const srcTime = Math.max(newest("client"), newest("server"), newest("shared"), mtime("package.json"), mtime("tsconfig.base.json"), mtime("tsconfig.server.json"));
if (!fs.existsSync(path.join("dist", "client", "index.html")) || srcTime > mtime(stamp)) {
  run("npm", ["run", "build"], "Building the game (about half a minute)...");
  fs.writeFileSync(stamp, new Date().toISOString());
}

// 4. start the engine
say(`Starting the engine on ${URL_} ...`);
const child = spawn(process.execPath, [path.join("dist", "server", "src", "index.js")], { stdio: "inherit", env: { ...process.env, PORT: String(PORT) } });
child.on("exit", (code) => { say(`Engine stopped${code ? ` (code ${code})` : ""}.`); hold(code ?? 0); });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { child.kill(); process.exit(0); });

// 5. open the browser once the engine answers
const started = Date.now();
const poll = setInterval(async () => {
  try {
    const r = await fetch(`${URL_}/api/status`);
    if (!r.ok) throw new Error(String(r.status));
    clearInterval(poll);
    if (process.env.NO_OPEN !== "1") openUrl(URL_);
    console.log(`
==========================================================
  The game is open at ${URL_}
  Editor's Desk: ${URL_}/desk     Codex: ${URL_}/codex
  Keep this window open while you play. Close it to stop.
==========================================================`);
    if (!hasKey) {
      console.log(`
  NOTE: no Anthropic API key yet, so the scripted stand-in Director is playing.
  Paste your key after ANTHROPIC_API_KEY= in this file, save, then close this
  window and open the game again:
    ${path.join(ROOT, ".env")}
`);
      if (envJustCreated) openEditor(path.join(ROOT, ".env"));
    }
  } catch {
    if (Date.now() - started > 60_000) { clearInterval(poll); say("The engine did not answer within a minute. Scroll up for the error."); }
  }
}, 500);

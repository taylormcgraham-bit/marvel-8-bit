/**
 * DOM overlays for the 3D theater: dialogue window, captions, banners, HP bars, quest log,
 * recap card, console, floating labels projected from world space.
 */
import * as THREE from "three";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Overlay {
  root: HTMLDivElement;
  private dialog: HTMLDivElement;
  private caption: HTMLDivElement;
  private banner: HTMLDivElement;
  private hud: HTMLDivElement;
  private bars: HTMLDivElement;
  private quest: HTMLDivElement;
  private consoleEl: HTMLPreElement;
  private floats: { el: HTMLDivElement; pos: THREE.Vector3; born: number; life: number; rise: number }[] = [];
  private barEls = new Map<string, { el: HTMLDivElement; hp: HTMLDivElement; st: HTMLDivElement; inj: HTMLDivElement; hideAt: number; pinned: boolean }>();
  private questVisible = false;
  private questHideAt = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div"); this.root.className = "ov"; parent.appendChild(this.root);
    this.root.innerHTML = `
      <div class="ov-hud"></div>
      <div class="ov-bars"></div>
      <div class="ov-quest"></div>
      <div class="ov-caption"></div>
      <div class="ov-banner"></div>
      <div class="ov-dialog"><div class="ov-portrait"></div><div class="ov-name"></div><div class="ov-text"></div><div class="ov-cursor">▼</div></div>
      <pre class="ov-console" hidden></pre>`;
    this.hud = this.root.querySelector(".ov-hud")!; this.bars = this.root.querySelector(".ov-bars")!; this.quest = this.root.querySelector(".ov-quest")!;
    this.caption = this.root.querySelector(".ov-caption")!; this.banner = this.root.querySelector(".ov-banner")!; this.dialog = this.root.querySelector(".ov-dialog")!;
    this.consoleEl = this.root.querySelector(".ov-console")!;
  }

  setHud(text: string) { this.hud.textContent = text; }
  toggleConsole() { this.consoleEl.hidden = !this.consoleEl.hidden; }
  log(level: string, text: string) { const d = document.createElement("div"); d.className = level; d.textContent = `${new Date().toLocaleTimeString()}  ${text}`; this.consoleEl.appendChild(d); while (this.consoleEl.childElementCount > 200) this.consoleEl.firstChild?.remove(); this.consoleEl.scrollTop = this.consoleEl.scrollHeight; }

  setSoundHint(on: boolean) { let h = this.root.querySelector(".ov-sound") as HTMLDivElement | null; if (!h) { h = document.createElement("div"); h.className = "ov-sound"; h.textContent = "CLICK OR PRESS A KEY FOR SOUND · M MUTES"; this.root.appendChild(h); } h.style.display = on ? "block" : "none"; }

  async say(name: string, portrait: HTMLCanvasElement | null, text: string, mood: string, ms: number, onChar?: () => void) {
    const d = this.dialog; d.classList.add("on"); d.dataset.mood = mood;
    const port = d.querySelector(".ov-portrait")!; port.innerHTML = ""; if (portrait) port.appendChild(portrait);
    d.querySelector(".ov-name")!.textContent = name.toUpperCase();
    const t = d.querySelector(".ov-text")!; t.textContent = ""; (d.querySelector(".ov-cursor") as HTMLElement).style.visibility = "hidden";
    const chars = [...text]; const per = Math.min(40, Math.max(14, (ms - 900) / chars.length));
    const start = performance.now();
    let i = 0;
    const typer = setInterval(() => { i++; t.textContent = chars.slice(0, i).join(""); if (onChar && i % 2 === 0) onChar(); if (i >= chars.length) { clearInterval(typer); (d.querySelector(".ov-cursor") as HTMLElement).style.visibility = "visible"; } }, per);
    await wait(Math.max(0, ms - (performance.now() - start)));
    clearInterval(typer); d.classList.remove("on");
  }
  hideDialog() { this.dialog.classList.remove("on"); }

  async showCaption(text: string, ms: number) { this.caption.textContent = text.toUpperCase(); this.caption.classList.add("on"); await wait(ms); this.caption.classList.remove("on"); }
  async showBanner(text: string, color: string, ms: number, sub?: string) { this.banner.innerHTML = `<div class="b1" style="color:${color}">${esc(text)}</div>${sub ? `<div class="b2">${esc(sub)}</div>` : ""}`; this.banner.classList.add("on"); await wait(ms); this.banner.classList.remove("on"); }
  async titleCard(issue: number, title: string, sub: string | undefined, ms: number) {
    const el = document.createElement("div"); el.className = "ov-title"; el.innerHTML = `<div class="t0">ISSUE #${issue}</div><div class="t1">${esc(title.toUpperCase())}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ""}`;
    this.root.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
    await wait(ms - 400); el.classList.remove("on"); await wait(400); el.remove();
  }
  async recap(title: string, lines: string[], ms: number) {
    const el = document.createElement("div"); el.className = "ov-recap"; el.innerHTML = `<div class="r0">${esc(title)}</div>${lines.map((l, i) => `<div class="r1" style="animation-delay:${0.5 + i * 0.9}s">· ${esc(l)}</div>`).join("")}`;
    this.root.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
    await wait(ms - 400); el.classList.remove("on"); await wait(400); el.remove();
  }

  /* ---- HP bars */
  bar(id: string, name: string, color: string) {
    let b = this.barEls.get(id);
    if (b) return b;
    const el = document.createElement("div"); el.className = "ov-bar";
    el.innerHTML = `<div class="n">${esc(name.toUpperCase())}</div><div class="hp"><i style="background:${color}"></i></div><div class="st"><i></i></div><div class="inj"></div>`;
    this.bars.appendChild(el);
    b = { el, hp: el.querySelector(".hp i")!, st: el.querySelector(".st i")!, inj: el.querySelector(".inj")!, hideAt: 0, pinned: false };
    this.barEls.set(id, b); return b;
  }
  setBar(id: string, hp: number, max: number, st: number, maxSt: number, injuries: string[]) {
    const b = this.barEls.get(id); if (!b) return;
    const r = Math.max(0, hp / max); b.hp.style.width = `${Math.round(r * 100)}%`; b.hp.style.background = r > 0.5 ? "#58d854" : r > 0.25 ? "#ffd860" : "#e02828";
    b.st.style.width = `${Math.round(Math.max(0, st / Math.max(1, maxSt)) * 100)}%`;
    b.inj.textContent = injuries.slice(0, 2).join(" · ").toUpperCase();
    b.el.classList.add("on"); b.hideAt = performance.now() + 9000;
  }
  pinBar(id: string, pinned: boolean) { const b = this.barEls.get(id); if (b) b.pinned = pinned; }
  removeBar(id: string) { const b = this.barEls.get(id); if (b) { b.el.remove(); this.barEls.delete(id); } }

  /* ---- quest log */
  setQuest(issue: number, act: number, title: string, objectives: { text: string; status: string }[]) {
    this.quest.innerHTML = `<div class="q0">ISSUE #${issue} · ACT ${act}: ${esc(title.toUpperCase())}</div>${objectives.map((o) => `<div class="q1 ${o.status}">${o.status === "done" ? "■" : o.status === "failed" ? "x" : "□"} ${esc(o.text)}</div>`).join("")}`;
    this.quest.classList.add("on"); this.questHideAt = performance.now() + 6000;
  }
  toggleQuest() { this.questVisible = !this.questVisible; this.quest.classList.toggle("on", this.questVisible); }

  /* ---- floating labels in world space */
  float(pos: THREE.Vector3, text: string, color: string, big = false, life = 1100) {
    const el = document.createElement("div"); el.className = "ov-float" + (big ? " big" : ""); el.style.color = color; el.textContent = text;
    this.root.appendChild(el); this.floats.push({ el, pos: pos.clone(), born: performance.now(), life, rise: 0.6 });
  }
  speech(pos: THREE.Vector3, text: string, life = 1800) {
    const el = document.createElement("div"); el.className = "ov-float speech"; el.textContent = text;
    this.root.appendChild(el); this.floats.push({ el, pos: pos.clone(), born: performance.now(), life, rise: 0.1 });
  }

  tick(camera: THREE.Camera, w: number, h: number) {
    const now = performance.now();
    for (const b of this.barEls.values()) if (!b.pinned && b.el.classList.contains("on") && now > b.hideAt) b.el.classList.remove("on");
    if (!this.questVisible && this.quest.classList.contains("on") && now > this.questHideAt) this.quest.classList.remove("on");
    const v = new THREE.Vector3();
    this.floats = this.floats.filter((f) => {
      const age = (now - f.born) / f.life;
      if (age >= 1) { f.el.remove(); return false; }
      v.copy(f.pos); v.y += age * f.rise; v.project(camera);
      f.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`; f.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      f.el.style.opacity = String(age < 0.2 ? 1 : 1 - (age - 0.2) / 0.8);
      return true;
    });
  }
}

export const OVERLAY_CSS = `
.ov{position:absolute;inset:0;pointer-events:none;font-family:"Press Start 2P",monospace;color:#f0f0f8;overflow:hidden}
.ov .ov-hud{position:absolute;top:10px;right:14px;font-size:10px;color:#c8c8dc;text-shadow:0 2px 0 #000}
.ov .ov-bars{position:absolute;top:34px;left:14px;right:14px;display:flex;flex-wrap:wrap;gap:10px 24px}
.ov .ov-bar{width:200px;opacity:0;transition:opacity .4s}.ov .ov-bar.on{opacity:1}
.ov .ov-bar .n{font-size:9px;text-shadow:0 2px 0 #000;margin-bottom:4px}
.ov .ov-bar .hp{height:10px;background:#202030;border:2px solid #e8e8f8;box-shadow:2px 2px 0 #000}.ov .ov-bar .hp i{display:block;height:100%;transition:width .3s}
.ov .ov-bar .st{height:4px;background:#202030;border:2px solid #e8e8f8;border-top:0;box-shadow:2px 2px 0 #000}.ov .ov-bar .st i{display:block;height:100%;background:#48b8ff;transition:width .3s}
.ov .ov-bar .inj{font-size:8px;color:#ff8a8a;text-shadow:0 2px 0 #000;margin-top:4px}
.ov .ov-quest{position:absolute;top:34px;left:14px;background:rgba(16,24,56,.92);border:2px solid #6a6a9a;box-shadow:3px 3px 0 #000;padding:8px 10px;max-width:300px;opacity:0;transition:opacity .4s}.ov .ov-quest.on{opacity:1}
.ov .ov-quest .q0{font-size:8px;color:#ffd860;margin-bottom:6px}.ov .ov-quest .q1{font-size:8px;line-height:1.5}.ov .ov-quest .q1.done{color:#58d854}.ov .ov-quest .q1.failed{color:#ff8a8a;text-decoration:line-through}
.ov .ov-caption{position:absolute;top:14px;left:14px;background:#ffd860;color:#1a1208;font-size:11px;padding:8px 12px;box-shadow:3px 3px 0 #000;border:2px solid #1a1208;max-width:70%;opacity:0;transform:translateY(-6px);transition:all .2s}.ov .ov-caption.on{opacity:1;transform:none}
.ov .ov-banner{position:absolute;left:0;right:0;top:40%;text-align:center;background:rgba(0,0,0,.55);padding:14px 0;opacity:0;transition:opacity .15s}.ov .ov-banner.on{opacity:1}
.ov .ov-banner .b1{font-size:28px;text-shadow:4px 4px 0 #000;animation:pop .25s ease-out}.ov .ov-banner .b2{font-size:9px;color:#d0d0e0;margin-top:8px;text-shadow:2px 2px 0 #000}
@keyframes pop{from{transform:scale(1.8)}to{transform:scale(1)}}
.ov .ov-dialog{position:absolute;left:16px;right:16px;bottom:16px;min-height:96px;background:linear-gradient(#182050,#101838);border:3px solid #e8e8f8;outline:2px solid #303060;box-shadow:4px 4px 0 #000;padding:14px 16px 14px 100px;opacity:0;transform:translateY(8px);transition:all .15s}.ov .ov-dialog.on{opacity:1;transform:none}
.ov .ov-portrait{position:absolute;left:12px;top:12px;width:68px;height:68px;background:#0c0c1c;border:2px solid #e8e8f8;outline:2px solid #303060;image-rendering:pixelated}.ov .ov-portrait canvas{width:100%;height:100%}
.ov .ov-name{position:absolute;top:-14px;left:96px;background:#203070;border:2px solid #e8e8f8;padding:4px 10px;font-size:10px;color:#ffd860;box-shadow:2px 2px 0 #000}
.ov .ov-text{font-size:12px;line-height:1.7;white-space:pre-wrap}
.ov .ov-dialog[data-mood=shout] .ov-text{color:#ff6a4a}.ov .ov-dialog[data-mood=whisper] .ov-text{color:#9a9ab8}.ov .ov-dialog[data-mood=worried] .ov-text,.ov .ov-dialog[data-mood=sad] .ov-text{color:#8ad0ff}.ov .ov-dialog[data-mood=smug] .ov-text,.ov .ov-dialog[data-mood=angry] .ov-text{color:#ffb060}
.ov .ov-cursor{position:absolute;right:12px;bottom:8px;font-size:9px;color:#ffd860;animation:bob .5s infinite alternate}@keyframes bob{to{transform:translateY(3px)}}
.ov .ov-title{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .35s}.ov .ov-title.on{opacity:1}
.ov .ov-title .t0{font-size:12px;color:#ffd860;margin-bottom:12px}.ov .ov-title .t1{font-size:22px;background:#e02828;padding:16px 40px;box-shadow:0 0 0 4px #ffd860,6px 6px 0 4px #000;text-align:center;max-width:80%;line-height:1.4}.ov .ov-title .t2{font-size:10px;color:#9a9ab8;margin-top:22px;max-width:70%;text-align:center;line-height:1.7}
.ov .ov-recap{position:absolute;left:10%;right:10%;top:12%;background:linear-gradient(#182050,#101838);border:3px solid #e8e8f8;outline:2px solid #303060;box-shadow:4px 4px 0 #000;padding:18px 22px;opacity:0;transition:opacity .35s}.ov .ov-recap.on{opacity:1}
.ov .ov-recap .r0{font-size:13px;color:#ffd860;margin-bottom:14px}.ov .ov-recap .r1{font-size:9px;line-height:1.8;opacity:0;animation:fadein .4s forwards}@keyframes fadein{to{opacity:1}}
.ov .ov-float{position:absolute;transform:translate(-50%,-100%);font-size:11px;text-shadow:2px 2px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;white-space:nowrap}.ov .ov-float.big{font-size:16px}.ov .ov-float.speech{font-size:9px;color:#fff;background:rgba(0,0,0,.55);padding:4px 8px;border-radius:3px;white-space:normal;max-width:180px;text-align:center}
.ov .ov-console{position:absolute;left:0;bottom:0;width:100%;max-height:40vh;margin:0;overflow:auto;background:rgba(0,0,0,.85);color:#c8c8c8;font:11px/1.5 monospace;padding:8px 12px;box-sizing:border-box;border-top:2px solid #3a3a5a;pointer-events:auto}
.ov .ov-sound{position:absolute;bottom:10px;left:16px;font-size:8px;color:#8a8aa8;text-shadow:0 2px 0 #000}
.ov .ov-console .reject{color:#ff7a7a}.ov .ov-console .warn{color:#ffd37a}.ov .ov-console .info{color:#8fd3ff}
`;

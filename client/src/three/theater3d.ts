/**
 * The 3D theater: a deterministic playback engine for GameEvents, rendered with three.js.
 * It never decides anything; it performs what the engine already resolved, with a camera
 * director, animation, lighting, weather, effects and DOM overlays.
 */
import * as THREE from "three";
import type { GameEvent, Dir } from "@shared/events";
import { MAPS, type MapDef } from "@shared/maps";
import { Net } from "../net";
import { makeRig, type Rig, type Pose } from "./rig";
import { buildWorld, buildBackdrop, type Built3D } from "./world2";
import { Overlay, OVERLAY_CSS } from "./overlay";
import { canvasTexture } from "./materials";
import { drawPortrait, DEFAULT_LOOK, type Look, type Palette } from "../render/figure";

interface Actor {
  id: string; name: string; rig: Rig; palette: Palette;
  tx: number; ty: number; facing: Dir;
  hp: number; maxHp: number; stamina: number; maxStamina: number; injuries: string[];
  pose: Pose; poseT: number; ko: boolean; walkTarget?: THREE.Vector3; walkUntil?: number; walkFrom?: THREE.Vector3; walkStart?: number;
  portrait: HTMLCanvasElement;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dirAngle = (d: Dir) => ({ down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[d]);

export class Theater3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: Overlay;
  private net?: Net;
  private map: MapDef = MAPS["chelsea-rooftop"]!;
  private world!: Built3D;
  private backdrop?: THREE.Group;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private actors = new Map<string, Actor>();
  private queue: GameEvent[] = [];
  private playing = false;
  private currentEndsAt = 0;
  private timeOfDay = "night";
  private weather = "clear";
  private weatherObj?: THREE.Points;
  private fog?: THREE.Group;
  private clock = new THREE.Clock();
  // camera director
  private camTarget = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camDist = 12;
  private camYaw = Math.PI / 4;
  private camPitch = 0.72;
  private camShake = 0;
  private focus: THREE.Vector3[] = [];
  private objectives: { id: string; text: string; status: string }[] = [];
  private actInfo = { issue: 0, n: 0, title: "" };
  private fx: { mesh: THREE.Object3D; born: number; life: number; vel?: THREE.Vector3 }[] = [];
  private sparkTex = canvasTexture(64, 64, (ctx) => { ctx.translate(32, 32); ctx.fillStyle = "#fff4c0"; ctx.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 10 : 30; const a = (i * Math.PI) / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ffd860"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); });
  private webTex = canvasTexture(64, 64, (ctx) => { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.translate(32, 32); for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * Math.PI / 4) * 30, Math.sin(i * Math.PI / 4) * 30); ctx.stroke(); } for (const r of [10, 20, 28]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); } });

  constructor(private el: HTMLElement, private mode: "theater" | "showcase") {
    const style = document.createElement("style"); style.textContent = OVERLAY_CSS; document.head.appendChild(style);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 300);
    this.overlay = new Overlay(el);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x404030, 0.8); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.6); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    window.addEventListener("resize", () => { this.renderer.setSize(el.clientWidth, el.clientHeight); this.camera.aspect = el.clientWidth / el.clientHeight; this.camera.updateProjectionMatrix(); });
    window.addEventListener("keydown", (e) => { if (e.key === "`") this.overlay.toggleConsole(); if (e.key === "q" || e.key === "Q") this.overlay.toggleQuest(); });
    let dragging = false, lx = 0, ly = 0;
    this.renderer.domElement.addEventListener("pointerdown", (ev) => { dragging = true; lx = ev.clientX; ly = ev.clientY; });
    window.addEventListener("pointerup", () => { dragging = false; });
    window.addEventListener("pointermove", (ev) => { if (!dragging) return; this.camYaw += (ev.clientX - lx) * 0.006; this.camPitch = Math.max(0.3, Math.min(1.2, this.camPitch + (ev.clientY - ly) * 0.004)); lx = ev.clientX; ly = ev.clientY; });
    window.addEventListener("wheel", (ev) => { this.camDist = Math.max(5, Math.min(22, this.camDist + ev.deltaY * 0.01)); });
    this.buildStage();
    this.camLook.copy(this.center()); this.camTarget.copy(this.center());
    this.loop();
  }

  connect() {
    this.net = new Net({
      onHello: (mode, replay) => { this.overlay.setHud(mode === "mock" ? "MOCK DIRECTOR · Q quests · ` console · drag to orbit" : "LIVE · Q quests · ` console · drag to orbit"); this.resetStage(); this.enqueue(replay); },
      onEvents: (events) => this.enqueue(events),
      onStatus: (text) => this.overlay.log("info", text),
    });
    setInterval(() => this.net?.send({ kind: "buffer", ms: this.bufferedMs() }), 1000);
  }

  /** Art review: whole roster on markers, no story. */
  showcase(list: GameEvent[]) {
    this.overlay.setHud(`${this.map.name.toUpperCase()} · ${this.timeOfDay.toUpperCase()} · SHOWCASE`);
    list.forEach((e, i) => { if (e.type === "spawn") { const m = this.map.markers[i % this.map.markers.length]!; this.spawn({ ...e, x: m.x, y: m.y }); } });
  }
  setEnv(map: string, tod: string, weather: string) { this.map = MAPS[map] ?? this.map; this.timeOfDay = tod; this.weather = weather; this.buildStage(); this.camLook.copy(this.center()); this.camTarget.copy(this.center()); this.camDist = 19; this.camPitch = 0.75; }

  /* ------------------------------------------------------------------ stage */
  private center() { return new THREE.Vector3(this.map.width / 2 - 0.5, 0, this.map.height / 2 - 0.5); }

  private buildStage() {
    if (this.world) this.scene.remove(this.world.group);
    if (this.backdrop) this.scene.remove(this.backdrop);
    const night = this.timeOfDay === "night";
    this.world = buildWorld(this.map, night); this.scene.add(this.world.group);
    this.backdrop = buildBackdrop(this.map, this.timeOfDay, this.center()); this.scene.add(this.backdrop);
    const tod = this.timeOfDay;
    const sunCol = { night: 0x9ab0ff, dawn: 0xffc0a0, day: 0xfff0d0, dusk: 0xffa060 }[tod] ?? 0xfff0d0;
    const sunInt = { night: 0.9, dawn: 1.3, day: 1.7, dusk: 1.3 }[tod] ?? 1.5;
    this.sun.color.setHex(sunCol); this.sun.intensity = sunInt;
    const c = this.center(); this.sun.position.set(c.x - 10, 20, c.z + 12); this.sun.target.position.copy(c);
    this.hemi.color.setHex(night ? 0x4050b0 : tod === "day" ? 0xbfd8ff : 0xd0a0a0); this.hemi.groundColor.setHex(night ? 0x202030 : 0x404030); this.hemi.intensity = night ? 1.1 : 0.8;
    this.renderer.toneMappingExposure = night ? 1.5 : tod === "day" ? 1.05 : 1.15;
    const fogCol = { night: 0x0a0a20, dawn: 0x6a4a5a, day: 0x9ac0f0, dusk: 0x8a4a3a }[tod] ?? 0x0a0a20;
    this.scene.fog = this.map.kind === "interior" ? null : new THREE.Fog(fogCol, 28, 70);
    this.buildWeather();
  }

  private buildWeather() {
    if (this.weatherObj) { this.scene.remove(this.weatherObj); this.weatherObj = undefined; }
    if (this.fog) { this.scene.remove(this.fog); this.fog = undefined; }
    if (this.map.kind === "interior" || this.weather === "clear") return;
    const c = this.center();
    if (this.weather === "rain" || this.weather === "storm" || this.weather === "snow") {
      const n = this.weather === "snow" ? 900 : this.weather === "storm" ? 2600 : 1500;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = c.x + (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = c.z + (Math.random() - 0.5) * 30; }
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: this.weather === "snow" ? 0xffffff : 0x9ab8e0, size: this.weather === "snow" ? 0.12 : 0.06, transparent: true, opacity: 0.8 });
      this.weatherObj = new THREE.Points(geo, mat); this.scene.add(this.weatherObj);
    }
    if (this.weather === "fog") {
      this.fog = new THREE.Group();
      const t = canvasTexture(128, 128, (ctx) => { const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(200,205,225,0.35)"); g.addColorStop(1, "rgba(200,205,225,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); });
      for (let i = 0; i < 24; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(7, 3.5, 1); s.position.set(c.x + (Math.random() - 0.5) * 22, 0.8 + Math.random() * 1.2, c.z + (Math.random() - 0.5) * 16); this.fog.add(s); }
      this.scene.add(this.fog);
      if (this.scene.fog) (this.scene.fog as THREE.Fog).near = 8, (this.scene.fog as THREE.Fog).far = 30;
    }
  }

  private resetStage() { for (const a of this.actors.values()) { this.scene.remove(a.rig.group); this.overlay.removeBar(a.id); } this.actors.clear(); this.queue = []; this.overlay.hideDialog(); }

  private spawn(e: Extract<GameEvent, { type: "spawn" }>) {
    if (this.actors.has(e.who)) return;
    const look = { ...DEFAULT_LOOK, ...((e.look as Partial<Look>) ?? {}) };
    const rig = makeRig(e.who, e.palette, look);
    const p = this.world.toWorld(e.x, e.y); rig.group.position.copy(p); rig.face(dirAngle(e.facing));
    this.scene.add(rig.group);
    const pc = document.createElement("canvas"); pc.width = 32; pc.height = 32; const ctx = pc.getContext("2d")!; ctx.fillStyle = "#0c0c1c"; ctx.fillRect(0, 0, 32, 32); drawPortrait(look, e.palette).draw(ctx);
    const a: Actor = { id: e.who, name: e.name, rig, palette: e.palette, tx: e.x, ty: e.y, facing: e.facing, hp: e.hp, maxHp: e.maxHp, stamina: e.stamina ?? 10, maxStamina: e.maxStamina ?? 10, injuries: (e.injuries ?? []).map((i) => i.name), pose: "idle", poseT: 0, ko: e.hp <= 0, portrait: pc };
    this.actors.set(e.who, a);
    this.overlay.bar(e.who, e.name, e.palette.primary);
    if (a.hp < a.maxHp || a.injuries.length) this.overlay.setBar(a.id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries);
    if (a.ko) rig.setPose("ko", 0);
    const label = this.makeLabel(e.name); label.position.y = rig.height + 0.25; rig.group.add(label);
  }
  private makeLabel(text: string) {
    const t = canvasTexture(512, 64, (ctx) => { ctx.font = "bold 24px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 7; ctx.strokeStyle = "#000"; ctx.strokeText(text.toUpperCase(), 256, 32); ctx.fillStyle = "#e0e0f0"; ctx.fillText(text.toUpperCase(), 256, 32); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, opacity: 0.8 })); s.scale.set(1.9, 0.24, 1); s.name = "label"; return s;
  }
  private pos(a: Actor) { return a.rig.group.position; }
  private headPos(a: Actor) { return this.pos(a).clone().add(new THREE.Vector3(0, a.rig.height, 0)); }
  private faceToward(a: Actor, target: THREE.Vector3) { const d = target.clone().sub(this.pos(a)); if (d.lengthSq() < 0.01) return; a.rig.face(Math.atan2(d.x, d.z)); }

  /* ------------------------------------------------------------------ queue */
  private enqueue(events: GameEvent[]) { this.queue.push(...events); if (!this.playing) void this.pump(); }
  private bufferedMs() { return Math.max(0, this.currentEndsAt - performance.now()) + this.queue.reduce((s, e) => s + e.ms, 0); }
  private async pump() { this.playing = true; while (this.queue.length) { const e = this.queue.shift()!; this.currentEndsAt = performance.now() + e.ms; try { await this.play(e); } catch (err) { console.error(err); } } this.playing = false; }

  private async play(e: GameEvent): Promise<void> {
    switch (e.type) {
      case "title": this.focus = []; return this.overlay.titleCard(e.issue, e.title, e.subtitle, e.ms);
      case "scene": {
        this.overlay.setHud(`${e.locationName.toUpperCase()}  ·  ${e.timeOfDay.toUpperCase()}${e.weather && e.weather !== "clear" ? "  ·  " + e.weather.toUpperCase() : ""}`);
        const moved = e.location !== this.map.id;
        const changed = moved || e.timeOfDay !== this.timeOfDay || (e.weather ?? "clear") !== this.weather;
        if (moved) { for (const a of this.actors.values()) { this.scene.remove(a.rig.group); this.overlay.removeBar(a.id); } this.actors.clear(); this.map = MAPS[e.location] ?? this.map; }
        this.timeOfDay = e.timeOfDay; this.weather = e.weather ?? "clear";
        if (changed) { this.buildStage(); this.camLook.copy(this.center()); this.camTarget.copy(this.center()); this.camDist = 13; }
        if (e.caption) return this.overlay.showCaption(e.caption, e.ms + 1200);
        return wait(e.ms);
      }
      case "spawn": { this.spawn(e); this.focus = [...this.actors.values()].map((a) => this.pos(a)); return wait(e.ms); }
      case "despawn": { const a = this.actors.get(e.who); if (!a) return; if (e.how) this.overlay.float(this.headPos(a), e.how.toUpperCase().slice(0, 28), "#b0b0c8"); await this.fade(a, e.ms); return; }
      case "caption": return this.overlay.showCaption(e.text, e.ms);
      case "wait": return wait(e.ms);
      case "note": this.overlay.log(e.level, e.text); return;
      case "face": { const a = this.actors.get(e.who); if (a && !a.ko) { a.facing = e.dir; a.rig.face(dirAngle(e.dir)); } return wait(e.ms); }
      case "emote": {
        const a = this.actors.get(e.who); if (!a) return;
        const sym = { "!": "!", "?": "?", "...": "...", heart: "♥", anger: "#", sweat: "~", music: "♪", zzz: "z z" }[e.emote] ?? e.emote;
        this.overlay.float(this.headPos(a).add(new THREE.Vector3(0.2, 0.1, 0)), sym, e.emote === "heart" || e.emote === "anger" ? "#ff6a6a" : "#ffffff", true, e.ms);
        if (e.emote === "!") { a.rig.group.position.y += 0.15; setTimeout(() => { a.rig.group.position.y = this.world.floorY(a.tx, a.ty); }, 150); }
        return wait(e.ms);
      }
      case "move": {
        const a = this.actors.get(e.who); if (!a || a.ko) return;
        const target = this.world.toWorld(e.x, e.y);
        this.faceToward(a, target);
        a.walkFrom = this.pos(a).clone(); a.walkTarget = target; a.walkStart = performance.now(); a.walkUntil = performance.now() + e.ms; a.pose = "walk";
        this.focus = [this.pos(a), target];
        await wait(e.ms);
        a.rig.group.position.copy(target); a.tx = e.x; a.ty = e.y; a.pose = "idle"; a.walkTarget = undefined;
        return;
      }
      case "say": {
        const a = this.actors.get(e.who); if (!a) return;
        const others = [...this.actors.values()].filter((o) => o.id !== a.id);
        if (others.length) { const o = others.sort((p, q) => this.pos(p).distanceTo(this.pos(a)) - this.pos(q).distanceTo(this.pos(a)))[0]!; if (!a.ko) this.faceToward(a, this.pos(o)); this.focus = [this.pos(a), this.pos(o)]; } else this.focus = [this.pos(a)];
        await this.overlay.say(a.name, a.portrait, e.text, e.mood, e.ms);
        return;
      }
      case "rescue": { const a = this.actors.get(e.who); if (!a) return; this.overlay.float(this.headPos(a), "RESCUE!", "#58d854", true); await this.overlay.showCaption(`${a.name} saves ${e.what}`, e.ms); return; }
      case "strike": return this.strike(e);
      case "fightStart": {
        const ids = e.sides.flat(); this.focus = ids.map((id) => this.actors.get(id)).filter(Boolean).map((a) => this.pos(a!));
        for (const id of ids) { const a = this.actors.get(id); if (a) { this.overlay.pinBar(id, true); this.overlay.setBar(id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries); } }
        this.camDist = Math.max(7, this.camDist - 3);
        return this.overlay.showBanner("FIGHT!", "#e02828", e.ms, e.stakes.length < 90 ? e.stakes.toUpperCase() : undefined);
      }
      case "round": { for (const [id, st] of Object.entries(e.stamina)) { const a = this.actors.get(id); if (a) { a.stamina = st; this.overlay.setBar(id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries); } } this.overlay.float(this.focusCenter().add(new THREE.Vector3(0, 2.2, 0)), `ROUND ${e.n}`, "#ffd860", true, e.ms); return wait(e.ms); }
      case "fightEnd": {
        for (const a of this.actors.values()) this.overlay.pinBar(a.id, false);
        for (const id of e.escaped) { const a = this.actors.get(id); if (a) void this.fade(a, 600); }
        const text = e.reason === "knockout" ? "K.O." : e.reason === "escape" ? "ESCAPED" : e.reason === "stalemate" ? "STANDOFF" : "BREAK";
        this.camDist += 3;
        return this.overlay.showBanner(text, e.reason === "knockout" ? "#e02828" : "#ffd860", e.ms, e.summary.toUpperCase());
      }
      case "injury": { const a = this.actors.get(e.who); if (!a) return; a.injuries.push(e.injury.name); this.overlay.setBar(a.id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries); this.overlay.float(this.headPos(a), e.injury.name.toUpperCase(), "#ff8a8a"); return wait(e.ms); }
      case "heal": {
        const a = this.actors.get(e.who); if (!a) return;
        const gained = e.hp - a.hp; a.hp = e.hp; a.stamina = e.stamina;
        if (e.healed.length) a.injuries = a.injuries.filter((_n, i) => i >= e.healed.length);
        if (a.ko && e.hp > 0) { a.ko = false; a.pose = "idle"; a.rig.setPose("idle", 0); this.overlay.float(this.headPos(a), "BACK UP", "#58d854"); }
        if (e.reason === "recover" && gained === 0) this.overlay.float(this.headPos(a), "RECOVER", "#48b8ff");
        else if (gained > 0 && e.reason !== "time") this.overlay.float(this.headPos(a), `+${gained}`, "#58d854");
        this.overlay.setBar(a.id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries);
        return wait(e.ms);
      }
      case "act": {
        this.actInfo = { issue: e.issue, n: e.n, title: e.title }; this.objectives = e.objectives.map((o) => ({ ...o }));
        this.overlay.setQuest(e.issue, e.n, e.title, this.objectives);
        if (e.seq === 0) return wait(200);
        return this.overlay.showBanner(`ACT ${["I", "II", "III"][e.n - 1] ?? e.n}`, "#ffd860", e.ms, e.title.toUpperCase());
      }
      case "objective": { const o = this.objectives.find((x) => x.id === e.id); if (o) o.status = e.status; this.overlay.setQuest(this.actInfo.issue, this.actInfo.n, this.actInfo.title, this.objectives); this.overlay.float(this.focusCenter().add(new THREE.Vector3(0, 2.6, 0)), e.status === "done" ? "OBJECTIVE COMPLETE" : "OBJECTIVE FAILED", e.status === "done" ? "#58d854" : "#ff8a8a", true, 1600); return wait(e.ms); }
      case "issueEnd": { this.objectives = []; return this.overlay.titleCard(e.issue, `END OF ISSUE: ${e.title}`, e.next ? `NEXT: ${e.next}` : undefined, e.ms); }
      case "death": { const a = this.actors.get(e.who); if (!a) return; a.ko = true; a.rig.setPose("ko", 0); await this.overlay.showCaption(`${e.name} ${e.how}`, e.ms - 800); await this.fade(a, 800); return; }
      case "travel": { const names = e.who.map((id) => this.actors.get(id)?.name ?? id).join(" & "); for (const id of e.who) { const a = this.actors.get(id); if (a) void this.fade(a, 600, false); } await this.overlay.showCaption(`${names}: ${e.how ?? "on the move"}${e.minutes ? ` (${e.minutes} min)` : ""}`, e.ms); return; }
      case "recap": return this.overlay.recap(e.title, e.lines, e.ms);
    }
  }

  private async fade(a: Actor, ms: number, remove = true) {
    const start = performance.now();
    const mats: THREE.Material[] = []; a.rig.group.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const mm of Array.isArray(m) ? m : [m]) { mats.push(mm); } });
    await new Promise<void>((r) => { const step = () => { const k = Math.min(1, (performance.now() - start) / ms); a.rig.group.position.y = this.world.floorY(a.tx, a.ty) + k * 0.6; a.rig.group.scale.setScalar(1 - k * 0.3); if (k < 1) requestAnimationFrame(step); else r(); }; step(); });
    void mats;
    if (remove) { this.scene.remove(a.rig.group); this.overlay.removeBar(a.id); this.actors.delete(a.id); }
  }

  private async strike(e: Extract<GameEvent, { type: "strike" }>) {
    const a = this.actors.get(e.who), t = this.actors.get(e.target); if (!a || !t) return;
    const from = this.pos(a).clone(), to = this.pos(t).clone();
    this.faceToward(a, to); this.focus = [from, to];
    const ranged = e.kind === "ranged" || e.kind === "control";
    a.pose = "attack"; a.poseT = performance.now();
    const dir = to.clone().sub(from).normalize();
    if (ranged) {
      const proj = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.kind === "control" ? this.webTex : this.sparkTex, transparent: true, depthTest: false }));
      proj.scale.set(0.5, 0.5, 1); proj.position.copy(from).add(new THREE.Vector3(0, 1.0, 0)).add(dir.clone().multiplyScalar(0.4));
      this.scene.add(proj); this.fx.push({ mesh: proj, born: performance.now(), life: 220, vel: to.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(proj.position).multiplyScalar(1000 / 220) });
      await wait(240);
    } else {
      const lunge = to.clone().sub(dir.clone().multiplyScalar(0.8));
      a.walkFrom = from.clone(); a.walkTarget = lunge; a.walkStart = performance.now(); a.walkUntil = performance.now() + 140;
      await wait(160);
    }
    // impact
    const hit = to.clone().add(new THREE.Vector3(0, 1.0, 0));
    if (e.outcome === "hit" || e.outcome === "blocked") {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, depthTest: false, color: e.outcome === "hit" ? 0xffffff : 0x88c8ff }));
      spark.scale.setScalar(e.outcome === "hit" ? 1.2 : 0.7); spark.position.copy(hit); this.scene.add(spark); this.fx.push({ mesh: spark, born: performance.now(), life: 260 });
      if (e.outcome === "hit") { this.camShake = Math.min(0.35, 0.08 + e.damage * 0.012); t.pose = "hurt"; t.poseT = performance.now(); t.rig.group.position.add(dir.clone().multiplyScalar(0.25)); setTimeout(() => { if (!t.walkTarget) t.rig.group.position.copy(this.world.toWorld(t.tx, t.ty)); }, 200); this.overlay.float(hit, `${e.damage}`, "#ffd860", e.damage >= 10); const pl = new THREE.PointLight(0xffd860, 6, 4); pl.position.copy(hit); this.scene.add(pl); this.fx.push({ mesh: pl, born: performance.now(), life: 150 }); }
      else this.overlay.float(hit, "BLOCK", "#48b8ff");
    } else if (e.outcome === "miss") { t.rig.group.position.add(dir.clone().multiplyScalar(0.35)); setTimeout(() => { t.rig.group.position.copy(this.world.toWorld(t.tx, t.ty)); }, 180); this.overlay.float(hit, "MISS", "#b0b0c8"); }
    else { this.overlay.float(hit, "COUNTER!", "#e02828", true); this.camShake = 0.12; a.pose = "hurt"; a.poseT = performance.now(); }
    t.hp = e.targetHp; t.maxHp = e.targetMaxHp; t.stamina = e.targetStamina; a.hp = e.attackerHp; a.stamina = e.attackerStamina;
    this.overlay.setBar(t.id, t.hp, t.maxHp, t.stamina, t.maxStamina, t.injuries); this.overlay.setBar(a.id, a.hp, a.maxHp, a.stamina, a.maxStamina, a.injuries);
    if (e.line) this.overlay.speech(this.headPos(a).add(new THREE.Vector3(0, 0.3, 0)), e.line);
    if (t.hp <= 0 && !t.ko) { t.ko = true; t.rig.setPose("ko", 0); this.overlay.float(hit.clone().add(new THREE.Vector3(0, 0.4, 0)), "K.O.", "#e02828", true); }
    await wait(200);
    // return to position
    a.walkFrom = this.pos(a).clone(); a.walkTarget = this.world.toWorld(a.tx, a.ty); a.walkStart = performance.now(); a.walkUntil = performance.now() + 220;
    await wait(240);
    a.pose = "idle"; a.walkTarget = undefined; if (!t.ko) t.pose = "idle";
    await wait(Math.max(0, e.ms - 160 - 200 - 240 - 240));
  }

  private focusCenter() { if (!this.focus.length) return this.center(); const c = new THREE.Vector3(); for (const p of this.focus) c.add(p); return c.multiplyScalar(1 / this.focus.length); }

  /* ------------------------------------------------------------------ frame loop */
  private loop() {
    const t = this.clock.getElapsedTime();
    const now = performance.now();
    // actors
    for (const a of this.actors.values()) {
      if (a.walkTarget && a.walkFrom && a.walkStart !== undefined && a.walkUntil !== undefined) {
        const k = Math.min(1, (now - a.walkStart) / Math.max(1, a.walkUntil - a.walkStart));
        a.rig.group.position.lerpVectors(a.walkFrom, a.walkTarget, k);
        if (k >= 1 && a.pose === "walk") { /* move() resolves */ }
      }
      const poseAge = (now - a.poseT) / 1000;
      if (a.ko) a.rig.setPose("ko", t);
      else if (a.pose === "attack") a.rig.setPose("attack", t, Math.min(1, poseAge * 8));
      else if (a.pose === "hurt") { a.rig.setPose("hurt", t, Math.max(0, 1 - poseAge * 3)); if (poseAge > 0.35) a.pose = "idle"; }
      else if (a.pose === "walk" || a.walkTarget) a.rig.setPose("walk", t);
      else a.rig.setPose("idle", t);
    }
    // fx
    this.fx = this.fx.filter((f) => { const age = (now - f.born) / f.life; if (age >= 1) { this.scene.remove(f.mesh); return false; } if (f.vel) f.mesh.position.addScaledVector(f.vel, 1 / 60); if (f.mesh instanceof THREE.Sprite) { f.mesh.material.opacity = 1 - age; f.mesh.material.rotation += 0.1; } if (f.mesh instanceof THREE.PointLight) f.mesh.intensity = 6 * (1 - age); return true; });
    // flames & lamps flicker, holo spin, banners sway, clouds drift
    for (const f of this.world.flames) { f.scale.set(0.35 + Math.sin(t * 14 + f.position.x) * 0.05, 0.5 + Math.sin(t * 11 + f.position.z) * 0.08, 1); }
    for (const l of this.world.lights) if (l.color.r > 0.9 && l.color.b < 0.5) l.intensity = (l.userData.base ??= l.intensity) * (0.9 + Math.sin(t * 9 + l.position.x * 3) * 0.1);
    this.world.group.traverse((o) => { if (o.name === "holo-globe") o.rotation.y = t * 0.6; if (o.name === "banner-cloth") { const pos = (o as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const d = Math.max(0, 1 - y); pos.setZ(i, Math.sin(t * 1.5 + d * 3) * d * 0.08); } pos.needsUpdate = true; } });
    this.backdrop?.traverse((o) => { if (o.name === "cloud") o.position.x += 0.004; });
    // weather
    if (this.weatherObj) { const pos = this.weatherObj.geometry.attributes.position as THREE.BufferAttribute; const dy = this.weather === "snow" ? 0.02 : 0.25; const c = this.center(); for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - dy; if (y < 0) { y = 14; pos.setX(i, c.x + (Math.random() - 0.5) * 30); pos.setZ(i, c.z + (Math.random() - 0.5) * 30); } pos.setY(i, y); } pos.needsUpdate = true; }
    if (this.fog) for (const s of this.fog.children) s.position.x += 0.004;
    // camera director: ease toward the focus, keep everyone in frame
    const target = this.mode === "showcase" ? this.center() : this.focusCenter();
    const spread = this.focus.length > 1 ? Math.max(...this.focus.map((p) => p.distanceTo(target))) : 0;
    const wantDist = this.mode === "showcase" ? this.camDist : Math.max(6.5, Math.min(16, 7 + spread * 1.6));
    this.camDist += (wantDist - this.camDist) * 0.02;
    this.camLook.lerp(target, 0.03);
    if (this.mode === "showcase" || !this.playing) this.camYaw += 0.0006;
    const px = this.camLook.x + Math.cos(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const pz = this.camLook.z + Math.sin(this.camYaw) * this.camDist * Math.cos(this.camPitch);
    const py = this.camLook.y + Math.sin(this.camPitch) * this.camDist;
    this.camera.position.lerp(new THREE.Vector3(px, py, pz), 0.06);
    if (this.camShake > 0) { this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.camShake, (Math.random() - 0.5) * this.camShake, (Math.random() - 0.5) * this.camShake)); this.camShake *= 0.82; if (this.camShake < 0.005) this.camShake = 0; }
    this.camera.lookAt(this.camLook.clone().add(new THREE.Vector3(0, 0.6, 0)));
    // labels face the camera automatically (sprites)
    this.overlay.tick(this.camera, this.el.clientWidth, this.el.clientHeight);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }
}

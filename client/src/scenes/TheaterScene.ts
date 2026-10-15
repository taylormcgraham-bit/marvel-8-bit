/**
 * The theater: a deterministic playback engine for GameEvents. It never decides anything;
 * it performs what the engine already resolved, with timing, animation and UI.
 */
import Phaser from "phaser";
import type { GameEvent, Dir } from "@shared/events";
import { MAPS, type MapDef } from "@shared/maps";
import { Net } from "../net";
import { VIEW_W, VIEW_H } from "../main";
import {
  TILE, CHAR_W, CHAR_H, PAL, FRAME_INDEX, makeTiles, makeTiles2, makeProps, makeSky, makeSkies, makeObjects, makeCharacter, makePortrait, makeEmotes, makeFx, type Look,
} from "../render/pixels";
import { windowBox } from "../ui/widgets";
import { DialogBox, CaptionBox, TitleCard, HpBar, QuestLog, FONT, floatText, banner } from "../ui/widgets";

interface Manifest {
  characters?: Record<string, { sheet: string; frameWidth?: number; frameHeight?: number; portrait?: string }>;
  /** override any procedural texture key, e.g. "tile-roof": "tiles/roof.png", "water-tower": "objects/tower.png" */
  textures?: Record<string, string>;
}

interface Actor {
  id: string;
  name: string;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  facing: Dir;
  tx: number; ty: number;
  hp: number; maxHp: number;
  stamina: number; maxStamina: number;
  injuries: string[];
  hpBar: HpBar;
  role: string;
  ko: boolean;
}

const tileToPx = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 2 });
const sideOf = (dir: Dir) => (dir === "left" || dir === "right" ? "side" : dir);

export class TheaterScene extends Phaser.Scene {
  private net?: Net;
  private queue: GameEvent[] = [];
  private playing = false;
  private currentEndsAt = 0;
  private actors = new Map<string, Actor>();
  private map!: MapDef;
  private dialog!: DialogBox;
  private caption!: CaptionBox;
  private title!: TitleCard;
  private hud!: Phaser.GameObjects.Text;
  private scanlines!: Phaser.GameObjects.Image;
  private quest!: QuestLog;
  private stageObjects: Phaser.GameObjects.GameObject[] = [];
  private weatherObjects: Phaser.GameObjects.GameObject[] = [];
  private timeOfDay = "night";
  private weather = "clear";
  private objectives: { id: string; text: string; status: string }[] = [];
  private actInfo = { issue: 0, n: 0, title: "" };
  private consoleEl = document.getElementById("console") as HTMLPreElement;
  private badgeEl = document.getElementById("badge") as HTMLDivElement;
  private mode: "live" | "mock" = "mock";
  private idleTimer = 0;

  constructor() { super("theater"); }

  /** Hand-drawn art, if any, is listed in client/public/assets/manifest.json (see docs/ART.md). */
  preload() {
    this.load.json("manifest", "assets/manifest.json");
    this.load.once("filecomplete-json-manifest", (_k: string, _t: string, data: Manifest) => {
      for (const [id, c] of Object.entries(data.characters ?? {})) {
        this.load.spritesheet(`char-${id}`, `assets/${c.sheet}`, { frameWidth: c.frameWidth ?? CHAR_W, frameHeight: c.frameHeight ?? CHAR_H });
        if (c.portrait) this.load.image(`portrait-${id}`, `assets/${c.portrait}`);
      }
      for (const [name, file] of Object.entries(data.textures ?? {})) this.load.image(name, `assets/${file}`);
    });
    this.load.on("loaderror", (f: { key: string }) => { if (f.key !== "manifest") console.warn("asset failed to load:", f.key); });
  }

  create() {
    const keep = new Set(Object.keys((this.cache.json.get("manifest") as Manifest | undefined)?.textures ?? {}));
    makeTiles(this, keep); makeTiles2(this); makeSky(this, VIEW_W); makeSkies(this, VIEW_W); makeObjects(this, keep); makeProps(this); makeEmotes(this); makeFx(this);
    this.map = MAPS["chelsea-rooftop"]!;
    this.buildStage();
    this.dialog = new DialogBox(this, VIEW_W, VIEW_H);
    this.caption = new CaptionBox(this, VIEW_W);
    this.title = new TitleCard(this, VIEW_W, VIEW_H);
    this.hud = this.add.text(VIEW_W - 4, 3, "", { ...FONT, fontSize: "6px", color: "#b0b0c8", stroke: PAL.black, strokeThickness: 2 }).setOrigin(1, 0).setDepth(940);
    this.scanlines = this.add.image(0, 0, "scanlines").setOrigin(0).setDepth(1900).setAlpha(0.5);
    this.quest = new QuestLog(this);
    this.input.keyboard?.on("keydown-Q", () => this.quest.toggle());

    this.input.keyboard?.on("keydown-BACKQUOTE", () => { this.consoleEl.hidden = !this.consoleEl.hidden; });
    this.input.keyboard?.on("keydown-C", () => this.scanlines.setVisible(!this.scanlines.visible));

    if (location.search.includes("showcase")) {
      // art review: spawn the whole roster, no story. ?map=<id>&tod=<dawn|day|dusk|night>&weather=<...>
      const q = new URLSearchParams(location.search);
      if (q.get("map") && MAPS[q.get("map")!]) this.map = MAPS[q.get("map")!]!;
      this.timeOfDay = q.get("tod") ?? "night"; this.weather = q.get("weather") ?? "clear";
      this.buildStage();
      this.badgeEl.textContent = "SHOWCASE  ·  C scanlines";
      fetch("/api/roster").then((r) => r.json()).then((list: GameEvent[]) => {
        this.hud.setText(`${this.map.name.toUpperCase()}  ·  ${this.timeOfDay.toUpperCase()}`);
        const markers = this.map.markers;
        this.enqueue(list.map((e, i) => e.type === "spawn" ? { ...e, x: markers[i % markers.length]!.x, y: markers[i % markers.length]!.y } : e));
      });
      return;
    }
    this.net = new Net({
      onHello: (mode, replay) => {
        this.mode = mode;
        this.badgeEl.textContent = (mode === "mock" ? "MOCK DIRECTOR" : "LIVE") + "  ·  Q quests  ·  ` console  ·  C scanlines  ·  /desk  /chronicle";
        this.resetStage();
        this.enqueue(replay);
      },
      onEvents: (events) => this.enqueue(events),
      onStatus: (text) => this.log("info", text),
    });

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.net?.send({ kind: "buffer", ms: this.bufferedMs() }) });
  }

  update(_t: number, dt: number) {
    for (const a of this.actors.values()) a.hpBar.tick(this);
    this.quest.tick();
    this.idleTimer += dt;
    if (!this.playing && this.queue.length === 0 && this.idleTimer > 2600) {
      this.idleTimer = 0;
      const list = [...this.actors.values()].filter((a) => !a.ko);
      const a = list[Phaser.Math.Between(0, list.length - 1)];
      if (a && Math.random() < 0.5) this.face(a, (["up", "down", "left", "right"] as Dir[])[Phaser.Math.Between(0, 3)]!);
    }
  }

  /* ------------------------------------------------------------------ stage */

  private clearStage() {
    for (const o of this.stageObjects) o.destroy();
    this.stageObjects = [];
    this.clearWeather();
  }
  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T { this.stageObjects.push(o); return o; }

  /** Build background, tiles, props and lighting for the current map, time of day and weather. */
  private buildStage() {
    this.clearStage();
    const m = this.map;
    const tod = this.timeOfDay;
    const night = tod === "night";
    if (m.kind !== "interior") {
      this.keep(this.add.image(0, 0, `sky-${tod}`).setOrigin(0).setDepth(-10));
      if (m.region === "latveria") this.keep(this.add.image(0, 0, "mountains").setOrigin(0).setDepth(-7));
      else if (m.kind === "rooftop") {
        const far = this.keep(this.add.image(0, 0, "skyline-far").setOrigin(0).setDepth(-9));
        this.tweens.add({ targets: far, x: -3, duration: 60000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        for (let i = 0; i < 3; i++) {
          const c = this.keep(this.add.image(-70 + i * 140, 4 + i * 7, "cloud").setOrigin(0).setDepth(-8));
          this.tweens.add({ targets: c, x: VIEW_W + 20, duration: 90000 + i * 25000, repeat: -1, delay: i * 8000, onRepeat: () => c.setX(-70) });
        }
        this.keep(this.add.image(0, 0, "skyline-near").setOrigin(0).setDepth(-7));
        if (night) {
          const blink = this.keep(this.add.image(0, 0, "skyline-blink").setOrigin(0).setDepth(-6).setAlpha(0.2));
          this.tweens.add({ targets: blink, alpha: 1, duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          const beacon = this.keep(this.add.rectangle(VIEW_W - 53, 1, 2, 2, 0xff3030).setOrigin(0).setDepth(-5));
          this.tweens.add({ targets: beacon, alpha: 0.1, duration: 700, yoyo: true, repeat: -1 });
        }
      }
    }
    // tiles
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const t = m.tiles[y]![x]!;
      if (t === "void") continue;
      this.keep(this.add.image(x * TILE, y * TILE, `tile-${t}`).setOrigin(0).setDepth(0));
    }
    if (m.kind === "rooftop") {
      for (let x = 0; x < m.width; x++) this.keep(this.add.image(x * TILE, 3 * TILE, "ledge-front").setOrigin(0).setDepth(0));
      for (let x = 1; x < m.width - 1; x++) this.keep(this.add.image(x * TILE, 3 * TILE + 7, "ao-strip").setOrigin(0).setDepth(0));
    }
    if (m.kind === "castle") for (let x = 1; x < m.width - 1; x++) this.keep(this.add.image(x * TILE, 3 * TILE, "ao-strip").setOrigin(0).setDepth(0));
    if (m.kind === "interior") for (let x = 1; x < m.width - 1; x++) this.keep(this.add.image(x * TILE, 2 * TILE, "ao-strip").setOrigin(0).setDepth(0));
    // props
    for (const p of m.props) this.drawProp(p.kind, p.x, p.y);
    // ambient particles
    if (m.id === "chelsea-rooftop") {
      const vent = m.markers.find((k) => k.id === "vent")!;
      this.keep(this.add.particles(vent.x * TILE + 8, vent.y * TILE - 2, "px", {
        speedY: { min: -10, max: -18 }, speedX: { min: -4, max: 4 }, lifespan: 1600, alpha: { start: 0.45, end: 0 },
        scale: { start: 2, end: 5 }, frequency: 180, tint: 0xb0b0c8,
      }).setDepth(vent.y * TILE + 20));
    }
    // lighting by time of day and kind
    const top = m.kind === "interior" ? 0 : 2 * TILE;
    if (night) this.keep(this.add.rectangle(0, top, VIEW_W, VIEW_H - top, m.kind === "interior" ? 0x303060 : 0x202060, m.kind === "interior" ? 0.1 : 0.16).setOrigin(0).setDepth(500).setBlendMode(Phaser.BlendModes.MULTIPLY));
    if (tod === "dusk") this.keep(this.add.rectangle(0, top, VIEW_W, VIEW_H - top, 0xffa060, 0.12).setOrigin(0).setDepth(500).setBlendMode(Phaser.BlendModes.MULTIPLY));
    if (tod === "dawn") this.keep(this.add.rectangle(0, top, VIEW_W, VIEW_H - top, 0xffd0a0, 0.1).setOrigin(0).setDepth(500).setBlendMode(Phaser.BlendModes.MULTIPLY));
    if (m.id === "chelsea-rooftop" && night) {
      const lamp = this.keep(this.add.image(2 * TILE + 16, 12 * TILE + 2, "light-warm").setDepth(501).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9));
      this.tweens.add({ targets: lamp, alpha: 0.7, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1200, 3000) });
      this.keep(this.add.image(9 * TILE, 9 * TILE, "light-cool").setDepth(501).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7));
    }
    this.buildWeather();
  }

  private drawProp(kind: string, tx: number, ty: number) {
    const key = kind === "water-tower" || kind === "bulkhead" ? kind : `prop-${kind}`;
    if (!this.textures.exists(key)) return;
    const img = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = img.width, h = img.height;
    const x = tx * TILE + (kind === "water-tower" ? -2 : 0), baseY = (ty + 1) * TILE;
    const ground = kind === "bugle-sign" || kind === "banner" || kind === "gate";
    if (!ground) this.keep(this.add.image(x + w / 2, baseY - 2, "shadow-blob").setDisplaySize(Math.min(64, w + 8), Math.max(6, Math.round(w / 4))).setAlpha(0.8).setDepth(1));
    this.keep(this.add.image(x, baseY - h, key).setOrigin(0).setDepth(ground ? 0.5 : baseY - 4));
    if (kind === "torch" || kind === "lamppost") {
      const lx = x + w / 2, ly = baseY - h + 4;
      const glow = this.keep(this.add.image(lx, ly, "light-warm").setDepth(501).setBlendMode(Phaser.BlendModes.ADD).setAlpha(kind === "torch" ? 0.6 : 0.45).setDisplaySize(kind === "torch" ? 56 : 80, kind === "torch" ? 56 : 80));
      this.tweens.add({ targets: glow, alpha: glow.alpha * 0.8, duration: 120, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(300, 1200) });
      if (kind === "torch") this.keep(this.add.particles(lx, ly, "px", { speedY: { min: -14, max: -24 }, speedX: { min: -3, max: 3 }, lifespan: 500, alpha: { start: 0.9, end: 0 }, scale: { start: 1.5, end: 0.5 }, frequency: 90, tint: [0xff8a20, 0xffd860] }).setDepth(502));
    }
    if (kind === "holo-table") this.keep(this.add.image(x + w / 2, baseY - h + 4, "light-cool").setDepth(501).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6).setDisplaySize(70, 70));
  }

  private clearWeather() { for (const o of this.weatherObjects) o.destroy(); this.weatherObjects = []; }
  private buildWeather() {
    this.clearWeather();
    const w = this.weather;
    if (this.map.kind === "interior" || w === "clear") return;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.weatherObjects.push(o); return o; };
    if (w === "rain" || w === "storm") {
      keep(this.add.particles(0, -10, "raindrop", { x: { min: -20, max: VIEW_W }, speedY: { min: 220, max: 300 }, speedX: { min: 30, max: 50 }, lifespan: 1100, quantity: w === "storm" ? 4 : 2, frequency: 40, alpha: { start: 0.7, end: 0.3 } }).setDepth(600));
      keep(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x203050, w === "storm" ? 0.22 : 0.12).setOrigin(0).setDepth(599).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (w === "storm") this.time.addEvent({ delay: 4000, loop: true, callback: () => { if (this.weather === "storm" && Math.random() < 0.5) this.cameras.main.flash(90, 220, 230, 255, false); } });
    } else if (w === "snow") {
      keep(this.add.particles(0, -4, "snowflake", { x: { min: -10, max: VIEW_W }, speedY: { min: 18, max: 34 }, speedX: { min: -8, max: 8 }, lifespan: 9000, frequency: 90, alpha: { start: 0.9, end: 0.5 } }).setDepth(600));
    } else if (w === "fog") {
      const f1 = keep(this.add.image(0, 0, "fog").setOrigin(0).setDepth(600).setAlpha(0.9));
      const f2 = keep(this.add.image(-320, 0, "fog").setOrigin(0).setDepth(600).setAlpha(0.9));
      this.tweens.add({ targets: [f1, f2], x: "+=320", duration: 40000, repeat: -1 });
    }
  }

  private resetStage() {
    for (const a of this.actors.values()) { a.sprite.destroy(); a.label.destroy(); a.shadow.destroy(); a.hpBar.root.destroy(); }
    this.actors.clear();
    this.queue = [];
    this.dialog.hide(); this.caption.hide();
  }

  private spawn(e: Extract<GameEvent, { type: "spawn" }>) {
    if (this.actors.has(e.who)) return;
    const look = e.look as Partial<Look> | undefined;
    makeCharacter(this, `char-${e.who}`, e.palette, look);
    makePortrait(this, `portrait-${e.who}`, e.palette, look);
    const p = tileToPx(e.x, e.y);
    const shadow = this.add.image(p.x, p.y + 1, "shadow-blob").setDisplaySize(20, 7).setAlpha(0.9).setDepth(2);
    const sprite = this.add.sprite(p.x, p.y, `char-${e.who}`, 0).setOrigin(0.5, 1);
    const label = this.add.text(p.x, p.y - CHAR_H - 1, e.name.toUpperCase(), { ...FONT, fontSize: "6px", color: "#d0d0e0", stroke: PAL.black, strokeThickness: 2 }).setOrigin(0.5, 1).setAlpha(0.75);
    const idx = this.actors.size;
    const right = idx % 2 === 1;
    const hpBar = new HpBar(this, right ? VIEW_W - 86 : 6, 26 + Math.floor(idx / 2) * 20, e.name, e.palette, right);
    const a: Actor = {
      id: e.who, name: e.name, sprite, shadow, label, facing: e.facing, tx: e.x, ty: e.y, hp: e.hp, maxHp: e.maxHp,
      stamina: e.stamina ?? 10, maxStamina: e.maxStamina ?? 10, injuries: (e.injuries ?? []).map((i) => i.name), hpBar, role: e.role, ko: e.hp <= 0,
    };
    this.actors.set(e.who, a);
    hpBar.setInjuries(a.injuries);
    if (a.hp < a.maxHp || a.injuries.length) { hpBar.set(a.hp, a.maxHp, this, a.stamina, a.maxStamina); }
    if (a.ko) { sprite.setFrame(FRAME_INDEX("ko", "side")); sprite.setAngle(90); sprite.setY(sprite.y - 6); }
    this.face(a, e.facing);
    this.sortDepth(a);
  }

  private sortDepth(a: Actor) { a.sprite.setDepth(a.sprite.y); a.label.setDepth(a.sprite.y); }
  private syncAttach(a: Actor) { a.label.setPosition(a.sprite.x, a.sprite.y - CHAR_H - 1); a.shadow.setPosition(a.sprite.x, a.sprite.y + 1); this.sortDepth(a); }

  private face(a: Actor, dir: Dir) {
    if (a.ko) return;
    a.facing = dir;
    a.sprite.setFlipX(dir === "left");
    a.sprite.play(`char-${a.id}-idle-${sideOf(dir)}`);
  }

  /* ------------------------------------------------------------------ queue */

  private enqueue(events: GameEvent[]) { this.queue.push(...events); if (!this.playing) void this.pump(); }

  private bufferedMs() {
    const cur = Math.max(0, this.currentEndsAt - this.time.now);
    return cur + this.queue.reduce((s, e) => s + e.ms, 0);
  }

  private async pump() {
    this.playing = true;
    while (this.queue.length) {
      const e = this.queue.shift()!;
      this.currentEndsAt = this.time.now + e.ms;
      try { await this.play(e); } catch (err) { console.error(err); }
    }
    this.playing = false;
  }

  private wait(ms: number) { return new Promise<void>((r) => this.time.delayedCall(ms, r)); }
  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig) { return new Promise<void>((r) => this.tweens.add({ ...cfg, onComplete: () => r() })); }

  private faceToward(a: Actor, x: number, y: number) {
    const dx = x - a.sprite.x, dy = y - a.sprite.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    this.face(a, Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up"));
  }

  private async play(e: GameEvent): Promise<void> {
    switch (e.type) {
      case "title": return this.title.show(e.issue, e.title, e.subtitle, e.ms);
      case "scene": {
        this.hud.setText(`${e.locationName.toUpperCase()}  ·  ${e.timeOfDay.toUpperCase()}${e.weather && e.weather !== "clear" ? "  ·  " + e.weather.toUpperCase() : ""}`);
        const moved = e.location !== this.map.id;
        const changed = moved || e.timeOfDay !== this.timeOfDay || (e.weather ?? "clear") !== this.weather;
        if (moved) {
          await this.tween({ targets: this.cameras.main, alpha: 0, duration: 300 } as unknown as Phaser.Types.Tweens.TweenBuilderConfig);
          for (const a of this.actors.values()) { a.sprite.destroy(); a.label.destroy(); a.shadow.destroy(); a.hpBar.root.destroy(); }
          this.actors.clear();
          this.map = MAPS[e.location] ?? this.map;
        }
        this.timeOfDay = e.timeOfDay; this.weather = e.weather ?? "clear";
        if (changed) this.buildStage();
        if (moved) this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 400 });
        if (e.caption) return this.caption.show(e.caption, e.ms + 1200);
        return this.wait(e.ms);
      }
      case "travel": {
        const names = e.who.map((id) => this.actors.get(id)?.name ?? id).join(" & ");
        for (const id of e.who) { const a = this.actors.get(id); if (a) this.tweens.add({ targets: [a.sprite, a.label, a.shadow], alpha: 0, duration: 500 }); }
        await this.caption.show(`${names}: ${e.how ?? "on the move"}${e.minutes ? ` (${e.minutes} min)` : ""}`, e.ms);
        return;
      }
      case "recap": return this.recapCard(e.title, e.lines, e.ms);
      case "spawn": { this.spawn(e); return this.wait(e.ms); }
      case "despawn": {
        const a = this.actors.get(e.who); if (!a) return;
        if (e.how) floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 10, e.how.toUpperCase().slice(0, 24), "#b0b0c8");
        await this.tween({ targets: [a.sprite, a.label, a.shadow], alpha: 0, duration: 400 });
        a.sprite.destroy(); a.label.destroy(); a.shadow.destroy(); a.hpBar.root.destroy(); this.actors.delete(e.who);
        return;
      }
      case "caption": return this.caption.show(e.text, e.ms);
      case "wait": return this.wait(e.ms);
      case "note": { this.log(e.level, e.text); return; }
      case "face": { const a = this.actors.get(e.who); if (a) this.face(a, e.dir); return this.wait(e.ms); }
      case "emote": {
        const a = this.actors.get(e.who); if (!a) return;
        const b = this.add.image(a.sprite.x + 9, a.sprite.y - CHAR_H - 9, `emote-${e.emote}`).setOrigin(0.5, 1).setDepth(990).setScale(0);
        this.tweens.add({ targets: b, scale: 1, duration: 150, ease: "Back.easeOut" });
        this.tweens.add({ targets: b, y: b.y - 2, duration: 300, yoyo: true, repeat: 2, delay: 150 });
        if (e.emote === "!") { a.sprite.setY(a.sprite.y - 3); this.time.delayedCall(120, () => { a.sprite.setY(a.sprite.y + 3); }); }
        await this.wait(e.ms); b.destroy(); return;
      }
      case "move": {
        const a = this.actors.get(e.who); if (!a || a.ko) return;
        const p = tileToPx(e.x, e.y);
        const dx = p.x - a.sprite.x, dy = p.y - a.sprite.y;
        const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
        a.facing = dir;
        a.sprite.setFlipX(dir === "left");
        a.sprite.play(`char-${a.id}-walk-${sideOf(dir)}`);
        const dust = this.add.particles(0, 0, "fx-dust", {
          follow: a.sprite, followOffset: { x: 0, y: -1 }, speedX: { min: -8, max: 8 }, speedY: { min: -6, max: -1 },
          lifespan: 350, alpha: { start: 0.6, end: 0 }, scale: { start: 0.6, end: 0.2 }, frequency: 90,
        }).setDepth(1);
        await this.tween({ targets: a.sprite, x: p.x, y: p.y, duration: e.ms, ease: "Linear", onUpdate: () => this.syncAttach(a) });
        dust.stop(); this.time.delayedCall(400, () => dust.destroy());
        a.tx = e.x; a.ty = e.y;
        this.face(a, dir);
        return;
      }
      case "say": {
        const a = this.actors.get(e.who); if (!a) return;
        const others = [...this.actors.values()].filter((o) => o.id !== a.id);
        if (others.length) {
          const o = others.sort((p, q) => Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, p.sprite.x, p.sprite.y) - Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, q.sprite.x, q.sprite.y))[0]!;
          this.faceToward(a, o.sprite.x, o.sprite.y);
        }
        if (!a.ko) this.tweens.add({ targets: a.sprite, y: a.sprite.y - 2, duration: 90, yoyo: true });
        await this.dialog.show(a.name, `portrait-${a.id}`, e.text, e.mood, e.ms);
        this.dialog.hide();
        return;
      }
      case "rescue": {
        const a = this.actors.get(e.who); if (!a) return;
        const b = this.add.image(a.sprite.x + 9, a.sprite.y - CHAR_H - 9, "emote-heart").setOrigin(0.5, 1).setDepth(990);
        floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 12, "RESCUE!", PAL.green, true);
        await this.caption.show(`${a.name} saves ${e.what}`, e.ms);
        b.destroy(); return;
      }
      case "strike": return this.strike(e);
      case "act": {
        this.actInfo = { issue: e.issue, n: e.n, title: e.title };
        this.objectives = e.objectives.map((o) => ({ ...o }));
        this.quest.set(e.issue, e.n, e.title, this.objectives);
        if (e.seq === 0) return this.wait(200); // snapshot: no banner
        const roman = ["I", "II", "III"][e.n - 1] ?? String(e.n);
        return banner(this, VIEW_W, VIEW_H, `ACT ${roman}`, PAL.yellow, e.ms, e.title.toUpperCase());
      }
      case "objective": {
        const o = this.objectives.find((x) => x.id === e.id); if (o) o.status = e.status;
        this.quest.set(this.actInfo.issue, this.actInfo.n, this.actInfo.title, this.objectives);
        floatText(this, VIEW_W / 2, 60, e.status === "done" ? "OBJECTIVE COMPLETE" : "OBJECTIVE FAILED", e.status === "done" ? PAL.green : "#ff8a8a", true);
        return this.wait(e.ms);
      }
      case "issueEnd": {
        this.objectives = [];
        return this.title.show(e.issue, `END OF ISSUE: ${e.title}`, e.next ? `NEXT: ${e.next}` : undefined, e.ms);
      }
      case "death": {
        const a = this.actors.get(e.who); if (!a) return;
        this.cameras.main.flash(300, 255, 255, 255, false);
        a.sprite.stop(); a.sprite.setFrame(FRAME_INDEX("ko", "side")); a.sprite.setAngle(90); a.ko = true;
        await this.caption.show(`${e.name} ${e.how}`, e.ms - 800);
        await this.tween({ targets: [a.sprite, a.label, a.shadow], alpha: 0, duration: 800 });
        a.sprite.destroy(); a.label.destroy(); a.shadow.destroy(); a.hpBar.root.destroy(); this.actors.delete(e.who);
        return;
      }
      case "fightStart": {
        for (const id of e.sides.flat()) { const a = this.actors.get(id); if (a) { a.hpBar.pinned = true; a.hpBar.set(a.hp, a.maxHp, this, a.stamina, a.maxStamina); } }
        this.cameras.main.flash(80, 255, 255, 255, false);
        return banner(this, VIEW_W, VIEW_H, "FIGHT!", PAL.red, e.ms, e.stakes.length < 70 ? e.stakes.toUpperCase() : undefined);
      }
      case "round": {
        for (const [id, st] of Object.entries(e.stamina)) { const a = this.actors.get(id); if (a) { a.stamina = st; a.hpBar.set(a.hp, a.maxHp, this, a.stamina, a.maxStamina); } }
        floatText(this, VIEW_W / 2, 40, `ROUND ${e.n}`, PAL.yellow, true);
        return this.wait(e.ms);
      }
      case "fightEnd": {
        for (const a of this.actors.values()) a.hpBar.pinned = false;
        for (const id of e.escaped) {
          const a = this.actors.get(id); if (!a) continue;
          this.tweens.add({ targets: [a.sprite, a.label, a.shadow], alpha: 0, duration: 500, onComplete: () => { a.sprite.destroy(); a.label.destroy(); a.shadow.destroy(); } });
          this.tweens.add({ targets: a.hpBar.root, alpha: 0, duration: 500, onComplete: () => a.hpBar.root.destroy() });
          this.actors.delete(id);
        }
        const text = e.reason === "knockout" ? "K.O." : e.reason === "escape" ? "ESCAPED" : e.reason === "stalemate" ? "STANDOFF" : "BREAK";
        return banner(this, VIEW_W, VIEW_H, text, e.reason === "knockout" ? PAL.red : PAL.yellow, e.ms, e.summary.toUpperCase());
      }
      case "injury": {
        const a = this.actors.get(e.who); if (!a) return;
        a.injuries.push(e.injury.name); a.hpBar.setInjuries(a.injuries); a.hpBar.show(this);
        floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 12, e.injury.name.toUpperCase(), "#ff8a8a");
        return this.wait(e.ms);
      }
      case "heal": {
        const a = this.actors.get(e.who); if (!a) return;
        const gained = e.hp - a.hp;
        a.hp = e.hp; a.stamina = e.stamina;
        if (e.healed.length) { a.injuries = a.injuries.filter((_n, i) => i >= e.healed.length); a.hpBar.setInjuries(a.injuries); }
        if (a.ko && e.hp > 0) { a.ko = false; a.sprite.setAngle(0); a.sprite.setY(a.sprite.y + 6); this.face(a, a.facing); floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 10, "BACK UP", PAL.green); }
        if (e.reason === "recover" && gained === 0) floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 10, "RECOVER", PAL.blue);
        else if (gained > 0 && e.reason !== "time") floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 10, `+${gained}`, PAL.green);
        a.hpBar.set(a.hp, a.maxHp, this, a.stamina, a.maxStamina);
        return this.wait(e.ms);
      }
    }
  }

  private async strike(e: Extract<GameEvent, { type: "strike" }>) {
    const a = this.actors.get(e.who), t = this.actors.get(e.target);
    if (!a || !t) return;
    const dx = t.sprite.x - a.sprite.x, dy = t.sprite.y - a.sprite.y;
    this.faceToward(a, t.sprite.x, t.sprite.y);
    const ox = a.sprite.x, oy = a.sprite.y;
    const ranged = e.kind === "ranged" || e.kind === "control";
    const sideways = Math.abs(dx) >= Math.abs(dy);
    const attackFrame = FRAME_INDEX("attack", sideways ? "side" : "down");
    const sgn = Math.sign(dx || 1);

    // wind-up: step back, then lunge or fire
    a.sprite.stop();
    await this.tween({ targets: a.sprite, x: ox - sgn * 3, duration: 140, ease: "Quad.easeOut", onUpdate: () => this.syncAttach(a) });
    a.sprite.setFrame(attackFrame);
    if (ranged) {
      const key = e.kind === "control" ? "fx-web" : "fx-bolt";
      const proj = this.add.image(a.sprite.x + sgn * 8, a.sprite.y - 16, key).setDepth(985);
      if (key === "fx-bolt") proj.setFlipX(sgn < 0).setAngle(Phaser.Math.RadToDeg(Math.atan2(dy, dx)) + (sgn < 0 ? 180 : 0));
      await this.tween({ targets: proj, x: t.sprite.x, y: t.sprite.y - 14, duration: 170, ease: "Linear" });
      proj.destroy();
    } else {
      const lx = t.sprite.x - sgn * 12, ly = t.sprite.y - Math.sign(dy) * 3;
      await this.tween({ targets: a.sprite, x: lx, y: ly, duration: 120, ease: "Quad.easeIn", onUpdate: () => this.syncAttach(a) });
    }

    // impact
    const ix = t.sprite.x, iy = t.sprite.y - 14;
    const hurtFrame = FRAME_INDEX("hurt", sideways ? "side" : "down");
    if (e.outcome === "hit" || e.outcome === "blocked") {
      const spark = this.add.image(ix + sgn * 2, iy, "fx-hit").setDepth(995).setScale(e.outcome === "hit" ? 1.3 : 0.7).setAngle(Phaser.Math.Between(0, 90));
      this.tweens.add({ targets: spark, scale: 0, angle: spark.angle + 45, duration: 220, onComplete: () => spark.destroy() });
      if (e.outcome === "hit") {
        this.cameras.main.shake(160, Math.min(0.014, 0.003 + e.damage * 0.0007));
        this.cameras.main.flash(60, 255, 255, 255, false);
        t.sprite.stop(); t.sprite.setFrame(hurtFrame); t.sprite.setTintFill(0xffffff);
        this.time.delayedCall(70, () => t.sprite.clearTint());
        this.tweens.add({ targets: t.sprite, x: t.sprite.x + sgn * 6, duration: 90, yoyo: true, onUpdate: () => this.syncAttach(t) });
        floatText(this, ix, iy - 8, `${e.damage}`, PAL.yellow, e.damage >= 10);
      } else {
        t.sprite.setTintFill(0x88c8ff); this.time.delayedCall(70, () => t.sprite.clearTint());
        floatText(this, ix, iy - 8, "BLOCK", PAL.blue);
      }
    } else if (e.outcome === "miss") {
      this.tweens.add({ targets: t.sprite, x: t.sprite.x + sgn * 8, duration: 90, yoyo: true, onUpdate: () => this.syncAttach(t) });
      floatText(this, ix, iy - 8, "MISS", "#b0b0c8");
    } else {
      floatText(this, ix, iy - 8, "COUNTER!", PAL.red, true);
      this.cameras.main.shake(110, 0.005);
      a.sprite.setFrame(hurtFrame); a.sprite.setTintFill(0xffffff); this.time.delayedCall(70, () => a.sprite.clearTint());
    }
    t.hp = e.targetHp; t.maxHp = e.targetMaxHp; t.stamina = e.targetStamina;
    a.hp = e.attackerHp; a.stamina = e.attackerStamina;
    t.hpBar.set(t.hp, t.maxHp, this, t.stamina, t.maxStamina);
    a.hpBar.set(a.hp, a.maxHp, this, a.stamina, a.maxStamina);
    if (e.line) {
      const bubble = this.add.text(a.sprite.x, a.sprite.y - CHAR_H - 12, e.line, { ...FONT, fontSize: "6px", color: PAL.white, stroke: PAL.black, strokeThickness: 3, wordWrap: { width: 110 }, align: "center" }).setOrigin(0.5, 1).setDepth(996);
      this.time.delayedCall(1800, () => bubble.destroy());
    }
    if (t.hp <= 0 && !t.ko) {
      t.ko = true;
      t.sprite.stop(); t.sprite.setFrame(FRAME_INDEX("ko", "side")); t.sprite.setAngle(sgn > 0 ? 90 : -90);
      t.sprite.setY(t.sprite.y - 6);
      floatText(this, ix, iy - 18, "K.O.", PAL.red, true);
    }

    // recover
    await this.wait(120);
    await this.tween({ targets: a.sprite, x: ox, y: oy, duration: 200, ease: "Quad.easeOut", onUpdate: () => this.syncAttach(a) });
    this.face(a, a.facing);
    if (!t.ko) this.face(t, t.facing);
    this.syncAttach(a); this.syncAttach(t);
    const spent = 140 + 170 + 120 + 200;
    await this.wait(Math.max(0, e.ms - spent));
  }

  /** "While you were away": a dark card listing off-panel one-liners. */
  private recapCard(title: string, lines: string[], ms: number): Promise<void> {
    const w = VIEW_W - 24, x = 12, y = 20;
    const box = windowBox(this, x, y, w, VIEW_H - 40).setDepth(2100).setAlpha(0);
    const head = this.add.text(x + 10, y + 10, title, { ...FONT, color: PAL.yellow, wordWrap: { width: w - 20 } }).setDepth(2101).setAlpha(0);
    const texts: Phaser.GameObjects.Text[] = [];
    let ly = y + 30;
    for (const l of lines) { const t = this.add.text(x + 10, ly, `· ${l}`, { ...FONT, fontSize: "6px", wordWrap: { width: w - 20 }, lineSpacing: 2 }).setDepth(2101).setAlpha(0); texts.push(t); ly += t.height + 6; if (ly > VIEW_H - 40) break; }
    const all = [box, head, ...texts];
    this.tweens.add({ targets: [box, head], alpha: 1, duration: 300 });
    texts.forEach((t, i) => this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 500 + i * 900 }));
    return new Promise((r) => this.time.delayedCall(ms - 400, () => this.tweens.add({ targets: all, alpha: 0, duration: 400, onComplete: () => { all.forEach((o) => o.destroy()); r(); } })));
  }

  private log(level: string, text: string) {
    const line = document.createElement("div");
    line.className = level;
    line.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
    this.consoleEl.appendChild(line);
    while (this.consoleEl.childElementCount > 200) this.consoleEl.firstChild?.remove();
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }
}

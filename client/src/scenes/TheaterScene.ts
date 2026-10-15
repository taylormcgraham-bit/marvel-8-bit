/**
 * The theater: a deterministic playback engine for GameEvents. It never decides anything;
 * it performs what the engine already resolved, with timing, animation and UI.
 */
import Phaser from "phaser";
import type { GameEvent, Dir } from "@shared/events";
import { MAPS, type MapDef } from "@shared/maps";
import { Net } from "../net";
import { VIEW_W, VIEW_H } from "../main";
import { TILE, CHAR_W, CHAR_H, PAL, makeTiles, makeSkyline, makeWaterTower, makeCharacter, makePortrait, makeEmotes, makeFx } from "../render/pixels";
import { DialogBox, CaptionBox, TitleCard, HpBar, FONT, floatText } from "../ui/widgets";

interface Actor {
  id: string;
  name: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  facing: Dir;
  tx: number; ty: number;
  hp: number; maxHp: number;
  hpBar: HpBar;
  role: string;
}

const tileToPx = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 2 });

export class TheaterScene extends Phaser.Scene {
  private net!: Net;
  private queue: GameEvent[] = [];
  private playing = false;
  private currentEndsAt = 0;
  private actors = new Map<string, Actor>();
  private map!: MapDef;
  private dialog!: DialogBox;
  private caption!: CaptionBox;
  private title!: TitleCard;
  private hud!: Phaser.GameObjects.Text;
  private mapLayer!: Phaser.GameObjects.Container;
  private consoleEl = document.getElementById("console") as HTMLPreElement;
  private badgeEl = document.getElementById("badge") as HTMLDivElement;
  private mode: "live" | "mock" = "mock";
  private idleTimer = 0;

  constructor() { super("theater"); }

  create() {
    makeTiles(this); makeSkyline(this, VIEW_W); makeWaterTower(this); makeEmotes(this); makeFx(this);
    this.map = MAPS["chelsea-rooftop"]!;
    this.drawMap();
    this.dialog = new DialogBox(this, VIEW_W, VIEW_H);
    this.caption = new CaptionBox(this, VIEW_W);
    this.title = new TitleCard(this, VIEW_W, VIEW_H);
    this.hud = this.add.text(VIEW_W - 4, 3, "", { ...FONT, fontSize: "6px", color: "#9a9ab0", stroke: PAL.black, strokeThickness: 2 }).setOrigin(1, 0).setDepth(940);

    this.input.keyboard?.on("keydown-BACKQUOTE", () => { this.consoleEl.hidden = !this.consoleEl.hidden; });

    this.net = new Net({
      onHello: (mode, replay) => {
        this.mode = mode;
        this.badgeEl.textContent = mode === "mock" ? "MOCK DIRECTOR · press ` for console" : "LIVE · press ` for console";
        this.resetStage();
        this.enqueue(replay);
      },
      onEvents: (events) => this.enqueue(events),
      onStatus: (text) => this.log("info", text),
    });

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.net.send({ kind: "buffer", ms: this.bufferedMs() }) });
  }

  update(_t: number, dt: number) {
    for (const a of this.actors.values()) a.hpBar.tick(this);
    // idle life: when nothing is queued, characters glance around so the world never looks frozen
    this.idleTimer += dt;
    if (!this.playing && this.queue.length === 0 && this.idleTimer > 2600) {
      this.idleTimer = 0;
      const list = [...this.actors.values()];
      const a = list[Phaser.Math.Between(0, list.length - 1)];
      if (a && Math.random() < 0.5) this.face(a, (["up", "down", "left", "right"] as Dir[])[Phaser.Math.Between(0, 3)]!);
    }
  }

  /* ------------------------------------------------------------------ stage */

  private drawMap() {
    this.mapLayer?.destroy();
    this.mapLayer = this.add.container(0, 0).setDepth(0);
    this.mapLayer.add(this.add.image(0, 0, "skyline").setOrigin(0));
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) {
      const t = this.map.tiles[y]![x]!;
      if (t === "void") continue;
      this.mapLayer.add(this.add.image(x * TILE, y * TILE, `tile-${t}`).setOrigin(0));
    }
    // water tower stands on the tower-base tiles, drawn in the actor layer so people can walk behind it
    this.add.image(14 * TILE - 2, 5 * TILE - 56 + 8, "water-tower").setOrigin(0).setDepth(3 * TILE + 8);
    // steam from the vent
    const vent = this.map.markers.find((m) => m.id === "vent")!;
    this.add.particles(vent.x * TILE + 4, vent.y * TILE - 4, "px", {
      speedY: { min: -12, max: -20 }, speedX: { min: -3, max: 3 }, lifespan: 1400, alpha: { start: 0.5, end: 0 },
      scale: { start: 2, end: 4 }, frequency: 220, tint: 0x9a9ab0,
    }).setDepth(vent.y * TILE + 20);
  }

  private resetStage() {
    for (const a of this.actors.values()) { a.sprite.destroy(); a.label.destroy(); a.hpBar.root.destroy(); }
    this.actors.clear();
    this.queue = [];
    this.dialog.hide(); this.caption.hide();
  }

  private spawn(e: Extract<GameEvent, { type: "spawn" }>) {
    if (this.actors.has(e.who)) return;
    makeCharacter(this, `char-${e.who}`, e.palette, e.role);
    makePortrait(this, `portrait-${e.who}`, e.palette);
    const p = tileToPx(e.x, e.y);
    const sprite = this.add.sprite(p.x, p.y, `char-${e.who}`, 0).setOrigin(0.5, 1);
    const label = this.add.text(p.x, p.y - CHAR_H - 2, e.name.toUpperCase(), { ...FONT, fontSize: "6px", color: "#c8c8d8", stroke: PAL.black, strokeThickness: 2 }).setOrigin(0.5, 1).setAlpha(0.8);
    const idx = this.actors.size;
    const right = idx % 2 === 1;
    const hpBar = new HpBar(this, right ? VIEW_W - 78 : 6, 24 + Math.floor(idx / 2) * 20, e.name, e.palette, right);
    const a: Actor = { id: e.who, name: e.name, sprite, label, facing: e.facing, tx: e.x, ty: e.y, hp: e.hp, maxHp: e.maxHp, hpBar, role: e.role };
    this.actors.set(e.who, a);
    this.face(a, e.facing);
    this.sortDepth(a);
  }

  private sortDepth(a: Actor) { a.sprite.setDepth(a.sprite.y); a.label.setDepth(a.sprite.y); }

  private face(a: Actor, dir: Dir) {
    a.facing = dir;
    a.sprite.stop();
    a.sprite.setFlipX(dir === "left");
    a.sprite.setFrame(dir === "down" ? 0 : dir === "up" ? 2 : 4);
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

  private async play(e: GameEvent): Promise<void> {
    switch (e.type) {
      case "title": return this.title.show(e.issue, e.title, e.subtitle, e.ms);
      case "scene": {
        this.hud.setText(`${e.locationName.toUpperCase()} · ${e.timeOfDay.toUpperCase()}`);
        if (e.caption) return this.caption.show(e.caption, e.ms + 1200);
        return this.wait(e.ms);
      }
      case "spawn": { this.spawn(e); return this.wait(e.ms); }
      case "despawn": {
        const a = this.actors.get(e.who); if (!a) return;
        await new Promise<void>((r) => this.tweens.add({ targets: [a.sprite, a.label], alpha: 0, duration: 400, onComplete: () => r() }));
        a.sprite.destroy(); a.label.destroy(); a.hpBar.root.destroy(); this.actors.delete(e.who);
        return;
      }
      case "caption": return this.caption.show(e.text, e.ms);
      case "wait": return this.wait(e.ms);
      case "note": { this.log(e.level, e.text); return; }
      case "face": { const a = this.actors.get(e.who); if (a) this.face(a, e.dir); return this.wait(e.ms); }
      case "emote": {
        const a = this.actors.get(e.who); if (!a) return;
        const b = this.add.image(a.sprite.x + 8, a.sprite.y - CHAR_H - 10, `emote-${e.emote}`).setOrigin(0.5, 1).setDepth(990);
        this.tweens.add({ targets: b, y: b.y - 3, duration: 200, yoyo: true, repeat: 1 });
        await this.wait(e.ms); b.destroy(); return;
      }
      case "move": {
        const a = this.actors.get(e.who); if (!a) return;
        const p = tileToPx(e.x, e.y);
        const dx = p.x - a.sprite.x, dy = p.y - a.sprite.y;
        const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
        a.facing = dir;
        a.sprite.setFlipX(dir === "left");
        a.sprite.play(`char-${a.id}-${dir === "left" || dir === "right" ? "side" : dir}`);
        await new Promise<void>((r) => this.tweens.add({
          targets: a.sprite, x: p.x, y: p.y, duration: e.ms, ease: "Linear",
          onUpdate: () => { a.label.setPosition(a.sprite.x, a.sprite.y - CHAR_H - 2); this.sortDepth(a); },
          onComplete: () => r(),
        }));
        a.tx = e.x; a.ty = e.y;
        this.face(a, dir);
        return;
      }
      case "say": {
        const a = this.actors.get(e.who); if (!a) return;
        // speaker faces the nearest other actor if any
        const others = [...this.actors.values()].filter((o) => o.id !== a.id);
        if (others.length) {
          const o = others.sort((p, q) => Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, p.sprite.x, p.sprite.y) - Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, q.sprite.x, q.sprite.y))[0]!;
          const dx = o.sprite.x - a.sprite.x, dy = o.sprite.y - a.sprite.y;
          if (Math.abs(dx) > 12 || Math.abs(dy) > 12) this.face(a, Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up"));
        }
        const hop = this.tweens.add({ targets: a.sprite, y: a.sprite.y - 2, duration: 90, yoyo: true });
        await this.dialog.show(a.name, `portrait-${a.id}`, e.text, e.mood, e.ms);
        hop.stop();
        this.dialog.hide();
        return;
      }
      case "rescue": {
        const a = this.actors.get(e.who); if (!a) return;
        const b = this.add.image(a.sprite.x + 8, a.sprite.y - CHAR_H - 10, "emote-heart").setOrigin(0.5, 1).setDepth(990);
        floatText(this, a.sprite.x, a.sprite.y - CHAR_H - 10, "RESCUE!", PAL.green);
        await this.caption.show(`${a.name} saves ${e.what}`, e.ms);
        b.destroy(); return;
      }
      case "strike": return this.strike(e);
    }
  }

  private async strike(e: Extract<GameEvent, { type: "strike" }>) {
    const a = this.actors.get(e.who), t = this.actors.get(e.target);
    if (!a || !t) return;
    const dx = t.sprite.x - a.sprite.x, dy = t.sprite.y - a.sprite.y;
    this.face(a, Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up"));
    const ox = a.sprite.x, oy = a.sprite.y;
    const ranged = e.kind === "ranged" || e.kind === "control";
    // wind-up
    await new Promise<void>((r) => this.tweens.add({ targets: a.sprite, x: ox - Math.sign(dx) * 3, duration: 160, onComplete: () => r() }));
    if (ranged) {
      const proj = this.add.image(a.sprite.x, a.sprite.y - 12, e.kind === "control" ? "fx-web" : "px").setDepth(985);
      if (e.kind !== "control") proj.setDisplaySize(3, 3).setTint(0xf8d878);
      await new Promise<void>((r) => this.tweens.add({ targets: proj, x: t.sprite.x, y: t.sprite.y - 12, duration: 180, onComplete: () => { proj.destroy(); r(); } }));
    } else {
      const lx = t.sprite.x - Math.sign(dx || 1) * 10, ly = t.sprite.y - Math.sign(dy) * 4;
      await new Promise<void>((r) => this.tweens.add({ targets: a.sprite, x: lx, y: ly, duration: 140, ease: "Quad.easeIn", onComplete: () => r() }));
    }
    // impact
    const ix = t.sprite.x, iy = t.sprite.y - 12;
    if (e.outcome === "hit" || e.outcome === "blocked") {
      const spark = this.add.image(ix, iy, "fx-hit").setDepth(995).setScale(e.outcome === "hit" ? 1 : 0.6);
      this.tweens.add({ targets: spark, scale: 0, duration: 220, onComplete: () => spark.destroy() });
      if (e.outcome === "hit") {
        this.cameras.main.shake(140, Math.min(0.012, 0.003 + e.damage * 0.0006));
        t.sprite.setTintFill(0xffffff); this.time.delayedCall(70, () => t.sprite.clearTint());
        this.tweens.add({ targets: t.sprite, x: t.sprite.x + Math.sign(dx || 1) * 4, duration: 80, yoyo: true });
        floatText(this, ix, iy - 6, `${e.damage}`, PAL.yellow);
      } else {
        floatText(this, ix, iy - 6, "BLOCK", PAL.blue);
      }
    } else if (e.outcome === "miss") {
      this.tweens.add({ targets: t.sprite, x: t.sprite.x + Math.sign(dx || 1) * 6, duration: 90, yoyo: true });
      floatText(this, ix, iy - 6, "MISS", "#9a9ab0");
    } else {
      floatText(this, ix, iy - 6, "COUNTER!", PAL.red);
      this.cameras.main.shake(100, 0.004);
      a.sprite.setTintFill(0xffffff); this.time.delayedCall(70, () => a.sprite.clearTint());
    }
    t.hp = e.targetHp; t.maxHp = e.targetMaxHp;
    t.hpBar.set(t.hp, t.maxHp, this);
    a.hpBar.set(a.hp, a.maxHp, this);
    if (t.hp <= 0) { t.sprite.setAngle(90); t.sprite.setTint(0x9a9ab0); floatText(this, ix, iy - 14, "K.O.", PAL.red); }
    // recover
    await new Promise<void>((r) => this.tweens.add({ targets: a.sprite, x: ox, y: oy, duration: 200, ease: "Quad.easeOut", onComplete: () => r() }));
    a.label.setPosition(a.sprite.x, a.sprite.y - CHAR_H - 2); this.sortDepth(a);
    t.label.setPosition(t.sprite.x, t.sprite.y - CHAR_H - 2);
    const spent = 160 + 180 + 200;
    await this.wait(Math.max(0, e.ms - spent));
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

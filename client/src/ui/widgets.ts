/**
 * 16-bit UI: a bevelled dialogue window with nameplate and portrait, comic captions,
 * issue title cards, HP bars, floating combat text.
 */
import Phaser from "phaser";
import { PAL, type Palette } from "../render/pixels";

export const FONT = { fontFamily: '"Press Start 2P", monospace', fontSize: "8px", color: PAL.white, resolution: 1 };

/** SNES-style window: dark blue gradient, 1px light rim, 1px dark rim, cut corners, drop shadow. */
export function windowBox(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.5).fillRect(x + 2, y + 2, w, h);               // shadow
  g.fillStyle(0xe8e8f8, 1).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2); // light rim with cut corners
  g.fillStyle(0x303060, 1).fillRect(x + 2, y + 1, w - 4, h - 2).fillRect(x + 1, y + 2, w - 2, h - 4); // dark rim
  g.fillStyle(0x101838, 1).fillRect(x + 3, y + 3, w - 6, h - 6);         // body
  g.fillStyle(0x182050, 1).fillRect(x + 3, y + 3, w - 6, Math.floor((h - 6) / 2)); // top half lighter
  g.fillStyle(0x4a5a9a, 1).fillRect(x + 3, y + 3, w - 6, 1);              // inner highlight
  return g;
}

export class DialogBox {
  private root: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private name: Phaser.GameObjects.Text;
  private plate: Phaser.GameObjects.Graphics;
  private portrait: Phaser.GameObjects.Image;
  private cursor: Phaser.GameObjects.Text;
  private typer?: Phaser.Time.TimerEvent;
  constructor(private scene: Phaser.Scene, viewW: number, viewH: number) {
    const h = 64, w = viewW - 8, x = 4, y = viewH - h - 4;
    this.root = scene.add.container(0, 0).setDepth(1000).setVisible(false);
    this.root.add(windowBox(scene, x, y, w, h));
    // portrait frame
    this.root.add(windowBox(scene, x + 6, y + 6, 40, 40));
    this.portrait = scene.add.image(x + 10, y + 10, "px").setOrigin(0).setDisplaySize(32, 32);
    this.root.add(this.portrait);
    // nameplate tab above the box
    this.plate = scene.add.graphics();
    this.root.add(this.plate);
    this.name = scene.add.text(x + 56, y - 7, "", { ...FONT, color: PAL.yellow });
    this.text = scene.add.text(x + 52, y + 10, "", { ...FONT, wordWrap: { width: w - 60 }, lineSpacing: 3 });
    this.cursor = scene.add.text(x + w - 12, y + h - 12, "▼", { ...FONT, fontSize: "6px", color: PAL.yellow }).setVisible(false);
    scene.tweens.add({ targets: this.cursor, y: y + h - 10, duration: 400, yoyo: true, repeat: -1 });
    this.root.add([this.name, this.text, this.cursor]);
  }
  show(name: string, portraitKey: string, line: string, mood: string, ms: number): Promise<void> {
    this.typer?.remove();
    this.root.setVisible(true);
    this.cursor.setVisible(false);
    this.portrait.setTexture(portraitKey).setDisplaySize(32, 32);
    this.name.setText(name.toUpperCase());
    const px = this.name.x - 6, py = this.name.y - 4, pw = this.name.width + 12, ph = 14;
    this.plate.clear();
    this.plate.fillStyle(0x000000, 0.5).fillRect(px + 2, py + 2, pw, ph);
    this.plate.fillStyle(0xe8e8f8, 1).fillRect(px, py, pw, ph);
    this.plate.fillStyle(0x303060, 1).fillRect(px + 1, py + 1, pw - 2, ph - 2);
    this.plate.fillStyle(0x203070, 1).fillRect(px + 2, py + 2, pw - 4, ph - 4);
    const color = mood === "shout" ? "#ff6a4a" : mood === "whisper" ? "#9a9ab8" : mood === "worried" || mood === "sad" ? "#8ad0ff" : mood === "smug" || mood === "angry" ? "#ffb060" : PAL.white;
    this.text.setColor(color).setText("");
    const chars = [...line];
    const typeMs = Math.min(40, Math.max(14, (ms - 900) / chars.length));
    let i = 0;
    return new Promise((resolve) => {
      this.typer = this.scene.time.addEvent({
        delay: typeMs, repeat: chars.length - 1,
        callback: () => {
          i++;
          this.text.setText(chars.slice(0, i).join(""));
          if (mood === "shout" && i % 3 === 0) this.root.setPosition(Phaser.Math.Between(-1, 1), Phaser.Math.Between(-1, 1));
          if (i >= chars.length) { this.root.setPosition(0, 0); this.cursor.setVisible(true); }
        },
      });
      this.scene.time.delayedCall(ms, () => { this.root.setPosition(0, 0); resolve(); });
    });
  }
  hide() { this.root.setVisible(false); }
}

export class CaptionBox {
  private box?: Phaser.GameObjects.Container;
  constructor(private scene: Phaser.Scene, private viewW: number) {}
  show(text: string, ms: number): Promise<void> {
    this.hide();
    const t = this.scene.add.text(0, 0, text.toUpperCase(), { ...FONT, color: "#1a1208", wordWrap: { width: this.viewW - 40 } });
    const w = Math.min(this.viewW - 16, t.width + 14), h = t.height + 10;
    const x = 8, y = 8;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRect(x + 3, y + 3, w, h);
    g.fillStyle(0x1a1208, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0xffd860, 1).fillRect(x, y, w, h);
    g.fillStyle(0xfff0b0, 1).fillRect(x, y, w, 1).fillRect(x, y, 1, h);
    g.fillStyle(0xc8a030, 1).fillRect(x, y + h - 1, w, 1).fillRect(x + w - 1, y, 1, h);
    t.setPosition(x + 7, y + 5);
    this.box = this.scene.add.container(0, 0, [g, t]).setDepth(900).setAlpha(0);
    this.scene.tweens.add({ targets: this.box, alpha: 1, duration: 150 });
    return new Promise((r) => this.scene.time.delayedCall(ms, () => { this.hide(); r(); }));
  }
  hide() { this.box?.destroy(); this.box = undefined; }
}

export class TitleCard {
  constructor(private scene: Phaser.Scene, private viewW: number, private viewH: number) {}
  show(issue: number, title: string, subtitle: string | undefined, ms: number): Promise<void> {
    const s = this.scene;
    const bg = s.add.rectangle(0, 0, this.viewW, this.viewH, 0x000000).setOrigin(0).setDepth(2000);
    const band = s.add.rectangle(0, this.viewH / 2 - 34, this.viewW, 66, 0xe02828).setOrigin(0).setDepth(2001);
    const bandHi = s.add.rectangle(0, this.viewH / 2 - 34, this.viewW, 2, 0xffd860).setOrigin(0).setDepth(2001);
    const bandLo = s.add.rectangle(0, this.viewH / 2 + 30, this.viewW, 2, 0x7a1010).setOrigin(0).setDepth(2001);
    const small = s.add.text(this.viewW / 2, this.viewH / 2 - 26, `ISSUE #${issue}`, { ...FONT, color: PAL.yellow }).setOrigin(0.5, 0).setDepth(2002);
    const big = s.add.text(this.viewW / 2, this.viewH / 2 - 10, title.toUpperCase(), { ...FONT, fontSize: "12px", wordWrap: { width: this.viewW - 20 }, align: "center", stroke: "#4a0808", strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(2002);
    const sub = s.add.text(this.viewW / 2, this.viewH / 2 + 44, subtitle ?? "", { ...FONT, color: "#9a9ab8", wordWrap: { width: this.viewW - 30 }, align: "center", lineSpacing: 3 }).setOrigin(0.5, 0).setDepth(2002);
    const all = [bg, band, bandHi, bandLo, small, big, sub];
    all.forEach((o) => o.setAlpha(0));
    s.tweens.add({ targets: all, alpha: 1, duration: 300 });
    s.tweens.add({ targets: band, x: 0, duration: 400, ease: "Quad.easeOut" }).play();
    return new Promise((r) => s.time.delayedCall(ms - 400, () => {
      s.tweens.add({ targets: all, alpha: 0, duration: 400, onComplete: () => { all.forEach((o) => o.destroy()); r(); } });
    }));
  }
}

export class HpBar {
  root: Phaser.GameObjects.Container;
  private fill: Phaser.GameObjects.Rectangle;
  private stamina: Phaser.GameObjects.Rectangle;
  private injuries: Phaser.GameObjects.Text;
  private hideAt = 0;
  /** while true the bar never fades (during a fight) */
  pinned = false;
  constructor(scene: Phaser.Scene, x: number, y: number, name: string, pal: Palette, private alignRight: boolean) {
    const w = 80;
    this.root = scene.add.container(x, y).setDepth(950).setAlpha(0);
    const label = scene.add.text(alignRight ? w : 0, 0, name.toUpperCase(), { ...FONT, fontSize: "6px", stroke: PAL.black, strokeThickness: 2 }).setOrigin(alignRight ? 1 : 0, 0);
    const shadow = scene.add.rectangle(1, 10, w, 10, 0x000000, 0.6).setOrigin(0);
    const rim = scene.add.rectangle(0, 9, w, 10, 0xe8e8f8).setOrigin(0);
    const inner = scene.add.rectangle(1, 10, w - 2, 5, 0x202030).setOrigin(0);
    this.fill = scene.add.rectangle(1, 10, w - 2, 5, Phaser.Display.Color.HexStringToColor(pal.primary).color).setOrigin(0);
    const gloss = scene.add.rectangle(1, 10, w - 2, 1, 0xffffff, 0.35).setOrigin(0);
    const stInner = scene.add.rectangle(1, 16, w - 2, 2, 0x202030).setOrigin(0);
    this.stamina = scene.add.rectangle(1, 16, w - 2, 2, 0x48b8ff).setOrigin(0);
    this.injuries = scene.add.text(alignRight ? w : 0, 21, "", { ...FONT, fontSize: "6px", color: "#ff8a8a", stroke: PAL.black, strokeThickness: 2 }).setOrigin(alignRight ? 1 : 0, 0);
    this.root.add([label, shadow, rim, inner, this.fill, gloss, stInner, this.stamina, this.injuries]);
  }
  set(hp: number, max: number, scene: Phaser.Scene, stamina?: number, maxStamina?: number) {
    const ratio = Math.max(0, hp / max);
    scene.tweens.add({ targets: this.fill, width: Math.max(0, Math.round(78 * ratio)), duration: 300 });
    this.fill.setFillStyle(ratio > 0.5 ? 0x58d854 : ratio > 0.25 ? 0xffd860 : 0xe02828);
    if (stamina !== undefined && maxStamina) scene.tweens.add({ targets: this.stamina, width: Math.max(0, Math.round(78 * Math.max(0, stamina / maxStamina))), duration: 300 });
    this.show(scene);
  }
  setInjuries(names: string[]) { this.injuries.setText(names.slice(0, 2).join(" · ").toUpperCase()); }
  show(scene: Phaser.Scene) { this.root.setAlpha(1); this.hideAt = scene.time.now + 9000; }
  tick(scene: Phaser.Scene) { if (!this.pinned && this.root.alpha > 0 && scene.time.now > this.hideAt) scene.tweens.add({ targets: this.root, alpha: 0, duration: 600 }); }
}

/** Big centered banner: "FIGHT!", "ROUND 2", "K.O.". */
export function banner(scene: Phaser.Scene, viewW: number, viewH: number, text: string, color: string, ms: number, sub?: string): Promise<void> {
  const band = scene.add.rectangle(0, viewH / 2 - 16, viewW, 32, 0x000000, 0.55).setOrigin(0).setDepth(1500).setAlpha(0);
  const t = scene.add.text(viewW / 2, viewH / 2 - (sub ? 6 : 0), text, { ...FONT, fontSize: "14px", color, stroke: PAL.black, strokeThickness: 4 }).setOrigin(0.5).setDepth(1501).setScale(2).setAlpha(0);
  const s = sub ? scene.add.text(viewW / 2, viewH / 2 + 9, sub, { ...FONT, fontSize: "6px", color: "#d0d0e0", stroke: PAL.black, strokeThickness: 2 }).setOrigin(0.5).setDepth(1501).setAlpha(0) : null;
  scene.tweens.add({ targets: [band, t, s].filter(Boolean), alpha: 1, duration: 120 });
  scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: "Back.easeOut" });
  return new Promise((r) => scene.time.delayedCall(ms - 250, () => {
    scene.tweens.add({ targets: [band, t, s].filter(Boolean), alpha: 0, duration: 250, onComplete: () => { band.destroy(); t.destroy(); s?.destroy(); r(); } });
  }));
}

export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, big = false) {
  const t = scene.add.text(x, y, text, { ...FONT, fontSize: big ? "10px" : "8px", color, stroke: PAL.black, strokeThickness: 3 }).setOrigin(0.5).setDepth(980).setScale(big ? 1.4 : 1.2);
  scene.tweens.add({ targets: t, scale: 1, duration: 120 });
  scene.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 1000, delay: 200, ease: "Quad.easeOut", onComplete: () => t.destroy() });
}

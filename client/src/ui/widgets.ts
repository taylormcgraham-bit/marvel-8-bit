/**
 * NES-style UI: dialogue box with portrait and typewriter text, caption boxes,
 * title cards, HP bars, floating combat text, emote bubbles.
 */
import Phaser from "phaser";
import { PAL, type Palette } from "../render/pixels";

export const FONT = { fontFamily: '"Press Start 2P", monospace', fontSize: "8px", color: PAL.white, resolution: 1 };

export function nineBox(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = "#101020", border = PAL.white) {
  const g = scene.add.graphics();
  g.fillStyle(Phaser.Display.Color.HexStringToColor(border).color, 1).fillRect(x, y, w, h);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(fill).color, 1).fillRect(x + 2, y + 2, w - 4, h - 4);
  // inner bevel
  g.fillStyle(0x6c6c8c, 1).fillRect(x + 2, y + 2, w - 4, 1).fillRect(x + 2, y + 2, 1, h - 4);
  return g;
}

export class DialogBox {
  private root: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private name: Phaser.GameObjects.Text;
  private portrait: Phaser.GameObjects.Image;
  private typer?: Phaser.Time.TimerEvent;
  constructor(private scene: Phaser.Scene, viewW: number, viewH: number) {
    const h = 66, w = viewW - 8, x = 4, y = viewH - h - 4;
    this.root = scene.add.container(0, 0).setDepth(1000).setVisible(false);
    this.root.add(nineBox(scene, x, y, w, h));
    this.root.add(nineBox(scene, x + 6, y + 6, 28, 28, PAL.black, "#6c6c8c"));
    this.portrait = scene.add.image(x + 8, y + 8, "px").setOrigin(0).setDisplaySize(24, 24);
    this.root.add(this.portrait);
    this.name = scene.add.text(x + 40, y + 6, "", { ...FONT, color: PAL.yellow });
    this.text = scene.add.text(x + 40, y + 17, "", { ...FONT, wordWrap: { width: w - 50 }, lineSpacing: 2 });
    this.root.add([this.name, this.text]);
  }
  show(name: string, portraitKey: string, line: string, mood: string, ms: number): Promise<void> {
    this.typer?.remove();
    this.root.setVisible(true);
    this.portrait.setTexture(portraitKey).setDisplaySize(24, 24);
    this.name.setText(name.toUpperCase());
    const color = mood === "shout" ? PAL.red : mood === "whisper" ? "#9a9ab0" : mood === "quip" ? PAL.white : mood === "worried" || mood === "sad" ? PAL.blue : mood === "smug" || mood === "angry" ? "#f0a060" : PAL.white;
    this.text.setColor(color).setText("");
    const chars = [...line];
    const typeMs = Math.min(40, Math.max(12, (ms - 900) / chars.length));
    let i = 0;
    return new Promise((resolve) => {
      this.typer = this.scene.time.addEvent({
        delay: typeMs, repeat: chars.length - 1,
        callback: () => {
          i++;
          this.text.setText(chars.slice(0, i).join(""));
          if (mood === "shout" && i % 3 === 0) this.root.setPosition(Phaser.Math.Between(-1, 1), Phaser.Math.Between(-1, 1));
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
    const t = this.scene.add.text(0, 0, text.toUpperCase(), { ...FONT, color: PAL.black, wordWrap: { width: this.viewW - 40 } });
    const w = Math.min(this.viewW - 16, t.width + 12), h = t.height + 10;
    const x = 8, y = 8;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 1).fillRect(x + 2, y + 2, w, h);
    g.fillStyle(0xf8d878, 1).fillRect(x, y, w, h);
    t.setPosition(x + 6, y + 5);
    this.box = this.scene.add.container(0, 0, [g, t]).setDepth(900);
    return new Promise((r) => this.scene.time.delayedCall(ms, () => { this.hide(); r(); }));
  }
  hide() { this.box?.destroy(); this.box = undefined; }
}

export class TitleCard {
  constructor(private scene: Phaser.Scene, private viewW: number, private viewH: number) {}
  show(issue: number, title: string, subtitle: string | undefined, ms: number): Promise<void> {
    const s = this.scene;
    const bg = s.add.rectangle(0, 0, this.viewW, this.viewH, 0x000000).setOrigin(0).setDepth(2000);
    const band = s.add.rectangle(0, this.viewH / 2 - 30, this.viewW, 60, 0xd82800).setOrigin(0).setDepth(2001);
    const small = s.add.text(this.viewW / 2, this.viewH / 2 - 22, `ISSUE #${issue}`, { ...FONT, color: PAL.yellow }).setOrigin(0.5, 0).setDepth(2002);
    const big = s.add.text(this.viewW / 2, this.viewH / 2 - 6, title.toUpperCase(), { ...FONT, fontSize: "12px", wordWrap: { width: this.viewW - 20 }, align: "center" }).setOrigin(0.5, 0).setDepth(2002);
    const sub = s.add.text(this.viewW / 2, this.viewH / 2 + 42, subtitle ?? "", { ...FONT, color: "#9a9ab0", wordWrap: { width: this.viewW - 30 }, align: "center" }).setOrigin(0.5, 0).setDepth(2002);
    const all = [bg, band, small, big, sub];
    all.forEach((o) => o.setAlpha(0));
    s.tweens.add({ targets: all, alpha: 1, duration: 300 });
    return new Promise((r) => s.time.delayedCall(ms - 400, () => {
      s.tweens.add({ targets: all, alpha: 0, duration: 400, onComplete: () => { all.forEach((o) => o.destroy()); r(); } });
    }));
  }
}

export class HpBar {
  root: Phaser.GameObjects.Container;
  private fill: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private hideAt = 0;
  constructor(scene: Phaser.Scene, x: number, y: number, private name: string, pal: Palette, alignRight: boolean) {
    const w = 72;
    this.root = scene.add.container(x, y).setDepth(950).setAlpha(0);
    const bg = scene.add.rectangle(0, 10, w, 6, 0x000000).setOrigin(0);
    const inner = scene.add.rectangle(1, 11, w - 2, 4, 0x303040).setOrigin(0);
    this.fill = scene.add.rectangle(1, 11, w - 2, 4, Phaser.Display.Color.HexStringToColor(pal.primary).color).setOrigin(0);
    this.label = scene.add.text(alignRight ? w : 0, 0, name.toUpperCase(), FONT).setOrigin(alignRight ? 1 : 0, 0);
    this.root.add([bg, inner, this.fill, this.label]);
  }
  set(hp: number, max: number, scene: Phaser.Scene) {
    const ratio = Math.max(0, hp / max);
    scene.tweens.add({ targets: this.fill, width: Math.max(0, Math.round(70 * ratio)), duration: 300 });
    this.fill.setFillStyle(ratio > 0.5 ? 0x58d854 : ratio > 0.25 ? 0xf8d878 : 0xd82800);
    this.root.setAlpha(1);
    this.hideAt = scene.time.now + 9000;
  }
  tick(scene: Phaser.Scene) { if (this.root.alpha > 0 && scene.time.now > this.hideAt) scene.tweens.add({ targets: this.root, alpha: 0, duration: 600 }); }
}

export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string) {
  const t = scene.add.text(x, y, text, { ...FONT, color, stroke: PAL.black, strokeThickness: 2 }).setOrigin(0.5).setDepth(980);
  scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => t.destroy() });
}

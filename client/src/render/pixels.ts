/**
 * Procedural 16-bit art. Everything is generated at boot from palettes so the prototype
 * needs zero asset files; hand-drawn sheets replace texture keys one for one (docs/ART.md).
 */
import Phaser from "phaser";
import type { Tile } from "@shared/maps";
import { Buf, outline, shade, tone, mix } from "./buf";
import { drawFigure, drawPortrait, FRAME_W, FRAME_H, DEFAULT_LOOK, type Look, type Palette, type Facing, type Pose } from "./figure";

export const TILE = 16;
export const CHAR_W = FRAME_W;
export const CHAR_H = FRAME_H;
export type { Look, Palette };

export const PAL = {
  night0: "#07071a", night1: "#0e0e2c", night2: "#161640", night3: "#20204f", star: "#f8f8ff", starDim: "#7878a8",
  roof: "#3a3a44", roofLight: "#4a4a56", roofDark: "#2c2c34", gravel: "#5c5c68", gravelLight: "#6e6e7a",
  brick: "#8a4a2a", brickDark: "#5e3018", brickLight: "#b06038", mortar: "#4a2818", brickTop: "#c88060",
  metal: "#6c6c80", metalDark: "#3c3c4c", metalLight: "#a0a0b8", rust: "#8a4a20", rustDark: "#5a2e10",
  glass: "#1e4a9a", glassLight: "#4a8ae0", glassHi: "#9ad0ff", frame: "#262636",
  door: "#4a3020", doorDark: "#2a1a10", knob: "#e0b848",
  windowLit: "#ffd880", windowDim: "#8a6a30", building: "#0c0c24", buildingLight: "#181838", buildingFar: "#121234",
  black: "#000000", white: "#fcfcfc", yellow: "#ffd860", red: "#e02828", green: "#58d854", blue: "#48b8ff",
};

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177; h >>>= 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Texture keys preloaded from hand-drawn art; the procedural generators skip these. */
let KEEP = new Set<string>();
function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}
const skip = (key: string) => KEEP.has(key);
function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/* ------------------------------------------------------------------ tiles */

function gravel(ctx: CanvasRenderingContext2D, seed: number) {
  px(ctx, 0, 0, PAL.roof, TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = hash(x, y, seed);
    if (r > 0.94) { px(ctx, x, y, PAL.gravelLight); px(ctx, x + 1, y + 1, PAL.roofDark); }
    else if (r > 0.86) px(ctx, x, y, PAL.gravel);
    else if (r < 0.05) px(ctx, x, y, PAL.roofDark);
    else if (r < 0.12) px(ctx, x, y, PAL.roofLight);
  }
}

export function makeTiles(scene: Phaser.Scene, keep: Set<string> = new Set()) {
  KEEP = keep;
  const kinds: Tile[] = ["roof", "ledge", "void", "door", "tower-base", "ac", "skylight", "vent", "stair"];
  for (const k of kinds) {
    if (skip(`tile-${k}`)) continue;
    const { tex, ctx } = canvas(scene, `tile-${k}`, TILE, TILE);
    switch (k) {
      case "roof": gravel(ctx, 1); break;
      case "void": px(ctx, 0, 0, PAL.night0, TILE, TILE); break;
      case "ledge": {
        px(ctx, 0, 0, PAL.brick, TILE, TILE);
        for (let row = 0; row < 4; row++) {
          const y = row * 4, off = row % 2 ? 4 : 0;
          px(ctx, 0, y + 3, PAL.mortar, TILE, 1);
          for (let x = off; x < TILE; x += 8) px(ctx, x, y, PAL.mortar, 1, 3);
          for (let x = 0; x < TILE; x += 8) { px(ctx, (x + off + 1) % TILE, y, PAL.brickLight, 3, 1); px(ctx, (x + off + 5) % TILE, y + 2, PAL.brickDark, 2, 1); }
        }
        px(ctx, 0, 0, PAL.brickTop, TILE, 1);
        break;
      }
      case "door": gravel(ctx, 2); break; // the bulkhead object is drawn over door tiles
      case "tower-base": {
        gravel(ctx, 5);
        for (let y = 2; y < TILE; y += 7) px(ctx, 0, y, PAL.metalDark, TILE, 2);
        break;
      }
      case "ac": {
        gravel(ctx, 3);
        px(ctx, 1, 2, PAL.black, 15, 14); // shadow
        px(ctx, 0, 0, PAL.metalDark, 15, 15);
        px(ctx, 1, 1, PAL.metal, 13, 4);   // top face
        px(ctx, 1, 1, PAL.metalLight, 13, 1);
        px(ctx, 1, 5, tone(PAL.metal, -0.25), 13, 9);  // front face
        for (let y = 6; y < 13; y += 2) px(ctx, 3, y, PAL.metalDark, 9, 1);
        px(ctx, 12, 2, PAL.metalDark, 1, 2);
        break;
      }
      case "skylight": {
        px(ctx, 0, 0, PAL.frame, TILE, TILE);
        px(ctx, 1, 1, PAL.glass, 14, 14);
        px(ctx, 7, 1, PAL.frame, 2, 14); px(ctx, 1, 7, PAL.frame, 14, 2);
        for (let i = 0; i < 6; i++) { px(ctx, 2 + i, 2 + (5 - i), PAL.glassLight); px(ctx, 10 + i, 10 + (5 - i), PAL.glassLight); }
        px(ctx, 2, 2, PAL.glassHi, 2, 1); px(ctx, 10, 10, PAL.glassHi, 2, 1);
        px(ctx, 12, 2, PAL.glassHi); px(ctx, 13, 3, PAL.glassHi); px(ctx, 13, 4, PAL.white); px(ctx, 12, 5, PAL.glassHi);
        px(ctx, 0, 0, tone(PAL.frame, 0.3), TILE, 1); px(ctx, 0, 0, tone(PAL.frame, 0.3), 1, TILE);
        break;
      }
      case "vent": {
        gravel(ctx, 4);
        px(ctx, 7, 6, PAL.black, 7, 10); // shadow
        px(ctx, 5, 3, PAL.metalDark, 6, 12);
        px(ctx, 6, 4, PAL.metal, 3, 10);
        px(ctx, 6, 4, PAL.metalLight, 1, 10);
        px(ctx, 3, 1, PAL.metalLight, 10, 3); px(ctx, 3, 3, PAL.metalDark, 10, 1);
        px(ctx, 5, 0, PAL.metal, 6, 1);
        break;
      }
      case "stair": {
        px(ctx, 0, 0, PAL.brick, TILE, TILE);
        px(ctx, 4, 0, PAL.metalLight, 2, 16); px(ctx, 10, 0, PAL.metalLight, 2, 16);
        px(ctx, 5, 0, PAL.metalDark, 1, 16); px(ctx, 11, 0, PAL.metalDark, 1, 16);
        for (let y = 2; y < 16; y += 4) { px(ctx, 6, y, PAL.metal, 4, 1); px(ctx, 6, y + 1, PAL.metalDark, 4, 1); }
        break;
      }
    }
    tex.refresh();
  }
  // a soft shadow strip for the inner edge of parapets (ambient occlusion)
  const s = canvas(scene, "ao-strip", TILE, 6);
  for (let y = 0; y < 6; y++) px(s.ctx, 0, y, `rgba(0,0,0,${(0.42 * (6 - y)) / 6})`, TILE, 1);
  s.tex.refresh();
}

/* ------------------------------------------------------------------ objects */

export function makeObjects(scene: Phaser.Scene, keep: Set<string> = new Set()) {
  KEEP = keep;
  // water tower 52x64 with legs, tank, conical roof, ladder, highlight
  if (!skip("water-tower")) {
    const { tex, ctx } = canvas(scene, "water-tower", 52, 64);
    const b = new Buf(52, 64);
    for (const lx of [8, 20, 32, 42]) b.rect(lx, 36, 2, 28, PAL.metalDark);
    b.rect(8, 48, 36, 1, PAL.metalDark); b.rect(12, 58, 28, 1, PAL.metalDark);
    for (let i = 0; i < 10; i++) { b.set(10 + i, 48 + i, PAL.metalDark); b.set(40 - i, 48 + i, PAL.metalDark); }
    b.rect(6, 14, 40, 24, PAL.rust);
    for (let y = 16; y < 38; y += 5) b.rect(6, y, 40, 1, PAL.rustDark);
    b.rect(6, 14, 40, 1, PAL.metalDark); b.rect(6, 37, 40, 1, PAL.metalDark);
    b.rect(10, 15, 3, 22, tone(PAL.rust, 0.25));
    b.rect(40, 15, 4, 22, tone(PAL.rust, -0.3));
    for (let r = 0; r < 10; r++) b.rect(4 + r * 2.2, 13 - r, 44 - r * 4.4, 1, r % 2 ? PAL.metal : PAL.metalDark);
    b.rect(25, 1, 2, 3, PAL.metalLight);
    b.rect(44, 14, 2, 46, PAL.metalLight); for (let y = 16; y < 60; y += 4) b.rect(42, y, 6, 1, PAL.metal);
    outline(b); shade(b, undefined, 0.15, 0.2);
    b.draw(ctx); tex.refresh();
  }
  // stairwell bulkhead 36x30: a boxy hut with a door on its front face
  if (!skip("bulkhead")) {
    const { tex, ctx } = canvas(scene, "bulkhead", 36, 30);
    const b = new Buf(36, 30);
    b.rect(2, 2, 32, 8, PAL.brickLight);        // roof slab
    b.rect(2, 10, 32, 18, PAL.brick);           // front face
    for (let row = 0; row < 4; row++) { const y = 11 + row * 4, off = row % 2 ? 4 : 0; b.rect(2, y + 3, 32, 1, PAL.mortar); for (let x = 2 + off; x < 34; x += 8) b.rect(x, y, 1, 3, PAL.mortar); }
    b.rect(12, 13, 12, 15, PAL.doorDark);        // door frame
    b.rect(13, 14, 10, 14, PAL.door);
    b.rect(14, 15, 3, 4, PAL.doorDark); b.rect(19, 15, 3, 4, PAL.doorDark); b.rect(14, 21, 3, 5, PAL.doorDark); b.rect(19, 21, 3, 5, PAL.doorDark);
    b.set(21, 21, PAL.knob);
    b.rect(26, 4, 6, 3, PAL.metalDark); b.rect(27, 1, 4, 3, PAL.metal); // vent cap on roof
    b.rect(16, 8, 4, 2, PAL.yellow); // lamp over door
    outline(b); shade(b, undefined, 0.18, 0.22);
    b.draw(ctx); tex.refresh();
  }
  // shadows (soft ellipses)
  {
    const { tex, ctx } = canvas(scene, "shadow-blob", 24, 10);
    const g = ctx.createRadialGradient(12, 5, 1, 12, 5, 11);
    g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 24, 10); tex.refresh();
  }
  // light pools
  {
    const { tex, ctx } = canvas(scene, "light-warm", 96, 96);
    const g = ctx.createRadialGradient(48, 48, 2, 48, 48, 48);
    g.addColorStop(0, "rgba(255,200,110,0.55)"); g.addColorStop(0.5, "rgba(255,170,80,0.18)"); g.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96); tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, "light-cool", 96, 96);
    const g = ctx.createRadialGradient(48, 48, 2, 48, 48, 48);
    g.addColorStop(0, "rgba(120,190,255,0.45)"); g.addColorStop(0.6, "rgba(90,150,255,0.12)"); g.addColorStop(1, "rgba(60,120,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96); tex.refresh();
  }
  // scanlines overlay (320x240, every other row)
  {
    const { tex, ctx } = canvas(scene, "scanlines", 320, 240);
    for (let y = 0; y < 240; y += 2) px(ctx, 0, y, "rgba(0,0,0,0.16)", 320, 1);
    tex.refresh();
  }
}

/* ------------------------------------------------------------------ sky */

export function makeSky(scene: Phaser.Scene, w: number) {
  const h = 48;
  // gradient sky with stars
  {
    const { tex, ctx } = canvas(scene, "sky", w, h);
    const bands = [PAL.night0, PAL.night0, PAL.night1, PAL.night1, PAL.night2, PAL.night3];
    bands.forEach((c, i) => px(ctx, 0, i * 8, c, w, 8));
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(hash(i, 1, 7) * w), y = Math.floor(hash(i, 2, 7) * 30);
      px(ctx, x, y, hash(i, 3, 7) > 0.75 ? PAL.star : PAL.starDim);
      if (hash(i, 4, 7) > 0.9) { px(ctx, x - 1, y, PAL.starDim); px(ctx, x + 1, y, PAL.starDim); px(ctx, x, y - 1, PAL.starDim); px(ctx, x, y + 1, PAL.starDim); }
    }
    // moon with glow
    const mg = ctx.createRadialGradient(44, 10, 2, 44, 10, 16);
    mg.addColorStop(0, "rgba(200,210,255,0.35)"); mg.addColorStop(1, "rgba(200,210,255,0)");
    ctx.fillStyle = mg; ctx.fillRect(26, -6, 36, 36);
    px(ctx, 41, 6, PAL.white, 6, 8); px(ctx, 40, 7, PAL.white, 8, 6); px(ctx, 42, 5, PAL.white, 4, 10);
    px(ctx, 44, 8, "#c8ccf0", 2, 2); px(ctx, 42, 11, "#c8ccf0", 1, 1);
    tex.refresh();
  }
  // far skyline: dim silhouettes
  {
    const { tex, ctx } = canvas(scene, "skyline-far", w, h);
    let x = 0, i = 0;
    while (x < w) {
      const bw = 8 + Math.floor(hash(i, 4, 9) * 14), bh = 6 + Math.floor(hash(i, 5, 9) * 16);
      px(ctx, x, h - bh, PAL.buildingFar, bw, bh);
      if (hash(i, 6, 9) > 0.7) px(ctx, x + Math.floor(bw / 2), h - bh - 3, PAL.buildingFar, 1, 3);
      x += bw + 1; i++;
    }
    tex.refresh();
  }
  // near skyline: buildings with lit windows, water towers, the spire
  {
    const { tex, ctx } = canvas(scene, "skyline-near", w, h);
    let x = 0, i = 0;
    while (x < w) {
      const bw = 12 + Math.floor(hash(i, 4, 7) * 20), bh = 10 + Math.floor(hash(i, 5, 7) * 24);
      const col = hash(i, 6, 7) > 0.5 ? PAL.building : PAL.buildingLight;
      px(ctx, x, h - bh, col, bw, bh);
      px(ctx, x, h - bh, tone(col, 0.35), bw, 1);
      px(ctx, x, h - bh, tone(col, 0.2), 1, bh);
      for (let wy = h - bh + 2; wy < h - 1; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) {
        const r = hash(wx, wy, 11);
        if (r > 0.55) px(ctx, wx, wy, r > 0.88 ? PAL.windowLit : PAL.windowDim, 2, 1);
      }
      if (hash(i, 8, 7) > 0.6) { px(ctx, x + 3, h - bh - 5, PAL.rustDark, 5, 5); px(ctx, x + 2, h - bh - 6, PAL.metalDark, 7, 1); }
      x += bw + 1; i++;
    }
    const sx = w - 60;
    px(ctx, sx, 14, PAL.buildingLight, 14, 34); px(ctx, sx + 3, 8, PAL.buildingLight, 8, 8); px(ctx, sx + 6, 0, PAL.metalLight, 2, 9);
    px(ctx, sx, 14, tone(PAL.buildingLight, 0.35), 1, 34);
    for (let wy = 16; wy < 46; wy += 3) for (let wx = sx + 1; wx < sx + 13; wx += 3) if (hash(wx, wy, 13) > 0.35) px(ctx, wx, wy, PAL.windowLit, 2, 1);
    tex.refresh();
  }
  // window twinkle overlay: a sparse set of lit windows to blink
  {
    const { tex, ctx } = canvas(scene, "skyline-blink", w, h);
    for (let i = 0; i < 40; i++) { const x = Math.floor(hash(i, 21, 3) * w), y = 22 + Math.floor(hash(i, 22, 3) * 24); px(ctx, x, y, PAL.windowLit, 2, 1); }
    tex.refresh();
  }
  // clouds
  {
    const { tex, ctx } = canvas(scene, "cloud", 64, 14);
    const c = "rgba(120,130,190,0.22)";
    px(ctx, 8, 6, c, 48, 6); px(ctx, 16, 2, c, 20, 5); px(ctx, 36, 4, c, 16, 4); px(ctx, 2, 8, c, 60, 3);
    tex.refresh();
  }
}

/* ------------------------------------------------------------------ characters */

export interface FrameSpec { pose: Pose; facing: Facing; step: number }
/** Frame order on every sheet (procedural or hand-drawn). docs/ART.md documents it. */
export const FRAMES: FrameSpec[] = [
  { pose: "idle", facing: "down", step: 0 }, { pose: "idle", facing: "down", step: 1 },
  { pose: "idle", facing: "up", step: 0 },   { pose: "idle", facing: "up", step: 1 },
  { pose: "idle", facing: "side", step: 0 }, { pose: "idle", facing: "side", step: 1 },
  { pose: "walk", facing: "down", step: 0 }, { pose: "walk", facing: "down", step: 1 }, { pose: "walk", facing: "down", step: 2 },
  { pose: "walk", facing: "up", step: 0 },   { pose: "walk", facing: "up", step: 1 },   { pose: "walk", facing: "up", step: 2 },
  { pose: "walk", facing: "side", step: 0 }, { pose: "walk", facing: "side", step: 1 }, { pose: "walk", facing: "side", step: 2 },
  { pose: "attack", facing: "side", step: 0 },
  { pose: "attack", facing: "down", step: 0 },
  { pose: "hurt", facing: "down", step: 0 },
  { pose: "hurt", facing: "side", step: 0 },
  { pose: "ko", facing: "side", step: 0 },
];
export const FRAME_INDEX = (pose: Pose, facing: Facing, step = 0) =>
  Math.max(0, FRAMES.findIndex((f) => f.pose === pose && f.facing === facing && f.step === step));

/** Draw the procedural sheet unless a hand-drawn one was preloaded under the same key, then register animations. */
export function makeCharacter(scene: Phaser.Scene, key: string, pal: Palette, look: Partial<Look> | undefined) {
  if (!scene.textures.exists(key)) {
    const L: Look = { ...DEFAULT_LOOK, ...(look ?? {}) };
    const { tex, ctx } = canvas(scene, key, FRAME_W * FRAMES.length, FRAME_H);
    FRAMES.forEach((f, i) => drawFigure(L, pal, f.facing, f.pose, f.step).draw(ctx, i * FRAME_W, 0));
    tex.refresh();
    FRAMES.forEach((_, i) => tex.add(i, 0, i * FRAME_W, 0, FRAME_W, FRAME_H));
  }
  const anim = (name: string, frames: number[], frameRate: number, repeat = -1, yoyo = false) => {
    const k = `${key}-${name}`;
    if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: frames.map((frame) => ({ key, frame })), frameRate, repeat, yoyo });
  };
  anim("idle-down", [0, 1], 1.4); anim("idle-up", [2, 3], 1.4); anim("idle-side", [4, 5], 1.4);
  anim("walk-down", [6, 7, 8, 7], 8); anim("walk-up", [9, 10, 11, 10], 8); anim("walk-side", [12, 13, 14, 13], 8);
}

export function makePortrait(scene: Phaser.Scene, key: string, pal: Palette, look: Partial<Look> | undefined) {
  if (scene.textures.exists(key)) return;
  const { tex, ctx } = canvas(scene, key, 32, 32);
  px(ctx, 0, 0, "#0c0c1c", 32, 32);
  drawPortrait({ ...DEFAULT_LOOK, ...(look ?? {}) }, pal).draw(ctx);
  tex.refresh();
}

/* ------------------------------------------------------------------ emotes & fx */

export function makeEmotes(scene: Phaser.Scene) {
  const list = ["!", "?", "...", "heart", "anger", "sweat", "music", "zzz"] as const;
  for (const e of list) {
    const { tex, ctx } = canvas(scene, `emote-${e}`, 12, 12);
    const b = new Buf(12, 12);
    b.rect(1, 0, 10, 9, PAL.white); b.rect(0, 1, 12, 7, PAL.white); b.rect(5, 9, 2, 2, PAL.white);
    const ink = "#20202c";
    switch (e) {
      case "!": b.rect(5, 1, 2, 5, ink); b.rect(5, 7, 2, 1, ink); break;
      case "?": b.rect(4, 1, 4, 1, ink); b.rect(7, 2, 1, 2, ink); b.rect(5, 4, 2, 1, ink); b.rect(5, 5, 1, 1, ink); b.rect(5, 7, 1, 1, ink); break;
      case "...": b.rect(3, 5, 1, 1, ink); b.rect(5, 5, 1, 1, ink); b.rect(7, 5, 1, 1, ink); break;
      case "heart": b.rect(3, 2, 2, 2, PAL.red); b.rect(7, 2, 2, 2, PAL.red); b.rect(3, 3, 6, 2, PAL.red); b.rect(4, 5, 4, 1, PAL.red); b.rect(5, 6, 2, 1, PAL.red); break;
      case "anger": b.rect(3, 2, 2, 2, PAL.red); b.rect(7, 2, 2, 2, PAL.red); b.rect(3, 5, 2, 2, PAL.red); b.rect(7, 5, 2, 2, PAL.red); b.rect(5, 4, 2, 2, PAL.red); break;
      case "sweat": b.rect(5, 1, 2, 2, PAL.blue); b.rect(4, 3, 4, 3, PAL.blue); b.rect(5, 6, 2, 1, PAL.blue); break;
      case "music": b.rect(4, 1, 1, 5, ink); b.rect(4, 1, 4, 1, ink); b.rect(7, 1, 1, 4, ink); b.rect(3, 5, 2, 2, ink); b.rect(6, 4, 2, 2, ink); break;
      case "zzz": b.rect(3, 1, 3, 1, ink); b.rect(4, 2, 1, 1, ink); b.rect(3, 3, 3, 1, ink); b.rect(6, 4, 3, 1, ink); b.rect(7, 5, 1, 1, ink); b.rect(6, 6, 3, 1, ink); break;
    }
    outline(b, "#20202c");
    b.draw(ctx); tex.refresh();
  }
}

export function makeFx(scene: Phaser.Scene) {
  {
    const { tex, ctx } = canvas(scene, "fx-hit", 16, 16);
    const b = new Buf(16, 16);
    b.rect(7, 0, 2, 16, PAL.yellow); b.rect(0, 7, 16, 2, PAL.yellow);
    for (let i = 0; i < 4; i++) { b.set(3 + i, 3 + i, PAL.yellow); b.set(12 - i, 3 + i, PAL.yellow); b.set(3 + i, 12 - i, PAL.yellow); b.set(12 - i, 12 - i, PAL.yellow); }
    b.rect(5, 5, 6, 6, PAL.white); b.rect(6, 6, 4, 4, "#fff4c0");
    outline(b, "#7a4a10");
    b.draw(ctx); tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, "fx-web", 10, 10);
    const c = PAL.white;
    px(ctx, 0, 4, c, 10, 2); px(ctx, 4, 0, c, 2, 10); for (let i = 0; i < 10; i++) { px(ctx, i, i, c); px(ctx, 9 - i, i, c); }
    px(ctx, 3, 3, "#c8c8e0", 4, 4); px(ctx, 4, 4, c, 2, 2);
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, "fx-bolt", 8, 4);
    px(ctx, 0, 1, PAL.yellow, 8, 2); px(ctx, 2, 0, PAL.white, 4, 4); px(ctx, 6, 1, "#ff8a28", 2, 2);
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, "fx-dust", 6, 6);
    px(ctx, 1, 1, "#8a8a9a", 4, 4); px(ctx, 0, 2, "#8a8a9a", 6, 2); px(ctx, 2, 0, "#8a8a9a", 2, 6); px(ctx, 2, 2, "#b8b8c8", 2, 2);
    tex.refresh();
  }
  const p = canvas(scene, "px", 1, 1); px(p.ctx, 0, 0, PAL.white); p.tex.refresh();
}

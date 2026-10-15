/**
 * Procedural 16-bit art. Everything is generated at boot from palettes so the prototype
 * needs zero asset files; hand-drawn sheets replace texture keys one for one (docs/ART.md).
 */
import Phaser from "phaser";
import type { Tile } from "@shared/maps";
import { Buf, outline, shade, grain, tone } from "./buf";
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

/* ------------------------------------------------------------------ tiles (block textures) */

/** Minecraft-style bricks: 4 courses of 4px bricks with cream mortar, alternating offsets. */
function bricks(b: Buf, w: number, h: number, brick: string, mortar: string, seed = 1) {
  b.rect(0, 0, w, h, brick);
  for (let row = 0; row * 4 < h; row++) {
    const y = row * 4, off = row % 2 ? 4 : 0;
    b.rect(0, y + 3, w, 1, mortar);
    for (let x = off; x < w + 8; x += 8) b.rect(x % (w + 8) - (x >= w ? w + 8 : 0), y, 1, 3, mortar);
    for (let x = -8 + off; x < w; x += 8) { b.rect(x + 1, y, 1, 3, tone(brick, 0.12)); b.rect(x + 1, y, 7, 1, tone(brick, 0.08)); b.rect(x + 1, y + 2, 7, 1, tone(brick, -0.12)); }
  }
  grain(b, 0.05, seed);
}

/** Minecraft gravel: mottled 2x2 blobs in four greys. */
function gravelBlock(b: Buf, seed: number) {
  const tones = ["#6a6a70", "#78787e", "#86868c", "#5c5c62", "#929298"];
  b.rect(0, 0, b.w, b.h, tones[0]!);
  for (let y = 0; y < b.h; y += 2) for (let x = 0; x < b.w; x += 2) {
    const r = hash(x, y, seed);
    const c = tones[Math.floor(r * tones.length)]!;
    b.rect(x, y, 2, 2, c);
    if (r > 0.8) b.rect(x, y, 1, 1, tone(c, 0.15));
    if (r < 0.2) b.rect(x + 1, y + 1, 1, 1, tone(c, -0.15));
  }
}

/** Minecraft cobblestone: rounded stones with dark seams. */
function cobble(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#4e4e56");
  const stones = [[0, 0, 5, 4], [6, 0, 4, 3], [11, 0, 5, 5], [0, 5, 4, 5], [5, 4, 6, 5], [12, 6, 4, 4], [0, 11, 6, 5], [7, 10, 4, 6], [12, 11, 4, 5]];
  stones.forEach(([x, y, w, h], i) => {
    const c = tone("#7e7e88", (hash(i, 1, seed) - 0.5) * 0.3);
    b.rect(x!, y!, w! - 1, h! - 1, c);
    b.rect(x!, y!, w! - 1, 1, tone(c, 0.18)); b.rect(x!, y!, 1, h! - 1, tone(c, 0.1));
    b.rect(x!, y! + h! - 2, w! - 1, 1, tone(c, -0.2));
  });
  grain(b, 0.05, seed);
}

/** Oak planks: 4 horizontal planks with end joints. */
function planks(b: Buf, w: number, h: number, base = "#a8763e", seed = 1) {
  b.rect(0, 0, w, h, base);
  for (let row = 0; row * 4 < h; row++) {
    const y = row * 4;
    b.rect(0, y, w, 1, tone(base, 0.14)); b.rect(0, y + 3, w, 1, tone(base, -0.3));
    const joint = (row * 5 + 3) % w; b.rect(joint, y, 1, 3, tone(base, -0.3));
  }
  grain(b, 0.05, seed);
}

/** Iron block: light top face, mid front face. */
function ironBlock(b: Buf, topH: number) {
  b.rect(0, 0, b.w, topH, "#d4d4dc"); b.rect(0, 0, b.w, 1, "#ececf2"); b.rect(0, topH - 1, b.w, 1, "#b4b4bc");
  b.rect(0, topH, b.w, b.h - topH, "#a8a8b2"); b.rect(0, b.h - 1, b.w, 1, "#7c7c86"); b.rect(0, topH, 1, b.h - topH, "#bcbcc6"); b.rect(b.w - 1, topH, 1, b.h - topH, "#8c8c96");
  grain(b, 0.04, 9);
}

const BRICK = "#9a5646", MORTAR = "#b8a890";

export function makeTiles(scene: Phaser.Scene, keep: Set<string> = new Set()) {
  KEEP = keep;
  const kinds: Tile[] = ["roof", "ledge", "void", "door", "tower-base", "ac", "skylight", "vent", "stair"];
  for (const k of kinds) {
    if (skip(`tile-${k}`)) continue;
    const { tex, ctx } = canvas(scene, `tile-${k}`, TILE, TILE);
    const b = new Buf(TILE, TILE);
    switch (k) {
      case "roof": gravelBlock(b, 1); break;
      case "void": b.rect(0, 0, TILE, TILE, PAL.night0); break;
      case "ledge": bricks(b, TILE, TILE, BRICK, MORTAR, 2); b.rect(0, 0, TILE, 1, tone(MORTAR, 0.2)); break;
      case "door": gravelBlock(b, 2); break;
      case "tower-base": cobble(b, 3); break;
      case "ac": {
        gravelBlock(b, 3);
        const box = new Buf(15, 15); ironBlock(box, 5);
        for (let y = 7; y < 13; y += 2) box.rect(2, y, 11, 1, "#6c6c76");
        box.rect(12, 1, 2, 2, "#8c8c96");
        b.blit(box, 0, 0);
        b.rect(1, 15, 15, 1, "#3a3a42"); // contact shadow
        break;
      }
      case "skylight": {
        const g = "#7cc0f0";
        b.rect(0, 0, TILE, TILE, g);
        b.rect(0, 0, TILE, 1, "#eaf6ff"); b.rect(0, 0, 1, TILE, "#eaf6ff"); b.rect(0, TILE - 1, TILE, 1, "#c0dcf0"); b.rect(TILE - 1, 0, 1, TILE, "#c0dcf0");
        for (let i = 2; i < 7; i++) { b.set(i, 8 - i, "#eaf6ff"); b.set(i + 7, 15 - i, "#eaf6ff"); }
        b.rect(3, 3, 1, 1, "#ffffff"); b.rect(11, 10, 1, 1, "#ffffff");
        b.rect(7, 1, 2, 14, "#5a7a98"); b.rect(1, 7, 14, 2, "#5a7a98"); // frame cross
        grain(b, 0.03, 4);
        break;
      }
      case "vent": {
        gravelBlock(b, 4);
        const box = new Buf(8, 12); ironBlock(box, 3);
        box.rect(2, 5, 4, 5, "#6c6c76"); box.rect(3, 6, 2, 3, "#2a2a32");
        b.blit(box, 4, 2);
        b.rect(5, 14, 8, 1, "#3a3a42");
        break;
      }
      case "stair": {
        bricks(b, TILE, TILE, BRICK, MORTAR, 5);
        const wood = "#8a6232";
        b.rect(3, 0, 2, TILE, wood); b.rect(11, 0, 2, TILE, wood);
        for (let y = 1; y < TILE; y += 4) { b.rect(5, y, 6, 2, wood); b.rect(5, y, 6, 1, tone(wood, 0.2)); }
        break;
      }
    }
    b.draw(ctx); tex.refresh();
  }
  // front face of the parapet (2.5D): darker bricks, 7px tall
  if (!skip("ledge-front")) {
    const { tex, ctx } = canvas(scene, "ledge-front", TILE, 7);
    const b = new Buf(TILE, 7); bricks(b, TILE, 7, tone(BRICK, -0.35), tone(MORTAR, -0.35), 6);
    b.rect(0, 6, TILE, 1, "#2a1a14");
    b.draw(ctx); tex.refresh();
  }
  const s = canvas(scene, "ao-strip", TILE, 6);
  for (let y = 0; y < 6; y++) px(s.ctx, 0, y, `rgba(0,0,0,${(0.4 * (6 - y)) / 6})`, TILE, 1);
  s.tex.refresh();
}

/* ------------------------------------------------------------------ objects */

export function makeObjects(scene: Phaser.Scene, keep: Set<string> = new Set()) {
  KEEP = keep;
  // water tower 52x64 built from blocks: fence-post legs, plank tank with iron bands, stepped roof
  if (!skip("water-tower")) {
    const { tex, ctx } = canvas(scene, "water-tower", 52, 64);
    const b = new Buf(52, 64);
    const post = "#4a3220";
    for (const lx of [7, 19, 31, 43]) { b.rect(lx, 36, 3, 28, post); b.rect(lx, 36, 1, 28, tone(post, 0.2)); }
    b.rect(7, 47, 39, 2, post); b.rect(10, 57, 33, 2, post);
    const tank = new Buf(40, 24); planks(tank, 40, 24, "#a8763e", 7);
    for (const y of [2, 12, 21]) { tank.rect(0, y, 40, 2, "#8c8c96"); tank.rect(0, y, 40, 1, "#c4c4ce"); }
    tank.rect(0, 0, 2, 24, tone("#a8763e", 0.15)); tank.rect(38, 0, 2, 24, tone("#a8763e", -0.3));
    b.blit(tank, 6, 14);
    // stepped block roof
    const roofC = "#5a5a66";
    for (let r = 0; r < 4; r++) { b.rect(6 + r * 5, 13 - r * 3, 40 - r * 10, 3, tone(roofC, r * 0.08)); b.rect(6 + r * 5, 13 - r * 3, 40 - r * 10, 1, tone(roofC, 0.3)); }
    b.rect(24, 0, 4, 2, "#9c9cae");
    const ladder = "#8a6232"; b.rect(45, 14, 2, 46, ladder); b.rect(49, 14, 2, 46, ladder); for (let y = 16; y < 60; y += 4) b.rect(45, y, 6, 1, ladder);
    grain(b, 0.04, 8); outline(b, "soft"); shade(b, null, 0.12, 0.2, true);
    b.draw(ctx); tex.refresh();
  }
  // stairwell bulkhead 36x30: cobblestone top face, brick front face, oak door
  if (!skip("bulkhead")) {
    const { tex, ctx } = canvas(scene, "bulkhead", 36, 30);
    const b = new Buf(36, 30);
    const top = new Buf(32, 9); cobble(top, 11); b.blit(top, 2, 1);
    const front = new Buf(32, 18); bricks(front, 32, 18, tone(BRICK, -0.15), tone(MORTAR, -0.15), 12); b.blit(front, 2, 10);
    const door = new Buf(10, 16); planks(door, 10, 16, "#7a5428", 13);
    door.rect(2, 2, 6, 4, "#2a3a4a"); door.rect(3, 3, 1, 1, "#7cc0f0"); door.rect(6, 3, 1, 1, "#7cc0f0"); door.rect(8, 10, 1, 1, "#e0b848");
    b.blit(door, 13, 12);
    b.rect(12, 11, 12, 1, "#2a1a14"); b.rect(12, 11, 1, 17, "#2a1a14"); b.rect(23, 11, 1, 17, "#2a1a14");
    b.rect(15, 9, 6, 2, "#ffd860"); b.rect(16, 8, 4, 1, "#8c8c96"); // lamp over the door
    b.rect(26, 2, 6, 4, "#8c8c96"); b.rect(27, 0, 4, 2, "#6c6c76");
    grain(b, 0.03, 14); outline(b, "soft"); shade(b, null, 0.12, 0.2, true);
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

/* ------------------------------------------------------------------ phase 4: more tiles */

/** Concrete slabs. */
function sidewalk(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#8a8a92");
  b.rect(0, 0, b.w, 1, "#a2a2aa"); b.rect(0, 0, 1, b.h, "#a2a2aa");
  b.rect(0, b.h - 1, b.w, 1, "#5e5e66"); b.rect(b.w - 1, 0, 1, b.h, "#5e5e66");
  b.rect(7, 2, 1, 1, "#6a6a72"); b.rect(3, 11, 2, 1, "#6a6a72");
  grain(b, 0.05, seed);
}
function asphalt(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#34343c");
  for (let y = 0; y < b.h; y += 2) for (let x = 0; x < b.w; x += 2) { const r = hash(x, y, seed); if (r > 0.8) b.rect(x, y, 2, 2, "#3e3e46"); else if (r < 0.1) b.rect(x, y, 2, 2, "#2a2a32"); }
  grain(b, 0.04, seed);
}
function facade(b: Buf, seed: number, window: boolean, door: boolean) {
  b.rect(0, 0, b.w, b.h, "#6a6a78");
  for (let y = 0; y < b.h; y += 4) { b.rect(0, y + 3, b.w, 1, "#4a4a56"); b.rect(y % 8 ? 8 : 0, y, 1, 3, "#4a4a56"); }
  b.rect(0, 0, b.w, 1, "#8a8a98");
  if (window) { b.rect(3, 2, 10, 11, "#262636"); b.rect(4, 3, 8, 9, "#3a5a8a"); b.rect(4, 3, 3, 3, "#6a9ad0"); b.rect(7, 3, 1, 9, "#262636"); b.rect(4, 7, 8, 1, "#262636"); b.rect(3, 13, 10, 1, "#8a8a98"); }
  if (door) { b.rect(1, 0, 14, 16, "#2a2a3a"); b.rect(2, 1, 12, 15, "#b08a40"); b.rect(3, 2, 10, 12, "#204060"); b.rect(7, 2, 2, 12, "#b08a40"); b.rect(2, 1, 12, 1, "#e0c070"); }
  grain(b, 0.04, seed);
}
function carpet(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#4a2a3a");
  for (let y = 0; y < b.h; y += 4) for (let x = 0; x < b.w; x += 4) if ((x + y) % 8 === 0) b.rect(x + 1, y + 1, 2, 2, "#5e3a4a");
  grain(b, 0.04, seed);
}
function marble(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#d8d8e0");
  b.rect(0, 0, b.w, 1, "#f0f0f6"); b.rect(0, 0, 1, b.h, "#f0f0f6"); b.rect(0, b.h - 1, b.w, 1, "#a8a8b4"); b.rect(b.w - 1, 0, 1, b.h, "#a8a8b4");
  for (let i = 0; i < 8; i++) b.set(3 + i, 10 - i, "#b8b8c4");
  grain(b, 0.03, seed);
}
function wall(b: Buf, seed: number, window: boolean) {
  b.rect(0, 0, b.w, b.h, "#303048");
  b.rect(0, b.h - 3, b.w, 3, "#202034"); b.rect(0, b.h - 3, b.w, 1, "#505070");
  if (window) { b.rect(1, 1, 14, 11, "#101c38"); for (let i = 0; i < 20; i++) { const x = Math.floor(hash(i, 1, seed) * 14) + 1, y = Math.floor(hash(i, 2, seed) * 10) + 1; b.set(x, y, hash(i, 3, seed) > 0.5 ? "#ffd880" : "#6a8ab0"); } b.rect(1, 1, 14, 1, "#4a6aa0"); b.rect(8, 1, 1, 11, "#4a6aa0"); }
  grain(b, 0.03, seed);
}
function flagstone(b: Buf, seed: number) {
  b.rect(0, 0, b.w, b.h, "#4e4e58");
  const stones = [[0, 0, 7, 6], [8, 0, 8, 5], [0, 7, 5, 9], [6, 6, 6, 5], [13, 6, 3, 4], [7, 12, 9, 4]];
  stones.forEach(([x, y, w, h], i) => { const c = tone("#6e6e7a", (hash(i, 1, seed) - 0.5) * 0.25); b.rect(x!, y!, w! - 1, h! - 1, c); b.rect(x!, y!, w! - 1, 1, tone(c, 0.15)); b.rect(x!, y! + h! - 2, w! - 1, 1, tone(c, -0.2)); });
  grain(b, 0.05, seed);
}
function castleWall(b: Buf, seed: number, battlement: boolean) {
  b.rect(0, 0, b.w, b.h, "#3a3a46");
  for (let y = 0; y < b.h; y += 8) { b.rect(0, y + 7, b.w, 1, "#22222c"); const off = y % 16 ? 8 : 0; b.rect(off, y, 1, 7, "#22222c"); b.rect(off + 1, y, 7, 1, "#5a5a68"); }
  if (battlement) { b.px.fill(null); b.rect(0, 10, b.w, 6, "#3a3a46"); b.rect(2, 4, 5, 6, "#3a3a46"); b.rect(10, 4, 5, 6, "#3a3a46"); b.rect(2, 4, 5, 1, "#5a5a68"); b.rect(10, 4, 5, 1, "#5a5a68"); }
  grain(b, 0.05, seed);
}

export function makeTiles2(scene: Phaser.Scene) {
  const defs: [Tile, (b: Buf) => void][] = [
    ["sidewalk", (b) => sidewalk(b, 21)],
    ["curb", (b) => { sidewalk(b, 22); b.rect(0, 13, 16, 3, "#5e5e66"); b.rect(0, 13, 16, 1, "#a2a2aa"); }],
    ["road", (b) => asphalt(b, 23)],
    ["road-line", (b) => { asphalt(b, 24); b.rect(2, 7, 10, 2, "#e0c050"); }],
    ["facade", (b) => facade(b, 25, false, false)],
    ["facade-window", (b) => facade(b, 26, true, false)],
    ["facade-door", (b) => facade(b, 27, false, true)],
    ["carpet", (b) => carpet(b, 28)],
    ["marble", (b) => marble(b, 29)],
    ["wall", (b) => wall(b, 30, false)],
    ["wall-window", (b) => wall(b, 31, true)],
    ["flagstone", (b) => flagstone(b, 32)],
    ["castle-wall", (b) => castleWall(b, 33, false)],
    ["battlement", (b) => castleWall(b, 34, true)],
    ["dais", (b) => { marble(b, 35); b.rect(0, 0, 16, 16, "#5a4a3a"); b.rect(0, 0, 16, 1, "#8a7a5a"); b.rect(0, 15, 16, 1, "#2a2016"); grain(b, 0.04, 35); }],
  ];
  for (const [k, fn] of defs) {
    if (skip(`tile-${k}`)) continue;
    const { tex, ctx } = canvas(scene, `tile-${k}`, TILE, TILE);
    const b = new Buf(TILE, TILE); fn(b); b.draw(ctx); tex.refresh();
  }
}

/** Props for the street, lounge and castle. Each is one texture, origin bottom-left at its tile. */
export function makeProps(scene: Phaser.Scene) {
  const mk = (key: string, w: number, h: number, fn: (b: Buf) => void, soft = true) => {
    if (scene.textures.exists(key) || skip(key)) return;
    const { tex, ctx } = canvas(scene, key, w, h);
    const b = new Buf(w, h); fn(b); grain(b, 0.04, key.length); if (soft) { outline(b, "soft"); shade(b, null, 0.12, 0.2, true); }
    b.draw(ctx); tex.refresh();
  };
  mk("prop-car", 34, 18, (b) => {
    const body = "#d8b020";
    b.rect(2, 6, 30, 9, body); b.rect(7, 2, 18, 5, body); b.rect(9, 3, 6, 4, "#8ac0e0"); b.rect(17, 3, 6, 4, "#8ac0e0");
    b.rect(2, 10, 30, 1, tone(body, -0.3)); b.rect(5, 14, 6, 4, "#202028"); b.rect(23, 14, 6, 4, "#202028"); b.rect(7, 15, 2, 2, "#8a8a94"); b.rect(25, 15, 2, 2, "#8a8a94");
    b.rect(2, 8, 2, 2, "#fff0a0"); b.rect(30, 8, 2, 2, "#ff4040"); b.rect(12, 1, 8, 2, "#f0e0a0");
  });
  mk("prop-lamppost", 10, 30, (b) => { b.rect(4, 6, 2, 24, "#2a3a2a"); b.rect(2, 4, 6, 3, "#2a3a2a"); b.rect(3, 1, 4, 4, "#ffe8a0"); b.rect(2, 0, 6, 1, "#2a3a2a"); b.rect(3, 28, 4, 2, "#2a3a2a"); });
  mk("prop-hydrant", 8, 12, (b) => { b.rect(2, 2, 4, 10, "#d02020"); b.rect(1, 5, 6, 2, "#d02020"); b.rect(3, 0, 2, 2, "#d02020"); b.rect(0, 5, 2, 2, "#a01818"); b.rect(6, 5, 2, 2, "#a01818"); });
  mk("prop-newsstand", 28, 22, (b) => { b.rect(0, 4, 28, 18, "#2a5a3a"); b.rect(0, 0, 28, 5, "#1a3a2a"); b.rect(2, 8, 24, 10, "#e8e0c8"); for (let i = 0; i < 4; i++) { b.rect(3 + i * 6, 9, 5, 4, i % 2 ? "#d04040" : "#4060b0"); b.rect(3 + i * 6, 14, 5, 3, "#a0a0a0"); } b.rect(6, 1, 16, 2, "#ffd860"); });
  mk("prop-subway", 26, 18, (b) => { b.rect(0, 2, 26, 16, "#303040"); b.rect(2, 4, 22, 14, "#101018"); for (let y = 6; y < 18; y += 3) b.rect(2, y, 22, 1, "#3a3a4a"); b.rect(0, 0, 26, 3, "#2a6a2a"); b.rect(2, 0, 22, 1, "#ffffff"); b.rect(0, 2, 2, 16, "#5a5a6a"); b.rect(24, 2, 2, 16, "#5a5a6a"); });
  mk("prop-bugle-sign", 64, 14, (b) => { b.rect(0, 0, 64, 14, "#101018"); b.rect(1, 1, 62, 12, "#d8d8e8"); b.rect(4, 4, 56, 6, "#101018"); for (let x = 6; x < 58; x += 5) b.rect(x, 5, 3, 4, "#ffd860"); b.rect(0, 13, 64, 1, "#404050"); }, false);
  mk("prop-couch", 36, 16, (b) => { b.rect(0, 4, 36, 12, "#6a2a3a"); b.rect(0, 0, 36, 6, "#7a3a4a"); b.rect(2, 6, 32, 6, "#8a4a5a"); b.rect(0, 6, 4, 10, "#5a2030"); b.rect(32, 6, 4, 10, "#5a2030"); b.rect(2, 14, 32, 2, "#3a1a24"); });
  mk("prop-bar", 44, 18, (b) => { b.rect(0, 6, 44, 12, "#4a3020"); b.rect(0, 4, 44, 3, "#8a6a40"); b.rect(0, 4, 44, 1, "#c0a070"); for (let x = 3; x < 44; x += 7) { b.rect(x, 0, 2, 4, hash(x, 1, 5) > 0.5 ? "#c0e0ff" : "#ffd860"); } b.rect(2, 9, 40, 1, "#3a2416"); });
  mk("prop-holo-table", 28, 20, (b) => { b.rect(2, 10, 24, 10, "#303848"); b.rect(0, 8, 28, 3, "#5a6a80"); b.rect(0, 8, 28, 1, "#8a9ab0"); b.rect(10, 0, 8, 8, "#2a8ad0"); b.rect(6, 2, 16, 5, "#3aa0f0"); b.rect(12, 1, 4, 2, "#a0e0ff"); b.rect(8, 4, 12, 1, "#a0e0ff"); }, false);
  mk("prop-elevator", 28, 26, (b) => { b.rect(0, 0, 28, 26, "#4a4a5a"); b.rect(2, 2, 11, 24, "#8a8a9a"); b.rect(15, 2, 11, 24, "#8a8a9a"); b.rect(2, 2, 11, 1, "#c0c0d0"); b.rect(15, 2, 11, 1, "#c0c0d0"); b.rect(12, 0, 4, 2, "#58d854"); });
  mk("prop-plant", 14, 22, (b) => { b.rect(4, 14, 6, 8, "#8a5a30"); b.rect(2, 6, 10, 9, "#2a7a3a"); b.rect(0, 2, 6, 6, "#3a9a4a"); b.rect(8, 0, 6, 7, "#3a9a4a"); b.rect(5, 10, 4, 3, "#1a5a2a"); });
  mk("prop-throne", 28, 34, (b) => { b.rect(4, 0, 20, 34, "#2a2a34"); b.rect(6, 2, 16, 20, "#1a5a2a"); b.rect(0, 20, 28, 14, "#3a3a46"); b.rect(2, 22, 24, 10, "#2a2a34"); b.rect(10, 4, 8, 8, "#8a8a9a"); b.rect(12, 6, 4, 2, "#101014"); b.rect(12, 9, 4, 1, "#101014"); b.rect(4, 0, 20, 2, "#c0a040"); });
  mk("prop-banner", 14, 30, (b) => { b.rect(0, 0, 14, 2, "#c0a040"); b.rect(1, 2, 12, 26, "#1a6a2a"); b.rect(1, 2, 12, 1, "#2a8a3a"); b.rect(4, 8, 6, 8, "#8a8a9a"); b.rect(5, 10, 4, 2, "#101014"); b.rect(5, 13, 4, 1, "#101014"); b.rect(1, 26, 4, 4, "#1a6a2a"); b.rect(9, 26, 4, 4, "#1a6a2a"); });
  mk("prop-torch", 8, 18, (b) => { b.rect(3, 8, 2, 10, "#4a3020"); b.rect(2, 6, 4, 3, "#2a2a34"); b.rect(2, 1, 4, 5, "#ff8a20"); b.rect(3, 0, 2, 3, "#ffd860"); });
  mk("prop-gate", 36, 26, (b) => { b.rect(0, 0, 36, 26, "#2a2a34"); b.rect(3, 3, 30, 23, "#101014"); for (let x = 5; x < 34; x += 5) b.rect(x, 3, 2, 23, "#5a5a6a"); for (let y = 6; y < 26; y += 6) b.rect(3, y, 30, 2, "#5a5a6a"); b.rect(0, 0, 36, 2, "#4a4a56"); });
  mk("prop-statue", 20, 34, (b) => { b.rect(2, 26, 16, 8, "#3a3a46"); b.rect(6, 4, 8, 22, "#5a5a68"); b.rect(5, 0, 10, 8, "#6a6a78"); b.rect(2, 8, 16, 10, "#4a6a4a"); b.rect(7, 3, 2, 1, "#101014"); b.rect(11, 3, 2, 1, "#101014"); });
}

/** Sky by time of day, plus a far-mountain variant for Latveria. */
export function makeSkies(scene: Phaser.Scene, w: number) {
  const h = 48;
  const bands: Record<string, string[]> = {
    night: [PAL.night0, PAL.night0, PAL.night1, PAL.night1, PAL.night2, PAL.night3],
    dawn: ["#1a1a3a", "#3a2a4a", "#6a3a5a", "#a05a5a", "#d08a60", "#f0b878"],
    day: ["#3a7ad8", "#4a8ae0", "#5a9ae8", "#6aaaf0", "#8ac0f8", "#b0d8ff"],
    dusk: ["#2a1a4a", "#4a2a5a", "#8a3a5a", "#c05a4a", "#e08a40", "#f0b060"],
  };
  for (const [tod, cols] of Object.entries(bands)) {
    const key = `sky-${tod}`;
    if (scene.textures.exists(key)) continue;
    const { tex, ctx } = canvas(scene, key, w, h);
    cols.forEach((c, i) => px(ctx, 0, i * 8, c, w, 8));
    if (tod === "night" || tod === "dawn") for (let i = 0; i < (tod === "night" ? 90 : 25); i++) { const x = Math.floor(hash(i, 1, 7) * w), y = Math.floor(hash(i, 2, 7) * 26); px(ctx, x, y, hash(i, 3, 7) > 0.75 ? PAL.star : PAL.starDim); }
    if (tod === "night") { px(ctx, 41, 6, PAL.white, 6, 8); px(ctx, 40, 7, PAL.white, 8, 6); px(ctx, 42, 5, PAL.white, 4, 10); px(ctx, 44, 8, "#c8ccf0", 2, 2); }
    if (tod === "day") { for (let i = 0; i < 3; i++) { const x = 40 + i * 110; px(ctx, x, 10 + i * 4, "#ffffff", 40, 6); px(ctx, x + 10, 6 + i * 4, "#ffffff", 20, 5); } px(ctx, 268, 6, "#fff8c0", 10, 10); px(ctx, 266, 8, "#fff8c0", 14, 6); }
    if (tod === "dusk") { px(ctx, 60, 30, "#ffd060", 12, 6); px(ctx, 58, 32, "#ffd060", 16, 3); }
    tex.refresh();
  }
  if (!scene.textures.exists("mountains")) {
    const { tex, ctx } = canvas(scene, "mountains", w, h);
    let x = 0, i = 0;
    while (x < w) {
      const pw = 30 + Math.floor(hash(i, 4, 3) * 40), ph = 14 + Math.floor(hash(i, 5, 3) * 22);
      for (let k = 0; k < pw; k++) { const t = Math.abs(k - pw / 2) / (pw / 2); const hh = Math.round(ph * (1 - t)); px(ctx, x + k, h - hh, "#1a1a2e", 1, hh); if (hh > ph * 0.7) px(ctx, x + k, h - hh, "#d8d8e8", 1, 1); }
      x += pw - 10; i++;
    }
    tex.refresh();
  }
  if (!scene.textures.exists("fog")) {
    const { tex, ctx } = canvas(scene, "fog", 320, 240);
    for (let i = 0; i < 60; i++) { const x = Math.floor(hash(i, 1, 9) * 320), y = Math.floor(hash(i, 2, 9) * 240), r = 20 + Math.floor(hash(i, 3, 9) * 40); const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, "rgba(200,205,220,0.22)"); g.addColorStop(1, "rgba(200,205,220,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    tex.refresh();
  }
  if (!scene.textures.exists("raindrop")) { const { tex, ctx } = canvas(scene, "raindrop", 1, 5); px(ctx, 0, 0, "#9ab8e0", 1, 5); tex.refresh(); }
  if (!scene.textures.exists("snowflake")) { const { tex, ctx } = canvas(scene, "snowflake", 2, 2); px(ctx, 0, 0, "#ffffff", 2, 2); tex.refresh(); }
}

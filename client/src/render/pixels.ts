/**
 * Procedural NES-flavored art. Everything on screen is generated here at boot so the
 * prototype needs zero asset files. Real sprites (Phase 5) replace these texture keys 1:1.
 */
import Phaser from "phaser";
import type { Tile } from "@shared/maps";

export const TILE = 16;
export const CHAR_W = 16;
export const CHAR_H = 24;

/** NES-ish palette used for the environment. */
export const PAL = {
  night0: "#0b0b14", night1: "#141432", night2: "#1e1e4a", star: "#f8f8f8", starDim: "#8888aa",
  roof: "#3c3c3c", roofLight: "#4a4a4a", roofDark: "#2e2e2e", gravel: "#5a5a5a",
  brick: "#7c3a1e", brickDark: "#5a2a14", brickLight: "#a04a28", mortar: "#4a2a1a",
  metal: "#6c6c7c", metalDark: "#44444f", metalLight: "#9c9cac", rust: "#8a4a20",
  glass: "#2050a0", glassLight: "#4a8ae0", frame: "#303040",
  door: "#4a3020", doorDark: "#2a1a10", knob: "#d8b040",
  windowLit: "#f8d878", windowDim: "#806030", building: "#101026", buildingLight: "#1a1a3a",
  black: "#000000", white: "#fcfcfc", yellow: "#f8d878", red: "#d82800", green: "#58d854", blue: "#3cbcfc",
  skin: "#f0c0a0", boots: "#202020",
};

/** Tiny deterministic noise so gravel speckles look the same every boot. */
function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177; h >>>= 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function ctxOf(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) {
  ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
}

export function makeTiles(scene: Phaser.Scene) {
  const kinds: Tile[] = ["roof", "ledge", "void", "door", "tower-base", "ac", "skylight", "vent", "stair"];
  for (const k of kinds) {
    const { tex, ctx } = ctxOf(scene, `tile-${k}`, TILE, TILE);
    drawTile(ctx, k);
    tex.refresh();
  }
}

function drawTile(ctx: CanvasRenderingContext2D, k: Tile) {
  const gravel = (seed: number) => {
    px(ctx, 0, 0, PAL.roof, TILE, TILE);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const r = hash(x, y, seed);
      if (r > 0.93) px(ctx, x, y, PAL.gravel);
      else if (r < 0.06) px(ctx, x, y, PAL.roofDark);
      else if (r > 0.86) px(ctx, x, y, PAL.roofLight);
    }
  };
  switch (k) {
    case "roof": gravel(1); break;
    case "void": px(ctx, 0, 0, PAL.night0, TILE, TILE); break;
    case "ledge": {
      px(ctx, 0, 0, PAL.brick, TILE, TILE);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        px(ctx, 0, y + 3, PAL.mortar, TILE, 1);
        const off = row % 2 ? 4 : 0;
        for (let x = off; x < TILE; x += 8) px(ctx, x, y, PAL.mortar, 1, 3);
        for (let x = 0; x < TILE; x += 8) px(ctx, (x + off + 1) % TILE, y, PAL.brickLight, 2, 1);
      }
      px(ctx, 0, 0, PAL.brickLight, TILE, 1);
      break;
    }
    case "door": {
      gravel(2);
      px(ctx, 1, 0, PAL.doorDark, 14, 16);
      px(ctx, 2, 1, PAL.door, 12, 15);
      px(ctx, 3, 2, PAL.doorDark, 4, 5); px(ctx, 9, 2, PAL.doorDark, 4, 5);
      px(ctx, 3, 9, PAL.doorDark, 4, 5); px(ctx, 9, 9, PAL.doorDark, 4, 5);
      px(ctx, 12, 8, PAL.knob, 1, 1);
      break;
    }
    case "tower-base": {
      px(ctx, 0, 0, PAL.metalDark, TILE, TILE);
      for (let y = 0; y < TILE; y += 4) px(ctx, 0, y, PAL.metal, TILE, 1);
      for (let x = 0; x < TILE; x += 4) px(ctx, x, 0, PAL.frame, 1, TILE);
      if (hash(3, 3, 9) > 0.3) px(ctx, 5, 6, PAL.rust, 3, 2);
      break;
    }
    case "ac": {
      gravel(3);
      px(ctx, 0, 1, PAL.metalDark, 16, 15);
      px(ctx, 1, 2, PAL.metal, 14, 13);
      for (let y = 4; y < 13; y += 2) px(ctx, 3, y, PAL.metalDark, 10, 1);
      px(ctx, 1, 2, PAL.metalLight, 14, 1);
      break;
    }
    case "skylight": {
      px(ctx, 0, 0, PAL.frame, TILE, TILE);
      px(ctx, 1, 1, PAL.glass, 14, 14);
      px(ctx, 7, 1, PAL.frame, 2, 14); px(ctx, 1, 7, PAL.frame, 14, 2);
      px(ctx, 2, 2, PAL.glassLight, 3, 1); px(ctx, 2, 3, PAL.glassLight, 1, 2);
      px(ctx, 10, 10, PAL.glassLight, 1, 1); px(ctx, 12, 12, PAL.white, 1, 1);
      // a crack
      px(ctx, 10, 2, PAL.white, 1, 1); px(ctx, 11, 3, PAL.white, 1, 1); px(ctx, 12, 5, PAL.white, 1, 1); px(ctx, 11, 4, PAL.white, 1, 1);
      break;
    }
    case "vent": {
      gravel(4);
      px(ctx, 5, 4, PAL.metalDark, 6, 12);
      px(ctx, 6, 5, PAL.metal, 4, 10);
      px(ctx, 4, 3, PAL.metalLight, 8, 2);
      px(ctx, 6, 0, PAL.metalLight, 4, 1);
      break;
    }
    case "stair": {
      px(ctx, 0, 0, PAL.brick, TILE, TILE);
      px(ctx, 4, 0, PAL.metalLight, 2, 16); px(ctx, 10, 0, PAL.metalLight, 2, 16);
      for (let y = 2; y < 16; y += 4) px(ctx, 6, y, PAL.metal, 4, 1);
      break;
    }
  }
}

/** Night skyline, 320x40, with a glowing spire on the right. */
export function makeSkyline(scene: Phaser.Scene, w: number) {
  const h = 40;
  const { tex, ctx } = ctxOf(scene, "skyline", w, h);
  px(ctx, 0, 0, PAL.night0, w, h);
  px(ctx, 0, 14, PAL.night1, w, 12); px(ctx, 0, 26, PAL.night2, w, 14);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i, 1, 7) * w), y = Math.floor(hash(i, 2, 7) * 22);
    px(ctx, x, y, hash(i, 3, 7) > 0.7 ? PAL.star : PAL.starDim);
  }
  // moon
  px(ctx, 40, 5, PAL.white, 6, 6); px(ctx, 39, 6, PAL.white, 8, 4); px(ctx, 41, 4, PAL.white, 4, 8); px(ctx, 42, 6, PAL.starDim, 2, 2);
  // buildings
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = 10 + Math.floor(hash(i, 4, 7) * 18);
    const bh = 8 + Math.floor(hash(i, 5, 7) * 22);
    const col = hash(i, 6, 7) > 0.5 ? PAL.building : PAL.buildingLight;
    px(ctx, x, h - bh, col, bw, bh);
    for (let wy = h - bh + 2; wy < h - 1; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) {
      const r = hash(wx, wy, 11);
      if (r > 0.6) px(ctx, wx, wy, r > 0.9 ? PAL.windowLit : PAL.windowDim);
    }
    x += bw + 1; i++;
  }
  // Empire State spire
  const sx = w - 58;
  px(ctx, sx, 10, PAL.buildingLight, 12, 30); px(ctx, sx + 3, 4, PAL.buildingLight, 6, 8); px(ctx, sx + 5, 0, PAL.metalLight, 2, 5);
  for (let wy = 12; wy < 38; wy += 3) for (let wx = sx + 1; wx < sx + 11; wx += 3) if (hash(wx, wy, 13) > 0.4) px(ctx, wx, wy, PAL.windowLit);
  px(ctx, sx + 4, 1, PAL.red, 1, 1);
  tex.refresh();
}

/** Water tower, 48x56, drawn above the tower-base tiles. */
export function makeWaterTower(scene: Phaser.Scene) {
  const { tex, ctx } = ctxOf(scene, "water-tower", 48, 56);
  // legs
  for (const lx of [6, 18, 30, 40]) px(ctx, lx, 30, PAL.metalDark, 2, 26);
  px(ctx, 6, 42, PAL.metalDark, 36, 1); px(ctx, 10, 50, PAL.metalDark, 28, 1);
  // tank
  px(ctx, 6, 10, PAL.rust, 36, 22);
  px(ctx, 8, 10, PAL.brick, 32, 22);
  for (let y = 12; y < 32; y += 5) px(ctx, 6, y, PAL.metalDark, 36, 1);
  px(ctx, 10, 11, PAL.brickLight, 3, 20);
  // conical roof
  for (let r = 0; r < 8; r++) px(ctx, 4 + r * 2.5, 9 - r, PAL.metalDark, 40 - r * 5, 1);
  px(ctx, 23, 0, PAL.metalLight, 2, 3);
  tex.refresh();
}

export interface Palette { primary: string; secondary: string; accent: string }

/**
 * Character spritesheet: 6 frames of 16x24.
 * 0,1 = down walk; 2,3 = up walk; 4,5 = side walk (facing right; flip for left).
 * Villains get a cape; heroes get a chest emblem pixel in accent.
 */
export function makeCharacter(scene: Phaser.Scene, key: string, pal: Palette, role: string) {
  if (scene.textures.exists(key)) return;
  const frames = 6;
  const { tex, ctx } = ctxOf(scene, key, CHAR_W * frames, CHAR_H);
  for (let f = 0; f < frames; f++) {
    const ox = f * CHAR_W;
    const dir = f < 2 ? "down" : f < 4 ? "up" : "side";
    const step = f % 2;
    const bob = step ? 1 : 0;
    const y0 = 2 + bob;
    // cape (villain) behind body
    if (role === "villain" && dir !== "up") px(ctx, ox + 3, y0 + 8, pal.secondary, 10, 10 - bob);
    // head (mask = primary)
    px(ctx, ox + 5, y0, pal.primary, 6, 6);
    px(ctx, ox + 4, y0 + 1, pal.primary, 8, 4);
    if (dir !== "up") {
      // eyes
      px(ctx, ox + 5, y0 + 2, pal.accent, 2, 2); px(ctx, ox + 9, y0 + 2, pal.accent, 2, 2);
      if (dir === "side") { px(ctx, ox + 9, y0 + 2, pal.accent, 2, 2); px(ctx, ox + 5, y0 + 2, pal.primary, 2, 2); }
    }
    // torso
    px(ctx, ox + 4, y0 + 6, pal.primary, 8, 5);
    px(ctx, ox + 4, y0 + 11, pal.secondary, 8, 4);
    if (role !== "villain" && dir !== "up") px(ctx, ox + 7, y0 + 7, pal.accent, 2, 2);
    // arms
    const swing = step ? 1 : -1;
    if (dir === "side") {
      px(ctx, ox + 7 + swing, y0 + 7, pal.primary, 2, 6);
    } else {
      px(ctx, ox + 2, y0 + 6 + (swing > 0 ? 1 : 0), pal.primary, 2, 6);
      px(ctx, ox + 12, y0 + 6 + (swing > 0 ? 0 : 1), pal.primary, 2, 6);
    }
    // legs
    const lift = step ? 2 : 0;
    px(ctx, ox + 4, y0 + 15, pal.secondary, 3, 6 - lift);
    px(ctx, ox + 9, y0 + 15 + (lift ? 0 : 0), pal.secondary, 3, 6 - (lift ? 0 : 2));
    // boots
    px(ctx, ox + 4, y0 + 21 - lift, PAL.boots, 3, 1 + lift / 2);
    px(ctx, ox + 9, y0 + 19 + (lift ? 2 : 0), PAL.boots, 3, 1);
    // outline-ish shadow under feet
    px(ctx, ox + 3, 23, "rgba(0,0,0,0.45)", 10, 1);
  }
  tex.refresh();
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * CHAR_W, 0, CHAR_W, CHAR_H);
  const animKey = (n: string) => `${key}-${n}`;
  const mk = (n: string, a: number, b: number) => {
    if (!scene.anims.exists(animKey(n))) scene.anims.create({ key: animKey(n), frames: [{ key, frame: a }, { key, frame: b }], frameRate: 6, repeat: -1 });
  };
  mk("down", 0, 1); mk("up", 2, 3); mk("side", 4, 5);
}

/** 24x24 portrait for the dialogue box: big masked head in the character's colors. */
export function makePortrait(scene: Phaser.Scene, key: string, pal: Palette) {
  if (scene.textures.exists(key)) return;
  const { tex, ctx } = ctxOf(scene, key, 24, 24);
  px(ctx, 0, 0, PAL.black, 24, 24);
  px(ctx, 5, 3, pal.primary, 14, 16); px(ctx, 3, 6, pal.primary, 18, 10);
  px(ctx, 6, 8, pal.accent, 5, 4); px(ctx, 13, 8, pal.accent, 5, 4);
  px(ctx, 7, 9, pal.secondary, 1, 1); px(ctx, 16, 9, pal.secondary, 1, 1);
  px(ctx, 4, 19, pal.secondary, 16, 5);
  tex.refresh();
}

/** Emote bubbles, 10x10 each. */
export function makeEmotes(scene: Phaser.Scene) {
  const list = ["!", "?", "...", "heart", "anger", "sweat", "music", "zzz"] as const;
  for (const e of list) {
    const { tex, ctx } = ctxOf(scene, `emote-${e}`, 10, 10);
    px(ctx, 1, 0, PAL.white, 8, 8); px(ctx, 0, 1, PAL.white, 10, 6); px(ctx, 4, 8, PAL.white, 2, 2);
    const ink = PAL.black;
    switch (e) {
      case "!": px(ctx, 4, 1, ink, 2, 4); px(ctx, 4, 6, ink, 2, 1); break;
      case "?": px(ctx, 3, 1, ink, 4, 1); px(ctx, 6, 2, ink, 1, 2); px(ctx, 4, 3, ink, 2, 1); px(ctx, 4, 4, ink, 1, 1); px(ctx, 4, 6, ink, 1, 1); break;
      case "...": px(ctx, 2, 4, ink, 1, 1); px(ctx, 4, 4, ink, 1, 1); px(ctx, 6, 4, ink, 1, 1); break;
      case "heart": px(ctx, 2, 2, PAL.red, 2, 2); px(ctx, 6, 2, PAL.red, 2, 2); px(ctx, 2, 3, PAL.red, 6, 2); px(ctx, 3, 5, PAL.red, 4, 1); px(ctx, 4, 6, PAL.red, 2, 1); break;
      case "anger": px(ctx, 2, 1, PAL.red, 2, 2); px(ctx, 6, 1, PAL.red, 2, 2); px(ctx, 2, 5, PAL.red, 2, 2); px(ctx, 6, 5, PAL.red, 2, 2); px(ctx, 4, 3, PAL.red, 2, 2); break;
      case "sweat": px(ctx, 4, 1, PAL.blue, 2, 2); px(ctx, 3, 3, PAL.blue, 4, 3); px(ctx, 4, 6, PAL.blue, 2, 1); break;
      case "music": px(ctx, 3, 1, ink, 1, 5); px(ctx, 3, 1, ink, 4, 1); px(ctx, 6, 1, ink, 1, 4); px(ctx, 2, 5, ink, 2, 2); px(ctx, 5, 4, ink, 2, 2); break;
      case "zzz": px(ctx, 2, 1, ink, 3, 1); px(ctx, 3, 2, ink, 1, 1); px(ctx, 2, 3, ink, 3, 1); px(ctx, 5, 4, ink, 3, 1); px(ctx, 6, 5, ink, 1, 1); px(ctx, 5, 6, ink, 3, 1); break;
    }
    tex.refresh();
  }
}

/** Hit spark, 12x12 star. */
export function makeFx(scene: Phaser.Scene) {
  const { tex, ctx } = ctxOf(scene, "fx-hit", 12, 12);
  px(ctx, 5, 0, PAL.yellow, 2, 12); px(ctx, 0, 5, PAL.yellow, 12, 2);
  px(ctx, 2, 2, PAL.yellow, 2, 2); px(ctx, 8, 2, PAL.yellow, 2, 2); px(ctx, 2, 8, PAL.yellow, 2, 2); px(ctx, 8, 8, PAL.yellow, 2, 2);
  px(ctx, 4, 4, PAL.white, 4, 4);
  tex.refresh();
  const w = ctxOf(scene, "fx-web", 8, 8);
  px(w.ctx, 0, 3, PAL.white, 8, 2); px(w.ctx, 3, 0, PAL.white, 2, 8); px(w.ctx, 1, 1, PAL.white, 1, 1); px(w.ctx, 6, 6, PAL.white, 1, 1); px(w.ctx, 6, 1, PAL.white, 1, 1); px(w.ctx, 1, 6, PAL.white, 1, 1);
  w.tex.refresh();
  const p = ctxOf(scene, "px", 1, 1);
  px(p.ctx, 0, 0, PAL.white); p.tex.refresh();
}

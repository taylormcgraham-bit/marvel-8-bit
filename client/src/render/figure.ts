/**
 * Character rig, Minecraft-style: cube head, boxy torso, straight limbs, no hard outline,
 * block texture on every face. One function draws any character in any pose from a palette
 * and a `look`. Output is a 24x34 buffer. Hand-drawn sheets (docs/ART.md) replace it 1:1.
 */
import { Buf, outline, shade, grain, tone } from "./buf";

export const FRAME_W = 24;
export const FRAME_H = 34;

export type Build = "lean" | "normal" | "bulky" | "huge";
export type HeadType = "full-mask" | "cowl" | "helmet" | "face" | "hood" | "skull" | "horned-helm";
export type Prop = "shield" | "hammer" | "tentacles" | "cane" | "club" | "satchel";

export interface Look {
  build: Build;
  head: HeadType;
  cape: boolean;
  emblem: boolean;
  skin: string;
  hair: string;
  props: Prop[];
  visor?: string;
  twoTone: boolean;
}
export interface Palette { primary: string; secondary: string; accent: string }
export type Pose = "idle" | "walk" | "attack" | "hurt" | "ko";
export type Facing = "down" | "up" | "side";

export const DEFAULT_LOOK: Look = {
  build: "normal", head: "full-mask", cape: false, emblem: true, skin: "#f0c0a0", hair: "#3a2a20", props: [], twoTone: true,
};

const INK = "#1a1a24";
const WHITE = "#f8f8f8";

/** Minecraft proportions scaled to the frame: head is a cube, torso a box, limbs straight sticks. */
const BUILDS: Record<Build, { head: number; torsoW: number; torsoH: number; armW: number; legW: number; legH: number }> = {
  lean:   { head: 8, torsoW: 7,  torsoH: 11, armW: 3, legW: 3, legH: 12 },
  normal: { head: 8, torsoW: 8,  torsoH: 11, armW: 4, legW: 4, legH: 12 },
  bulky:  { head: 8, torsoW: 10, torsoH: 12, armW: 5, legW: 5, legH: 11 },
  huge:   { head: 9, torsoW: 12, torsoH: 12, armW: 6, legW: 5, legH: 11 },
};

/** Face/head block, top-left at (x, y), size s. */
function drawHead(b: Buf, x: number, y: number, s: number, look: Look, pal: Palette, facing: Facing) {
  const R = (rx: number, ry: number, rw: number, rh: number, c: string) => b.rect(x + rx, y + ry, rw, rh, c);
  const eyeRow = Math.floor(s / 2) - 1;
  const eyes = (iris: string, white = WHITE) => {
    if (facing === "up") return;
    if (facing === "side") { R(s - 3, eyeRow, 1, 1, white); R(s - 2, eyeRow, 1, 1, iris); return; }
    R(1, eyeRow, 1, 1, white); R(2, eyeRow, 1, 1, iris);
    R(s - 3, eyeRow, 1, 1, iris); R(s - 2, eyeRow, 1, 1, white);
  };
  const lenses = (c: string) => {
    if (facing === "up") return;
    const w = Math.max(2, Math.floor(s / 3));
    if (facing === "side") { R(s - w - 1, eyeRow - 1, w, 2, c); R(s - w - 2, eyeRow - 1, 1, 2, INK); return; }
    R(1, eyeRow - 1, w, 2, c); R(s - w - 1, eyeRow - 1, w, 2, c);
    R(0, eyeRow - 1, 1, 2, tone(pal.primary, -0.4)); R(s - 1, eyeRow - 1, 1, 2, tone(pal.primary, -0.4));
  };
  switch (look.head) {
    case "full-mask": {
      R(0, 0, s, s, pal.primary);
      const web = tone(pal.primary, -0.22);
      if (facing !== "up") { R(Math.floor(s / 2), 0, 1, s, web); R(0, 1, s, 1, web); R(0, s - 2, s, 1, web); R(1, Math.floor(s / 2) + 1, s - 2, 1, web); }
      else { R(Math.floor(s / 2), 0, 1, s, web); R(0, Math.floor(s / 2), s, 1, web); }
      lenses(pal.accent);
      break;
    }
    case "cowl":
      R(0, 0, s, s, pal.primary);
      if (facing !== "up") { R(1, s - 3, s - 2, 3, look.skin); R(2, s - 1, s - 4, 1, tone(look.skin, -0.3)); }
      eyes(INK);
      if (look.emblem && facing === "down") R(Math.floor(s / 2) - 1, 0, 2, 1, pal.accent); // the little A / horns tip
      break;
    case "helmet": {
      R(0, 0, s, s, pal.primary);
      const v = look.visor ?? pal.secondary;
      if (facing !== "up") { R(1, 2, s - 2, s - 3, v); R(1, 2, s - 2, 1, tone(v, 0.25)); }
      if (facing === "side") R(s - 3, eyeRow, 2, 1, pal.accent);
      else if (facing === "down") { R(2, eyeRow, 1, 1, pal.accent); R(s - 3, eyeRow, 1, 1, pal.accent); R(2, s - 2, s - 4, 1, tone(v, -0.3)); }
      break;
    }
    case "face":
      R(0, 0, s, s, look.skin);
      R(0, 0, s, 2, look.hair);
      if (facing === "side") { R(0, 0, 3, 5, look.hair); R(0, 2, 2, s - 2, look.hair); }
      else if (facing === "up") R(0, 0, s, s - 1, look.hair);
      else { R(0, 0, 1, 4, look.hair); R(s - 1, 0, 1, 4, look.hair); }
      eyes(INK);
      if (facing === "down") R(3, s - 2, s - 6, 1, tone(look.skin, -0.35));
      break;
    case "hood":
      R(0, 0, s, s, pal.secondary);
      if (facing !== "up") R(1, 2, s - 2, s - 2, look.skin);
      R(0, 0, s, 2, pal.primary); R(-1, 0, s + 2, 1, pal.primary); // hat brim
      eyes(INK, tone(look.skin, 0.5));
      if (facing === "down") R(2, s - 2, s - 4, 1, tone(look.skin, -0.4)); // grin
      break;
    case "skull":
      R(0, 0, s, s, pal.primary);
      if (facing !== "up") {
        if (facing === "side") R(s - 3, eyeRow - 1, 2, 2, INK);
        else { R(1, eyeRow - 1, 2, 2, INK); R(s - 3, eyeRow - 1, 2, 2, INK); R(Math.floor(s / 2), eyeRow + 1, 1, 1, INK); }
        R(1, s - 2, s - 2, 1, INK); for (let i = 1; i < s - 1; i += 2) R(i, s - 2, 1, 1, tone(pal.primary, 0.5));
      }
      break;
    case "horned-helm":
      R(0, 0, s, s, look.skin);
      R(0, 0, s, 4, pal.accent); R(0, 4, 1, 2, pal.accent); R(s - 1, 4, 1, 2, pal.accent);
      eyes(INK);
      // horns
      R(-2, -3, 2, 4, pal.accent); R(-3, -5, 2, 3, pal.accent); R(-3, -6, 1, 1, pal.accent);
      R(s, -3, 2, 4, pal.accent); R(s + 1, -5, 2, 3, pal.accent); R(s + 2, -6, 1, 1, pal.accent);
      break;
  }
}

/** Build one frame. Feet rest at y = FRAME_H - 2. */
export function drawFigure(look: Look, pal: Palette, facing: Facing, pose: Pose, step = 0): Buf {
  const b = new Buf(FRAME_W, FRAME_H);
  const B = BUILDS[look.build];
  const cx = FRAME_W / 2;
  const feet = FRAME_H - 2;
  const legTop = feet - B.legH;
  const torsoTop = legTop - B.torsoH;
  const headTop = torsoTop - B.head;

  const legC = look.twoTone ? pal.secondary : pal.primary;
  const bootC = tone(look.twoTone ? pal.secondary : pal.primary, -0.5);
  const sleeveC = pal.primary;
  const handC = look.head === "face" || look.head === "cowl" || look.head === "hood" ? look.skin : pal.primary;

  const bob = pose === "walk" ? (step === 1 ? -1 : 0) : pose === "idle" && step === 1 ? 1 : 0;
  const lean = pose === "attack" && facing === "side" ? 1 : pose === "hurt" ? -1 : 0;
  // Minecraft swings arms and legs in opposition
  const swing = pose === "walk" ? (step === 0 ? 1 : step === 2 ? -1 : 0) : 0;

  // ---- cape behind
  if (look.cape) {
    const capeC = tone(pal.secondary, -0.25);
    const cw = B.torsoW + 4, ch = B.torsoH + Math.floor(B.legH * 0.6);
    if (facing === "up") b.rect(cx - cw / 2, torsoTop + bob, cw, ch, pal.secondary);
    else b.rect(cx - cw / 2 + (facing === "side" ? -3 : 0), torsoTop + bob + 1, cw, ch - 1, capeC);
  }
  // ---- props behind
  if (look.props.includes("tentacles")) {
    const t = "#8e8e9e", hi = "#c8c8d8";
    for (const sgn of [-1, 1]) {
      const sx = cx + sgn * (B.torsoW / 2 + 2);
      b.rect(sx - 1, torsoTop - 5 + bob, 2, 12, t); b.rect(sx - 1 + sgn * 2, torsoTop - 9 + bob, 2, 5, t); b.rect(sx - 1 + sgn * 4, torsoTop - 12 + bob, 3, 4, t);
      b.rect(sx - 1 + sgn * 4, torsoTop - 12 + bob, 1, 1, hi); b.rect(sx - 1 + sgn * 5, torsoTop - 11 + bob, 1, 1, "#e04040");
    }
  }
  if (look.props.includes("shield") && facing === "up") {
    const sy = torsoTop + 5 + bob;
    b.rect(cx - 4, sy - 3, 8, 7, pal.secondary); b.rect(cx - 3, sy - 4, 6, 9, pal.secondary);
    b.rect(cx - 2, sy - 2, 4, 5, WHITE); b.rect(cx - 1, sy - 1, 2, 3, pal.primary);
  }

  // ---- legs
  if (facing === "side") {
    const stride = pose === "walk" ? (step === 0 ? 2 : step === 2 ? -2 : 0) : 0;
    b.rect(cx - 1 - stride, legTop, B.legW, B.legH, tone(legC, -0.2));
    b.rect(cx - 1 - stride, feet - 2, B.legW, 2, tone(bootC, -0.1));
    b.rect(cx - B.legW + 1 + stride, legTop, B.legW, B.legH, legC);
    b.rect(cx - B.legW + 1 + stride, feet - 2, B.legW, 2, bootC);
  } else {
    const lx = cx - B.legW, rx = cx;
    const lLift = pose === "walk" ? (step === 0 ? 2 : 0) : 0, rLift = pose === "walk" ? (step === 2 ? 2 : 0) : 0;
    b.rect(lx, legTop, B.legW, B.legH - lLift, legC); b.rect(lx, feet - 2 - lLift, B.legW, 2, bootC);
    b.rect(rx, legTop, B.legW, B.legH - rLift, legC); b.rect(rx, feet - 2 - rLift, B.legW, 2, bootC);
    b.rect(cx, legTop, 1, B.legH, tone(legC, -0.25)); // gap between legs reads as a seam
  }

  // ---- torso
  const tx = cx - B.torsoW / 2 + lean, ty = torsoTop + bob;
  const tw = facing === "side" ? Math.max(4, Math.round(B.torsoW * 0.7)) : B.torsoW;
  const txx = facing === "side" ? cx - tw / 2 + lean : tx;
  b.rect(txx, ty, tw, B.torsoH, pal.primary);
  b.rect(txx, ty + B.torsoH - 2, tw, 2, look.twoTone ? tone(pal.secondary, -0.1) : tone(pal.primary, -0.4)); // belt
  if (!look.twoTone) b.rect(txx + 1, ty + B.torsoH - 2, tw - 2, 1, pal.accent); // buckle line
  if (look.emblem && facing === "down") { b.rect(cx - 1 + lean, ty + 2, 2, 3, pal.accent); b.rect(cx - 2 + lean, ty + 3, 4, 1, pal.accent); }
  if (look.head === "helmet" && facing === "down") b.rect(cx - 1 + lean, ty + 2, 2, 2, pal.accent); // reactor / chest light
  if (look.props.includes("satchel") && facing !== "up") { b.rect(txx + tw - 3, ty + 3, 3, 4, "#6a4a2a"); b.rect(txx + tw - 3, ty + 3, 3, 1, "#8a6a3a"); }
  if ((look.build === "huge" || look.build === "bulky") && facing === "down") b.rect(cx + lean, ty + 1, 1, B.torsoH - 3, tone(pal.primary, -0.14));

  // ---- arms
  const armH = Math.min(B.torsoH + 1, 12);
  if (facing === "side") {
    // back arm (behind body) then front arm
    const ax = cx - B.armW / 2 + lean;
    b.rect(ax - swing * 2, ty, B.armW, armH, tone(sleeveC, -0.22));
    b.rect(ax - swing * 2, ty + armH - 2, B.armW, 2, tone(handC, -0.25));
    if (pose === "attack") {
      b.rect(cx + 1, ty + 2, B.armW + 7, Math.max(2, B.armW - 1), sleeveC);
      b.rect(cx + 1 + B.armW + 6, ty + 2, 2, Math.max(2, B.armW - 1), handC);
    } else {
      b.rect(ax + swing * 2, ty, B.armW, armH, sleeveC);
      b.rect(ax + swing * 2, ty + armH - 2, B.armW, 2, handC);
    }
  } else {
    const spread = pose === "hurt" ? 2 : 0;
    const lArmY = ty + (swing > 0 ? -1 : swing < 0 ? 1 : 0), rArmY = ty + (swing < 0 ? -1 : swing > 0 ? 1 : 0);
    b.rect(tx - B.armW - spread, lArmY, B.armW, armH, sleeveC); b.rect(tx - B.armW - spread, lArmY + armH - 2, B.armW, 2, handC);
    b.rect(tx + B.torsoW + spread, rArmY, B.armW, armH, sleeveC); b.rect(tx + B.torsoW + spread, rArmY + armH - 2, B.armW, 2, handC);
    if (pose === "attack") { b.rect(tx + B.torsoW, ty - 4, B.armW, armH - 2, sleeveC); b.rect(tx + B.torsoW, ty - 4, B.armW, 2, handC); }
  }

  // ---- props in front
  if (look.props.includes("shield") && facing !== "up") {
    const sx = facing === "side" ? cx + 3 : tx - B.armW - 2, sy = ty + 5;
    b.rect(sx - 4, sy - 3, 8, 7, pal.secondary); b.rect(sx - 3, sy - 4, 6, 9, pal.secondary);
    b.rect(sx - 3, sy - 2, 6, 5, WHITE); b.rect(sx - 2, sy - 1, 4, 3, pal.secondary); b.rect(sx - 1, sy, 2, 1, WHITE);
  }
  if (look.props.includes("hammer")) {
    const hx = facing === "side" ? cx + B.armW + 1 : tx + B.torsoW + B.armW;
    b.rect(hx, ty - 3, 2, 13, "#7a5230"); b.rect(hx - 2, ty - 8, 6, 5, "#9c9cae"); b.rect(hx - 2, ty - 8, 6, 1, "#d8d8e8"); b.rect(hx - 2, ty - 4, 6, 1, "#6c6c7e");
  }
  if (look.props.includes("cane") && facing !== "up") {
    const hx = facing === "side" ? cx + B.armW + 2 : tx + B.torsoW + B.armW + 1;
    b.rect(hx, ty + 8, 1, feet - ty - 8, "#2a2a30"); b.rect(hx - 1, ty + 7, 3, 1, pal.accent);
  }
  if (look.props.includes("club") && facing !== "up") {
    const hx = facing === "side" ? cx + B.armW + 1 : tx + B.torsoW + B.armW + 1;
    b.rect(hx, ty + 3, 1, 9, pal.primary); b.rect(hx, ty + 3, 1, 1, pal.accent);
  }

  // ---- head (cube)
  const hs = B.head;
  const hx = cx - Math.floor(hs / 2) + (facing === "side" ? 1 : 0) + lean;
  const hy = headTop + bob + (pose === "hurt" ? 1 : 0);
  drawHead(b, hx, hy, hs, look, pal, facing);

  if (pose === "ko") for (let i = 0; i < b.px.length; i++) if (b.px[i]) b.px[i] = tone(b.px[i]!, -0.35);

  grain(b, 0.06, look.build.length + hs);
  outline(b, "soft");
  shade(b, null, 0.16, 0.26, true);
  return b;
}

/** Portrait: the head block scaled 3x into 32x32, with shoulders. */
export function drawPortrait(look: Look, pal: Palette): Buf {
  const hs = BUILDS[look.build].head;
  const small = new Buf(hs + 4, hs + 4);
  small.rect(0, hs + 2, small.w, 2, pal.primary);
  if (look.cape) small.rect(0, hs + 1, small.w, 3, tone(pal.secondary, -0.2));
  drawHead(small, 2, 1, hs, look, pal, "down");
  grain(small, 0.05, 3);
  outline(small, "soft");
  shade(small, null, 0.16, 0.26, true);
  const k = Math.floor(32 / Math.max(small.w, small.h));
  const big = small.scaled(k);
  const out = new Buf(32, 32);
  out.blit(big, Math.floor((32 - big.w) / 2), Math.max(0, 32 - big.h));
  return out;
}

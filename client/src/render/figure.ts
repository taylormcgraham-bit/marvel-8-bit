/**
 * Character rig. One function draws any character in any pose from a palette and a `look`
 * (build, head type, props). Output is a 24x34 pixel buffer, outlined and shaded.
 * Real sprite sheets (docs/ART.md) replace this one texture key at a time.
 */
import { Buf, outline, shade, tone, mix } from "./buf";

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
  /** helmet faceplate color; defaults to the secondary color */
  visor?: string;
  /** secondary color covers legs (true) or only the belt/trunks (false) */
  twoTone: boolean;
}

export interface Palette { primary: string; secondary: string; accent: string }

export type Pose = "idle" | "walk" | "attack" | "hurt" | "ko";
export type Facing = "down" | "up" | "side";

export const DEFAULT_LOOK: Look = {
  build: "normal", head: "full-mask", cape: false, emblem: true, skin: "#f0c0a0", hair: "#3a2a20", props: [], twoTone: true,
};

const BUILDS: Record<Build, { torsoW: number; torsoH: number; armW: number; legW: number; headW: number; headH: number; shoulder: number }> = {
  lean:   { torsoW: 8,  torsoH: 9,  armW: 2, legW: 3, headW: 7, headH: 7, shoulder: 0 },
  normal: { torsoW: 10, torsoH: 9,  armW: 3, legW: 4, headW: 8, headH: 8, shoulder: 0 },
  bulky:  { torsoW: 13, torsoH: 10, armW: 4, legW: 5, headW: 8, headH: 8, shoulder: 1 },
  huge:   { torsoW: 16, torsoH: 11, armW: 5, legW: 6, headW: 9, headH: 8, shoulder: 2 },
};

/** Draw a head into buf with its top-left at (x, y). Returns nothing; eye placement depends on facing. */
function drawHead(b: Buf, x: number, y: number, w: number, h: number, look: Look, pal: Palette, facing: Facing, k = 1) {
  const R = (rx: number, ry: number, rw: number, rh: number, c: string) => b.rect(x + rx * k, y + ry * k, rw * k, rh * k, c);
  const eyeY = Math.floor(h * 0.42);
  const lensW = Math.max(2, Math.floor(w / 4));
  const eyes = (c: string, outlineEyes = false) => {
    if (facing === "up") return;
    if (facing === "side") { R(w - lensW - 1, eyeY, lensW, 2, c); if (outlineEyes) R(w - lensW - 2, eyeY, 1, 2, tone(c, -0.5)); }
    else { R(1, eyeY, lensW, 2, c); R(w - lensW - 1, eyeY, lensW, 2, c); }
  };
  switch (look.head) {
    case "full-mask":
      R(0, 0, w, h, pal.primary);
      eyes(pal.accent, true);
      // webbing hint: a darker centerline
      if (facing !== "side") R(Math.floor(w / 2), 0, 1, h, tone(pal.primary, -0.12));
      break;
    case "cowl":
      R(0, 0, w, h, pal.primary);
      R(0, Math.floor(h * 0.6), w, Math.ceil(h * 0.4), look.skin); // jaw exposed
      eyes("#fcfcfc");
      if (facing !== "up" && facing !== "side") { R(0, Math.floor(h * 0.6), 1, 2, pal.primary); R(w - 1, Math.floor(h * 0.6), 1, 2, pal.primary); }
      break;
    case "helmet":
      R(0, 0, w, h, pal.primary);
      R(1, Math.floor(h * 0.3), w - 2, Math.ceil(h * 0.55), look.visor ?? pal.secondary); // faceplate
      eyes(pal.accent);
      break;
    case "face":
      R(0, 0, w, h, look.skin);
      R(0, 0, w, Math.max(2, Math.floor(h * 0.3)), look.hair); // hair
      if (facing === "side") R(0, 0, Math.floor(w * 0.35), Math.floor(h * 0.6), look.hair);
      if (facing === "up") R(0, 0, w, Math.floor(h * 0.7), look.hair);
      eyes("#20202c");
      break;
    case "hood":
      R(0, 0, w, h, pal.secondary);
      R(1, Math.floor(h * 0.35), w - 2, Math.ceil(h * 0.65), look.skin); // face inside the hood
      R(0, -2, w, 2, pal.primary); // the hat
      eyes("#20202c");
      break;
    case "skull":
      R(0, 0, w, h, pal.primary);
      eyes("#101010");
      if (facing !== "up") R(1, h - 2, w - 2, 1, "#101010"); // teeth line
      break;
    case "horned-helm":
      R(0, 0, w, h, pal.accent);
      R(0, Math.floor(h * 0.55), w, Math.ceil(h * 0.45), look.skin);
      eyes("#20202c");
      // horns
      R(-2, -4, 2, 5, pal.accent); R(-3, -6, 2, 3, pal.accent);
      R(w, -4, 2, 5, pal.accent); R(w + 1, -6, 2, 3, pal.accent);
      break;
  }
}

/**
 * Build one frame. Coordinates: frame is FRAME_W x FRAME_H; feet rest at y = FRAME_H - 3.
 * `step` is 0..2 for walk, 0..1 for idle.
 */
export function drawFigure(look: Look, pal: Palette, facing: Facing, pose: Pose, step = 0): Buf {
  const b = new Buf(FRAME_W, FRAME_H);
  const B = BUILDS[look.build];
  const cx = FRAME_W / 2;
  const feet = FRAME_H - 3;
  const legH = 8, bootH = 2;
  const torsoTop = feet - legH - B.torsoH;
  const headTop = torsoTop - B.headH - 1;

  const legColor = look.twoTone ? pal.secondary : pal.primary;
  const boot = tone(pal.secondary, -0.45);
  const skin = look.skin;

  // bob: contact frames low, passing frame high
  let bob = 0;
  if (pose === "walk") bob = step === 1 ? -1 : 0;
  if (pose === "idle") bob = step === 1 ? 1 : 0;

  // leg offsets
  let lLegDy = 0, rLegDy = 0, lLegDx = 0, rLegDx = 0;
  if (pose === "walk") {
    if (facing === "side") { lLegDx = step === 0 ? 2 : step === 2 ? -2 : 0; rLegDx = -lLegDx; }
    else { lLegDy = step === 0 ? -2 : 0; rLegDy = step === 2 ? -2 : 0; }
  }

  // ---- cape (behind everything)
  if (look.cape && facing !== "up") {
    const capeC = tone(pal.secondary, -0.2);
    b.rect(cx - B.torsoW / 2 - 1, torsoTop + bob, B.torsoW + 2, B.torsoH + legH - 2, capeC);
  }

  // ---- props drawn behind the body
  if (look.props.includes("tentacles")) {
    const t = "#8a8a9a";
    for (const side of [-1, 1]) {
      const sx = cx + side * (B.torsoW / 2 + 2);
      b.rect(sx, torsoTop - 6 + bob, 2, 10, t); b.rect(sx + side * 2, torsoTop - 9 + bob, 2, 4, t); b.rect(sx + side * 4, torsoTop - 11 + bob, 3, 3, t);
      b.rect(sx + side * 5, torsoTop - 11 + bob, 1, 1, "#d0d0e0");
    }
  }
  if (look.props.includes("shield") && facing === "up") {
    // shield on the back
    b.disc(cx, torsoTop + 4 + bob, 5, pal.secondary); b.disc(cx, torsoTop + 4 + bob, 3, "#fcfcfc"); b.disc(cx, torsoTop + 4 + bob, 1, pal.primary);
  }
  if (look.cape && facing === "up") {
    b.rect(cx - B.torsoW / 2 - 1, torsoTop + bob, B.torsoW + 2, B.torsoH + legH - 2, tone(pal.secondary, -0.2));
  }

  // ---- legs
  if (facing === "side") {
    const back = cx - 2 + rLegDx, front = cx - B.legW + 2 + lLegDx;
    b.rect(back, feet - legH, B.legW, legH, tone(legColor, -0.15));
    b.rect(back, feet - bootH, B.legW, bootH, tone(boot, -0.1));
    b.rect(front, feet - legH, B.legW, legH, legColor);
    b.rect(front, feet - bootH, B.legW, bootH, boot);
  } else {
    const lx = cx - B.legW - 0.5, rx = cx + 0.5;
    b.rect(lx, feet - legH + lLegDy, B.legW, legH, legColor);
    b.rect(rx, feet - legH + rLegDy, B.legW, legH, legColor);
    b.rect(lx, feet - bootH + lLegDy, B.legW, bootH, boot);
    b.rect(rx, feet - bootH + rLegDy, B.legW, bootH, boot);
    // a lifted foot clears the ground
    if (lLegDy) for (let i = 0; i < B.legW; i++) for (let j = 0; j < -lLegDy; j++) b.set(Math.round(lx) + i, feet - 1 - j, null);
    if (rLegDy) for (let i = 0; i < B.legW; i++) for (let j = 0; j < -rLegDy; j++) b.set(Math.round(rx) + i, feet - 1 - j, null);
  }

  // ---- torso
  const tx = cx - B.torsoW / 2, ty = torsoTop + bob;
  const lean = pose === "attack" && facing === "side" ? 1 : pose === "hurt" ? -1 : 0;
  b.rect(tx + lean, ty, B.torsoW, B.torsoH, pal.primary);
  // belt / trunks
  b.rect(tx + lean, ty + B.torsoH - 2, B.torsoW, 2, look.twoTone ? pal.secondary : tone(pal.primary, -0.35));
  if (!look.twoTone) b.rect(tx + lean, ty + B.torsoH - 1, B.torsoW, 1, pal.accent);
  // emblem / chest detail
  if (look.emblem && facing === "down") b.rect(cx - 1 + lean, ty + 2, 2, 3, pal.accent);
  if (look.head === "helmet" && facing === "down") b.disc(cx + lean, ty + 3, 1, pal.accent); // arc reactor
  // muscle line for bulky builds
  if ((look.build === "bulky" || look.build === "huge") && facing !== "up") b.rect(cx + lean, ty + 1, 1, B.torsoH - 3, tone(pal.primary, -0.12));

  // ---- arms
  const armH = Math.min(B.torsoH, 8);
  const swing = pose === "walk" ? (step === 0 ? 1 : step === 2 ? -1 : 0) : 0;
  if (facing === "side") {
    // back arm
    b.rect(cx - 1 - swing, ty + 1, B.armW, armH, tone(pal.primary, -0.18));
    b.rect(cx - 1 - swing, ty + armH, B.armW, 2, tone(skin, -0.2));
    // front arm
    if (pose === "attack") {
      b.rect(cx + 1, ty + 2, B.armW + 6, Math.max(2, B.armW - 1), pal.primary);
      b.rect(cx + 1 + B.armW + 6, ty + 2, 2, Math.max(2, B.armW - 1), skin); // fist
    } else {
      b.rect(cx + swing, ty + 1, B.armW, armH, pal.primary);
      b.rect(cx + swing, ty + armH, B.armW, 2, skin);
    }
  } else {
    const spread = pose === "hurt" ? 2 : 0;
    b.rect(tx - B.armW - spread, ty + 1 + (swing > 0 ? 1 : 0) + B.shoulder, B.armW, armH, pal.primary);
    b.rect(tx - B.armW - spread, ty + armH + 1 + (swing > 0 ? 1 : 0), B.armW, 2, skin);
    b.rect(tx + B.torsoW + spread, ty + 1 + (swing < 0 ? 1 : 0) + B.shoulder, B.armW, armH, pal.primary);
    b.rect(tx + B.torsoW + spread, ty + armH + 1 + (swing < 0 ? 1 : 0), B.armW, 2, skin);
  }

  // ---- props in front
  if (look.props.includes("shield") && facing !== "up") {
    const sx = facing === "side" ? cx + 3 : tx - B.armW - 3;
    const sy = ty + 4;
    b.disc(sx, sy, 5, pal.secondary); b.disc(sx, sy, 3, "#fcfcfc"); b.disc(sx, sy, 2, pal.secondary); b.disc(sx, sy, 1, "#fcfcfc");
  }
  if (look.props.includes("hammer")) {
    const hx = facing === "side" ? cx + B.armW + 1 : tx + B.torsoW + B.armW;
    b.rect(hx, ty - 4, 2, 12, "#7a5a3a"); b.rect(hx - 2, ty - 7, 6, 4, "#9a9aaa"); b.rect(hx - 2, ty - 7, 6, 1, "#d0d0e0");
  }
  if (look.props.includes("cane") && facing !== "up") {
    const hx = facing === "side" ? cx + B.armW + 1 : tx + B.torsoW + B.armW + 1;
    b.rect(hx, ty + 6, 1, feet - ty - 6, "#2a2a30"); b.rect(hx - 1, ty + 5, 3, 1, pal.accent);
  }
  if (look.props.includes("club") && facing !== "up") {
    const hx = facing === "side" ? cx + B.armW + 1 : tx + B.torsoW + B.armW + 1;
    b.rect(hx, ty + 2, 1, 8, pal.primary);
  }

  // ---- head
  const hx = cx - Math.floor(B.headW / 2) + (facing === "side" ? 1 : 0) + lean;
  const hy = headTop + bob + (pose === "hurt" ? 1 : 0);
  // neck
  b.rect(cx - 1 + lean, hy + B.headH, 2, 1, look.head === "face" || look.head === "cowl" ? skin : pal.primary);
  drawHead(b, hx, hy, B.headW, B.headH, look, pal, facing);

  // ---- KO: draw lying down by rotating 90 degrees (rendered via sprite angle in the theater), just dim here
  if (pose === "ko") {
    for (let i = 0; i < b.px.length; i++) if (b.px[i]) b.px[i] = mix(b.px[i]!, "#9a9ab0", 0.5);
  }

  outline(b);
  shade(b);
  return b;
}

/** Portrait: head only, scaled up 3x into a 32x32 buffer with outline and shading. */
export function drawPortrait(look: Look, pal: Palette): Buf {
  const B = BUILDS[look.build];
  const small = new Buf(B.headW + 6, B.headH + 8);
  // shoulders
  small.rect(0, B.headH + 5, small.w, 3, pal.primary);
  if (look.cape) small.rect(0, B.headH + 4, small.w, 4, tone(pal.secondary, -0.2));
  small.rect(3, B.headH + 4, B.headW, 1, look.head === "face" || look.head === "cowl" ? look.skin : pal.primary);
  drawHead(small, 3, 3, B.headW, B.headH, look, pal, "down");
  outline(small);
  shade(small);
  const k = Math.floor(32 / Math.max(small.w, small.h));
  const big = small.scaled(k);
  const out = new Buf(32, 32);
  out.blit(big, Math.floor((32 - big.w) / 2), Math.max(0, 32 - big.h));
  return out;
}

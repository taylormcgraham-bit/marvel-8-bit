/**
 * Voxel character rig in three.js: the same proportions and `look` data as the 2D rig,
 * extruded into boxes. One group per character; limbs are separate meshes so they animate.
 */
import * as THREE from "three";
import type { Look, Palette } from "../render/figure";
import { DEFAULT_LOOK } from "../render/figure";

const U = 1 / 8; // one voxel = 1/8 of a tile

function mat(hex: string, emissive = 0) {
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  if (emissive) m.emissive = new THREE.Color(hex).multiplyScalar(emissive);
  return m;
}
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w * U, h * U, d * U);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x * U, y * U, z * U);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/** Paint a face texture (eyes, lenses, hair) onto a canvas for the head's front face. */
function faceTexture(look: Look, pal: Palette): THREE.CanvasTexture {
  const secondaryOf = (p: Palette) => p.secondary;
  const c = document.createElement("canvas"); c.width = 8; c.height = 8;
  const ctx = c.getContext("2d")!;
  const px = (x: number, y: number, col: string, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const base = look.head === "face" ? look.skin : look.head === "hood" ? secondaryOf(pal) : pal.primary;
  px(0, 0, base, 8, 8);
  switch (look.head) {
    case "full-mask": { const web = shade(pal.primary, -0.22); px(4, 0, web, 1, 8); px(0, 1, web, 8, 1); px(0, 6, web, 8, 1); px(1, 2, pal.accent, 2, 2); px(5, 2, pal.accent, 2, 2); px(0, 2, shade(pal.primary, -0.4), 1, 2); px(7, 2, shade(pal.primary, -0.4), 1, 2); break; }
    case "cowl": px(1, 5, look.skin, 6, 3); px(1, 3, "#f8f8f8"); px(2, 3, "#1a1a24"); px(5, 3, "#1a1a24"); px(6, 3, "#f8f8f8"); break;
    case "helmet": { const v = look.visor ?? pal.secondary; px(1, 2, v, 6, 5); px(1, 2, shade(v, 0.25), 6, 1); px(2, 3, pal.accent); px(5, 3, pal.accent); px(2, 6, shade(v, -0.3), 4, 1); break; }
    case "face": px(0, 0, look.hair, 8, 2); px(0, 0, look.hair, 1, 4); px(7, 0, look.hair, 1, 4); px(1, 3, "#f8f8f8"); px(2, 3, "#1a1a24"); px(5, 3, "#1a1a24"); px(6, 3, "#f8f8f8"); px(3, 6, shade(look.skin, -0.35), 2, 1); break;
    case "hood": px(1, 2, look.skin, 6, 6); px(0, 0, pal.primary, 8, 2); px(1, 3, "#f8f8f8"); px(2, 3, "#1a1a24"); px(5, 3, "#1a1a24"); px(6, 3, "#f8f8f8"); px(2, 6, shade(look.skin, -0.4), 4, 1); break;
    case "skull": px(1, 2, "#101010", 2, 2); px(5, 2, "#101010", 2, 2); px(4, 4, "#101010"); px(1, 6, "#101010", 6, 1); for (let i = 1; i < 7; i += 2) px(i, 6, shade(pal.primary, 0.5)); break;
    case "horned-helm": px(0, 0, pal.accent, 8, 4); px(1, 4, "#f8f8f8"); px(2, 4, "#1a1a24"); px(5, 4, "#1a1a24"); px(6, 4, "#f8f8f8"); break;
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shade(hex: string, k: number) { const c = new THREE.Color(hex); const t = k > 0 ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0); c.lerp(t, Math.abs(k)); return "#" + c.getHexString(); }

export interface VoxelFigure { group: THREE.Group; lArm: THREE.Mesh; rArm: THREE.Mesh; lLeg: THREE.Mesh; rLeg: THREE.Mesh; head: THREE.Mesh; setWalk(t: number): void; setIdle(t: number): void }

export function makeVoxelFigure(pal: Palette, lookIn: Partial<Look> | undefined): VoxelFigure {
  const look: Look = { ...DEFAULT_LOOK, ...(lookIn ?? {}) };
  const B = { lean: [7, 11, 3, 3], normal: [8, 11, 4, 4], bulky: [10, 12, 5, 5], huge: [12, 12, 6, 5] }[look.build] as [number, number, number, number];
  const [torsoW, torsoH, armW, legW] = B;
  const legH = 12, headS = look.build === "huge" ? 9 : 8;
  const g = new THREE.Group();
  const prim = mat(pal.primary), sec = mat(pal.secondary), skin = mat(look.skin);
  const legM = look.twoTone ? sec : prim;
  const bootM = mat(shade(look.twoTone ? pal.secondary : pal.primary, -0.5));

  // legs (pivot at hip)
  const mkLeg = (x: number) => { const pivot = new THREE.Group(); pivot.position.set(x * U, legH * U, 0); const leg = box(legW, legH, legW, legM, 0, -legH / 2, 0); const boot = box(legW, 2, legW + 1, bootM, 0, -legH + 1, 0.5); pivot.add(leg, boot); g.add(pivot); return pivot; };
  const lLegP = mkLeg(-legW / 2 - 0.5), rLegP = mkLeg(legW / 2 + 0.5);
  // torso
  const torso = box(torsoW, torsoH, Math.max(4, torsoW * 0.55), prim, 0, legH + torsoH / 2, 0);
  g.add(torso);
  const belt = box(torsoW + 0.2, 2, Math.max(4, torsoW * 0.55) + 0.2, look.twoTone ? sec : mat(shade(pal.primary, -0.4)), 0, legH + 1, 0); g.add(belt);
  if (look.emblem) g.add(box(3, 3, 0.4, mat(pal.accent, 0.3), 0, legH + torsoH * 0.65, torsoW * 0.28));
  if (look.head === "helmet") g.add(box(2, 2, 0.4, mat(pal.accent, 0.8), 0, legH + torsoH * 0.7, torsoW * 0.28));
  // arms (pivot at shoulder)
  const mkArm = (x: number) => { const pivot = new THREE.Group(); pivot.position.set(x * U, (legH + torsoH - 1) * U, 0); const arm = box(armW, torsoH, armW, prim, 0, -torsoH / 2 + 1, 0); const hand = box(armW, 2, armW, look.head === "face" || look.head === "cowl" || look.head === "hood" ? skin : prim, 0, -torsoH + 2, 0); pivot.add(arm, hand); g.add(pivot); return pivot; };
  const lArmP = mkArm(-torsoW / 2 - armW / 2), rArmP = mkArm(torsoW / 2 + armW / 2);
  // head with face texture on the front
  const face = faceTexture(look, pal);
  const headBase = look.head === "face" ? look.skin : look.head === "hood" ? pal.secondary : look.head === "horned-helm" ? look.skin : pal.primary;
  const side = mat(headBase);
  const top = mat(look.head === "face" ? look.hair : look.head === "horned-helm" ? pal.accent : headBase);
  const headMats = [side, side, top, side, new THREE.MeshLambertMaterial({ map: face }), side];
  const head = new THREE.Mesh(new THREE.BoxGeometry(headS * U, headS * U, headS * U), headMats);
  head.position.set(0, (legH + torsoH + headS / 2 + 0.5) * U, 0); head.castShadow = true; g.add(head);
  if (look.head === "horned-helm") { g.add(box(1.5, 5, 1.5, mat(pal.accent), -headS / 2 - 0.5, legH + torsoH + headS + 1, 0)); g.add(box(1.5, 5, 1.5, mat(pal.accent), headS / 2 + 0.5, legH + torsoH + headS + 1, 0)); }
  if (look.cape) { const cape = box(torsoW + 4, torsoH + legH * 0.6, 1, mat(shade(pal.secondary, -0.25)), 0, legH + torsoH / 2 - legH * 0.3, -Math.max(4, torsoW * 0.55) / 2 - 0.6); g.add(cape); }
  // props
  if (look.props.includes("shield")) { const s = new THREE.Mesh(new THREE.CylinderGeometry(5 * U, 5 * U, 0.6 * U, 24), [mat(pal.secondary), mat("#f8f8f8"), mat(pal.secondary)]); s.rotation.z = Math.PI / 2; s.position.set((-torsoW / 2 - armW - 1) * U, (legH + torsoH / 2) * U, 0); s.castShadow = true; g.add(s); }
  if (look.props.includes("hammer")) { g.add(box(1.5, 12, 1.5, mat("#7a5230"), torsoW / 2 + armW + 1, legH + torsoH - 2, 2)); g.add(box(6, 4, 4, mat("#9c9cae"), torsoW / 2 + armW + 1, legH + torsoH + 5, 2)); }
  if (look.props.includes("tentacles")) { for (const sgn of [-1, 1]) { const t = box(2, 14, 2, mat("#8e8e9e"), sgn * (torsoW / 2 + 2), legH + torsoH + 4, -3); t.rotation.z = -sgn * 0.5; g.add(t); const tip = box(3, 3, 3, mat("#8e8e9e"), sgn * (torsoW / 2 + 8), legH + torsoH + 11, -3); g.add(tip); } }
  if (look.props.includes("cane")) g.add(box(1, legH + 8, 1, mat("#2a2a30"), torsoW / 2 + armW + 2, (legH + 8) / 2, 2));

  const fig: VoxelFigure = {
    group: g, lArm: lArmP as unknown as THREE.Mesh, rArm: rArmP as unknown as THREE.Mesh, lLeg: lLegP as unknown as THREE.Mesh, rLeg: rLegP as unknown as THREE.Mesh, head,
    setWalk(t) { const a = Math.sin(t * 10) * 0.6; lLegP.rotation.x = a; rLegP.rotation.x = -a; lArmP.rotation.x = -a; rArmP.rotation.x = a; g.position.y = Math.abs(Math.sin(t * 10)) * 0.04; },
    setIdle(t) { lLegP.rotation.x = 0; rLegP.rotation.x = 0; lArmP.rotation.x = Math.sin(t * 2) * 0.05; rArmP.rotation.x = -Math.sin(t * 2) * 0.05; head.rotation.y = Math.sin(t * 0.7) * 0.15; g.position.y = 0; },
  };
  return fig;
}

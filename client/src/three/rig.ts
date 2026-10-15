/**
 * Stylized low-poly character rig: rounded head, tapered torso, capsule limbs, hands and
 * boots, with costume details driven by each character's `look` (mask type, emblem, cape,
 * props). Cel-shaded with outlines. Procedural animation: idle, walk, attack, hurt, KO.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Look, Palette } from "../render/figure";
import { DEFAULT_LOOK } from "../render/figure";
import { toon, outlined, shadeHex, canvasTexture } from "./materials";

export type Pose = "idle" | "walk" | "attack" | "hurt" | "ko";

export interface Rig {
  group: THREE.Group;
  height: number;
  setPose(pose: Pose, t: number, strength?: number): void;
  face(dirRad: number): void;
}

const INK = "#1a1a24";
const WHITE = "#f8f8f8";

function rbox(w: number, h: number, d: number, m: THREE.Material, r = 0.08) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.2)), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return outlined(mesh);
}
function capsule(r: number, len: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  mesh.castShadow = true;
  return outlined(mesh);
}
function sphere(r: number, m: THREE.Material, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
  mesh.castShadow = true;
  return outlined(mesh);
}

/** Chest emblem textures by symbol. */
function emblemTexture(symbol: string, fg: string, bg: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.lineCap = "round";
    const cx = 32, cy = 32;
    switch (symbol) {
      case "spider": {
        ctx.beginPath(); ctx.ellipse(cx, cy + 4, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy - 10, 5, 0, Math.PI * 2); ctx.fill();
        for (const [a, b] of [[-26, -18], [-30, -4], [-28, 10], [-20, 22], [26, -18], [30, -4], [28, 10], [20, 22]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + a!, cy + b!); ctx.stroke(); }
        break;
      }
      case "star": {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); break;
      }
      case "dd": { ctx.font = "bold 34px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("DD", cx, cy + 2); break; }
      case "arc": { ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); break; }
      case "skull": { ctx.beginPath(); ctx.arc(cx, cy - 4, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - 10, cy + 6, 20, 12); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx - 6, cy - 6, 4, 0, Math.PI * 2); ctx.arc(cx + 6, cy - 6, 4, 0, Math.PI * 2); ctx.fill(); break; }
      case "bolt": { ctx.beginPath(); ctx.moveTo(cx + 6, cy - 24); ctx.lineTo(cx - 10, cy + 4); ctx.lineTo(cx + 2, cy + 4); ctx.lineTo(cx - 6, cy + 24); ctx.lineTo(cx + 12, cy - 6); ctx.lineTo(cx, cy - 6); ctx.closePath(); ctx.fill(); break; }
      case "mask": { ctx.fillRect(cx - 14, cy - 16, 28, 32); ctx.fillStyle = bg; ctx.fillRect(cx - 9, cy - 6, 6, 4); ctx.fillRect(cx + 3, cy - 6, 6, 4); ctx.fillRect(cx - 8, cy + 6, 16, 3); break; }
    }
  });
}

const EMBLEM_BY_ID: Record<string, string> = {
  "spider-man": "spider", "captain-america": "star", "daredevil": "dd", "iron-man": "arc", "red-skull": "skull", "thor": "bolt", "doctor-doom": "mask",
};

export function makeRig(id: string, pal: Palette, lookIn: Partial<Look> | undefined): Rig {
  const look: Look = { ...DEFAULT_LOOK, ...(lookIn ?? {}) };
  const g = new THREE.Group();
  // proportions (world units: a tile is 1). Heroic chibi: big head, broad chest.
  const P = {
    lean:   { torsoW: 0.42, torsoD: 0.26, torsoH: 0.5, armR: 0.065, legR: 0.075, head: 0.3, shoulder: 0.07 },
    normal: { torsoW: 0.48, torsoD: 0.3, torsoH: 0.52, armR: 0.075, legR: 0.085, head: 0.31, shoulder: 0.08 },
    bulky:  { torsoW: 0.62, torsoD: 0.36, torsoH: 0.58, armR: 0.1, legR: 0.1, head: 0.31, shoulder: 0.11 },
    huge:   { torsoW: 0.78, torsoD: 0.44, torsoH: 0.64, armR: 0.13, legR: 0.12, head: 0.34, shoulder: 0.14 },
  }[look.build];
  const legLen = 0.46, bootH = 0.12;
  const hipY = legLen + bootH;
  const chestY = hipY + P.torsoH / 2;
  const neckY = hipY + P.torsoH;
  const headY = neckY + P.head + 0.03;

  const prim = toon(pal.primary), sec = toon(pal.secondary), acc = toon(pal.accent, { emissive: 0.15 });
  const skin = toon(look.skin), hair = toon(look.hair);
  const dark = toon(shadeHex(look.twoTone ? pal.secondary : pal.primary, -0.5));
  const legM = look.twoTone ? sec : prim;
  const gloveM = look.head === "face" || look.head === "cowl" || look.head === "hood" ? skin : look.twoTone ? sec : prim;

  // ---- legs: hip pivot -> thigh capsule -> boot
  const mkLeg = (x: number) => {
    const hip = new THREE.Group(); hip.position.set(x, hipY, 0);
    const thigh = capsule(P.legR, legLen - P.legR * 2, legM); thigh.position.y = -legLen / 2; hip.add(thigh);
    const boot = rbox(P.legR * 2.3, bootH, P.legR * 2.9, dark, 0.04); boot.position.set(0, -legLen - bootH / 2 + 0.02, P.legR * 0.3); hip.add(boot);
    g.add(hip); return hip;
  };
  const lHip = mkLeg(-P.torsoW * 0.22), rHip = mkLeg(P.torsoW * 0.22);
  // ---- torso: tapered rounded box (wider at the chest)
  const torso = rbox(P.torsoW, P.torsoH, P.torsoD, prim, 0.09);
  torso.position.y = chestY; g.add(torso);
  const pelvis = rbox(P.torsoW * 0.86, P.torsoH * 0.3, P.torsoD * 0.9, look.twoTone ? sec : toon(shadeHex(pal.primary, -0.35)), 0.06);
  pelvis.position.y = hipY + P.torsoH * 0.14; g.add(pelvis);
  const belt = rbox(P.torsoW * 0.9, 0.05, P.torsoD * 0.95, look.twoTone ? toon(shadeHex(pal.secondary, -0.3)) : acc, 0.02);
  belt.position.y = hipY + P.torsoH * 0.3; g.add(belt);
  // shoulders
  for (const sx of [-1, 1]) { const s = sphere(P.shoulder, prim); s.position.set(sx * (P.torsoW / 2 + P.shoulder * 0.4), neckY - P.shoulder * 0.9, 0); g.add(s); }
  // chest emblem
  const symbol = EMBLEM_BY_ID[id] ?? (look.emblem ? "star" : "");
  if (symbol) {
    const tex = emblemTexture(symbol, symbol === "spider" ? INK : pal.accent, pal.primary);
    const em = new THREE.Mesh(new THREE.PlaneGeometry(P.torsoW * 0.5, P.torsoW * 0.5), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#ffffff").gradientMap, transparent: true }));
    em.position.set(0, chestY + P.torsoH * 0.1, P.torsoD / 2 + 0.004); g.add(em);
  }
  if (look.head === "helmet") { const core = sphere(0.045, toon(pal.accent, { emissive: 1.2 }), 10); core.position.set(0, chestY + P.torsoH * 0.12, P.torsoD / 2 + 0.01); g.add(core); }
  // ---- arms: shoulder pivot -> upper capsule -> hand sphere
  const armLen = P.torsoH * 0.95;
  const mkArm = (x: number) => {
    const sh = new THREE.Group(); sh.position.set(x, neckY - P.shoulder, 0);
    const upper = capsule(P.armR, armLen - P.armR * 2, prim); upper.position.y = -armLen / 2; sh.add(upper);
    const hand = sphere(P.armR * 1.15, gloveM, 10); hand.position.y = -armLen - P.armR * 0.3; sh.add(hand);
    g.add(sh); return sh;
  };
  const lSh = mkArm(-(P.torsoW / 2 + P.armR * 1.1)), rSh = mkArm(P.torsoW / 2 + P.armR * 1.1);
  // ---- head
  const headGroup = new THREE.Group(); headGroup.position.y = headY; g.add(headGroup);
  const neck = capsule(0.06, 0.04, look.head === "face" || look.head === "cowl" ? skin : prim); neck.position.y = -P.head - 0.02; headGroup.add(neck);
  const headBase = look.head === "face" ? skin : look.head === "hood" ? sec : look.head === "horned-helm" ? skin : prim;
  const head = rbox(P.head * 1.9, P.head * 2, P.head * 1.8, headBase, 0.14); headGroup.add(head);
  const fz = P.head * 0.9; // front face z
  const eye = (x: number, w: number, h: number, m: THREE.Material, z = fz) => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m); e.scale.set(w, h, 0.03); e.position.set(x, 0.02, z); headGroup.add(e); return e; };
  const dot = (x: number, r: number, m: THREE.Material, y = 0.02, z = fz + 0.005) => { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); e.position.set(x, y, z); headGroup.add(e); return e; };
  switch (look.head) {
    case "full-mask": {
      // big almond lenses with a dark rim
      for (const sx of [-1, 1]) { const rim = eye(sx * 0.12, 0.12, 0.09, toon(INK)); rim.rotation.z = sx * 0.4; const lens = eye(sx * 0.12, 0.1, 0.07, toon(pal.accent, { emissive: 0.1 }), fz + 0.01); lens.rotation.z = sx * 0.4; }
      // web lines as a thin texture band is overkill; a subtle darker center stripe reads as webbing
      const stripe = rbox(0.02, P.head * 1.9, 0.01, toon(shadeHex(pal.primary, -0.2)), 0.005); stripe.position.set(0, 0, fz); headGroup.add(stripe);
      break;
    }
    case "cowl": {
      const jaw = rbox(P.head * 1.6, P.head * 0.7, P.head * 0.5, skin, 0.08); jaw.position.set(0, -P.head * 0.6, fz - P.head * 0.2); headGroup.add(jaw);
      for (const sx of [-1, 1]) { eye(sx * 0.1, 0.045, 0.035, toon(WHITE)); dot(sx * 0.1, 0.018, toon(INK)); }
      if (id === "captain-america") for (const sx of [-1, 1]) { const wing = rbox(0.03, 0.08, 0.12, toon(WHITE), 0.01); wing.position.set(sx * P.head * 0.95, P.head * 0.2, 0); headGroup.add(wing); }
      if (id === "daredevil") for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), prim); horn.position.set(sx * P.head * 0.55, P.head * 1.0, 0.05); horn.rotation.z = -sx * 0.25; headGroup.add(outlined(horn)); }
      break;
    }
    case "helmet": {
      const plate = rbox(P.head * 1.5, P.head * 1.3, 0.05, toon(look.visor ?? pal.secondary), 0.05); plate.position.set(0, -P.head * 0.1, fz - 0.01); headGroup.add(plate);
      for (const sx of [-1, 1]) eye(sx * 0.1, 0.06, 0.025, toon(pal.accent, { emissive: 1.5 }), fz + 0.035);
      const mouth = rbox(0.14, 0.015, 0.01, toon(shadeHex(look.visor ?? pal.secondary, -0.4)), 0.004); mouth.position.set(0, -P.head * 0.5, fz + 0.03); headGroup.add(mouth);
      break;
    }
    case "face": {
      const cap = rbox(P.head * 1.95, P.head * 0.9, P.head * 1.85, hair, 0.14); cap.position.set(0, P.head * 0.6, -0.02); headGroup.add(cap);
      for (const sx of [-1, 1]) { eye(sx * 0.1, 0.045, 0.04, toon(WHITE)); dot(sx * 0.1, 0.02, toon(INK)); }
      const brow = rbox(0.3, 0.02, 0.01, hair, 0.005); brow.position.set(0, 0.1, fz); headGroup.add(brow);
      const mouth = rbox(0.1, 0.012, 0.01, toon(shadeHex(look.skin, -0.4)), 0.004); mouth.position.set(0, -0.12, fz); headGroup.add(mouth);
      break;
    }
    case "hood": {
      const hood = rbox(P.head * 2.1, P.head * 2.1, P.head * 1.9, sec, 0.16); hood.position.set(0, 0.03, -0.03); headGroup.add(hood);
      const faceM = rbox(P.head * 1.5, P.head * 1.4, 0.06, skin, 0.08); faceM.position.set(0, -0.03, fz + 0.01); headGroup.add(faceM);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(P.head * 1.1, P.head * 1.6, 10), prim); hat.position.set(0, P.head * 1.6, -0.05); hat.rotation.x = -0.35; headGroup.add(outlined(hat));
      for (const sx of [-1, 1]) { eye(sx * 0.09, 0.04, 0.03, toon("#ffd860", { emissive: 0.6 }), fz + 0.045); }
      const grin = rbox(0.16, 0.02, 0.01, toon(INK), 0.004); grin.position.set(0, -0.11, fz + 0.045); headGroup.add(grin);
      break;
    }
    case "skull": {
      for (const sx of [-1, 1]) dot(sx * 0.1, 0.045, toon(INK), 0.03, fz - 0.01);
      const nose = dot(0, 0.02, toon(INK), -0.05, fz - 0.005); void nose;
      const teeth = rbox(0.22, 0.04, 0.02, toon(WHITE), 0.004); teeth.position.set(0, -0.16, fz); headGroup.add(teeth);
      break;
    }
    case "horned-helm": {
      const helm = rbox(P.head * 2.0, P.head * 1.1, P.head * 1.9, acc, 0.14); helm.position.set(0, P.head * 0.55, -0.01); headGroup.add(helm);
      for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 12, Math.PI * 0.9), acc); horn.position.set(sx * P.head * 0.9, P.head * 0.9, 0); horn.rotation.y = sx * Math.PI / 2; horn.rotation.z = sx > 0 ? 0 : Math.PI; headGroup.add(outlined(horn)); }
      for (const sx of [-1, 1]) { eye(sx * 0.1, 0.045, 0.04, toon(WHITE)); dot(sx * 0.1, 0.02, toon("#2a6a2a")); }
      break;
    }
  }
  // ---- cape: a tapered plane behind the torso, swayed in animation
  let cape: THREE.Mesh | null = null;
  if (look.cape) {
    const geo = new THREE.PlaneGeometry(P.torsoW * 1.3, P.torsoH + legLen * 0.8, 1, 6);
    cape = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: new THREE.Color(shadeHex(pal.secondary, -0.15)), gradientMap: toon("#ffffff").gradientMap, side: THREE.DoubleSide }));
    cape.castShadow = true;
    cape.position.set(0, neckY - (P.torsoH + legLen * 0.8) / 2 + 0.02, -P.torsoD / 2 - 0.02);
    g.add(cape);
  }
  // ---- props
  if (look.props.includes("shield")) {
    const tex = canvasTexture(128, 128, (ctx) => { const rings = [[64, pal.secondary], [50, WHITE], [36, pal.secondary], [22, pal.primary]] as [number, string][]; for (const [r, c] of rings) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = WHITE; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); });
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), [toon(pal.secondary), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon("#ffffff").gradientMap }), toon(pal.secondary)]);
    shield.rotation.z = Math.PI / 2; shield.rotation.y = Math.PI / 2; shield.position.set(-(P.torsoW / 2 + P.armR * 1.1 + 0.05), chestY - 0.05, 0.02); shield.castShadow = true; g.add(outlined(shield, 0.02));
  }
  if (look.props.includes("hammer")) {
    const h = new THREE.Group(); h.position.set(P.torsoW / 2 + P.armR * 1.1, chestY - 0.1, 0.12);
    const handle = capsule(0.025, 0.35, toon("#7a5230")); h.add(handle);
    const headM = rbox(0.22, 0.14, 0.14, toon("#9c9cae"), 0.03); headM.position.y = 0.22; h.add(headM);
    g.add(h);
  }
  if (look.props.includes("tentacles")) {
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * P.torsoW * 0.3, chestY, -P.torsoD / 2), new THREE.Vector3(sx * (P.torsoW * 0.6 + k * 0.2), chestY + 0.3 + k * 0.1, -0.3), new THREE.Vector3(sx * (P.torsoW + 0.3 + k * 0.1), chestY + 0.8 + k * 0.2, -0.1 + k * 0.2), new THREE.Vector3(sx * (P.torsoW + 0.45 + k * 0.1), chestY + 1.0 + k * 0.15, 0.25)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.04, 8, false), toon("#8e8e9e")); tube.castShadow = true; g.add(outlined(tube, 0.02));
      const claw = sphere(0.06, toon("#c8c8d8"), 8); claw.position.copy(curve.getPoint(1)); g.add(claw);
      const eyeDot = sphere(0.02, toon("#e04040", { emissive: 1.5 }), 6); eyeDot.position.copy(curve.getPoint(1)).add(new THREE.Vector3(0, 0, 0.06)); g.add(eyeDot);
    }
  }
  if (look.props.includes("cane")) { const c = capsule(0.018, 0.7, toon("#2a2a30")); c.position.set(P.torsoW / 2 + P.armR * 2.2, 0.4, 0.1); g.add(c); const top = sphere(0.035, toon(pal.accent), 8); top.position.set(P.torsoW / 2 + P.armR * 2.2, 0.78, 0.1); g.add(top); }
  if (look.props.includes("club")) { const c = capsule(0.02, 0.3, prim); c.position.set(P.torsoW / 2 + P.armR * 2.0, chestY - 0.1, 0.1); c.rotation.z = 0.3; g.add(c); }
  if (look.props.includes("satchel")) { const s = rbox(0.14, 0.12, 0.08, toon("#6a4a2a"), 0.03); s.position.set(P.torsoW / 2 + 0.02, hipY + 0.1, 0.1); g.add(s); }

  const height = headY + P.head;
  // everything animates on an inner body group so the root keeps its world position
  const body = new THREE.Group(); body.add(...g.children); g.add(body);
  let koApplied = false;
  const rig: Rig = {
    group: g, height,
    face(dir) { g.rotation.y = dir; },
    setPose(pose, t, strength = 1) {
      const sw = Math.sin(t * 9);
      if (pose === "ko") {
        if (!koApplied) { body.rotation.z = Math.PI / 2 * 0.98; body.position.y = 0.25; koApplied = true; }
        return;
      }
      if (koApplied) { body.rotation.z = 0; body.position.y = 0; koApplied = false; }
      switch (pose) {
        case "walk":
          lHip.rotation.x = sw * 0.7 * strength; rHip.rotation.x = -sw * 0.7 * strength;
          lSh.rotation.x = -sw * 0.6 * strength; rSh.rotation.x = sw * 0.6 * strength;
          body.position.y = Math.abs(sw) * 0.025; torso.rotation.y = sw * 0.06; headGroup.rotation.y = -sw * 0.04;
          break;
        case "idle":
          lHip.rotation.x = 0; rHip.rotation.x = 0;
          lSh.rotation.x = Math.sin(t * 1.6) * 0.06; rSh.rotation.x = -Math.sin(t * 1.6) * 0.06; lSh.rotation.z = 0.08; rSh.rotation.z = -0.08;
          body.position.y = 0; torso.rotation.y = 0; torso.position.y = chestY + Math.sin(t * 1.6) * 0.008; headGroup.rotation.y = Math.sin(t * 0.6) * 0.18; headGroup.rotation.x = Math.sin(t * 0.9) * 0.04;
          break;
        case "attack": {
          const k = Math.min(1, strength);
          rSh.rotation.x = -2.2 * k; rSh.rotation.z = -0.15; lSh.rotation.x = 0.6 * k; torso.rotation.y = -0.5 * k; headGroup.rotation.y = 0.3 * k;
          lHip.rotation.x = 0.4 * k; rHip.rotation.x = -0.3 * k; body.position.y = 0;
          break;
        }
        case "hurt": {
          const k = Math.min(1, strength);
          torso.rotation.x = -0.35 * k; headGroup.rotation.x = -0.3 * k; lSh.rotation.x = -1.2 * k; rSh.rotation.x = -1.2 * k; lSh.rotation.z = 0.6 * k; rSh.rotation.z = -0.6 * k; body.position.y = 0;
          break;
        }
      }
      if (pose !== "hurt") torso.rotation.x = 0;
      if (cape) { const pos = cape.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const depth = Math.max(0, -y); pos.setZ(i, -Math.sin(t * 2 + depth * 4) * depth * 0.12 - depth * (pose === "walk" ? 0.35 : 0.12)); } pos.needsUpdate = true; cape.geometry.computeVertexNormals(); }
    },
  };
  return rig;
}

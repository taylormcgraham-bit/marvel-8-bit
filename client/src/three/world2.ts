/**
 * Detailed stylized world builder: textured tiles, bevelled raised blocks, props with real
 * parts, lights, and a backdrop (sky dome, skyline, mountains). Same MapDef as the 2D theater.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { MapDef, Tile, PropKind } from "@shared/maps";
import { toon, outlined, shadeHex, canvasTexture } from "./materials";

/* ------------------------------------------------------------------ textures */
const texCache = new Map<string, THREE.CanvasTexture>();
function tex(name: string, make: () => THREE.CanvasTexture) { let t = texCache.get(name); if (!t) { t = make(); texCache.set(name, t); } return t; }
const noise = (ctx: CanvasRenderingContext2D, w: number, h: number, amt: number, seed = 1) => {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const k = (i / 4); let hsh = (k * 374761393 + seed * 668265263) >>> 0; hsh = (hsh ^ (hsh >>> 13)) * 1274126177 >>> 0; const r = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967295; const v = (r - 0.5) * amt * 255; d[i] = Math.max(0, Math.min(255, d[i]! + v)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + v)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + v)); }
  ctx.putImageData(img, 0, 0);
};
const T = {
  brick: () => tex("brick", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#b8a890"; ctx.fillRect(0, 0, 128, 128); for (let row = 0; row < 8; row++) { const y = row * 16, off = row % 2 ? 16 : 0; for (let x = -32; x < 128; x += 32) { ctx.fillStyle = `hsl(${12 + (row * 7 + x) % 9}, 45%, ${38 + ((row * 13 + x) % 10)}%)`; ctx.fillRect(x + off + 2, y + 2, 28, 12); } } noise(ctx, 128, 128, 0.08); })),
  gravel: () => tex("gravel", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#5a5a64"; ctx.fillRect(0, 0, 128, 128); for (let i = 0; i < 700; i++) { const x = (i * 97) % 128, y = (i * 61) % 128; ctx.fillStyle = i % 3 ? "#6a6a74" : "#4a4a54"; ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 2)); } noise(ctx, 128, 128, 0.1); })),
  asphalt: () => tex("asphalt", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#34343c"; ctx.fillRect(0, 0, 128, 128); noise(ctx, 128, 128, 0.14, 3); })),
  sidewalk: () => tex("sidewalk", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#9a9aa2"; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = "#6e6e76"; ctx.lineWidth = 3; for (let i = 0; i <= 128; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke(); } noise(ctx, 128, 128, 0.08, 5); })),
  marble: () => tex("marble", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#e0e0e8"; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = "#b8b8c4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 100); ctx.bezierCurveTo(40, 60, 70, 90, 120, 20); ctx.stroke(); ctx.strokeStyle = "#c8c8d4"; ctx.strokeRect(1, 1, 126, 126); noise(ctx, 128, 128, 0.04, 7); })),
  carpet: () => tex("carpet", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#5a3448"; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = "#6e4458"; for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) if ((x + y) % 32 === 0) ctx.fillRect(x + 4, y + 4, 8, 8); noise(ctx, 128, 128, 0.06, 9); })),
  flagstone: () => tex("flagstone", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#4e4e58"; ctx.fillRect(0, 0, 128, 128); const stones = [[0, 0, 56, 48], [60, 0, 68, 40], [0, 52, 40, 76], [44, 44, 44, 40], [92, 44, 36, 36], [48, 88, 80, 40]]; stones.forEach(([x, y, w, h], i) => { ctx.fillStyle = `hsl(240, 6%, ${40 + (i * 7) % 12}%)`; ctx.fillRect(x!, y!, w! - 4, h! - 4); }); noise(ctx, 128, 128, 0.08, 11); })),
  stoneblock: () => tex("stoneblock", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#22222c"; ctx.fillRect(0, 0, 128, 128); for (let row = 0; row < 4; row++) { const y = row * 32, off = row % 2 ? 32 : 0; for (let x = -64; x < 128; x += 64) { ctx.fillStyle = `hsl(240, 8%, ${28 + (row * 5 + x / 8) % 8}%)`; ctx.fillRect(x + off + 3, y + 3, 58, 26); } } noise(ctx, 128, 128, 0.08, 13); })),
  facade: () => tex("facade", () => canvasTexture(128, 256, (ctx) => { ctx.fillStyle = "#6a6a78"; ctx.fillRect(0, 0, 128, 256); for (let y = 0; y < 256; y += 32) { ctx.fillStyle = "#4a4a56"; ctx.fillRect(0, y + 29, 128, 3); } for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 3; fx++) { const x = 12 + fx * 40, y = 20 + fy * 56; ctx.fillStyle = "#1e2a44"; ctx.fillRect(x, y, 24, 36); ctx.fillStyle = (fx + fy) % 3 ? "#6a9ad0" : "#ffd880"; ctx.fillRect(x + 3, y + 3, 18, 14); ctx.fillStyle = "#3a5a8a"; ctx.fillRect(x + 3, y + 20, 18, 13); } noise(ctx, 128, 256, 0.05, 15); })),
  windows: () => tex("windows", () => canvasTexture(64, 128, (ctx) => { ctx.fillStyle = "#101a30"; ctx.fillRect(0, 0, 64, 128); for (let y = 6; y < 128; y += 14) for (let x = 6; x < 64; x += 14) { let h = (x * 31 + y * 17) % 7; ctx.fillStyle = h > 3 ? "#ffd880" : h > 1 ? "#3a5a8a" : "#101a30"; ctx.fillRect(x, y, 8, 8); } })),
  banner: (hex: string) => tex("banner" + hex, () => canvasTexture(64, 128, (ctx) => { ctx.fillStyle = hex; ctx.fillRect(0, 0, 64, 128); ctx.fillStyle = "#c0a040"; ctx.fillRect(0, 0, 64, 6); ctx.fillStyle = "#9a9aaa"; ctx.fillRect(18, 34, 28, 40); ctx.fillStyle = "#101014"; ctx.fillRect(23, 44, 8, 6); ctx.fillRect(33, 44, 8, 6); ctx.fillRect(24, 60, 16, 4); })),
};
function tiled(t: THREE.Texture, rx: number, ry: number) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

/* ------------------------------------------------------------------ tiles */
interface TileSpec { h: number; top: THREE.Texture | string; side?: string; emissive?: number }
const SPEC: Partial<Record<Tile, () => TileSpec>> = {
  roof: () => ({ h: 0.1, top: T.gravel() }), door: () => ({ h: 0.1, top: T.gravel() }), "tower-base": () => ({ h: 0.1, top: T.gravel() }),
  ledge: () => ({ h: 0.6, top: T.brick(), side: "#9a5a46" }), stair: () => ({ h: 0.6, top: T.brick(), side: "#9a5a46" }),
  ac: () => ({ h: 0.1, top: T.gravel() }), vent: () => ({ h: 0.1, top: T.gravel() }), skylight: () => ({ h: 0.12, top: "#7cc0f0", side: "#5a7a98", emissive: 0.3 }),
  sidewalk: () => ({ h: 0.14, top: T.sidewalk(), side: "#7a7a82" }), curb: () => ({ h: 0.14, top: T.sidewalk(), side: "#6a6a72" }),
  road: () => ({ h: 0.02, top: T.asphalt() }), "road-line": () => ({ h: 0.02, top: T.asphalt() }),
  facade: () => ({ h: 2.6, top: "#5a5a68", side: "#6a6a78" }), "facade-window": () => ({ h: 2.6, top: "#5a5a68", side: "#6a6a78" }), "facade-door": () => ({ h: 2.6, top: "#5a5a68", side: "#6a6a78" }),
  carpet: () => ({ h: 0.08, top: T.carpet() }), marble: () => ({ h: 0.1, top: T.marble(), side: "#b8b8c4" }),
  wall: () => ({ h: 1.7, top: "#3a3a58", side: "#30304a" }), "wall-window": () => ({ h: 1.7, top: "#3a3a58", side: "#30304a" }),
  flagstone: () => ({ h: 0.08, top: T.flagstone() }), dais: () => ({ h: 0.45, top: T.marble(), side: "#6a5a4a" }),
  "castle-wall": () => ({ h: 2.4, top: T.stoneblock(), side: "#3a3a46" }), battlement: () => ({ h: 2.4, top: T.stoneblock(), side: "#3a3a46" }),
};

const lam = (hex: string) => toon(hex);
function topMat(top: THREE.Texture | string, emissive = 0) { return typeof top === "string" ? toon(top, { emissive }) : new THREE.MeshToonMaterial({ map: top, gradientMap: toon("#ffffff").gradientMap }); }

export interface Built3D { group: THREE.Group; lights: THREE.PointLight[]; flames: THREE.Sprite[]; toWorld(tx: number, ty: number): THREE.Vector3; floorY(tx: number, ty: number): number }

export function buildWorld(map: MapDef, night: boolean): Built3D {
  const g = new THREE.Group();
  const lights: THREE.PointLight[] = [];
  const flames: THREE.Sprite[] = [];
  const heights: number[][] = map.tiles.map((row) => row.map((t) => SPEC[t]?.().h ?? 0.1));
  const floorY = (tx: number, ty: number) => heights[ty]?.[tx] ?? 0.1;
  const toWorld = (tx: number, ty: number) => new THREE.Vector3(tx, floorY(tx, ty), ty);

  // merge flat floor tiles by texture into big planes for a clean look and fewer draws
  const floorGroups = new Map<string, { spec: TileSpec; cells: [number, number][] }>();
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = map.tiles[y]![x]!; if (t === "void") continue;
    const spec = SPEC[t]?.() ?? { h: 0.1, top: "#555" };
    if (spec.h <= 0.15) { const key = typeof spec.top === "string" ? spec.top : spec.top.uuid; const grp = floorGroups.get(key) ?? { spec, cells: [] }; grp.cells.push([x, y]); floorGroups.set(key, grp); }
    else {
      const geo = new RoundedBoxGeometry(1, spec.h, 1, 2, 0.06);
      const mats = [lam(spec.side ?? "#555"), lam(spec.side ?? "#555"), topMat(spec.top, spec.emissive), lam(spec.side ?? "#555"), lam(spec.side ?? "#555"), lam(spec.side ?? "#555")];
      const m = new THREE.Mesh(geo, mats); m.position.set(x, spec.h / 2, y); m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (t === "battlement" && (x % 2 === 0)) { const merlon = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.5, 1, 2, 0.05), lam("#4a4a58")); merlon.position.set(x, spec.h + 0.25, y); merlon.castShadow = true; g.add(merlon); }
      if ((t === "facade-window") && night) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.4), new THREE.MeshToonMaterial({ map: tiled(T.windows(), 1, 1), gradientMap: toon("#ffffff").gradientMap, emissive: new THREE.Color(0x604820) })); win.position.set(x, 1.3, y + 0.505); g.add(win); }
      else if (t === "facade" || t === "facade-window" || t === "facade-door") { const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.6), new THREE.MeshToonMaterial({ map: tiled(T.facade(), 1, 1), gradientMap: toon("#ffffff").gradientMap })); face.position.set(x, 1.3, y + 0.505); g.add(face); }
      if (t === "facade-door") { const d = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.3, 0.1, 2, 0.03), lam("#b08a40")); d.position.set(x, 0.65, y + 0.52); g.add(d); const awning = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.6), lam("#8a2020")); awning.position.set(x, 1.5, y + 0.8); awning.castShadow = true; g.add(awning); }
      if (t === "wall-window") { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshToonMaterial({ map: tiled(T.windows(), 1, 1), gradientMap: toon("#ffffff").gradientMap, emissive: new THREE.Color(night ? 0x203050 : 0x404060) })); win.position.set(x, 0.9, y + 0.505); g.add(win); }
    }
    if (t === "skylight") { const l = new THREE.PointLight(0x6ab0ff, night ? 1.2 : 0.2, 3.5); l.position.set(x, 0.5, y); g.add(l); lights.push(l); }
    if (t === "road-line") { const line = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), lam("#e0c050")); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.035, y); g.add(line); }
    if (t === "ac") { const box = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.55, 0.9, 2, 0.05), lam("#c8c8d0")); box.position.set(x, 0.1 + 0.275, y); box.castShadow = true; g.add(box); const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshToonMaterial({ color: 0x5a5a66, gradientMap: toon("#ffffff").gradientMap })); grille.position.set(x, 0.38, y + 0.46); g.add(grille); const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), lam("#3a3a46")); fan.position.set(x, 0.66, y); g.add(fan); }
    if (t === "vent") { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 12), lam("#7a7a8a")); pipe.position.set(x, 0.35, y); pipe.castShadow = true; g.add(pipe); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), lam("#9a9aaa")); cap.position.set(x, 0.62, y); g.add(cap); }
  }
  for (const { spec, cells } of floorGroups.values()) {
    for (const [x, y] of cells) {
      const geo = new THREE.BoxGeometry(1, Math.max(0.04, spec.h), 1);
      const mat = typeof spec.top === "string" ? toon(spec.top, { emissive: spec.emissive }) : new THREE.MeshToonMaterial({ map: spec.top, gradientMap: toon("#ffffff").gradientMap });
      const m = new THREE.Mesh(geo, [lam(spec.side ?? shadeHex(typeof spec.top === "string" ? spec.top : "#666", -0.3)), lam(spec.side ?? "#555"), mat, lam(spec.side ?? "#555"), lam(spec.side ?? "#555"), lam(spec.side ?? "#555")]);
      m.position.set(x, spec.h / 2, y); m.receiveShadow = true; g.add(m);
    }
  }

  /* ---- props */
  const add = (o: THREE.Object3D, x: number, y: number, dy = 0) => { o.position.set(x, floorY(Math.round(x), Math.round(y)) + dy, y); g.add(o); return o; };
  const light = (hex: number, intensity: number, dist: number, x: number, y: number, h: number) => { const l = new THREE.PointLight(hex, intensity, dist, 1.6); add(l, x, y, h); lights.push(l); return l; };
  const flameSprite = () => { const t = tex("flame", () => canvasTexture(32, 32, (ctx) => { const gr = ctx.createRadialGradient(16, 18, 2, 16, 16, 15); gr.addColorStop(0, "rgba(255,240,180,1)"); gr.addColorStop(0.4, "rgba(255,150,40,0.9)"); gr.addColorStop(1, "rgba(255,80,0,0)"); ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32); })); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(0.35, 0.5, 1); flames.push(s); return s; };
  for (const p of map.props) {
    switch (p.kind as PropKind) {
      case "water-tower": {
        const grp = new THREE.Group();
        for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as [number, number][]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8), lam("#3a2a1a")); leg.position.set(lx, 1.1, lz); leg.castShadow = true; grp.add(leg); }
        for (const [a, b] of [[[-0.8, -0.8], [0.8, 0.8]], [[0.8, -0.8], [-0.8, 0.8]]] as [number, number][][]) { const d = new THREE.Vector3(b![0]! - a![0]!, 0, b![1]! - a![1]!); const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.length(), 6), lam("#3a2a1a")); brace.position.set(0, 1.0, 0); brace.rotation.z = Math.PI / 2; brace.rotation.y = -Math.atan2(d.z, d.x); grp.add(brace); }
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 1.5, 20), new THREE.MeshToonMaterial({ map: tiled(T.brick(), 3, 1), gradientMap: toon("#ffffff").gradientMap, color: new THREE.Color("#c89a60") })); tank.position.y = 2.95; tank.castShadow = true; grp.add(outlined(tank, 0.01));
        for (const yy of [2.35, 2.95, 3.55]) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.04, 6, 24), lam("#8c8c96")); band.rotation.x = Math.PI / 2; band.position.y = yy; grp.add(band); }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.75, 20), lam("#5a5a66")); roof.position.y = 4.07; roof.castShadow = true; grp.add(outlined(roof, 0.01));
        const ladder = new THREE.Group(); for (let i = 0; i < 9; i++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), lam("#8a6232")); rung.position.set(1.15, 2.3 + i * 0.2, 0); ladder.add(rung); } for (const sx of [-0.15, 0.15]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.04), lam("#8a6232")); rail.position.set(1.15 + sx, 3.1, 0); ladder.add(rail); } grp.add(ladder);
        add(grp, p.x + 1, p.y - 1, 0); break;
      }
      case "bulkhead": {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.5, 1.3, 2, 0.06), [new THREE.MeshToonMaterial({ map: tiled(T.brick(), 2, 1.5), gradientMap: toon("#ffffff").gradientMap }), new THREE.MeshToonMaterial({ map: tiled(T.brick(), 2, 1.5), gradientMap: toon("#ffffff").gradientMap }), lam("#7a7a86"), lam("#7a7a86"), new THREE.MeshToonMaterial({ map: tiled(T.brick(), 2, 1.5), gradientMap: toon("#ffffff").gradientMap }), new THREE.MeshToonMaterial({ map: tiled(T.brick(), 2, 1.5), gradientMap: toon("#ffffff").gradientMap })]);
        body.position.y = 0.75; body.castShadow = true; grp.add(outlined(body, 0.01));
        const door = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.0, 0.08, 2, 0.02), lam("#7a5428")); door.position.set(0, 0.5, 0.66); grp.add(door);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), lam("#7cc0f0")); win.position.set(0, 0.8, 0.71); grp.add(win);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon("#ffd860", { emissive: night ? 2 : 0.4 })); lamp.position.set(0, 1.2, 0.72); grp.add(lamp);
        add(grp, p.x + 0.5, p.y - 0.4, 0);
        light(0xffb060, night ? 2.2 : 0.3, 4.5, p.x + 0.5, p.y + 0.3, 1.2); break;
      }
      case "car": {
        const grp = new THREE.Group(); const col = p.x % 2 ? "#d8b020" : "#2a4ac0";
        const body = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.5, 0.95, 2, 0.08), lam(col)); body.position.y = 0.45; body.castShadow = true; grp.add(outlined(body, 0.01));
        const cab = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.5, 0.85, 2, 0.1), lam(col)); cab.position.set(-0.1, 0.9, 0); cab.castShadow = true; grp.add(outlined(cab, 0.01));
        const glass = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.36, 0.86, 2, 0.05), toon("#8ac0e0", { emissive: 0.2 })); glass.position.set(-0.1, 0.95, 0); grp.add(glass);
        for (const [wx, wz] of [[-0.65, 0.48], [0.65, 0.48], [-0.65, -0.48], [0.65, -0.48]] as [number, number][]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), lam("#202028")); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.2, wz); grp.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.13, 8), lam("#8a8a94")); hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.2, wz); grp.add(hub); }
        for (const sz of [-0.3, 0.3]) { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), toon("#fff0a0", { emissive: night ? 2 : 0.3 })); hl.position.set(1.0, 0.45, sz); grp.add(hl); const tl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), toon("#ff4040", { emissive: night ? 1.5 : 0.3 })); tl.position.set(-1.0, 0.45, sz); grp.add(tl); }
        if (col === "#d8b020") { const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), toon("#fff0a0", { emissive: 0.4 })); sign.position.set(-0.1, 1.2, 0); grp.add(sign); }
        add(grp, p.x + 0.5, p.y, 0); break;
      }
      case "lamppost": {
        const grp = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.15, 10), lam("#2a3a2a")); base.position.y = 0.07; grp.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.2, 8), lam("#2a3a2a")); pole.position.y = 1.1; pole.castShadow = true; grp.add(pole);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), lam("#2a3a2a")); arm.rotation.z = Math.PI / 2; arm.position.set(0.22, 2.2, 0); grp.add(arm);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toon("#ffe8a0", { emissive: night ? 2.5 : 0.5 })); globe.position.set(0.45, 2.15, 0); grp.add(globe);
        add(grp, p.x, p.y, 0); light(0xffd080, night ? 2.0 : 0.25, 5, p.x + 0.45, p.y, 2.1); break;
      }
      case "hydrant": { const grp = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 10), lam("#d02020")); b.position.y = 0.22; grp.add(outlined(b, 0.02)); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lam("#d02020")); cap.position.y = 0.46; grp.add(cap); for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), lam("#a01818")); n.rotation.z = Math.PI / 2; n.position.set(sx * 0.13, 0.3, 0); grp.add(n); } add(grp, p.x, p.y, 0); break; }
      case "newsstand": { const grp = new THREE.Group(); const b = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.0, 0.9, 2, 0.04), lam("#2a5a3a")); b.position.y = 0.5; b.castShadow = true; grp.add(outlined(b, 0.01)); const roof = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.1, 1.2, 2, 0.03), lam("#1a3a2a")); roof.position.y = 1.08; grp.add(roof); for (let i = 0; i < 4; i++) { const mag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), toon(["#d04040", "#4060b0", "#e0c050", "#f8f8f8"][i]!)); mag.position.set(-0.6 + i * 0.4, 0.6, 0.46); grp.add(mag); } const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.05), toon("#ffd860", { emissive: 0.3 })); sign.position.set(0, 1.25, 0.3); grp.add(sign); add(grp, p.x + 0.5, p.y, 0); break; }
      case "subway": { const grp = new THREE.Group(); const pit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.0), lam("#101018")); pit.position.y = 0.0; grp.add(pit); for (const sx of [-0.72, 0.72]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.0), lam("#5a5a6a")); rail.position.set(sx, 0.45, 0); grp.add(rail); } const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.1), toon("#2a6a2a", { emissive: 0.4 })); sign.position.set(0, 1.1, -0.45); grp.add(sign); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), lam("#5a5a6a")); post.position.set(0, 0.5, -0.45); grp.add(post); add(grp, p.x + 0.5, p.y, 0.05); break; }
      case "bugle-sign": { const s = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.8, 0.12, 2, 0.04), toon("#d8d8e8", { emissive: night ? 0.6 : 0.2 })); add(s, p.x + 2, p.y + 0.6, 3.0); const txt = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.6), new THREE.MeshToonMaterial({ map: tex("bugle", () => canvasTexture(512, 80, (ctx) => { ctx.fillStyle = "#d8d8e8"; ctx.fillRect(0, 0, 512, 80); ctx.fillStyle = "#101018"; ctx.font = "bold 56px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("DAILY BUGLE", 256, 42); })), gradientMap: toon("#ffffff").gradientMap })); add(txt, p.x + 2, p.y + 0.67, 3.0); break; }
      case "couch": { const grp = new THREE.Group(); const seat = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.45, 0.9, 2, 0.1), lam("#7a3a4a")); seat.position.y = 0.25; seat.castShadow = true; grp.add(outlined(seat, 0.01)); const back = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.6, 0.25, 2, 0.08), lam("#6a2a3a")); back.position.set(0, 0.6, -0.33); grp.add(outlined(back, 0.01)); for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.3, 0.9, 2, 0.08), lam("#6a2a3a")); arm.position.set(sx * 1.0, 0.55, 0); grp.add(arm); } for (const sx of [-0.6, 0.1, 0.8]) { const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.12, 0.7, 2, 0.05), lam("#8a4a5a")); cushion.position.set(sx, 0.52, 0.05); grp.add(cushion); } add(grp, p.x + 1, p.y, 0); break; }
      case "bar": { const grp = new THREE.Group(); const b = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.95, 0.8, 2, 0.05), lam("#4a3020")); b.position.y = 0.48; b.castShadow = true; grp.add(outlined(b, 0.01)); const top = new THREE.Mesh(new RoundedBoxGeometry(2.8, 0.08, 1.0, 2, 0.03), new THREE.MeshToonMaterial({ map: tiled(T.marble(), 3, 1), gradientMap: toon("#ffffff").gradientMap })); top.position.y = 0.99; grp.add(top); for (let i = 0; i < 5; i++) { const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 8), toon(i % 2 ? "#c0e0ff" : "#ffd860", { emissive: 0.3 })); bottle.position.set(-1.0 + i * 0.5, 1.15, -0.2); grp.add(bottle); } add(grp, p.x + 1.3, p.y, 0); break; }
      case "holo-table": { const grp = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.7, 20), lam("#303848")); t.position.y = 0.35; t.castShadow = true; grp.add(outlined(t, 0.01)); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 8, 24), toon("#4ab0ff", { emissive: 1.5 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.7; grp.add(rim); const holo = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x3aa0f0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); holo.rotation.x = Math.PI; holo.position.y = 1.25; grp.add(holo); const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: 0x8ad0ff, wireframe: true, transparent: true, opacity: 0.8 })); globe.position.y = 1.25; globe.name = "holo-globe"; grp.add(globe); add(grp, p.x + 0.5, p.y + 0.3, 0); light(0x4ab0ff, 1.6, 4.5, p.x + 0.5, p.y + 0.3, 1.3); break; }
      case "elevator": { const grp = new THREE.Group(); const frame = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.6, 0.25, 2, 0.03), lam("#4a4a5a")); frame.position.y = 0.8; grp.add(frame); for (const sx of [-0.36, 0.36]) { const door = new THREE.Mesh(new RoundedBoxGeometry(0.66, 1.45, 0.08, 2, 0.02), lam("#8a8a9a")); door.position.set(sx, 0.78, 0.12); grp.add(door); } const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), toon("#58d854", { emissive: 1.5 })); lamp.position.set(0, 1.62, 0.12); grp.add(lamp); add(grp, p.x + 0.5, p.y, 0); break; }
      case "plant": { const grp = new THREE.Group(); const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.4, 10), lam("#8a5a30")); pot.position.y = 0.2; grp.add(outlined(pot, 0.02)); for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(i % 2 ? "#2a7a3a" : "#3a9a4a")); leaf.scale.set(1, 1.4, 0.5); const a = (i / 5) * Math.PI * 2; leaf.position.set(Math.cos(a) * 0.12, 0.65 + (i % 2) * 0.15, Math.sin(a) * 0.12); leaf.rotation.y = -a; leaf.rotation.z = 0.4; grp.add(outlined(leaf, 0.02)); } add(grp, p.x, p.y, 0); break; }
      case "throne": { const grp = new THREE.Group(); const seat = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.6, 1.0, 2, 0.05), lam("#2a2a34")); seat.position.y = 0.3; seat.castShadow = true; grp.add(outlined(seat, 0.01)); const back = new THREE.Mesh(new RoundedBoxGeometry(1.2, 2.0, 0.25, 2, 0.06), lam("#1a5a2a")); back.position.set(0, 1.3, -0.4); back.castShadow = true; grp.add(outlined(back, 0.01)); for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.4, 0.9, 2, 0.05), lam("#2a2a34")); arm.position.set(sx * 0.5, 0.75, 0); grp.add(arm); } const mask = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshToonMaterial({ map: T.banner("#1a5a2a"), gradientMap: toon("#ffffff").gradientMap })); mask.position.set(0, 1.7, -0.27); grp.add(mask); const crown = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.3), lam("#c0a040")); crown.position.set(0, 2.32, -0.4); grp.add(crown); add(grp, p.x + 0.5, p.y, 0); break; }
      case "banner": { const grp = new THREE.Group(); const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.0, 1, 6), new THREE.MeshToonMaterial({ map: T.banner("#1a6a2a"), gradientMap: toon("#ffffff").gradientMap, side: THREE.DoubleSide })); cloth.position.set(0, 1.6, 0); cloth.name = "banner-cloth"; grp.add(cloth); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), lam("#c0a040")); rod.rotation.z = Math.PI / 2; rod.position.set(0, 2.62, 0); grp.add(rod); add(grp, p.x, p.y + 0.5, 0); break; }
      case "torch": { const grp = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), lam("#4a3020")); pole.position.y = 0.45; grp.add(pole); const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.15, 8), lam("#2a2a34")); cup.position.y = 0.95; grp.add(cup); const f = flameSprite(); f.position.y = 1.2; grp.add(f); add(grp, p.x, p.y, 0); light(0xff9a30, 2.4, 5.5, p.x, p.y, 1.2); break; }
      case "gate": { const grp = new THREE.Group(); for (let i = -0.9; i <= 0.9; i += 0.3) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), lam("#5a5a6a")); b.position.set(i, 1.0, 0); grp.add(b); } for (const yy of [0.5, 1.1, 1.7]) { const h = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.06), lam("#4a4a5a")); h.position.set(0, yy, 0); grp.add(h); } add(grp, p.x + 0.5, p.y + 0.5, 0); break; }
      case "statue": { const grp = new THREE.Group(); const ped = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.35, 0.9, 2, 0.04), lam("#3a3a46")); ped.position.y = 0.17; grp.add(outlined(ped, 0.01)); const body = new THREE.Mesh(new RoundedBoxGeometry(0.6, 1.3, 0.45, 2, 0.08), lam("#5a5a68")); body.position.y = 1.0; body.castShadow = true; grp.add(outlined(body, 0.01)); const head = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.45, 0.42, 2, 0.1), lam("#6a6a78")); head.position.y = 1.9; grp.add(outlined(head, 0.01)); const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshToonMaterial({ color: 0x3a6a3a, gradientMap: toon("#ffffff").gradientMap, side: THREE.DoubleSide })); cape.position.set(0, 1.1, -0.28); grp.add(cape); add(grp, p.x, p.y, 0); break; }
    }
  }
  return { group: g, lights, flames, toWorld, floorY };
}

/** Backdrop: sky dome, stars, distant skyline or mountains, clouds. */
export function buildBackdrop(map: MapDef, tod: string, center: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const night = tod === "night";
  const skyCols: Record<string, [string, string]> = { night: ["#050514", "#1a1a44"], dawn: ["#2a1a4a", "#f0b878"], day: ["#2a6ad0", "#b0d8ff"], dusk: ["#2a1a4a", "#f0a050"] };
  const [top, bottom] = skyCols[tod] ?? skyCols.night!;
  const skyTex = canvasTexture(4, 256, (ctx) => { const gr = ctx.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(1, bottom); ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 256); });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false }));
  dome.position.copy(center); g.add(dome);
  if (night || tod === "dawn") {
    const n = night ? 500 : 120; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1; const r = 80; pos[i * 3] = center.x + Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = center.z + Math.sin(a) * Math.cos(e) * r; }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: night ? 0.5 : 0.35, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
    g.add(stars);
    if (night) { const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf0f0ff })); moon.position.set(center.x - 30, 28, center.z - 40); g.add(moon); }
  }
  if (map.region === "manhattan" && map.kind !== "interior") {
    for (let i = 0; i < 56; i++) {
      // keep the skyline outside the placed blocks (the composite spans roughly 48 x 40 tiles)
      const ang = (i / 56) * Math.PI * 2 + 0.1; const rad = 42 + (i % 4) * 7 + (i % 3) * 3;
      const w = 4 + (i * 7) % 6, d = 4 + (i * 5) % 5, h = 6 + (i * 11) % 26;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ map: tiled(T.windows(), Math.ceil(w), Math.ceil(h / 2)), gradientMap: toon("#ffffff").gradientMap, color: new THREE.Color(night ? 0x5a6a90 : 0x8a90a8), emissive: new THREE.Color(night ? 0x303848 : 0x101418) }));
      b.position.set(center.x + Math.cos(ang) * rad, h / 2 - 3.2, center.z + Math.sin(ang) * rad); g.add(b);
      if (i % 5 === 0) { const spire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2, 6), toon("#9a9aaa")); spire.position.set(b.position.x, h - 2.2, b.position.z); g.add(spire); }
    }
  }
  if (map.region === "latveria") {
    for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2; const rad = 34 + (i % 3) * 8; const h = 10 + (i * 7) % 12; const m = new THREE.Mesh(new THREE.ConeGeometry(8 + (i % 4) * 2, h, 7), toon(night ? "#1a1a2e" : "#3a3a5a")); m.position.set(center.x + Math.cos(ang) * rad, h / 2 - 4, center.z + Math.sin(ang) * rad); g.add(m); const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 7), toon("#e8e8f0")); cap.position.set(m.position.x, h - 4 - 1.4, m.position.z); g.add(cap); }
  }
  if (tod === "day" || tod === "dusk") { const cloudTex = canvasTexture(128, 64, (ctx) => { for (const [x, y, r] of [[40, 36, 22], [64, 28, 26], [90, 36, 20], [60, 42, 18]] as [number, number, number][]) { const gr = ctx.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 64); } }); for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false })); s.scale.set(16, 8, 1); s.position.set(center.x + (i - 4) * 14, 22 + (i % 3) * 3, center.z - 40 + (i % 2) * 20); s.name = "cloud"; g.add(s); } }
  return g;
}

/* ------------------------------------------------------------------ open world: a region as one scene */
import { MAPS, PLACEMENTS, CONNECTORS, type Region } from "@shared/maps";

export interface BuiltRegion {
  group: THREE.Group;
  region: Region;
  maps: Record<string, Built3D>;
  lights: THREE.PointLight[];
  flames: THREE.Sprite[];
  /** world position for a tile on a given map */
  toWorld(mapId: string, tx: number, ty: number): THREE.Vector3;
  floorY(mapId: string, tx: number, ty: number): number;
  /** ground-level point under a map's edge facing another map, for travel paths */
  exitPoint(mapId: string, towardMapId: string): THREE.Vector3;
  center(mapId: string): THREE.Vector3;
}

export function buildRegion(region: Region, night: boolean): BuiltRegion {
  const g = new THREE.Group();
  const maps: Record<string, Built3D> = {};
  const lights: THREE.PointLight[] = [];
  const flames: THREE.Sprite[] = [];
  const windowsTex = T.windows();
  for (const m of Object.values(MAPS)) {
    if (m.region !== region) continue;
    const p = PLACEMENTS[m.id] ?? { x: 0, y: 0, elevation: 0 };
    const built = buildWorld(m, night);
    built.group.position.set(p.x, p.elevation, p.y);
    g.add(built.group); maps[m.id] = built; lights.push(...built.lights); flames.push(...built.flames);
    if (p.elevation > 0) {
      // the building under an elevated map
      const w = m.width, d = m.height, h = p.elevation;
      const glass = p.body === "glass";
      const mat = glass
        ? new THREE.MeshToonMaterial({ color: new THREE.Color(night ? 0x3a4a80 : 0x6a8ac0), map: tiled(windowsTex, w, h / 2), gradientMap: toon("#ffffff").gradientMap, emissive: new THREE.Color(night ? 0x203050 : 0x101820) })
        : new THREE.MeshToonMaterial({ map: tiled(T.facade(), w / 2, h / 2.6), gradientMap: toon("#ffffff").gradientMap });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, lam("#4a4a56"), lam("#2a2a34"), mat, mat]);
      body.position.set(p.x + w / 2 - 0.5, h / 2 - 0.02, p.y + d / 2 - 0.5); body.castShadow = true; body.receiveShadow = true; g.add(body);
      if (glass) { const crown = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), lam("#9aa0b8")); crown.position.set(body.position.x, h + 0.1, body.position.z); g.add(crown); const spire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 4, 8), lam("#c0c8e0")); spire.position.set(p.x + w - 2, h + 2.2, p.y + 1); g.add(spire); const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.2), toon("#48b8ff", { emissive: night ? 1.2 : 0.3 })); sign.position.set(body.position.x, h - 2, p.y + d - 0.4 + 0.11); g.add(sign); const a = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshToonMaterial({ map: tex("aLogo", () => canvasTexture(128, 128, (ctx) => { ctx.fillStyle = "#48b8ff"; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = "#ffffff"; ctx.font = "bold 110px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("A", 64, 70); })), gradientMap: toon("#ffffff").gradientMap })); a.position.set(body.position.x, h - 2, p.y + d - 0.4 + 0.22); g.add(a); }
      else { const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), lam("#8a5a46")); ledge.position.set(body.position.x, h - 0.15, body.position.z); g.add(ledge); }
    }
  }
  // connectors
  for (const c of CONNECTORS[region]) {
    const spec = SPEC[c.tile]?.() ?? { h: 0.05, top: "#555" };
    const mat = typeof spec.top === "string" ? toon(spec.top) : new THREE.MeshToonMaterial({ map: tiled(spec.top, c.w, c.h), gradientMap: toon("#ffffff").gradientMap });
    const h = Math.max(0.04, spec.h);
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, h, c.h), [lam(spec.side ?? "#555"), lam(spec.side ?? "#555"), mat, lam(spec.side ?? "#555"), lam(spec.side ?? "#555"), lam(spec.side ?? "#555")]);
    m.position.set(c.x + c.w / 2 - 0.5, h / 2, c.y + c.h / 2 - 0.5); m.receiveShadow = true; g.add(m);
    if (c.tile === "road-line") { for (let i = 0; i < Math.max(c.w, c.h); i += 2) { const line = new THREE.Mesh(new THREE.PlaneGeometry(c.w > c.h ? 0.8 : 0.14, c.w > c.h ? 0.14 : 0.8), lam("#e0c050")); line.rotation.x = -Math.PI / 2; line.position.set(c.w > c.h ? c.x + i : c.x, 0.04, c.w > c.h ? c.y : c.y + i); g.add(line); } }
    if (c.tile === "sidewalk" && (c.w >= 10 || c.h >= 10)) { for (let i = 2; i < Math.max(c.w, c.h); i += 6) { const grp = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.2, 8), lam("#2a3a2a")); pole.position.y = 1.1; grp.add(pole); const globe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toon("#ffe8a0", { emissive: night ? 2.5 : 0.5 })); globe.position.y = 2.2; grp.add(globe); grp.position.set(c.w > c.h ? c.x + i : c.x, 0.1, c.w > c.h ? c.y : c.y + i); g.add(grp); const l = new THREE.PointLight(0xffd080, night ? 1.6 : 0.2, 5, 1.6); l.position.set(grp.position.x, 2.1, grp.position.z); g.add(l); lights.push(l); } }
  }
  // ground plane far out so the city has a floor
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), toon(region === "latveria" ? "#2a2a36" : "#2a2a30"));
  ground.rotation.x = -Math.PI / 2; ground.position.set(20, -0.03, 15); ground.receiveShadow = true; g.add(ground);

  const toWorld = (mapId: string, tx: number, ty: number) => { const p = PLACEMENTS[mapId] ?? { x: 0, y: 0, elevation: 0 }; const b = maps[mapId]; return new THREE.Vector3(p.x + tx, p.elevation + (b ? b.floorY(tx, ty) : 0.1), p.y + ty); };
  const floorY = (mapId: string, tx: number, ty: number) => { const p = PLACEMENTS[mapId] ?? { x: 0, y: 0, elevation: 0 }; const b = maps[mapId]; return p.elevation + (b ? b.floorY(tx, ty) : 0.1); };
  const center = (mapId: string) => { const m = MAPS[mapId]; const p = PLACEMENTS[mapId] ?? { x: 0, y: 0, elevation: 0 }; return new THREE.Vector3(p.x + (m?.width ?? 20) / 2 - 0.5, p.elevation, p.y + (m?.height ?? 15) / 2 - 0.5); };
  const exitPoint = (mapId: string, towardMapId: string) => {
    const a = center(mapId), b = center(towardMapId); const m = MAPS[mapId]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const p = a.clone();
    if (Math.abs(dx) > Math.abs(dz)) p.x += Math.sign(dx) * (m.width / 2 + 1.5); else p.z += Math.sign(dz) * (m.height / 2 + 1.5);
    p.y = 0.1; return p;
  };
  return { group: g, region, maps, lights, flames, toWorld, floorY, exitPoint, center };
}

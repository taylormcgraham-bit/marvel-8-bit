/**
 * Builds a map as voxel geometry: tiles as slabs, parapets as walls, props as box
 * assemblies, with lights for lamps and torches. Same MapDef the 2D theater uses.
 */
import * as THREE from "three";
import type { MapDef, Tile, PropKind } from "@shared/maps";

const T = 1; // one tile = 1 world unit

const TILE_COLORS: Partial<Record<Tile, { top: string; h: number }>> = {
  roof: { top: "#56565e", h: 0.1 }, ledge: { top: "#a0624a", h: 0.55 }, door: { top: "#56565e", h: 0.1 }, "tower-base": { top: "#4a4a52", h: 0.1 },
  ac: { top: "#c8c8d0", h: 0.5 }, skylight: { top: "#7cc0f0", h: 0.14 }, vent: { top: "#6c6c7a", h: 0.35 }, stair: { top: "#a0624a", h: 0.55 },
  sidewalk: { top: "#9a9aa2", h: 0.12 }, curb: { top: "#8a8a92", h: 0.12 }, road: { top: "#3a3a42", h: 0.0 }, "road-line": { top: "#3a3a42", h: 0.0 },
  facade: { top: "#6a6a78", h: 2.4 }, "facade-window": { top: "#6a6a78", h: 2.4 }, "facade-door": { top: "#6a6a78", h: 2.4 },
  carpet: { top: "#5a3448", h: 0.08 }, marble: { top: "#e0e0e8", h: 0.1 }, wall: { top: "#3a3a58", h: 1.6 }, "wall-window": { top: "#5a7ab0", h: 1.6 },
  flagstone: { top: "#6a6a76", h: 0.08 }, "castle-wall": { top: "#4a4a58", h: 2.2 }, battlement: { top: "#4a4a58", h: 2.8 }, dais: { top: "#8a7a5a", h: 0.4 },
};

const lam = (hex: string) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
const sideOf = (hex: string) => lam("#" + new THREE.Color(hex).multiplyScalar(0.72).getHexString());

export interface BuiltMap { group: THREE.Group; lights: THREE.Light[]; toWorld(tx: number, ty: number): THREE.Vector3; floorY(tx: number, ty: number): number }

export function buildMap(map: MapDef, night: boolean): BuiltMap {
  const g = new THREE.Group();
  const lights: THREE.Light[] = [];
  const heights: number[][] = map.tiles.map((row) => row.map((t) => TILE_COLORS[t]?.h ?? 0.1));
  // merge tiles into instanced-ish meshes per color for performance: simple approach, one box per tile
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = map.tiles[y]![x]!;
    if (t === "void") continue;
    const c = TILE_COLORS[t] ?? { top: "#555", h: 0.1 };
    const h = Math.max(0.04, c.h);
    const geo = new THREE.BoxGeometry(T, h, T);
    const mats = [sideOf(c.top), sideOf(c.top), lam(c.top), sideOf(c.top), sideOf(c.top), sideOf(c.top)];
    const m = new THREE.Mesh(geo, mats);
    m.position.set(x * T, h / 2, y * T);
    m.receiveShadow = true; m.castShadow = h > 0.3;
    g.add(m);
    if (t === "skylight") { const glow = new THREE.PointLight(0x6ab0ff, night ? 0.9 : 0.2, 3); glow.position.set(x * T, 0.6, y * T); g.add(glow); lights.push(glow); }
    if (t === "road-line") { const line = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.12), lam("#e0c050")); line.position.set(x * T, 0.03, y * T); g.add(line); }
    if (t === "facade-window" || t === "wall-window") { const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.05), new THREE.MeshLambertMaterial({ color: 0x8ab0e0, emissive: night ? 0x3a5a8a : 0x102030 })); win.position.set(x * T, 1.3, y * T + 0.5); g.add(win); }
    if (t === "facade-door") { const d = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.08), lam("#b08a40")); d.position.set(x * T, 0.6, y * T + 0.5); g.add(d); }
  }
  // props
  const put = (mesh: THREE.Object3D, x: number, y: number, dy = 0) => { mesh.position.set(x * T, (heights[y]?.[x] ?? 0.1) + dy, y * T); g.add(mesh); };
  for (const p of map.props) {
    const base = heights[p.y]?.[p.x] ?? 0.1;
    switch (p.kind as PropKind) {
      case "water-tower": {
        const grp = new THREE.Group();
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as [number, number][]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), lam("#3a2a1a")); leg.position.set(lx, 1.1, lz); leg.castShadow = true; grp.add(leg); }
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 16), lam("#a8763e")); tank.position.y = 3.0; tank.castShadow = true; grp.add(tank);
        for (const y of [2.4, 3.0, 3.6]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, 0.08, 16), lam("#8c8c96")); band.position.y = y; grp.add(band); }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 16), lam("#5a5a66")); roof.position.y = 4.2; roof.castShadow = true; grp.add(roof);
        put(grp, p.x + 1, p.y - 1, 0); break;
      }
      case "bulkhead": { const b = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 1.2), [sideOf("#a0624a"), sideOf("#a0624a"), lam("#7a7a86"), sideOf("#a0624a"), sideOf("#a0624a"), sideOf("#a0624a")]); b.castShadow = true; put(b, p.x + 0.5, p.y - 0.4, 0.7); const d = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.06), lam("#7a5428")); put(d, p.x + 0.5, p.y + 0.2, 0.45); const lamp = new THREE.PointLight(0xffb060, night ? 1.6 : 0.3, 4); put(lamp, p.x + 0.5, p.y + 0.6, 1.2); lights.push(lamp); break; }
      case "car": { const grp = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.9), lam("#d8b020")); body.position.y = 0.45; body.castShadow = true; grp.add(body); const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.8), lam("#f0e0a0")); cab.position.set(-0.1, 0.92, 0); cab.castShadow = true; grp.add(cab); for (const [wx, wz] of [[-0.65, 0.45], [0.65, 0.45], [-0.65, -0.45], [0.65, -0.45]] as [number, number][]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 10), lam("#202028")); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.2, wz); grp.add(w); } put(grp, p.x + 0.5, p.y, 0); break; }
      case "lamppost": { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), lam("#2a3a2a")); pole.castShadow = true; put(pole, p.x, p.y, 1.0); const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: 0xffe8a0, emissive: night ? 0xffd070 : 0x806030 })); put(head, p.x, p.y, 2.05); const l = new THREE.PointLight(0xffd080, night ? 1.4 : 0.2, 4.5); put(l, p.x, p.y, 1.9); lights.push(l); break; }
      case "hydrant": { const h = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.25), lam("#d02020")); put(h, p.x, p.y, 0.3); break; }
      case "newsstand": { const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.9), lam("#2a5a3a")); b.castShadow = true; put(b, p.x + 0.5, p.y, 0.5); const r = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.1), lam("#1a3a2a")); put(r, p.x + 0.5, p.y, 1.05); break; }
      case "subway": { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), lam("#303040")); put(b, p.x + 0.5, p.y, 0.4); const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a6a2a, emissive: 0x104010 })); put(s, p.x + 0.5, p.y, 0.9); break; }
      case "bugle-sign": { const s = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 0.1), new THREE.MeshLambertMaterial({ color: 0xd8d8e8, emissive: night ? 0x404050 : 0x202028 })); put(s, p.x + 2, p.y, 2.9); break; }
      case "couch": { const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), lam("#7a3a4a")); c.castShadow = true; put(c, p.x + 1, p.y, 0.25); const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.25), lam("#6a2a3a")); put(back, p.x + 1, p.y - 0.33, 0.6); break; }
      case "bar": { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), lam("#4a3020")); b.castShadow = true; put(b, p.x + 1.3, p.y, 0.45); const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.0), lam("#c0a070")); put(top, p.x + 1.3, p.y, 0.94); break; }
      case "holo-table": { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.7, 12), lam("#303848")); put(t, p.x + 0.5, p.y + 0.3, 0.35); const holo = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x3aa0f0, emissive: 0x2a8ad0, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); holo.rotation.x = Math.PI; put(holo, p.x + 0.5, p.y + 0.3, 1.2); const l = new THREE.PointLight(0x4ab0ff, 1.2, 4); put(l, p.x + 0.5, p.y + 0.3, 1.2); lights.push(l); break; }
      case "elevator": { const e = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.3), lam("#8a8a9a")); put(e, p.x + 0.5, p.y, 0.75); break; }
      case "plant": { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8), lam("#8a5a30")); put(pot, p.x, p.y, 0.2); const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lam("#2a7a3a")); put(leaves, p.x, p.y, 0.8); break; }
      case "throne": { const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.0), lam("#2a2a34")); seat.castShadow = true; put(seat, p.x + 0.5, p.y, 0.3); const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.25), lam("#1a5a2a")); back.castShadow = true; put(back, p.x + 0.5, p.y - 0.4, 0.9); const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), lam("#9a9aaa")); put(mask, p.x + 0.5, p.y - 0.26, 1.3); break; }
      case "banner": { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.05), lam("#1a6a2a")); put(b, p.x, p.y + 0.5, 1.4); const rod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), lam("#c0a040")); put(rod, p.x, p.y + 0.5, 2.3); break; }
      case "torch": { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), lam("#4a3020")); put(pole, p.x, p.y, 0.4); const fire = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff8a20, emissive: 0xff6a10 })); put(fire, p.x, p.y, 0.95); const l = new THREE.PointLight(0xff9a30, 1.8, 5); put(l, p.x, p.y, 1.1); lights.push(l); break; }
      case "gate": { const bars = new THREE.Group(); for (let i = -0.9; i <= 0.9; i += 0.3) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), lam("#5a5a6a")); b.position.set(i, 0.9, 0); bars.add(b); } put(bars, p.x + 0.5, p.y + 0.5, 0.0); break; }
      case "statue": { const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.5), lam("#5a5a68")); s.castShadow = true; put(s, p.x, p.y, 0.7); const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lam("#6a6a78")); put(h, p.x, p.y, 1.65); const ped = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.9), lam("#3a3a46")); put(ped, p.x, p.y, 0.15); break; }
    }
  }
  return { group: g, lights, toWorld: (tx, ty) => new THREE.Vector3(tx * T, heights[ty]?.[tx] ?? 0.1, ty * T), floorY: (tx, ty) => heights[ty]?.[tx] ?? 0.1 };
}

/** Shared stylized materials: cel-shaded (toon) with a 3-step ramp, plus an inverted-hull outline helper. */
import * as THREE from "three";

let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const colors = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 230, 230, 230, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  return ramp;
}

const cache = new Map<string, THREE.MeshToonMaterial>();
export function toon(hex: string, opts: { emissive?: number; map?: THREE.Texture } = {}): THREE.MeshToonMaterial {
  const key = hex + (opts.emissive ?? 0) + (opts.map ? opts.map.uuid : "");
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: toonRamp(), map: opts.map ?? null });
    if (opts.emissive) m.emissive = new THREE.Color(hex).multiplyScalar(opts.emissive);
    cache.set(key, m);
  }
  return m;
}

export function shadeHex(hex: string, k: number): string {
  const c = new THREE.Color(hex); c.lerp(k > 0 ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), Math.abs(k));
  return "#" + c.getHexString();
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });
/** Add an inverted-hull outline child to a mesh (classic cel outline). */
export function outlined<T extends THREE.Mesh>(mesh: T, thickness = 0.035): T {
  const hull = new THREE.Mesh(mesh.geometry, outlineMat);
  const s = 1 + thickness;
  hull.scale.set(s, s, s);
  hull.castShadow = false; hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

/** Canvas texture helper with nearest filtering off (these are smooth stylized textures). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, pixel = false): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

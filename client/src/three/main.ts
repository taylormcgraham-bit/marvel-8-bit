/**
 * 3D proof: the same world data (maps, markers, roster, looks) rendered with three.js as a
 * voxel world under an isometric camera with real lighting and shadows. Drag to orbit.
 * This is a renderer experiment; the engine and events are untouched.
 */
import * as THREE from "three";
import { MAPS } from "@shared/maps";
import type { GameEvent } from "@shared/events";
import { buildMap } from "./world";
import { makeVoxelFigure, type VoxelFigure } from "./voxel";

const q = new URLSearchParams(location.search);
const map = MAPS[q.get("map") ?? "chelsea-rooftop"] ?? MAPS["chelsea-rooftop"]!;
const tod = q.get("tod") ?? "night";
const night = tod === "night";

const el = document.getElementById("game")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = night ? 1.5 : 1.1;
el.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyColor = { night: 0x0b0b1e, dawn: 0x5a3a5a, day: 0x6aaaf0, dusk: 0xa0503a }[tod] ?? 0x0b0b1e;
scene.background = new THREE.Color(skyColor);
scene.fog = new THREE.Fog(skyColor, 22, 48);

// isometric-ish camera: orthographic, looking down at ~35 degrees, rotated 45
const aspect = el.clientWidth / el.clientHeight;
const frustum = 9.5;
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200);
const center = new THREE.Vector3(map.width / 2 - 0.5, 0, map.height / 2 + 0.5);
let orbit = Math.PI / 4, pitch = 0.55, zoom = 1;
function placeCamera() {
  const r = 30;
  camera.position.set(center.x + Math.cos(orbit) * r * Math.cos(pitch), center.y + Math.sin(pitch) * r, center.z + Math.sin(orbit) * r * Math.cos(pitch));
  camera.lookAt(center);
  camera.zoom = zoom; camera.updateProjectionMatrix();
}
placeCamera();

// lights: hemisphere + sun/moon with shadows
const hemi = new THREE.HemisphereLight(night ? 0x5060c0 : 0xbfd8ff, night ? 0x202030 : 0x404030, night ? 1.2 : 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(night ? 0x9ab0ff : 0xfff0d0, night ? 1.1 : 1.6);
sun.position.set(center.x - 8, 18, center.z + 10);
sun.target.position.copy(center); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16; sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ground under the map (the building below the roof / the street beyond)
const ground = new THREE.Mesh(new THREE.BoxGeometry(map.width + 1, 3, map.height + 1), new THREE.MeshLambertMaterial({ color: map.kind === "rooftop" ? 0x5a3a2a : 0x2a2a34 }));
ground.position.set(center.x, -1.55, center.z); ground.receiveShadow = true; scene.add(ground);
if (map.kind === "rooftop") {
  // a few neighbouring buildings for the skyline
  for (let i = 0; i < 14; i++) {
    const w = 3 + (i * 7) % 5, d = 3 + (i * 5) % 4, h = 2 + (i * 11) % 9;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0x16162e, emissive: night ? 0x0a0a18 : 0 }));
    const ang = (i / 14) * Math.PI * 2; const rad = 20 + (i % 3) * 5;
    b.position.set(center.x + Math.cos(ang) * rad, h / 2 - 3, center.z + Math.sin(ang) * rad);
    scene.add(b);
  }
}

const built = buildMap(map, night);
scene.add(built.group);

// roster on markers
const figures: { fig: VoxelFigure; tx: number; ty: number; walking: boolean; phase: number }[] = [];
fetch("/api/roster").then((r) => r.json()).then((list: GameEvent[]) => {
  list.forEach((e, i) => {
    if (e.type !== "spawn") return;
    const fig = makeVoxelFigure(e.palette, e.look as never);
    const m = map.markers[i % map.markers.length]!;
    const p = built.toWorld(m.x, m.y);
    fig.group.position.set(p.x, p.y, p.z);
    fig.group.scale.setScalar(0.5);
    fig.group.rotation.y = Math.PI + ((i * 1.3) % 1.2 - 0.6);
    scene.add(fig.group);
    figures.push({ fig, tx: m.x, ty: m.y, walking: i % 3 === 0, phase: i * 0.7 });
  });
}).catch(() => { /* no engine: empty stage */ });

// orbit by drag, zoom by wheel
let dragging = false, lx = 0;
renderer.domElement.addEventListener("pointerdown", (ev) => { dragging = true; lx = ev.clientX; });
window.addEventListener("pointerup", () => { dragging = false; });
window.addEventListener("pointermove", (ev) => { if (!dragging) return; orbit += (ev.clientX - lx) * 0.006; lx = ev.clientX; placeCamera(); });
window.addEventListener("wheel", (ev) => { zoom = Math.max(0.6, Math.min(2.4, zoom - ev.deltaY * 0.001)); placeCamera(); });
window.addEventListener("resize", () => { renderer.setSize(el.clientWidth, el.clientHeight); const a = el.clientWidth / el.clientHeight; camera.left = -frustum * a; camera.right = frustum * a; placeCamera(); });

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  if (!dragging && q.get("spin") !== "0") { orbit += 0.0008; placeCamera(); }
  for (const f of figures) {
    if (f.walking) {
      const r = 1.2; const a = t * 0.8 + f.phase;
      const p = built.toWorld(f.tx, f.ty);
      f.fig.group.position.set(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
      f.fig.group.rotation.y = -a + Math.PI / 2;
      f.fig.setWalk(t + f.phase);
    } else f.fig.setIdle(t + f.phase);
  }
  for (const l of built.lights) if (l instanceof THREE.PointLight && l.color.r > 0.9 && l.color.b < 0.5) l.intensity = (night ? 1.6 : 0.3) * (0.85 + Math.sin(t * 9 + l.position.x) * 0.15);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

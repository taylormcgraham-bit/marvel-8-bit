/** A tiny pixel buffer with the two post-processes that make procedural art read as 16-bit: outlines and shading. */
export class Buf {
  px: (string | null)[];
  constructor(public w: number, public h: number) { this.px = new Array(w * h).fill(null); }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x]!; }
  set(x: number, y: number, c: string | null) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(Math.round(x + i), Math.round(y + j), c);
  }
  /** filled circle */
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.set(cx + x, cy + y, c);
  }
  blit(other: Buf, ox: number, oy: number) {
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) { const c = other.get(x, y); if (c) this.set(ox + x, oy + y, c); }
  }
  /** scale up by integer factor (nearest neighbor) */
  scaled(k: number): Buf {
    const o = new Buf(this.w * k, this.h * k);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, this.get(Math.floor(x / k), Math.floor(y / k)));
    return o;
  }
  flipX(): Buf {
    const o = new Buf(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.set(this.w - 1 - x, y, this.get(x, y));
    return o;
  }
  draw(ctx: CanvasRenderingContext2D, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y); if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); } }
  }
}

export const OUTLINE = "#14121c";

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** mix toward black (k<0) or white (k>0) */
export function tone(h: string, k: number): string {
  const [r, g, b] = hexToRgb(h);
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  return rgbToHex(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a);
}
/** mix two colors */
export function mix(a: string, b: string, k: number): string {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

/**
 * Outline around every filled region (4-neighborhood). Mutates.
 * With `color` = "soft", the outline is a darkened copy of the neighboring pixel instead of
 * a flat black line, which is how blocky Minecraft-style sprites keep their silhouette
 * without a cartoon edge.
 */
export function outline(buf: Buf, color: string | "soft" = OUTLINE) {
  const add: [number, number, string][] = [];
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    if (buf.get(x, y)) continue;
    const n = buf.get(x, y - 1) || buf.get(x - 1, y) || buf.get(x + 1, y) || buf.get(x, y + 1);
    if (n) add.push([x, y, color === "soft" ? tone(n, -0.6) : color]);
  }
  for (const [x, y, c] of add) buf.set(x, y, c);
}

/** Per-pixel texture noise so flat fills read as material (deterministic). Mutates. */
export function grain(buf: Buf, amount = 0.07, seed = 1) {
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    const c = buf.get(x, y);
    if (!c) continue;
    let h = (x * 374761393 + y * 668265263 + seed * 982451653) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177; h >>>= 0;
    const r = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    buf.set(x, y, tone(c, (r - 0.5) * 2 * amount));
  }
}

/**
 * Light from the top-left: pixels whose upper or left neighbor is outline/empty get a highlight;
 * pixels whose lower neighbor is outline/empty get a shadow. Reads like hand-shaded sprites.
 */
export function shade(buf: Buf, outlineColor: string | null = OUTLINE, hi = 0.22, lo = 0.28, soft = false) {
  // with soft outlines there is no single outline color; treat "much darker than me" as an edge
  const isEdgeFor = (me: string) => (c: string | null) => {
    if (!c) return true;
    if (outlineColor && c === outlineColor) return true;
    if (soft) { const [r1, g1, b1] = hexToRgb(me), [r2, g2, b2] = hexToRgb(c); return (r2 + g2 + b2) < (r1 + g1 + b1) * 0.5; }
    return false;
  };
  const out = new Buf(buf.w, buf.h);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    const c = buf.get(x, y);
    if (!c || (outlineColor && c === outlineColor)) { out.set(x, y, c); continue; }
    const isEdge = isEdgeFor(c);
    const below = isEdge(buf.get(x, y + 1)), above = isEdge(buf.get(x, y - 1)), left = isEdge(buf.get(x - 1, y));
    let v = c;
    if (below) v = tone(c, -lo);
    else if (above || left) v = tone(c, hi);
    out.set(x, y, v);
  }
  buf.px = out.px;
}

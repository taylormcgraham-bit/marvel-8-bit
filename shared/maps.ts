/**
 * Map definitions shared by engine and theater. Tile units (16px). Markers are the only
 * positions the Director may reference. Props are drawn by the theater by kind.
 * Phase 5 moves these to Tiled JSON under canon/world/maps/.
 */
export type Tile =
  | "roof" | "ledge" | "void" | "door" | "tower-base" | "ac" | "skylight" | "vent" | "stair"
  | "sidewalk" | "road" | "road-line" | "facade" | "facade-window" | "facade-door" | "curb"
  | "carpet" | "marble" | "wall" | "wall-window"
  | "flagstone" | "castle-wall" | "battlement" | "dais";

export type PropKind =
  | "water-tower" | "bulkhead"
  | "car" | "lamppost" | "hydrant" | "newsstand" | "subway" | "bugle-sign"
  | "couch" | "bar" | "holo-table" | "elevator" | "plant"
  | "throne" | "banner" | "torch" | "gate" | "statue";

export type MapKind = "rooftop" | "street" | "interior" | "castle";
export type Region = "manhattan" | "latveria" | "asgard" | "wakanda";

export interface MapMarker { id: string; x: number; y: number; desc: string }
export interface MapProp { kind: PropKind; x: number; y: number }

export interface MapDef {
  id: string;
  name: string;
  kind: MapKind;
  region: Region;
  width: number;
  height: number;
  tiles: Tile[][];
  markers: MapMarker[];
  props: MapProp[];
  /** where travelers appear on arrival */
  entry: string[];
  /** civilians around? drives collateral rules */
  publicSpace: boolean;
  flavor: string;
}

const W = 20, H = 15;
const grid = (fill: Tile) => Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
const set = (rows: Tile[][], x: number, y: number, t: Tile) => { rows[y]![x] = t; };
const fillRect = (rows: Tile[][], x: number, y: number, w: number, h: number, t: Tile) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(rows, i, j, t); };

/* ----------------------------------------------------------------- chelsea rooftop */
function rooftop(): Tile[][] {
  const rows = grid("roof");
  fillRect(rows, 0, 0, W, 2, "void");
  fillRect(rows, 0, 2, W, 1, "ledge");
  fillRect(rows, 0, 2, 1, H - 2, "ledge"); fillRect(rows, W - 1, 2, 1, H - 2, "ledge");
  fillRect(rows, 0, H - 1, W, 1, "ledge");
  fillRect(rows, 14, 3, 3, 2, "tower-base");
  set(rows, 2, 12, "door"); set(rows, 3, 12, "door");
  set(rows, 6, 4, "ac"); set(rows, 7, 4, "ac"); set(rows, 11, 10, "ac");
  fillRect(rows, 8, 8, 2, 2, "skylight");
  set(rows, 4, 7, "vent"); set(rows, 16, 9, "vent");
  set(rows, W - 1, 7, "stair");
  return rows;
}

export const CHELSEA_ROOFTOP: MapDef = {
  id: "chelsea-rooftop", name: "Chelsea Rooftop", kind: "rooftop", region: "manhattan", width: W, height: H, tiles: rooftop(),
  publicSpace: false,
  flavor: "An unremarkable six-story rooftop in Chelsea with a rusted water tower, a humming AC unit, a cracked skylight over an empty office, and a stairwell door that never locks. Spider-Man's thinking spot. The Empire State Building glows to the northeast. Traffic hisses below.",
  props: [{ kind: "water-tower", x: 14, y: 5 }, { kind: "bulkhead", x: 2, y: 13 }],
  entry: ["ledge-north", "door", "ledge-east"],
  markers: [
    { id: "water-tower", x: 15, y: 5, desc: "beneath the water tower legs, Spidey's usual perch" },
    { id: "ledge-north", x: 10, y: 3, desc: "the far parapet, overlooking the avenue, where someone arriving by air would land" },
    { id: "ledge-east", x: 17, y: 8, desc: "east parapet by the fire-escape ladder" },
    { id: "ledge-west", x: 2, y: 8, desc: "west parapet, nothing but a long drop" },
    { id: "ledge-south", x: 10, y: 13, desc: "near parapet, facing the viewer, street below" },
    { id: "center", x: 10, y: 7, desc: "open gravel in the middle of the roof" },
    { id: "skylight", x: 10, y: 9, desc: "beside the cracked skylight; glass that would not survive a hard landing" },
    { id: "ac-unit", x: 7, y: 5, desc: "beside the big AC unit, good cover" },
    { id: "door", x: 3, y: 11, desc: "in front of the stairwell door, the only way down on foot" },
    { id: "vent", x: 5, y: 7, desc: "by the steam vent, hissing" },
    { id: "corner-ne", x: 17, y: 4, desc: "northeast corner, near the tower, cornered" },
    { id: "corner-sw", x: 2, y: 12, desc: "southwest corner by the door" },
  ],
};

/* ----------------------------------------------------------------- midtown street */
function street(): Tile[][] {
  const rows = grid("road");
  fillRect(rows, 0, 0, W, 3, "facade");
  for (let x = 1; x < W; x += 2) set(rows, x, 1, "facade-window");
  for (let x = 2; x < W; x += 3) set(rows, x, 0, "facade-window");
  set(rows, 9, 2, "facade-door"); set(rows, 10, 2, "facade-door");
  fillRect(rows, 0, 3, W, 1, "sidewalk");
  fillRect(rows, 0, 4, W, 1, "curb");
  fillRect(rows, 0, 5, W, 6, "road");
  for (let x = 0; x < W; x += 2) set(rows, x, 8, "road-line");
  fillRect(rows, 0, 11, W, 1, "curb");
  fillRect(rows, 0, 12, W, 2, "sidewalk");
  fillRect(rows, 0, 14, W, 1, "facade");
  return rows;
}

export const MIDTOWN_STREET: MapDef = {
  id: "midtown-street", name: "Midtown, outside the Daily Bugle", kind: "street", region: "manhattan", width: W, height: H, tiles: street(),
  publicSpace: true,
  flavor: "A Midtown block at the foot of the Daily Bugle building: a brass-doored lobby, a newsstand that sells Jameson's front page by the stack, a subway entrance, yellow cabs double-parked, and a sidewalk that never empties. Anything that happens here happens in front of a crowd and a camera.",
  props: [
    { kind: "bugle-sign", x: 8, y: 0 }, { kind: "newsstand", x: 3, y: 3 }, { kind: "subway", x: 15, y: 12 },
    { kind: "lamppost", x: 1, y: 4 }, { kind: "lamppost", x: 18, y: 4 }, { kind: "lamppost", x: 6, y: 12 }, { kind: "lamppost", x: 13, y: 12 },
    { kind: "hydrant", x: 11, y: 3 }, { kind: "car", x: 4, y: 6 }, { kind: "car", x: 13, y: 9 }, { kind: "car", x: 16, y: 6 },
  ],
  entry: ["bugle-door", "subway", "corner-west", "corner-east"],
  markers: [
    { id: "bugle-door", x: 10, y: 4, desc: "the Daily Bugle lobby doors, brass and revolving" },
    { id: "newsstand", x: 5, y: 4, desc: "the newsstand, today's Bugle front page on the rack" },
    { id: "subway", x: 16, y: 13, desc: "the subway stairs, a way to vanish into the city" },
    { id: "crosswalk", x: 10, y: 8, desc: "the middle of the crosswalk, traffic stopped both ways" },
    { id: "parked-cab", x: 6, y: 7, desc: "behind a double-parked cab, cover from the road" },
    { id: "lamppost-east", x: 17, y: 5, desc: "under the east lamppost by the curb" },
    { id: "lamppost-west", x: 2, y: 5, desc: "under the west lamppost, by the hydrant" },
    { id: "far-sidewalk", x: 10, y: 12, desc: "the far sidewalk, crowd pressed against the storefronts" },
    { id: "corner-west", x: 1, y: 12, desc: "the west corner, an alley mouth behind it" },
    { id: "corner-east", x: 18, y: 12, desc: "the east corner, by the subway" },
    { id: "road-center", x: 12, y: 6, desc: "open asphalt between two stopped cars" },
    { id: "center", x: 10, y: 6, desc: "the middle of the block" },
  ],
};

/* ----------------------------------------------------------------- avengers tower lounge */
function lounge(): Tile[][] {
  const rows = grid("carpet");
  fillRect(rows, 0, 0, W, 2, "wall");
  for (let x = 2; x < W - 2; x++) set(rows, x, 1, "wall-window");
  fillRect(rows, 0, 2, 1, H - 2, "wall"); fillRect(rows, W - 1, 2, 1, H - 2, "wall");
  fillRect(rows, 0, H - 1, W, 1, "wall");
  fillRect(rows, 7, 5, 6, 5, "marble");
  fillRect(rows, 1, 2, W - 2, 1, "marble");
  return rows;
}

export const AVENGERS_LOUNGE: MapDef = {
  id: "avengers-lounge", name: "Avengers Tower, the lounge", kind: "interior", region: "manhattan", width: W, height: H, tiles: lounge(),
  publicSpace: false,
  flavor: "The lounge on the ninety-third floor of Avengers Tower: floor-to-ceiling glass over Manhattan, a holo-table that is always on, Tony's bar, a couch that has seen a hundred debriefs, and an elevator that announces guests before they arrive. The one place in the city where heroes can take the mask off.",
  props: [
    { kind: "holo-table", x: 9, y: 7 }, { kind: "couch", x: 3, y: 10 }, { kind: "bar", x: 14, y: 4 }, { kind: "elevator", x: 2, y: 13 },
    { kind: "plant", x: 17, y: 12 }, { kind: "plant", x: 1, y: 3 },
  ],
  entry: ["elevator", "balcony"],
  markers: [
    { id: "window-wall", x: 10, y: 2, desc: "at the glass, the whole city below" },
    { id: "holo-table", x: 10, y: 9, desc: "around the holo-table, the briefing map hovering" },
    { id: "couch", x: 4, y: 9, desc: "the couch, where people sit when the news is bad" },
    { id: "bar", x: 15, y: 6, desc: "Tony's bar, mostly coffee these days" },
    { id: "elevator", x: 3, y: 12, desc: "the elevator doors, J.A.R.V.I.S. announcing arrivals" },
    { id: "balcony", x: 17, y: 2, desc: "the balcony door, how the flyers come and go" },
    { id: "center", x: 10, y: 6, desc: "the open floor between table and window" },
    { id: "corner-quiet", x: 16, y: 12, desc: "the quiet corner by the plants, out of earshot" },
  ],
};

/* ----------------------------------------------------------------- castle doom courtyard */
function courtyard(): Tile[][] {
  const rows = grid("flagstone");
  fillRect(rows, 0, 0, W, 1, "battlement");
  fillRect(rows, 0, 1, W, 2, "castle-wall");
  fillRect(rows, 0, 3, 1, H - 3, "castle-wall"); fillRect(rows, W - 1, 3, 1, H - 3, "castle-wall");
  fillRect(rows, 0, H - 1, W, 1, "castle-wall");
  fillRect(rows, 8, 3, 4, 2, "dais");
  return rows;
}

export const CASTLE_DOOM: MapDef = {
  id: "castle-doom", name: "Castle Doom, the great courtyard", kind: "castle", region: "latveria", width: W, height: H, tiles: courtyard(),
  publicSpace: false,
  flavor: "The great courtyard of Castle Doom, Doomstadt: flagstones older than the Habsburgs, green banners bearing the mask, torches that never go out, a throne on a raised dais under the mountain sky, and Doombots standing like statues in the colonnades. Nothing happens here that Doom has not permitted, or so he says.",
  props: [
    { kind: "throne", x: 9, y: 4 }, { kind: "banner", x: 4, y: 2 }, { kind: "banner", x: 15, y: 2 }, { kind: "torch", x: 7, y: 3 }, { kind: "torch", x: 12, y: 3 },
    { kind: "torch", x: 1, y: 8 }, { kind: "torch", x: 18, y: 8 }, { kind: "gate", x: 9, y: 14 }, { kind: "statue", x: 2, y: 5 }, { kind: "statue", x: 17, y: 5 },
  ],
  entry: ["gate", "east-colonnade"],
  markers: [
    { id: "throne-dais", x: 10, y: 6, desc: "the foot of the dais, beneath the throne" },
    { id: "throne", x: 10, y: 4, desc: "the throne itself; only Doom sits here" },
    { id: "gate", x: 10, y: 12, desc: "the portcullis gate, the only way out on foot" },
    { id: "east-colonnade", x: 17, y: 8, desc: "the east colonnade, Doombots in the shadows" },
    { id: "west-colonnade", x: 2, y: 8, desc: "the west colonnade, by the Doombot statue" },
    { id: "center", x: 10, y: 9, desc: "the center of the flagstones, torchlit" },
    { id: "banner-wall", x: 5, y: 4, desc: "beneath the great banner" },
    { id: "torch-east", x: 13, y: 5, desc: "beside the east torch" },
    { id: "corner-sw", x: 2, y: 12, desc: "the southwest corner, near the gate" },
  ],
};

export const MAPS: Record<string, MapDef> = {
  [CHELSEA_ROOFTOP.id]: CHELSEA_ROOFTOP,
  [MIDTOWN_STREET.id]: MIDTOWN_STREET,
  [AVENGERS_LOUNGE.id]: AVENGERS_LOUNGE,
  [CASTLE_DOOM.id]: CASTLE_DOOM,
};

/** Travel time in game minutes (canon/world/rules.md §2). */
export function travelMinutes(from: string, to: string): number {
  if (from === to) return 0;
  const a = MAPS[from], b = MAPS[to];
  if (!a || !b) return 30;
  if (a.region === b.region) return a.region === "manhattan" ? 25 : 15;
  const far = new Set([a.region, b.region]);
  if (far.has("asgard")) return 5;                 // Bifrost, with Heimdall's leave
  if (far.has("latveria") || far.has("wakanda")) return 180; // Quinjet
  return 60;
}

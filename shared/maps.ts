/**
 * Map definitions shared by engine and theater. Tile units (16px). Markers are the only
 * positions the Director may reference. Phase 1 ships one map; Phase 4 moves these to
 * Tiled JSON under canon/world/maps/.
 */
export type Tile = "roof" | "ledge" | "void" | "door" | "tower-base" | "ac" | "skylight" | "vent" | "stair";

export interface MapMarker { id: string; x: number; y: number; desc: string }

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  /** rows of tile ids, width*height */
  tiles: Tile[][];
  markers: MapMarker[];
  /** words the Director sees to stage the scene */
  flavor: string;
}

const W = 20, H = 15;

function build(): Tile[][] {
  const rows: Tile[][] = [];
  for (let y = 0; y < H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < W; x++) {
      let t: Tile = "roof";
      if (y <= 1) t = "void";                       // skyline above the building
      else if (y === 2) t = "ledge";                // far parapet
      else if (x === 0 || x === W - 1) t = "ledge"; // side parapets
      else if (y === H - 1) t = "ledge";            // near parapet
      row.push(t);
    }
    rows.push(row);
  }
  const set = (x: number, y: number, t: Tile) => { rows[y]![x] = t; };
  // water tower base (3x2) top-right
  set(14, 3, "tower-base"); set(15, 3, "tower-base"); set(16, 3, "tower-base");
  set(14, 4, "tower-base"); set(15, 4, "tower-base"); set(16, 4, "tower-base");
  // stairwell door bottom-left
  set(2, 12, "door"); set(3, 12, "door");
  // AC units
  set(6, 4, "ac"); set(7, 4, "ac");
  set(11, 10, "ac");
  // skylight
  set(8, 8, "skylight"); set(9, 8, "skylight"); set(8, 9, "skylight"); set(9, 9, "skylight");
  // vents
  set(4, 7, "vent"); set(16, 9, "vent");
  // fire escape ladder on east ledge
  set(W - 1, 7, "stair");
  return rows;
}

export const CHELSEA_ROOFTOP: MapDef = {
  id: "chelsea-rooftop",
  name: "Chelsea Rooftop",
  width: W,
  height: H,
  tiles: build(),
  flavor:
    "An unremarkable six-story rooftop in Chelsea with a rusted water tower, a humming AC unit, a cracked skylight over an empty office, and a stairwell door that never locks. Spider-Man's thinking spot. The Empire State Building glows to the northeast. Traffic hisses below.",
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

export const MAPS: Record<string, MapDef> = { [CHELSEA_ROOFTOP.id]: CHELSEA_ROOFTOP };

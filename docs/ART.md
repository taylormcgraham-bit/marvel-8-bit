# Art direction and asset pipeline

Target look: **blocky Minecraft-style pixel art, top-down, with more detail than 8-bit.**
Cube heads and boxy bodies in Steve proportions, no hard cartoon outline (a soft darkened
edge instead), block texture on every surface (bricks with cream mortar, gravel, cobblestone,
oak planks, iron, glass), and a slight 2.5D feel where walls and objects show a front face.
Layered sky, lighting pools, chunky combat feedback. SNES Zelda is still the reference for
how the overworld is laid out and read.

## What ships today (procedural)

Every texture is generated at boot in `client/src/render/`:

- `buf.ts`: a pixel buffer with the two passes that make procedural art read as hand-drawn:
  automatic **outlines** and top-left **shading**.
- `figure.ts`: the character rig. One function draws any character in any pose from the
  palette and `look` in their `stats.json` (build, head type, cape, props).
- `pixels.ts`: tiles, sky layers, objects (water tower, stairwell bulkhead), emotes, FX.

The rig gets the proportions, texture and lighting right and is still a rig. Hand-drawn
sheets are how individual characters get their iconic details (Spidey's web pattern, Doom's
riveted mask, Thor's winged helm). That is why the pipeline below exists.

## Dropping in hand-drawn art

Any procedural texture can be replaced one key at a time, with no code changes, by listing
a file in `client/public/assets/manifest.json`:

```json
{
  "characters": {
    "spider-man": { "sheet": "characters/spider-man.png", "frameWidth": 24, "frameHeight": 34, "portrait": "characters/spider-man-portrait.png" }
  },
  "textures": {
    "tile-roof": "tiles/roof.png",
    "water-tower": "objects/water-tower.png"
  }
}
```

Files live under `client/public/assets/`. A character with a sheet listed skips the rig
entirely; everything else keeps using procedural art, so you can replace one hero at a time.

### Character sheet contract

A horizontal strip, one row, frames left to right in this exact order (20 frames):

| # | Pose | Facing | Notes |
|---|---|---|---|
| 0–1 | idle | down | breathing, 2 frames |
| 2–3 | idle | up | |
| 4–5 | idle | side | drawn facing **right**; the engine flips for left |
| 6–8 | walk | down | contact, pass, contact |
| 9–11 | walk | up | |
| 12–14 | walk | side | |
| 15 | attack | side | |
| 16 | attack | down | |
| 17 | hurt | down | |
| 18 | hurt | side | |
| 19 | ko | side | drawn standing; the engine rotates it 90° |

Default frame size is 24×34. Bigger is fine (Street Fighter proportions want 32×48):
set `frameWidth`/`frameHeight` in the manifest. Feet should rest 3px above the bottom edge.
Portraits are 32×32.

### Tiles and objects

16×16 tiles, keys `tile-roof`, `tile-ledge`, `tile-door`, `tile-tower-base`, `tile-ac`,
`tile-skylight`, `tile-vent`, `tile-stair`. Objects: `water-tower` (52×64), `bulkhead`
(36×30), `sky`, `skyline-far`, `skyline-near` (320×48), `cloud`, emotes (`emote-!` etc.,
12×12), FX (`fx-hit` 16×16, `fx-web`, `fx-bolt`, `fx-dust`).

## Three routes to real art

1. **Commission a pixel artist.** The sheet contract above is the brief. Twelve characters
   at 20 frames is a modest job for someone who does this; ask for Aseprite source files.
2. **AI pixel-art tools.** PixelLab, Aseprite plus an image model, or Retro Diffusion can
   produce a base sheet from a description and a reference. Expect to clean up by hand in
   Aseprite; the frame order and feet alignment are what usually need fixing.
3. **CC0 packs for the environment.** Tilesets on itch.io and OpenGameArt (search "16x16
   rooftop", "city tileset") cover roofs, streets and interiors well. Characters still need
   to be custom because nobody ships Marvel heroes in a free pack.

Doing route 3 for environments and route 1 or 2 for characters is the fastest way to the
look you have in mind. Each piece drops in through the manifest as it arrives.

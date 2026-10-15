import Phaser from "phaser";
import { TheaterScene } from "./scenes/TheaterScene";

export const VIEW_W = 320;
export const VIEW_H = 240;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: VIEW_W,
  height: VIEW_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#0b0b14",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 3 },
  scene: [TheaterScene],
});

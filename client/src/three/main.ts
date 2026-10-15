/**
 * Entry point for the 3D theater (the main view). ?showcase spawns the roster for art
 * review, with ?map, ?tod and ?weather.
 */
import { Theater3D } from "./theater3d";
import type { GameEvent } from "@shared/events";

const el = document.getElementById("game")!;
const q = new URLSearchParams(location.search);
const showcase = q.has("showcase");
const theater = new Theater3D(el, showcase ? "showcase" : "theater");
(window as unknown as { __theater: Theater3D }).__theater = theater; // debugging hook
if (showcase) {
  theater.setEnv(q.get("map") ?? "chelsea-rooftop", q.get("tod") ?? "night", q.get("weather") ?? "clear");
  if (q.has("wide")) theater.wide();
  fetch("/api/roster").then((r) => r.json()).then((list: GameEvent[]) => theater.showcase(list)).catch(() => undefined);
} else {
  theater.connect();
}
